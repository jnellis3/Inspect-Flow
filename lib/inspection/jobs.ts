// The app's side of the pipeline contract. Each project gets a job directory under
// jobsDir(); the app writes brief.json, links the uploads into input/ and supporting/,
// and queues work with request.json + status.json. The worker (pipeline/worker.mjs) owns
// status.json once a job is queued and writes results to out/.
import { copyFile, link, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AppError, bucket, jobsDir, remoteWorkers } from "./server";
import { mileage, projectDetails, projectTitle, type FindingSummary, type Project, type ProjectDetail, type RunStatus } from "./types";

const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function jobDir(projectId: string) {
  if (!ID.test(projectId)) throw new AppError(400, "Invalid project.");
  return join(jobsDir(), projectId);
}

async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; } catch { return null; }
}

async function writeJson(path: string, value: unknown) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 1));
  await rename(`${path}.tmp`, path);
}

async function exists(path: string) {
  try { await stat(path); return true; } catch { return false; }
}

export async function readRun(projectId: string): Promise<RunStatus> {
  return (await readJson<RunStatus>(join(jobDir(projectId), "status.json"))) ?? { state: "idle" };
}

/** The worker touches a heartbeat file every few seconds while it is alive. In RunPod mode the
 *  dispatcher starts engines on demand, so "no worker right now" is normal, not an outage. */
export async function workerOnline() {
  if (process.env.WORKER_MODE === "runpod") return true;
  try { return Date.now() - (await stat(join(jobsDir(), ".worker-heartbeat"))).mtimeMs < 30_000; } catch { return false; }
}

export const OUTPUTS = {
  reel: { file: "out/highlight-reel-web.mp4", type: "video/mp4", download: "highlight-reel.mp4" },
  master: { file: "out/highlight-reel.mp4", type: "video/mp4", download: "highlight-reel-master.mp4" },
  report: { file: "out/report.pdf", type: "application/pdf", download: "inspection-report.pdf" },
  poster: { file: "out/poster.jpg", type: "image/jpeg", download: "poster.jpg" },
} as const;

export async function detail(project: Project): Promise<Omit<ProjectDetail, "project">> {
  const dir = jobDir(project.id);
  const [run, online, reel, report, poster] = await Promise.all([
    readRun(project.id), workerOnline(),
    stat(join(dir, OUTPUTS.reel.file)).catch(() => null), exists(join(dir, OUTPUTS.report.file)), exists(join(dir, OUTPUTS.poster.file)),
  ]);
  const findings = await readJson<{ findings?: FindingSummary[]; positives?: { title: string; area: string }[] }>(join(dir, "findings.json"));
  let editorNotes = "";
  try { editorNotes = (await readFile(join(dir, "summary.md"), "utf8")).slice(0, 20_000); } catch { /* not written yet */ }
  return {
    run,
    workerOnline: online,
    outputs: { reel: !!reel, report, poster, version: reel ? String(Math.round(reel.mtimeMs)) : null },
    findings: (findings?.findings ?? []).map(({ id, area, title, priority, who, summary, fix, estimate, confidence }) => ({ id, area, title, priority, who, summary, fix, estimate, confidence })),
    positives: (findings?.positives ?? []).map(({ title, area }) => ({ title, area })),
    editorNotes,
    revisions: (await readJson<{ message: string; at: string }[]>(join(dir, "revisions.json"))) ?? [],
  };
}

