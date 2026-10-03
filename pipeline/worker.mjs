// Queue worker: runs pipeline jobs that the app drops under $JOBS_DIR, one at a time.
//
// A job is a directory holding brief.json, input/, and request.json. The app marks it
// ready by writing status.json {state: "queued"}. This worker owns status.json from then on:
// state, stage, a plain-language "activity" line, the agent's latest note, cost, and errors.
// Writing a file named `cancel` into the job directory stops the running job.
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Docker secrets: OPENROUTER_API_KEY_FILE holds the key instead of the environment.
if (!process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY_FILE) {
  process.env.OPENROUTER_API_KEY = readFileSync(process.env.OPENROUTER_API_KEY_FILE, "utf8").trim();
}
if (!process.env.OPENROUTER_API_KEY) console.warn("OPENROUTER_API_KEY is not set; jobs will fail until it is.");

const JOBS = process.env.JOBS_DIR || "/data/jobs";
const RUN_JOB = process.env.RUN_JOB || "/opt/pipeline/run-job.sh";
const POLL_MS = 3000;

const readJson = path => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };
function writeJson(path, value) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 1));
  renameSync(`${path}.tmp`, path);
}
const log = (...args) => console.log(new Date().toISOString(), ...args);
// The app shows "video engine offline" when this file goes stale.
const heartbeat = () => { try { writeFileSync(join(JOBS, ".worker-heartbeat"), new Date().toISOString()); } catch { /* volume not ready */ } };

function jobDirs() {
  try {
    return readdirSync(JOBS, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(JOBS, d.name));
  } catch { return []; }
}

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

function runJob(dir) {
  const statusPath = join(dir, "status.json");
  const request = readJson(join(dir, "request.json")) ?? { kind: "produce" };
  let status = { ...readJson(statusPath), state: "running", kind: request.kind, startedAt: new Date().toISOString(), finishedAt: null, error: null, stage: null, activity: null, note: null };
  writeJson(statusPath, status);
  rmSync(join(dir, "cancel"), { force: true });
  log("start", dir, request.kind);

  return new Promise(resolve => {
    const child = spawn(RUN_JOB, [dir], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d; });
    child.stderr.on("data", d => { stderr = (stderr + d).slice(-8000); });
    const tail = new AgentTail(join(dir, "logs", "agent.jsonl"));
    let cancelled = false;
    const timer = setInterval(() => {
      heartbeat();
      tail.poll();
      const stage = readJson(join(dir, "logs", "stage.json"))?.stage ?? status.stage;
      status = { ...status, stage, activity: stage === "direct" ? tail.activity : null, note: tail.note, actions: tail.actions, updatedAt: new Date().toISOString() };
      writeJson(statusPath, status);
      if (!cancelled && existsSync(join(dir, "cancel"))) {
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
      writeJson(statusPath, status);
      log("end", dir, state, code);
      resolve();
    });
  });
}

// A job that was running when the worker stopped is safe to run again: every stage resumes.
for (const dir of jobDirs()) {
  const status = readJson(join(dir, "status.json"));
  if (status?.state === "running") writeJson(join(dir, "status.json"), { ...status, state: "queued", note: "Resuming after a restart" });
}

mkdirSync(JOBS, { recursive: true });
log("worker ready, watching", JOBS);
for (;;) {
  heartbeat();
  const queued = jobDirs()
    .map(dir => ({ dir, status: readJson(join(dir, "status.json")) }))
    .filter(j => j.status?.state === "queued")
    .sort((a, b) => String(a.status.queuedAt).localeCompare(String(b.status.queuedAt)));
  if (queued.length) await runJob(queued[0].dir);
  else await new Promise(r => setTimeout(r, POLL_MS));
}
