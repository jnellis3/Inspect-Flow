// A workspace is one inspection company: its company profile, its team, and its video allowance.
// Everything here acts on the signed-in account's workspace.
import { randomBytes } from "node:crypto";
import { hash } from "./auth";
import { applicationOrigin } from "./origin";
import { AppError, account, db, requireOwner, workspaceId } from "./store";
import type { Company, Invite, Member, Plan, Role, VideoUsage, Workspace } from "./types";

/** Free videos for a "trial" workspace, until paid plans exist. */
const trialVideos = () => Number(process.env.TRIAL_VIDEO_LIMIT || 3);
const limitFor = (plan: Plan) => plan === "unlimited" ? null : trialVideos();
const INVITE_MS = 7 * 86400000;

export async function getWorkspace(): Promise<Workspace> {
  const row = await db().prepare("SELECT id, name, profile, plan FROM workspaces WHERE id = ?")
    .bind(workspaceId()).first<{ id: string; name: string; profile: string; plan: Plan }>();
  if (!row) throw new AppError(404, "Workspace not found.");
  const profile = JSON.parse(row.profile) as Partial<Company>;
  const { used, limit } = await videoUsage();
  return {
    id: row.id,
    company: { name: row.name, phone: profile.phone ?? "", website: profile.website ?? "", accent: profile.accent ?? "" },
    plan: row.plan,
    usage: { used, limit },
  };
}

export async function updateCompany({ name, ...profile }: Company) {
  requireOwner();
  await db().prepare("UPDATE workspaces SET name = ?, profile = ? WHERE id = ?").bind(name, JSON.stringify(profile), workspaceId()).run();
}

// ---------- videos ----------

/** Videos started against the plan's allowance; `counted` says whether `projectId` is one of them. */
export async function videoUsage(projectId = ""): Promise<VideoUsage & { counted: boolean }> {
  const row = await db().prepare(`SELECT w.plan, (SELECT count(*) FROM videos WHERE workspace_id = w.id) AS used,
      EXISTS (SELECT 1 FROM videos WHERE project_id = ? AND workspace_id = w.id) AS counted FROM workspaces w WHERE w.id = ?`)
    .bind(projectId, workspaceId()).first<{ plan: Plan; used: number; counted: number }>();
  if (!row) throw new AppError(404, "Workspace not found.");
  return { used: row.used, limit: limitFor(row.plan), counted: !!row.counted };
}

/** Count a project against the allowance the first time it's sent for a video. Retries, restarts
 *  and change requests for the same project are free. */
export async function countVideo(projectId: string) {
  const { limit, counted } = await videoUsage(projectId);
  if (counted) return;
  const id = workspaceId();
  // One statement, so two projects started at once can't both take the last free video.
  await db().prepare(`INSERT INTO videos (project_id, workspace_id, created_at) SELECT ?, ?, ?
      WHERE ? IS NULL OR (SELECT count(*) FROM videos WHERE workspace_id = ?) < ? ON CONFLICT (project_id) DO NOTHING`)
    .bind(projectId, id, Date.now(), limit, id, limit).run();
  if (!(await videoUsage(projectId)).counted) {
    throw new AppError(402, `This workspace has used its ${limit} free videos. You can still request changes to the ones you've made.`);
  }
}

// ---------- team ----------

export async function listMembers(): Promise<Member[]> {
  const rows = await db().prepare("SELECT id, username, role, created_at FROM app_users WHERE workspace_id = ? ORDER BY created_at")
    .bind(workspaceId()).all<{ id: string; username: string; role: Role; created_at: number }>();
  return rows.results.map(r => ({ id: r.id, username: r.username, role: r.role, createdAt: r.created_at }));
}

/** Remove a teammate's account and sign them out everywhere. Their projects stay with the workspace. */
export async function removeMember(userId: string) {
  requireOwner();
  if (userId === account().id) throw new AppError(409, "You can't remove yourself.");
  const [removed] = await db().batch([
    db().prepare("DELETE FROM app_users WHERE id = ? AND workspace_id = ?").bind(userId, workspaceId()),
    db().prepare("DELETE FROM app_sessions WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM app_users WHERE id = ?)").bind(userId, userId),
  ]);
  if (removed.meta.changes !== 1) throw new AppError(404, "That person isn't in this workspace.");
}

/** A one-time link that lets a teammate create an account here. Only its hash is stored. */
export async function createInvite() {
  requireOwner();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await db().prepare("INSERT INTO invites (id, token_hash, workspace_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), hash(token), workspaceId(), account().id, now, now + INVITE_MS).run();
  // The token rides in the fragment, which browsers never send to servers or in Referer headers.
  return `${applicationOrigin().origin}/join#${token}`;
}

export async function listInvites(): Promise<Invite[]> {
  const rows = await db().prepare("SELECT id, created_at, expires_at FROM invites WHERE workspace_id = ? AND expires_at > ? ORDER BY created_at")
    .bind(workspaceId(), Date.now()).all<{ id: string; created_at: number; expires_at: number }>();
  return rows.results.map(r => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires_at }));
}

export async function revokeInvite(id: string) {
  requireOwner();
  await db().prepare("DELETE FROM invites WHERE id = ? AND workspace_id = ?").bind(id, workspaceId()).run();
}
