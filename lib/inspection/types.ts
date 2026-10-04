// The app's domain model. A workspace is one inspection company: its members, its company
// profile, and its projects. A project is one inspection: its details, its uploads, and the
// pipeline job that turns them into a highlight reel and a PDF report.

export type VoiceMode = "ai" | "source";

/** What is being inspected. Picks the form fields, the director's domain profile, and the wording. */
export type Vertical = "home" | "vehicle";

export type Vehicle = { year: string; make: string; model: string; trim: string; vin: string; mileage: string; location: string };

/** How the company appears in its videos and reports. Shared by everyone in the workspace. */
export type Company = { name: string; phone: string; website: string; accent: string };

export type Role = "owner" | "member";

/** "trial" workspaces get a few free videos; "unlimited" ones have no cap. */
export type Plan = "trial" | "unlimited";

/** Videos the workspace has started, and how many its plan allows (null: no limit). */
export type VideoUsage = { used: number; limit: number | null };

/** The workspace is named after its company (`company.name`). */
export type Workspace = { id: string; company: Company; plan: Plan; usage: VideoUsage };

export type Member = { id: string; username: string; role: Role; createdAt: number };

export type Invite = { id: string; createdAt: number; expiresAt: number };

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
  vertical: Vertical;
  property: { address: string; city: string; kind: string };
  vehicle: Vehicle;
  inspection: { date: string; type: string };
  inspectors: string[];
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
  /** Whose job it is, so the queue can take turns between workspaces. */
  workspace?: string;
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
  who: "builder" | "homeowner" | "specialist" | "seller" | "owner";
  summary: string;
  fix: string;
  estimate?: string;
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
  /** `counted`: this project already used one of the workspace's videos (retries and changes are free). */
  usage: VideoUsage & { counted: boolean };
  /** The Spectora inspection this project came from or was linked to. */
  spectora?: SpectoraLink | null;
  /** The public watch link, once one has been made. */
  share?: { token: string; url: string; createdAt: string } | null;
};

export type SpectoraLink = {
  inspectionId: string;
  projectId: string;
  status: "linked" | "canceled" | "deleted";
  mapped: { property: Project["property"]; inspection: Project["inspection"]; people: string[]; client: string; agent: string; services: string[]; url: string };
  pushedAt: string | null;
  pushError: string | null;
  attachmentId: string | null;
};

export type ProjectListItem = Pick<Project, "id" | "vertical" | "property" | "vehicle" | "inspection" | "updatedAt"> & {
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

export const INSPECTION_TYPES: Record<Vertical, readonly string[]> = {
  home: ["New construction", "Pre-purchase", "Pre-listing", "Warranty (11-month)", "Re-inspection", "Other"],
  vehicle: ["Pre-purchase", "Pre-sale", "Consignment", "Service", "Post-purchase baseline", "Other"],
};

/** What the report calls the things that were fine (matches pipeline/reel/schema.ts `wording`). */
export const POSITIVES_LABEL: Record<Vertical, string> = { home: "Done right", vehicle: "Checks out" };

export const EMPTY_VEHICLE: Vehicle = { year: "", make: "", model: "", trim: "", vin: "", mileage: "", location: "" };

type Subject = Pick<Project, "vertical" | "property" | "vehicle">;

/** "2011 Porsche 911 Carrera S" */
export const vehicleName = (v: Vehicle) => [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");

/** "48,210" → "48,210 miles"; anything with its own unit ("77,000 km") stays as typed. */
export const mileage = (value: string) => /^[\d,.\s]+$/.test(value) ? `${value.trim()} miles` : value;

/** The project's headline: the address, or the vehicle. */
export const projectTitle = (p: Subject) =>
  p.vertical === "vehicle" ? vehicleName(p.vehicle) || "Vehicle inspection" : p.property.address;

/** Secondary details shown under the title. */
export const projectDetails = (p: Subject) =>
  p.vertical === "vehicle"
    ? [mileage(p.vehicle.mileage), p.vehicle.location].filter(Boolean) as string[]
    : [p.property.city].filter(Boolean);

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
