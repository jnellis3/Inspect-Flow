// Resumable chunked uploads for the walkthrough video and supporting files.
//
// start → PUT each 8 MiB part (any order, retryable) → complete. Choosing the same file again
// after an interruption resumes: the project records which parts already arrived.
import { AppError, bucket, getProject, updateProject } from "./store";
import { readRun } from "./jobs";
import {
  MAX_SUPPORTING_BYTES, MAX_SUPPORTING_FILES, MAX_VIDEO_BYTES, SUPPORTING_TYPES, UPLOAD_PART_BYTES, VIDEO_TYPES,
  type Project, type Upload,
} from "./types";

export type Target = { kind: "video" } | { kind: "supporting"; id: string };

const keyFor = (projectId: string, t: Target) => t.kind === "video" ? `${projectId}/source` : `${projectId}/supporting/${t.id}`;
const find = (p: Project, t: Target) => t.kind === "video" ? p.video : p.supporting.find(f => f.id === t.id) ?? null;
const put = (p: Project, t: Target, u: Upload | null): Project => t.kind === "video"
  ? { ...p, video: u }
  : { ...p, supporting: u ? p.supporting.map(f => f.id === t.id ? u : f) : p.supporting.filter(f => f.id !== t.id) };

async function assertEditable(p: Project, t: Target) {
  const run = await readRun(p.id);
  if (run.state === "queued" || run.state === "running") throw new AppError(409, "Wait for the current job to finish before changing files.");
  if (t.kind === "video" && run.state !== "idle") throw new AppError(409, "This project already has a video. Start a new project for different footage.");
}

export async function startUpload(projectId: string, kind: "video" | "supporting", file: { name: string; type: string; size: number; fingerprint: string }) {
  const p = await getProject(projectId);
  if (kind === "video") {
    if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) throw new AppError(415, "Upload an MP4, MOV, M4V or WebM video.");
    if (file.size > MAX_VIDEO_BYTES) throw new AppError(413, "Videos can be up to 6 GB.");
  } else {
    if (!(SUPPORTING_TYPES as readonly string[]).includes(file.type)) throw new AppError(415, "Supporting files can be photos, short videos, PDFs or text notes.");
    if (file.size > MAX_SUPPORTING_BYTES) throw new AppError(413, "Supporting files can be up to 1 GB each.");
    if (p.supporting.length >= MAX_SUPPORTING_FILES) throw new AppError(413, `Attach up to ${MAX_SUPPORTING_FILES} supporting files.`);
  }
  // Resume an interrupted upload of the same file.
  const existing = kind === "video" ? p.video : p.supporting.find(f => f.fingerprint === file.fingerprint && f.status === "uploading");
  if (existing?.status === "uploading" && existing.fingerprint === file.fingerprint && existing.size === file.size) return { project: p, upload: existing };

  const target: Target = kind === "video" ? { kind } : { kind, id: crypto.randomUUID() };
  await assertEditable(p, target);
  if (kind === "video" && p.video) await bucket().delete(`${p.id}/source`);
  const multipart = await bucket().createMultipartUpload(keyFor(p.id, target), { httpMetadata: { contentType: file.type } });
  const upload: Upload = {
    id: target.kind === "supporting" ? target.id : "video", name: file.name.slice(0, 200), type: file.type, size: file.size,
    status: "uploading", uploadId: multipart.uploadId, parts: [], fingerprint: file.fingerprint,
  };
  try {
    const project = await updateProject(p.id, current => target.kind === "video" ? { ...current, video: upload } : { ...current, supporting: [...current.supporting, upload] });
    return { project, upload };
  } catch (e) { await multipart.abort(); throw e; }
}

export async function uploadPart(projectId: string, t: Target, part: number, request: Request) {
  const p = await getProject(projectId);
  const u = find(p, t);
  if (u?.status !== "uploading" || !u.uploadId) throw new AppError(409, "Start the upload first.");
  const expected = Math.min(UPLOAD_PART_BYTES, u.size - (part - 1) * UPLOAD_PART_BYTES);
  if (!Number.isInteger(part) || part < 1 || expected <= 0 || Number(request.headers.get("x-part-size")) !== expected || !request.body) {
    throw new AppError(400, "Invalid upload part.");
  }
  const bytes = new Uint8Array(await new Response(request.body).arrayBuffer());
  if (bytes.byteLength !== expected) throw new AppError(400, "The upload part was incomplete. It will be retried.");
  let uploaded: { partNumber: number; etag: string };
  try { uploaded = await bucket().resumeMultipartUpload(keyFor(p.id, t), u.uploadId).uploadPart(part, bytes); }
  catch { throw new AppError(503, "Upload interrupted. It will resume."); }
  await updateProject(p.id, current => {
    const cu = find(current, t);
    if (!cu || cu.uploadId !== u.uploadId) throw new AppError(409, "The upload changed; refresh to continue.");
    return put(current, t, { ...cu, parts: [...(cu.parts ?? []).filter(x => x.partNumber !== part), uploaded] });
  });
  return uploaded.partNumber;
}

export async function completeUpload(projectId: string, t: Target) {
  const p = await getProject(projectId);
  const u = find(p, t);
  if (u?.status === "ready") return p;
  if (!u?.uploadId) throw new AppError(409, "Start the upload first.");
  const parts = [...(u.parts ?? [])].sort((a, b) => a.partNumber - b.partNumber);
  if (parts.length !== Math.ceil(u.size / UPLOAD_PART_BYTES) || parts.some((x, i) => x.partNumber !== i + 1)) {
    throw new AppError(409, "The upload is incomplete. Choose the same file to resume.");
  }
  const key = keyFor(p.id, t);
  const already = await bucket().head(key);
  const object = already?.size === u.size ? already : await bucket().resumeMultipartUpload(key, u.uploadId).complete(parts);
  if (object.size !== u.size) throw new AppError(409, "The uploaded size doesn't match. Please upload the file again.");
  return updateProject(p.id, current => {
    const cu = find(current, t);
    if (!cu) throw new AppError(404, "Upload not found.");
    return put(current, t, { id: cu.id, name: cu.name, type: cu.type, size: cu.size, status: "ready" });
  });
}

export async function removeSupporting(projectId: string, id: string) {
  const p = await getProject(projectId);
  const t: Target = { kind: "supporting", id };
  if ((await readRun(p.id)).state !== "idle") throw new AppError(409, "This file is already part of the video. Mention it in a change request instead.");
  await bucket().delete(keyFor(p.id, t));
  return updateProject(p.id, current => put(current, t, null));
}
