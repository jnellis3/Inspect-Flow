// Queue worker: runs pipeline jobs one at a time, in one of two modes.
//
// Local (default): the app and worker share a volume. A job is a directory under $JOBS_DIR with
// brief.json, input/ and request.json; the app queues it by writing status.json {state: "queued"},
// and the worker owns status.json from then on. A file named `cancel` stops the running job.
//
// Remote (APP_URL + WORKER_TOKEN set, e.g. on a RunPod pod): the worker claims jobs from the app's
// /api/worker API, downloads the inputs (and the saved state of earlier runs, for revisions),
// runs them locally, streams status back, and uploads the outputs and new state.
import { spawn } from "node:child_process";
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Docker secrets: OPENROUTER_API_KEY_FILE holds the key instead of the environment.
if (!process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY_FILE) {
  process.env.OPENROUTER_API_KEY = readFileSync(process.env.OPENROUTER_API_KEY_FILE, "utf8").trim();
}
if (!process.env.OPENROUTER_API_KEY) console.warn("OPENROUTER_API_KEY is not set; jobs will fail until it is.");

const JOBS = process.env.JOBS_DIR || "/data/jobs";
const WORK_DIR = process.env.WORK_DIR || join(homedir(), "jobs");  // remote mode: scratch for claimed jobs
const RUN_JOB = process.env.RUN_JOB || "/opt/pipeline/run-job.sh";
const POLL_MS = 3000;

const readJson = path => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };
function writeJson(path, value) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 1));
  renameSync(`${path}.tmp`, path);
}
const log = (...args) => console.log(new Date().toISOString(), ...args);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// What the agent is doing right now, in words a homeowner would understand.
const ACTIVITY = [
  [/^\s*(cd \S+;?\s*)?frames\b/, "Reviewing the footage"],
  [/^\s*(cd \S+;?\s*)?voice\b/, "Recording the narration"],
  [/^\s*(cd \S+;?\s*)?music\b/, "Composing the music"],
  [/^\s*(cd \S+;?\s*)?build\b/, "Assembling the edit"],
  [/^\s*(cd \S+;?\s*)?snap\b/, "Checking the edit frame by frame"],
  [/^\s*(cd \S+;?\s*)?render\b/, "Rendering the final video"],
  [/^\s*(cd \S+;?\s*)?report\b/, "Writing the PDF report"],
];
function activityFor(block) {
  if (block.name === "Agent" || block.name === "Task") return "Checking the evidence for each finding";
  if (block.name === "Write" || block.name === "Edit") {
    const file = String(block.input?.file_path || "");
    if (file.endsWith("findings.json")) return "Writing up the findings";
    if (file.endsWith("edit.json")) return "Storyboarding the video";
    if (file.endsWith("summary.md")) return "Writing notes for you";
  }
  if (block.name === "Bash") {
    const command = String(block.input?.command || "");
    for (const [pattern, label] of ACTIVITY) if (pattern.test(command)) return label;
  }
  if (block.name === "Read" && /\.(jpe?g|png)$/i.test(String(block.input?.file_path || ""))) return "Reviewing the footage";
  return null;
}

// Incrementally follows logs/agent.jsonl. Lines carrying images can be megabytes long, so only
// assistant lines are parsed.
class AgentTail {
  constructor(path) { this.path = path; this.offset = 0; this.partial = ""; this.note = null; this.activity = null; this.actions = 0; }
  poll() {
    if (!existsSync(this.path)) return;
    const size = statSync(this.path).size;
    if (size < this.offset) { this.offset = 0; this.partial = ""; }
    if (size === this.offset) return;
    const fd = openSync(this.path, "r");
    try {
      const buffer = Buffer.alloc(Math.min(size - this.offset, 64 * 1024 * 1024));
      const read = readSync(fd, buffer, 0, buffer.length, this.offset);
      this.offset += read;
      const lines = (this.partial + buffer.subarray(0, read).toString("utf8")).split("\n");
      this.partial = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith('{"type":"assistant"')) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        for (const block of event.message?.content ?? []) {
          if (block.type === "tool_use") {
            this.actions += 1;
            this.activity = activityFor(block) ?? this.activity;
          } else if (block.type === "text" && block.text?.trim() && !event.parent_tool_use_id) {
            this.note = block.text.trim().replace(/\s+/g, " ").slice(0, 280);
          }
        }
      }
    } finally { closeSync(fd); }
  }
}

/**
 * Run one job directory through run-job.sh. `sink.update(patch)` receives status changes;
 * `sink.cancelRequested()` is polled to stop the job. Resolves with the final status.
 */
