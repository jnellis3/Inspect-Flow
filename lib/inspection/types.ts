export type Decision = "pending" | "approved" | "dismissed";
export type Finding = {
  id: string; source?: "inspector" | "agent"; analysisJobId?:string; title: string; location: string; observation: string; evidence: string;
  whyItMatters: string; recommendation: string; severity: "attention" | "maintenance" | "information";
  timestamp: number; endTimestamp: number; confidence: string; decision: Decision;
  pointer?: {x: number; y: number} | null;
  diagram?: {cause: string; effect: string; action: string} | null;
};
export type Aerial = {status:"draft"|"confirmed";latitude:number;longitude:number;matchedAddress:string;year:string;attribution:string;imageKey:string;imageSha256:string;extent:{xmin:number;ymin:number;xmax:number;ymax:number};rasterId:number};
export type Inspection = {
  id: string; address: string; inspector: string; date: string; notes: string;
  revision: number; createdAt: string; updatedAt: string;
  video: {name: string; type: string; size: number; status: "awaiting_upload" | "ready"; duration?: number; uploadId?:string; parts?:{partNumber:number;etag:string}[]; fingerprint?:string} | null;
  aerial?:Aerial|null; lastAnalysisJobId?:string; findings: Finding[]; coverage: string; transcript: string; narration: boolean;
  messages: {id: string; role: "user" | "assistant"; text: string; at: string}[];
};
export type Job = {
  id: string; projectId: string; kind: "analysis" | "chat" | "export" | "probe";
  status: "starting" | "running" | "completed" | "failed" | "cancelled";
  phase: string; sessionId: string | null; turnId: string | null; error: string | null;
  createdAt: string; updatedAt: string; revision: number; result: Record<string, unknown>;
};
export type SavedFile = {id: string; projectId: string; name: string; mime: string; size: number; kind: string; revision: number};
export type ProjectDetail = {project: Inspection; jobs: Job[]; files: SavedFile[]};
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const MAX_DURATION = 90 * 60;
export const MODEL = "gpt-6.1-sol";
export function timestamp(value: number) {const s=Math.max(0,Math.floor(value)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}

export const UPLOAD_PART_BYTES=8*1024*1024;
export const STAGING_PART_BYTES=40*1024*1024;
