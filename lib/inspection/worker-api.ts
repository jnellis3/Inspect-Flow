// The app side of remote workers (e.g. RunPod pods): a small token-authenticated API through
// which a worker claims queued jobs, downloads their inputs, reports progress, and uploads
// results. Job state lives in the app's job directories either way; a remote worker only ever
// holds a working copy.
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError, jobsDir, remoteWorkers } from "./server";
import { jobDir, readRun } from "./jobs";
import type { RunStatus } from "./types";
import { projectWorkspace, pushIfReady } from "./spectora/store";

/** The shared secret workers present. From WORKER_TOKEN, or generated once and kept on the volume. */
let cachedToken: string | null = null;
export async function workerToken() {
  if (cachedToken) return cachedToken;
  if (process.env.WORKER_TOKEN) return (cachedToken = process.env.WORKER_TOKEN);
  const path = join(jobsDir(), ".worker-token");
  try { cachedToken = (await readFile(path, "utf8")).trim(); }
  catch {
    await mkdir(jobsDir(), { recursive: true });
    cachedToken = randomBytes(32).toString("hex");
    await writeFile(path, cachedToken, { mode: 0o600 });
    await chmod(path, 0o600);
  }
  return cachedToken;
}

/** Authenticate a worker request; returns the worker's id. Also records that a worker is alive. */
export async function authenticateWorker(request: Request) {
  if (!remoteWorkers()) throw new AppError(404, "Not found.");
  const presented = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(await workerToken());
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) throw new AppError(401, "Invalid worker token.");
  const now = new Date();
  await writeFile(join(jobsDir(), ".worker-heartbeat"), now.toISOString()).catch(() => {});
  return (request.headers.get("x-worker-id") ?? "worker").slice(0, 80);
}

export async function workerRoute(request: Request, fn: (workerId: string) => Promise<Response>) {
  try { return await fn(await authenticateWorker(request)); }
  catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    console.error("Worker request failed", e);
    return Response.json({ error: "Worker request failed." }, { status: 500 });
  }
}

async function writeStatus(projectId: string, status: RunStatus & Record<string, unknown>) {
  const path = join(jobDir(projectId), "status.json");
  await writeFile(`${path}.tmp`, JSON.stringify(status, null, 1));
  await rename(`${path}.tmp`, path);
}

export async function listJobs() {
  const ids = (await readdir(jobsDir(), { withFileTypes: true }).catch(() => [])).filter(d => d.isDirectory()).map(d => d.name);
  return Promise.all(ids.map(async id => ({ id, status: await readRun(id) as RunStatus & Record<string, unknown> })));
}

/** Files a worker needs for a job: control files plus the uploaded media. */
async function inputFiles(projectId: string) {
  const dir = jobDir(projectId);
  const out: { path: string; size: number }[] = [];
  for (const sub of ["input", "supporting"]) {
    for (const name of await readdir(join(dir, sub)).catch(() => [] as string[])) {
      out.push({ path: `${sub}/${name}`, size: (await stat(join(dir, sub, name))).size });
    }
  }
  for (const name of ["brief.json", "request.json"]) out.push({ path: name, size: (await stat(join(dir, name))).size });
  return out;
}

/** The job to run next: oldest first, but workspaces take turns (counting the jobs they already
 *  have running), so one company's batch can't hold up everyone else's. Mirrored in pipeline/worker.mjs. */
export function nextQueued<T extends { id: string; status: RunStatus }>(jobs: T[]): T | undefined {
  const turns = new Map<string, number>();
  const whose = (j: T) => j.status.workspace ?? j.id;
  for (const j of jobs) if (j.status.state === "running") turns.set(whose(j), (turns.get(whose(j)) ?? 0) + 1);
  return jobs.filter(j => j.status.state === "queued")
    .sort((a, b) => String(a.status.queuedAt).localeCompare(String(b.status.queuedAt)))
    .map(job => { const turn = turns.get(whose(job)) ?? 0; turns.set(whose(job), turn + 1); return { job, turn }; })
    .sort((a, b) => a.turn - b.turn)[0]?.job;
}