/** "2026-10-02" → "October 2, 2026" (other text passes through). */
function readableDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The pipeline's brief.json: what the director agent knows about the job. */
function briefFor(p: Project) {
  const company: Record<string, unknown> = { name: p.company.name || "Your inspector", people: p.company.people.filter(Boolean) };
  if (p.company.phone) company.phone = p.company.phone;
  if (p.company.website) company.website = p.company.website;
  if (/^#[0-9a-fA-F]{6}$/.test(p.company.accent)) company.accent = p.company.accent;
  const subject = { title: projectTitle(p), details: projectDetails(p) };
  const shared = { targetSeconds: [120, 180], voice: p.voice, subject, inspection: { date: readableDate(p.inspection.date), type: p.inspection.type }, company, notes: p.notes };
  if (p.vertical === "vehicle") {
    const v = p.vehicle;
    const audience = /pre-sale|consignment/i.test(p.inspection.type) ? "prospective buyers" : /post-purchase|service/i.test(p.inspection.type) ? "owner" : "buyer";
    const vehicle = Object.fromEntries(Object.entries({ ...v, mileage: mileage(v.mileage) }).filter(([, value]) => value));
    return { profile: "vehicle-inspection", audience, vehicle, ...shared };
  }
  return {
    profile: "home-inspection",
    audience: "homeowner",
    property: { address: p.property.address, city: p.property.city || undefined, kind: p.property.kind || undefined },
    ...shared,
  };
}

const extension = (type: string, name: string) =>
  ({ "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v" } as Record<string, string>)[type]
  ?? (name.split(".").pop() || "mp4").toLowerCase();

/** Hard-link a stored upload into the job directory (same volume), copying if linking fails. */
async function place(key: string, dest: string) {
  if (await exists(dest)) return;
  const source = await bucket().path(key);
  if (!source) throw new AppError(409, "An uploaded file is missing. Please upload it again.");
  try { await link(source, dest); } catch { await copyFile(source, dest); }
}

function safeName(name: string, taken: Set<string>) {
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 50) || "file";
  const ext = (dot > 0 ? name.slice(dot + 1) : "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase();
  let candidate = ext ? `${stem}.${ext}` : stem;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = ext ? `${stem}_${i}.${ext}` : `${stem}_${i}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

export async function queueRun(p: Project, kind: "produce" | "revise", message = "") {
  const dir = jobDir(p.id);
  const run = await readRun(p.id);
  if (run.state === "queued" || run.state === "running") throw new AppError(409, "This project is already being worked on.");
  if (p.video?.status !== "ready") throw new AppError(409, "Upload the walkthrough video first.");
  if (p.supporting.some(f => f.status !== "ready")) throw new AppError(409, "Wait for the supporting files to finish uploading.");
  if (kind === "revise" && !(await exists(join(dir, OUTPUTS.reel.file)))) throw new AppError(409, "There's no finished video to revise yet.");

  await mkdir(join(dir, "input"), { recursive: true });
  await mkdir(join(dir, "supporting"), { recursive: true });
  await place(`${p.id}/source`, join(dir, "input", `walkthrough.${extension(p.video.type, p.video.name)}`));
  const taken = new Set<string>();
  for (const f of p.supporting) await place(`${p.id}/supporting/${f.id}`, join(dir, "supporting", safeName(f.name, taken)));
  await writeJson(join(dir, "brief.json"), briefFor(p));
  const now = new Date().toISOString();
  await writeJson(join(dir, "request.json"), { kind, message, requestedAt: now });
  if (kind === "revise") {
    const history = (await readJson<{ message: string; at: string }[]>(join(dir, "revisions.json"))) ?? [];
    await writeJson(join(dir, "revisions.json"), [...history, { message, at: now }]);
  }
  await rm(join(dir, "cancel"), { force: true });
  await writeJson(join(dir, "status.json"), { state: "queued", kind, queuedAt: now, stage: null, note: null, error: null });
}

export async function cancelRun(projectId: string) {
  const dir = jobDir(projectId);
  const run = await readRun(projectId);
  if (run.state === "queued") await writeJson(join(dir, "status.json"), { ...run, state: "cancelled", finishedAt: new Date().toISOString() });
  else if (run.state === "running") {
    await writeFile(join(dir, "cancel"), "");
    // A remote worker learns about the cancel on its next report; stop showing progress now.
    if (remoteWorkers()) await writeJson(join(dir, "status.json"), { ...run, note: "Stopping…" });
  }
  else throw new AppError(409, "Nothing is running.");
}

export async function removeJob(projectId: string) {
  const run = await readRun(projectId);
  if (run.state === "running" || run.state === "queued") throw new AppError(409, "Stop the current job before deleting this project.");
  await rm(jobDir(projectId), { recursive: true, force: true });
}
