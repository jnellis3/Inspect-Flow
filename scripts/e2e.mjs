// End-to-end check against a running, DISPOSABLE installation: sign up, create a project,
// upload a walkthrough (and optional supporting files) in chunks, make the video, wait,
// and verify the outputs are served. Spends real API credit.
//
//   E2E_ORIGIN=http://localhost:3100 node scripts/e2e.mjs walkthrough.mp4 [photo.jpg ...]
import { createHash, randomBytes } from "node:crypto";
import { openSync, readSync, statSync, closeSync } from "node:fs";
import { basename } from "node:path";

const origin = process.env.E2E_ORIGIN || "http://localhost:3100";
const [video, ...extras] = process.argv.slice(2);
if (!video) throw new Error("usage: node scripts/e2e.mjs walkthrough.mp4 [supporting files...]");
const PART = 8 * 1024 * 1024;
let cookie = "";

async function call(path, { method = "GET", body, raw, headers = {} } = {}) {
  const response = await fetch(origin + path, {
    method, body: raw ?? (body ? JSON.stringify(body) : undefined),
    headers: { Origin: origin, "X-Inspection-Request": "1", Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
  });
  const set = response.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const data = response.headers.get("content-type")?.includes("json") ? await response.json() : await response.arrayBuffer();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

function readPart(path, index, size) {
  const fd = openSync(path, "r");
  try {
    const length = Math.min(PART, size - index * PART);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, index * PART);
    return buffer;
  } finally { closeSync(fd); }
}

const TYPES = { mp4: "video/mp4", mov: "video/quicktime", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf", txt: "text/plain" };
async function upload(projectId, target, path) {
  const size = statSync(path).size;
  const type = TYPES[path.split(".").pop().toLowerCase()] ?? "application/octet-stream";
  const fingerprint = createHash("sha256").update(`${path}:${size}`).digest("hex");
  const { upload: u } = await call(`/api/projects/${projectId}/upload`, { method: "POST", body: { action: "start", target, name: basename(path), type, size, fingerprint } });
  const parts = Math.ceil(size / PART);
  for (let i = 0; i < parts; i++) {
    const data = readPart(path, i, size);
    await call(`/api/projects/${projectId}/upload?target=${target}${target === "supporting" ? `&file=${u.id}` : ""}&part=${i + 1}`, { method: "PUT", raw: data, headers: { "X-Part-Size": String(data.length) } });
  }
  await call(`/api/projects/${projectId}/upload`, { method: "POST", body: { action: "complete", target, fileId: target === "supporting" ? u.id : undefined } });
  console.log(`uploaded ${basename(path)} (${parts} parts)`);
}

const username = `e2e-${randomBytes(3).toString("hex")}`;
await call("/api/auth", { method: "POST", body: { action: "signup", username, password: randomBytes(18).toString("hex") } });
console.log("signed up as", username);
const { project } = await call("/api/projects", { method: "POST", body: {
  property: { address: "E2E Test House", city: "Cypress, TX", kind: "" },
  inspection: { date: "2026-10-03", type: "New construction" },
  company: { name: "E2E Inspections", people: ["Tyler"], phone: "", website: "", accent: "" },
  voice: { mode: process.env.E2E_VOICE || "ai", voice: "ash" }, notes: "Automated end-to-end test. Keep the reel short.",
} });
await upload(project.id, "video", video);
for (const extra of extras) await upload(project.id, "supporting", extra);
await call(`/api/projects/${project.id}/run`, { method: "POST", body: { action: "produce" } });

async function waitForRun(label) {
const started = Date.now();
let last = "";
for (;;) {
  const detail = await call(`/api/projects/${project.id}`);
  const line = `${detail.run.state} · ${detail.run.stage ?? ""} · ${detail.run.activity ?? ""}`;
  if (line !== last) { console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${line}`); last = line; }
  if (["done", "failed", "cancelled"].includes(detail.run.state)) {
    if (detail.run.state !== "done") throw new Error(`run ${detail.run.state}: ${detail.run.error}`);
    const reel = await call(`/api/projects/${project.id}/output/reel`);
    const report = await call(`/api/projects/${project.id}/output/report`);
    const range = await fetch(`${origin}/api/projects/${project.id}/output/reel`, { headers: { Cookie: cookie, Range: "bytes=0-99" } });
    console.log(JSON.stringify({
      run: label, project: project.id, findings: detail.findings.length, reelBytes: reel.byteLength, reportBytes: report.byteLength,
      rangeStatus: range.status, costUsd: detail.run.costUsd, version: detail.outputs.version, minutes: +((Date.now() - started) / 60000).toFixed(1),
    }));
    return detail;
  }
  await new Promise(r => setTimeout(r, 10_000));
}
}

const first = await waitForRun("produce");
// Optional: ask for changes and check the revision produces a new video.
if (process.env.E2E_REVISE) {
  if (process.env.E2E_BEFORE_REVISE) { const { execSync } = await import("node:child_process"); execSync(process.env.E2E_BEFORE_REVISE, { stdio: "inherit" }); }
  await call(`/api/projects/${project.id}/run`, { method: "POST", body: { action: "revise", message: process.env.E2E_REVISE } });
  const second = await waitForRun("revise");
  if (second.outputs.version === first.outputs.version) throw new Error("revision did not produce a new video");
  console.log("revision produced a new video");
}