/** Hand the next queued job to this worker (single-process app, so no cross-process race). */
let claiming: Promise<unknown> = Promise.resolve();
export function claim(workerId: string) {
  const result = claiming.then(async () => {
    const next = nextQueued(await listJobs());
    if (!next) return null;
    const { id, status } = next;
    const now = new Date().toISOString();
    await writeStatus(id, { ...status, state: "running", workerId, startedAt: now, updatedAt: now, stage: "starting", note: null, error: null });
    const hasState = !!(await stat(join(jobDir(id), "state.tar.gz")).catch(() => null));
    return { id, kind: status.kind ?? "produce", hasState, files: await inputFiles(id) };
  });
  claiming = result.catch(() => {});
  return result;
}

/** Merge a worker's status report. Returns whether the job should be cancelled. */
export async function reportStatus(projectId: string, workerId: string, patch: Record<string, unknown>) {
  const current = await readRun(projectId) as RunStatus & Record<string, unknown>;
  if (current.workerId !== workerId || current.state !== "running") return { cancel: true };  // job was reassigned
  const allowed = ["state", "stage", "activity", "note", "actions", "error", "costUsd", "finishedAt", "startedAt"];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  if (clean.state && !["running", "done", "failed", "cancelled"].includes(String(clean.state))) delete clean.state;
  await writeStatus(projectId, { ...current, ...clean, updatedAt: new Date().toISOString() });
  const cancelFile = join(jobDir(projectId), "cancel");
  const cancel = !!(await stat(cancelFile).catch(() => null));
  if (clean.state && clean.state !== "running") await rm(cancelFile, { force: true });
  if (clean.state === "done") {
    // Follow-ups that need the finished outputs, e.g. attaching the reel to the Spectora inspection.
    const workspace = await projectWorkspace(projectId);
    if (workspace) void pushIfReady(projectId, workspace).catch(e => console.error("Post-run follow-up failed", projectId, e));
  }
  return { cancel };
}

// What a worker may read and write inside a job directory.
const READABLE = /^(input\/[^/]+|supporting\/[^/]+|brief\.json|request\.json|state\.tar\.gz)$/;
const WRITABLE: Record<string, number> = {
  "out/highlight-reel-web.mp4": 2 * 1024 ** 3, "out/highlight-reel.mp4": 4 * 1024 ** 3, "out/poster.jpg": 20 * 1024 ** 2,
  "out/report.pdf": 200 * 1024 ** 2, "findings.json": 5 * 1024 ** 2, "summary.md": 5 * 1024 ** 2, "edit.json": 5 * 1024 ** 2,
  "state.tar.gz": 4 * 1024 ** 3,
};

function resolveIn(projectId: string, path: string) {
  const full = join(jobDir(projectId), path);
  if (relative(jobDir(projectId), full).startsWith("..")) throw new AppError(400, "Invalid path.");
  return full;
}

export async function assertClaimed(projectId: string, workerId: string) {
  const run = await readRun(projectId) as RunStatus & Record<string, unknown>;
  if (run.workerId !== workerId) throw new AppError(409, "This job is not assigned to this worker.");
}

export async function readFileFor(projectId: string, path: string) {
  if (!READABLE.test(path)) throw new AppError(403, "Not readable.");
  const full = resolveIn(projectId, path);
  const info = await stat(full).catch(() => null);
  if (!info) throw new AppError(404, "No such file.");
  return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String(info.size) },
  });
}

export async function writeFileFor(projectId: string, path: string, body: ReadableStream<Uint8Array> | null) {
  const limit = WRITABLE[path];
  if (!limit || !body) throw new AppError(403, "Not writable.");
  const full = resolveIn(projectId, path);
  await mkdir(dirname(full), { recursive: true });
  let size = 0;
  const counted = Readable.fromWeb(body as never);
  counted.on("data", (chunk: Buffer) => { size += chunk.length; if (size > limit) counted.destroy(new AppError(413, "Too large.")); });
  await pipeline(counted, createWriteStream(`${full}.part`));
  await rename(`${full}.part`, full);
  const now = new Date();
  await utimes(full, now, now);
  return size;
}
