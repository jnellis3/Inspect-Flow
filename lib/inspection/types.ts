// The app's domain model. A project is one inspection: its details, its uploads, and the
// pipeline job that turns them into a highlight reel and a PDF report.

export type VoiceMode = "ai" | "source";

/** A file being (or already) uploaded in chunks. */
export type Upload = {
  id: string;
  name: string;
  type: string;
  size: number;
  status: "uploading" | "ready";
  uploadId?: string;
  parts?: { partNumber: number; etag: string }[];
  fingerprint?: string;
};

export type Project = {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  property: { address: string; city: string; kind: string };
  inspection: { date: string; type: string };
  company: { name: string; people: string[]; phone: string; website: string; accent: string };
  voice: { mode: VoiceMode; voice: string };
  notes: string;
  video: Upload | null;
  supporting: Upload[];
};

export type RunState = "idle" | "queued" | "running" | "done" | "failed" | "cancelled";

/** Written by the pipeline worker into the job directory; read by the app. */
export type RunStatus = {
  state: RunState;
  kind?: "produce" | "revise";
  stage?: string | null;
  activity?: string | null;
  note?: string | null;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string | null;
  error?: string | null;
  costUsd?: number | null;
};

export type FindingSummary = {
  id: string;
  area: string;
  title: string;
  priority: "safety" | "repair" | "minor" | "monitor";
  who: "builder" | "homeowner" | "specialist";
  summary: string;
  fix: string;
  confidence: string;
};

export type ProjectDetail = {
  project: Project;
  run: RunStatus;
  workerOnline: boolean;
  outputs: { reel: boolean; report: boolean; poster: boolean; version: string | null };
  findings: FindingSummary[];
  positives: { title: string; area: string }[];
  editorNotes: string;
  revisions: { message: string; at: string }[];
};

export type ProjectListItem = Pick<Project, "id" | "property" | "inspection" | "updatedAt"> & {
  state: RunState;
  hasVideo: boolean;
  poster: boolean;
};

/** Voices offered for AI narration (OpenAI voices via OpenRouter). */
export const VOICES = [
  { id: "ash", label: "Ash", description: "Warm, confident, male" },
  { id: "coral", label: "Coral", description: "Bright, friendly, female" },
  { id: "sage", label: "Sage", description: "Calm, measured, female" },
  { id: "ballad", label: "Ballad", description: "Soft, gentle, male" },
  { id: "verse", label: "Verse", description: "Expressive, male" },
  { id: "shimmer", label: "Shimmer", description: "Clear, upbeat, female" },
] as const;

export const INSPECTION_TYPES = ["New construction", "Pre-purchase", "Pre-listing", "Warranty (11-month)", "Re-inspection", "Other"] as const;

export const MAX_VIDEO_BYTES = 6 * 1024 * 1024 * 1024;
export const MAX_SUPPORTING_BYTES = 1024 * 1024 * 1024;
export const MAX_SUPPORTING_FILES = 30;
export const UPLOAD_PART_BYTES = 8 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"] as const;
export const SUPPORTING_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "video/mp4", "video/quicktime", "video/webm", "video/x-m4v",
  "application/pdf", "text/plain", "text/markdown",
] as const;