function runJob(dir, sink) {
  const request = readJson(join(dir, "request.json")) ?? { kind: "produce" };
  let status = { state: "running", kind: request.kind, startedAt: new Date().toISOString(), finishedAt: null, error: null, stage: null, activity: null, note: null };
  sink.update(status);
  log("start", dir, request.kind);

  return new Promise(resolve => {
    const child = spawn(RUN_JOB, [dir], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d; });
    child.stderr.on("data", d => { stderr = (stderr + d).slice(-8000); });
    const tail = new AgentTail(join(dir, "logs", "agent.jsonl"));
    let cancelled = false;
    const timer = setInterval(async () => {
      tail.poll();
      const stage = readJson(join(dir, "logs", "stage.json"))?.stage ?? status.stage;
      status = { ...status, stage, activity: stage === "direct" ? tail.activity : null, note: tail.note, actions: tail.actions, updatedAt: new Date().toISOString() };
      sink.update(status);
      if (!cancelled && await sink.cancelRequested()) {
        cancelled = true;
        log("cancel", dir);
        try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
      }
    }, POLL_MS);

    child.on("close", code => {
      clearInterval(timer);
      tail.poll();
      const summary = (() => { try { return JSON.parse(stdout.trim().split("\n").pop() || "{}"); } catch { return {}; } })();
      const reel = existsSync(join(dir, "out", "highlight-reel-web.mp4"));
      const state = cancelled ? "cancelled" : code === 0 && reel ? "done" : "failed";
      const lastLog = (() => { try { return readFileSync(join(dir, "logs", "job.log"), "utf8").trim().split("\n").slice(-3).join(" | "); } catch { return ""; } })();
      status = {
        ...status, state, stage: state === "done" ? "done" : status.stage, activity: null, note: tail.note,
        finishedAt: new Date().toISOString(), costUsd: summary.totalCostUsd ?? null,
        error: state === "failed" ? (stderr.trim().split("\n").slice(-4).join(" | ") || lastLog || `exit ${code}`).slice(0, 600) : null,
      };
      log("end", dir, state, code);
      resolve(status);
    });
  });
}

// ---------- local mode: the app and worker share a volume ----------

async function localMode() {
  // The app shows "video engine offline" when this file goes stale.
  const heartbeat = () => { try { writeFileSync(join(JOBS, ".worker-heartbeat"), new Date().toISOString()); } catch { /* volume not ready */ } };
  const jobDirs = () => {
    try { return readdirSync(JOBS, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(JOBS, d.name)); } catch { return []; }
  };
  // A job that was running when the worker stopped is safe to run again: every stage resumes.
  for (const dir of jobDirs()) {
    const status = readJson(join(dir, "status.json"));
    if (status?.state === "running") writeJson(join(dir, "status.json"), { ...status, state: "queued", note: "Resuming after a restart" });
  }
  mkdirSync(JOBS, { recursive: true });
  log("worker ready (local), watching", JOBS);
  for (;;) {
    heartbeat();
    const queued = jobDirs()
      .map(dir => ({ dir, status: readJson(join(dir, "status.json")) }))
      .filter(j => j.status?.state === "queued")
      .sort((a, b) => String(a.status.queuedAt).localeCompare(String(b.status.queuedAt)));
    if (!queued.length) { await sleep(POLL_MS); continue; }
    const dir = queued[0].dir;
    const statusPath = join(dir, "status.json");
    rmSync(join(dir, "cancel"), { force: true });
    const final = await runJob(dir, {
      update: patch => { heartbeat(); writeJson(statusPath, { ...readJson(statusPath), ...patch }); },
      cancelRequested: async () => existsSync(join(dir, "cancel")),
    });
    writeJson(statusPath, { ...readJson(statusPath), ...final });
  }
}

// ---------- remote mode: claim jobs from the app over HTTPS (e.g. a RunPod pod) ----------

const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
const WORKER_ID = process.env.RUNPOD_POD_ID || process.env.WORKER_ID || hostname();

