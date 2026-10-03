// On-demand video engines on RunPod. Every 20 s: start a pod when jobs are waiting, replace a
// pod that never connects or goes silent, and terminate it once the queue has been empty for a
// few minutes. Pods run the worker image in remote mode and talk to the app over HTTPS, so you
// only pay for GPU time while a video is being made.
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jobsDir } from "./server";
import { listJobs, workerToken } from "./worker-api";
import type { RunStatus } from "./types";

const API = "https://rest.runpod.io/v1";
const TICK_MS = 20_000;
const IDLE_MS = 4 * 60_000;        // empty queue for this long → terminate the pod
const CONNECT_MS = 20 * 60_000;    // a new pod must reach the app within this (image pull + boot)
const SILENT_MS = 12 * 60_000;     // a running job with no status this long → requeue it
const CHECK_MS = 2 * 60_000;       // how often to confirm the pod still exists
const RETRY_MS = 2 * 60_000;       // back-off after RunPod refuses to create a pod

type Engine = { podId: string | null; createdAt: number; lastActive: number; lastChecked: number; failures: number; lastError: string | null; lastErrorAt: number };

const enginePath = () => join(jobsDir(), ".runpod.json");
async function readEngine(): Promise<Engine> {
  try { return JSON.parse(await readFile(enginePath(), "utf8")); }
  catch { return { podId: null, createdAt: 0, lastActive: 0, lastChecked: 0, failures: 0, lastError: null, lastErrorAt: 0 }; }
}
async function saveEngine(e: Engine) {
  await writeFile(`${enginePath()}.tmp`, JSON.stringify(e, null, 1));
  await rename(`${enginePath()}.tmp`, enginePath());
}

async function runpod(method: string, path: string, body?: unknown) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) throw Object.assign(new Error(`RunPod ${method} ${path}: HTTP ${response.status} ${text.slice(0, 300)}`), { status: response.status });
  return text ? JSON.parse(text) : null;
}

async function createPod() {
  const env: Record<string, string> = {
    APP_URL: process.env.WORKER_APP_URL || process.env.APP_ORIGIN || "",
    WORKER_TOKEN: await workerToken(),
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
    AGENT_MODEL: process.env.AGENT_MODEL || "anthropic/claude-sonnet-5.5",
    WHISPER_DEVICE: "cpu",
  };
  const pod = await runpod("POST", "/pods", {
    name: "inspect-flow-worker",
    imageName: process.env.WORKER_IMAGE || "ghcr.io/jnellis3/inspect-flow-worker:latest",
    computeType: "GPU",
    gpuTypeIds: (process.env.RUNPOD_GPU_TYPES?.trim() || "NVIDIA RTX A4000,NVIDIA RTX A4500,NVIDIA RTX A5000,NVIDIA RTX 4000 Ada Generation,NVIDIA GeForce RTX 3090")
      .split(",").map(s => s.trim()).filter(Boolean),
    gpuCount: 1,
    cloudType: process.env.RUNPOD_CLOUD_TYPE || "SECURE",
    containerDiskInGb: Number(process.env.RUNPOD_DISK_GB || 80),
    volumeInGb: 0,
    minVCPUPerGPU: Number(process.env.RUNPOD_MIN_VCPU || 8),
    minRAMPerGPU: Number(process.env.RUNPOD_MIN_RAM_GB || 24),
    ports: [],
    env,
    dockerEntrypoint: ["node", "/opt/pipeline/worker.mjs"],
    dockerStartCmd: [],
  });
  console.log(`runpod: started pod ${pod.id} ($${pod.costPerHr}/h)`);
  return pod.id as string;
}

async function terminate(podId: string) {
  try { await runpod("DELETE", `/pods/${podId}`); console.log(`runpod: terminated pod ${podId}`); }
  catch (e) { if ((e as { status?: number }).status !== 404) throw e; }
}

async function note(jobId: string, status: RunStatus, patch: Partial<RunStatus>) {
  const path = join(jobsDir(), jobId, "status.json");
  await writeFile(`${path}.tmp`, JSON.stringify({ ...status, ...patch }, null, 1));
  await rename(`${path}.tmp`, path);
}

async function heartbeatAt() {
  try { return (await stat(join(jobsDir(), ".worker-heartbeat"))).mtimeMs; } catch { return 0; }
}

export async function tick() {
  const now = Date.now();
  const jobs = await listJobs();
  const engine = await readEngine();
  const heartbeat = await heartbeatAt();

  // A running job whose worker went silent goes back to the queue; its pod is presumed dead.
  for (const j of jobs.filter(x => x.status.state === "running")) {
    const last = Date.parse(String(j.status.updatedAt ?? j.status.startedAt ?? 0));
    if (now - last > SILENT_MS) {
      await note(j.id, j.status, { state: "queued", note: "The video engine stopped responding; restarting on a fresh one.", queuedAt: new Date().toISOString() });
      if (engine.podId) { await terminate(engine.podId); engine.podId = null; }
    }
  }
  const fresh = await listJobs();
  const queued = fresh.filter(j => j.status.state === "queued");
  const busy = queued.length > 0 || fresh.some(j => j.status.state === "running");
  if (busy) engine.lastActive = now;

  if (engine.podId) {
    if (now - engine.lastChecked > CHECK_MS) {
      engine.lastChecked = now;
      try {
        const pod = await runpod("GET", `/pods/${engine.podId}`);
        if (!pod || ["TERMINATED", "EXITED"].includes(pod.desiredStatus)) engine.podId = null;
      } catch (e) { if ((e as { status?: number }).status === 404) engine.podId = null; }
    }
    if (engine.podId && heartbeat < engine.createdAt && now - engine.createdAt > CONNECT_MS) {
      await terminate(engine.podId);
      engine.podId = null;
      engine.failures += 1;
      engine.lastError = "A cloud video engine started but never connected.";
      engine.lastErrorAt = now;
    } else if (engine.podId && !busy && now - engine.lastActive > IDLE_MS) {
      await terminate(engine.podId);
      engine.podId = null;
    }
  }

  if (!engine.podId && queued.length) {
    if (engine.failures >= 3) {
      for (const j of queued) await note(j.id, j.status, { state: "failed", error: `Couldn't start a cloud video engine: ${engine.lastError ?? "unknown error"} Try again in a few minutes.`, finishedAt: new Date().toISOString() });
      engine.failures = 0;
    } else if (now - engine.lastErrorAt > RETRY_MS) {
      try {
        engine.podId = await createPod();
        engine.createdAt = engine.lastActive = engine.lastChecked = now;
        for (const j of queued) await note(j.id, j.status, { note: "Starting a cloud video engine. This usually takes 2–6 minutes." });
      } catch (e) {
        engine.failures += 1;
        engine.lastError = String((e as Error).message).slice(0, 300);
        engine.lastErrorAt = now;
        console.error("runpod:", engine.lastError);
        for (const j of queued) await note(j.id, j.status, { note: "No cloud GPU is free right now; trying again shortly." });
      }
    }
  }
  if (heartbeat > engine.createdAt && engine.failures) engine.failures = 0;  // a pod connected: reset
  await saveEngine(engine);
}

let started = false;
export function startDispatcher() {
  if (started || process.env.WORKER_MODE !== "runpod") return;
  if (!process.env.RUNPOD_API_KEY) { console.warn("WORKER_MODE=runpod but RUNPOD_API_KEY is not set; jobs will wait."); return; }
  started = true;
  let running = false;
  console.log("runpod: dispatcher started");
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (e) { console.error("runpod dispatcher:", e); } finally { running = false; }
  }, TICK_MS);
}
