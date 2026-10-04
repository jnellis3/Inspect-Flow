import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { authenticate, type Account } from "./auth";
import { assertRequestOrigin } from "./origin";
import { AppError, db } from "./server";
import { EMPTY_VEHICLE, projectTitle, type Project } from "./types";

export { AppError, bucket, db } from "./server";

const context = new AsyncLocalStorage<Account>();

/** The signed-in account for the current request. */
export function account() {
  const current = context.getStore();
  if (!current) throw new AppError(401, "Sign in to your account.");
  return current;
}

/** The workspace every query in this request is scoped to. */
export const workspaceId = () => account().workspaceId;

/** Workspace settings and the team are the owner's to change. */
export function requireOwner() {
  if (account().role !== "owner") throw new AppError(403, "Only the workspace owner can change this.");
}

/** State-changing requests must come from this app's own pages. */
export function mutation(request: Request) {
  assertRequestOrigin(request);
  if (request.headers.get("x-inspection-request") !== "1") throw new AppError(403, "This request must come from this workspace.");
}

/** Read a small JSON body (≤ 1 MiB) and validate it. */
export async function body<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.output<T>> {
  mutation(request);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Expected JSON input.");
  const text = await readLimited(request, 1024 * 1024);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new AppError(400, "This request could not be read."); }
  return schema.parse(value);
}

async function readLimited(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Expected input.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new AppError(413, "This input is too large."); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Wrap a route handler: authentication, origin checks, and consistent error responses. */
export async function api(request: Request, fn: () => Promise<Response>, options: { public?: boolean } = {}) {
  let response: Response;
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) mutation(request);
    if (options.public) response = await fn();
    else {
      const account = await authenticate(request);
      if (!account) throw new AppError(401, "Sign in to your account.");
      response = await context.run(account, fn);
    }
  } catch (e) {
    if (e instanceof z.ZodError) response = Response.json({ error: e.issues[0]?.message || "Please check the input." }, { status: 400 });
    else if (e instanceof AppError) response = Response.json({ error: e.message }, { status: e.status });
    else {
      console.error("Request failed", e);
      response = Response.json({ error: "The request could not finish. Your saved work is safe. Please retry." }, { status: 500 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

// ---------- projects ----------

/** Projects saved before vehicles existed are home inspections; before workspaces, each project
 *  carried its own company details, which now belong to the workspace (all but the inspectors). */
function fromRow(r: { data: string; revision: number; updated_at: string }): Project {
  const { company, ...p } = JSON.parse(r.data);
  return {
    ...p, vertical: p.vertical ?? "home", vehicle: { ...EMPTY_VEHICLE, ...p.vehicle }, inspectors: p.inspectors ?? company?.people ?? [],
    revision: r.revision, updatedAt: r.updated_at,
  };
}

export async function getProject(id: string): Promise<Project> {
  const row = await db().prepare("SELECT data, revision, updated_at FROM projects WHERE id = ? AND workspace_id = ?")
    .bind(id, workspaceId()).first<{ data: string; revision: number; updated_at: string }>();
  if (!row) throw new AppError(404, "Project not found.");
  return fromRow(row);
}

/** Optimistic write: fails with 409 if someone saved since `expected` was read. */
export async function saveProject(p: Project, expected: number): Promise<Project> {
  const now = new Date().toISOString();
  const next = { ...p, revision: expected + 1, updatedAt: now };
  const result = await db().prepare("UPDATE projects SET data = ?, address = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND workspace_id = ? AND revision = ?")
    .bind(JSON.stringify(next), projectTitle(p), now, p.id, workspaceId(), expected).run();
  if (result.meta.changes !== 1) throw new AppError(409, "This project changed in another window. Refresh and try again.");
  return next;
}

/** Apply a change to the latest version of a project, retrying if a concurrent save wins. */
export async function updateProject(id: string, change: (p: Project) => Project): Promise<Project> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await getProject(id);
    try { return await saveProject(change(current), current.revision); }
    catch (e) { if (!(e instanceof AppError && e.status === 409)) throw e; }
  }
  throw new AppError(409, "This project is busy. Please retry.");
}

export async function insertProject(p: Project) {
  await db().prepare("INSERT INTO projects (id, workspace_id, address, revision, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(p.id, workspaceId(), projectTitle(p), p.revision, JSON.stringify(p), p.createdAt, p.updatedAt).run();
}

export async function listProjects(): Promise<Project[]> {
  const rows = await db().prepare("SELECT data, revision, updated_at FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 200")
    .bind(workspaceId()).all<{ data: string; revision: number; updated_at: string }>();
  return rows.results.map(fromRow);
}

export async function deleteProject(id: string) {
  await db().prepare("DELETE FROM projects WHERE id = ? AND workspace_id = ?").bind(id, workspaceId()).run();
}