async function call(path, init = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${APP_URL}/api/worker${path}`, {
        ...init, duplex: init.body ? "half" : undefined,
        headers: { Authorization: `Bearer ${process.env.WORKER_TOKEN}`, "X-Worker-Id": WORKER_ID, ...(init.headers ?? {}) },
      });
      if (response.status >= 500 && attempt < 5) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (e) {
      if (attempt >= 5 || init.body instanceof ReadableStream) throw e;
      log("app unreachable, retrying:", String(e).slice(0, 120));
      await sleep(2000 * 2 ** attempt);
    }
  }
}

async function download(jobId, path, dest) {
  const response = await call(`/jobs/${jobId}/file?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error(`download ${path}: HTTP ${response.status}`);
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${dest}.part`));
  renameSync(`${dest}.part`, dest);
}

async function upload(jobId, path, file) {
  if (!existsSync(file)) return;
  const response = await call(`/jobs/${jobId}/file?path=${encodeURIComponent(path)}`, {
    method: "PUT", body: Readable.toWeb(createReadStream(file)), headers: { "Content-Length": String(statSync(file).size) },
  });
  if (!response.ok) throw new Error(`upload ${path}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
}

// Everything the agent needs to pick a job up again later, minus what ingest can regenerate.
const STATE_EXCLUDES = ["./input", "./supporting", "./media", "./out", "./scratch", "./state.tar.gz", "./status.json"];
const OUTPUTS = ["out/highlight-reel-web.mp4", "out/poster.jpg", "out/report.pdf", "findings.json", "summary.md", "edit.json"];

async function runRemote(job) {
  const dir = join(WORK_DIR, job.id);
  mkdirSync(dir, { recursive: true });
  if (job.hasState && !existsSync(join(dir, "logs"))) {
    log("restoring saved state", job.id);
    const response = await call(`/jobs/${job.id}/file?path=state.tar.gz`);
    if (!response.ok) throw new Error(`state download: HTTP ${response.status}`);
    const tar = spawn("tar", ["-xzf", "-", "-C", dir], { stdio: ["pipe", "inherit", "inherit"] });
    await pipeline(Readable.fromWeb(response.body), tar.stdin);
    await new Promise(r => tar.on("close", r));
  }
  for (const f of job.files) {
    const dest = join(dir, f.path);
    // Media is reused when already present; small control files (brief, request) always refresh.
    if (f.size < 1_000_000 || !existsSync(dest) || statSync(dest).size !== f.size) await download(job.id, f.path, dest);
  }
  let cancel = false;
  let lastSent = 0;
  const final = await runJob(dir, {
    update: patch => {
      if (Date.now() - lastSent < 4000 && patch.state === "running") return;
      lastSent = Date.now();
      call(`/jobs/${job.id}/status`, { method: "POST", body: JSON.stringify(patch), headers: { "Content-Type": "application/json" } })
        .then(r => r.json()).then(r => { cancel = cancel || !!r.cancel; }).catch(() => {});
    },
    cancelRequested: async () => cancel,
  });
  try {
    for (const path of OUTPUTS) await upload(job.id, path, join(dir, path));
    // Written beside the job directory, not inside it, so archiving doesn't change what it reads.
    const state = join(WORK_DIR, `${job.id}.state.tar.gz`);
    await new Promise((resolve, reject) => {
      const tar = spawn("tar", ["-C", dir, "-czf", state, "--warning=no-file-changed", ...STATE_EXCLUDES.flatMap(x => ["--exclude", x]), "."], { stdio: "inherit" });
      // GNU tar exits 1 when a file changed while being read: still a usable archive.
      tar.on("close", code => code === 0 || code === 1 ? resolve() : reject(new Error(`tar exit ${code}`)));
    });
    await upload(job.id, "state.tar.gz", state);
    rmSync(state, { force: true });
  } catch (e) {
    Object.assign(final, { state: "failed", error: `Finished, but results couldn't be sent back: ${String(e).slice(0, 300)}` });
  }
  await call(`/jobs/${job.id}/status`, { method: "POST", body: JSON.stringify(final), headers: { "Content-Type": "application/json" } });
}

async function remoteMode() {
  if (!process.env.WORKER_TOKEN) throw new Error("WORKER_TOKEN is required in remote mode.");
  mkdirSync(WORK_DIR, { recursive: true });
  log("worker ready (remote)", WORKER_ID, "→", APP_URL);
  for (;;) {
    const response = await call("/claim", { method: "POST" });
    if (response.status === 204) { await sleep(10_000); continue; }
    if (!response.ok) { log("claim failed:", response.status, (await response.text()).slice(0, 200)); await sleep(15_000); continue; }
    const job = await response.json();
    try { await runRemote(job); }
    catch (e) {
      log("job error", job.id, e);
      await call(`/jobs/${job.id}/status`, { method: "POST", body: JSON.stringify({ state: "failed", error: String(e).slice(0, 500), finishedAt: new Date().toISOString() }), headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  }
}

await (APP_URL ? remoteMode() : localMode());
