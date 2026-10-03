"use client";
import { request } from "./api";
import { UPLOAD_PART_BYTES, type Project, type Upload } from "@/lib/inspection/types";

/** Identifies "the same file" across page reloads so an interrupted upload can resume. */
async function fingerprint(file: File) {
  const sample = await new Blob([file.slice(0, 65536), file.slice(Math.max(0, file.size - 65536)), `${file.size}:${file.name}`]).arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", sample);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/** Best-effort type for files the browser can't name (HEIC on some desktops, .mov on Linux). */
function mimeOf(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ({ mov: "video/quicktime", mp4: "video/mp4", m4v: "video/x-m4v", heic: "image/heic", heif: "image/heif", md: "text/markdown", txt: "text/plain" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}

/** PUT one part, retrying network drops and server hiccups with backoff. */
async function putPart(url: string, blob: Blob) {
  let lastError = "Upload failed.";
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    let response: Response;
    try {
      response = await fetch(url, { method: "PUT", body: blob, headers: { "X-Inspection-Request": "1", "X-Part-Size": String(blob.size) } });
    } catch {
      lastError = "The connection dropped. Choose the same file to resume.";
      continue;
    }
    if (response.ok) return;
    lastError = ((await response.json().catch(() => ({}))) as { error?: string }).error || lastError;
    if (response.status < 500 && response.status !== 409 && response.status !== 429) break;  // won't succeed on retry
  }
  throw new Error(lastError);
}

export async function uploadFile(projectId: string, target: "video" | "supporting", file: File, onProgress: (fraction: number) => void): Promise<Project> {
  const { upload } = await request<{ project: Project; upload: Upload }>(`/api/projects/${projectId}/upload`, {
    method: "POST", body: { action: "start", target, name: file.name, type: mimeOf(file), size: file.size, fingerprint: await fingerprint(file) },
  });
  const total = Math.ceil(file.size / UPLOAD_PART_BYTES);
  const done = new Set(upload.parts?.map(p => p.partNumber) ?? []);
  const pending = Array.from({ length: total }, (_, i) => i + 1).filter(n => !done.has(n));
  let finished = done.size;
  onProgress(finished / total);
  const fileParam = target === "supporting" ? `&file=${upload.id}` : "";
  const worker = async () => {
    for (let n = pending.shift(); n !== undefined; n = pending.shift()) {
      const blob = file.slice((n - 1) * UPLOAD_PART_BYTES, Math.min(file.size, n * UPLOAD_PART_BYTES));
      await putPart(`/api/projects/${projectId}/upload?target=${target}${fileParam}&part=${n}`, blob);
      onProgress(++finished / total);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const { project } = await request<{ project: Project }>(`/api/projects/${projectId}/upload`, {
    method: "POST", body: { action: "complete", target, fileId: target === "supporting" ? upload.id : undefined },
  });
  return project;
}
