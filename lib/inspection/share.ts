// Public watch links. A finished reel is served to anyone holding the token at /w/<token>; the
// token is random, revocable, and the only thing that page or its media routes trust.
import { randomBytes } from "node:crypto";
import { applicationOrigin } from "./origin";
import { AppError, db } from "./server";
import { owner } from "./store";
import type { Project } from "./types";

export type Share = { token: string; url: string; createdAt: string };
const TOKEN = /^[A-Za-z0-9_-]{22,64}$/;

export const shareUrl = (token: string) => new URL(`/w/${token}`, applicationOrigin()).toString();

/** The project's live share link, if one exists. */
export async function getShare(projectId: string, accountId = owner()): Promise<Share | null> {
  const row = await db().prepare("SELECT token, created_at FROM shares WHERE project_id = ? AND owner = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .bind(projectId, accountId).first<{ token: string; created_at: string }>();
  return row ? { token: row.token, url: shareUrl(row.token), createdAt: row.created_at } : null;
}

/** Reuse the live link or mint one. */
export async function ensureShare(projectId: string, accountId = owner()): Promise<Share> {
  const existing = await getShare(projectId, accountId);
  if (existing) return existing;
  const token = randomBytes(24).toString("base64url");
  const now = new Date().toISOString();
  await db().prepare("INSERT INTO shares (token, project_id, owner, created_at) VALUES (?, ?, ?, ?)").bind(token, projectId, accountId, now).run();
  return { token, url: shareUrl(token), createdAt: now };
}

export async function revokeShares(projectId: string) {
  await db().prepare("UPDATE shares SET revoked_at = ? WHERE project_id = ? AND owner = ? AND revoked_at IS NULL").bind(new Date().toISOString(), projectId, owner()).run();
}

/** Resolve a public token to its project without a signed-in account. */
export async function projectForShare(token: string): Promise<Project | null> {
  if (!TOKEN.test(token)) throw new AppError(404, "This link isn't valid.");
  const row = await db().prepare("SELECT p.data, p.revision, p.updated_at FROM shares s JOIN projects p ON p.id = s.project_id AND p.owner = s.owner WHERE s.token = ? AND s.revoked_at IS NULL")
    .bind(token).first<{ data: string; revision: number; updated_at: string }>();
  if (!row) return null;
  const p = JSON.parse(row.data) as Project;
  return { ...p, vertical: p.vertical ?? "home", revision: row.revision, updatedAt: row.updated_at };
}
