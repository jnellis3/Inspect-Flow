// Spectora integration state: one connection per account (the company's API key and a webhook
// token), one link per Spectora inspection (which project it became, whether the reel was pushed).
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { applicationOrigin } from "../origin";
import { open, seal } from "../secrets";
import { AppError, db } from "../server";
import { OUTPUTS, jobDir, readRun } from "../jobs";
import { asOwner, getProject, insertProject, listProjects, owner } from "../store";
import { ensureShare } from "../share";
import { INSPECTION_TYPES, type Project } from "../types";
import { SpectoraClient, SpectoraError, inspectionFields, parseWebhook, type MappedInspection, type SpectoraRecord } from "./client";

export type Connection = {
  owner: string;
  apiKey: string;
  webhookToken: string;
  autoCreate: boolean;
  autoPush: boolean;
  createdAt: string;
  lastEventAt: string | null;
  lastEvent: string | null;
  lastError: string | null;
};

export type Link = {
  inspectionId: string;
  projectId: string;
  status: "linked" | "canceled" | "deleted";
  mapped: MappedInspection;
  pushedAt: string | null;
  pushError: string | null;
  attachmentId: string | null;
};

/** What the UI sees: never the key itself. */
export type ConnectionView = Omit<Connection, "apiKey" | "owner"> & { connected: true; webhookUrl: string; keyHint: string } | { connected: false };

type Row = { owner: string; api_key: string; webhook_token: string; auto_create: number; auto_push: number; created_at: string; last_event_at: string | null; last_event: string | null; last_error: string | null };
const fromRow = (r: Row): Connection => ({ owner: r.owner, apiKey: open(r.api_key), webhookToken: r.webhook_token, autoCreate: !!r.auto_create, autoPush: !!r.auto_push, createdAt: r.created_at, lastEventAt: r.last_event_at, lastEvent: r.last_event, lastError: r.last_error });

export const webhookUrl = (token: string) => new URL(`/api/integrations/spectora/webhook/${token}`, applicationOrigin()).toString();

export function view(c: Connection | null): ConnectionView {
  if (!c) return { connected: false };
  const { apiKey, owner: _owner, ...rest } = c;
  void _owner;
  return { connected: true, ...rest, webhookUrl: webhookUrl(c.webhookToken), keyHint: `…${apiKey.slice(-4)}` };
}

export async function getConnection(accountId = owner()): Promise<Connection | null> {
  const row = await db().prepare("SELECT * FROM spectora_connections WHERE owner = ?").bind(accountId).first<Row>();
  return row ? fromRow(row) : null;
}

export async function connectionForToken(token: string): Promise<Connection | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const row = await db().prepare("SELECT * FROM spectora_connections WHERE webhook_token = ?").bind(token).first<Row>();
  return row ? fromRow(row) : null;
}

/** Save a key after proving it works against Spectora. Reconnecting keeps the webhook token. */
export async function connect(apiKey: string): Promise<Connection> {
  const key = apiKey.trim();
  if (key.length < 16 || key.length > 400 || /\s/.test(key)) throw new AppError(400, "That doesn't look like a Spectora API key.");
  try { await new SpectoraClient(key).verify(); }
  catch (e) {
    if (e instanceof SpectoraError && (e.status === 401 || e.status === 403)) throw new AppError(400, "Spectora rejected this key. Create one at developer.spectora.com (company admin) and paste the whole key.");
    throw new AppError(502, e instanceof Error ? e.message : "Could not reach Spectora.");
  }
  const existing = await getConnection();
  const now = new Date().toISOString();
  const token = existing?.webhookToken ?? randomBytes(32).toString("base64url");
  await db().prepare(`INSERT INTO spectora_connections (owner, api_key, webhook_token, auto_create, auto_push, created_at, updated_at)
    VALUES (?, ?, ?, 1, 1, ?, ?) ON CONFLICT(owner) DO UPDATE SET api_key = excluded.api_key, updated_at = excluded.updated_at, last_error = NULL`)
    .bind(owner(), seal(key), token, now, now).run();
  return (await getConnection())!;
}

export async function updateConnection(patch: { autoCreate?: boolean; autoPush?: boolean }) {
  const c = await getConnection();
  if (!c) throw new AppError(404, "Spectora isn't connected.");
  await db().prepare("UPDATE spectora_connections SET auto_create = ?, auto_push = ?, updated_at = ? WHERE owner = ?")
    .bind(patch.autoCreate ?? c.autoCreate, patch.autoPush ?? c.autoPush, new Date().toISOString(), owner()).run();
}

export async function disconnect() {
  await db().prepare("DELETE FROM spectora_connections WHERE owner = ?").bind(owner()).run();
}

async function noteEvent(accountId: string, event: string, error: string | null) {
  await db().prepare("UPDATE spectora_connections SET last_event_at = ?, last_event = ?, last_error = ? WHERE owner = ?")
    .bind(new Date().toISOString(), event.slice(0, 120), error?.slice(0, 500) ?? null, accountId).run();
}

// ---------- links ----------

type LinkRow = { inspection_id: string; project_id: string; status: string; inspection_json: string; pushed_at: string | null; push_error: string | null; attachment_id: string | null };
function linkFrom(r: LinkRow): Link {
  let mapped: MappedInspection;
  try { mapped = inspectionFields(JSON.parse(r.inspection_json)); }
  catch { mapped = { property: { address: "", city: "", kind: "" }, inspection: { date: "", type: "" }, people: [], client: "", agent: "", services: [], url: "" }; }
  return { inspectionId: r.inspection_id, projectId: r.project_id, status: r.status as Link["status"], mapped, pushedAt: r.pushed_at, pushError: r.push_error, attachmentId: r.attachment_id };
}

export async function linkForProject(projectId: string, accountId = owner()): Promise<Link | null> {
  const row = await db().prepare("SELECT * FROM spectora_links WHERE project_id = ? AND owner = ?").bind(projectId, accountId).first<LinkRow>();
  return row ? linkFrom(row) : null;
}

export async function linkForInspection(inspectionId: string, accountId = owner()): Promise<Link | null> {
  const row = await db().prepare("SELECT * FROM spectora_links WHERE inspection_id = ? AND owner = ?").bind(inspectionId, accountId).first<LinkRow>();
  return row ? linkFrom(row) : null;
}

/** The raw record as Spectora returned it, for refining the field mapping. */
export async function rawInspection(projectId: string): Promise<unknown> {
  const row = await db().prepare("SELECT inspection_json FROM spectora_links WHERE project_id = ? AND owner = ?").bind(projectId, owner()).first<{ inspection_json: string }>();
  return row ? JSON.parse(row.inspection_json) : null;
}

async function insertLink(accountId: string, inspection: SpectoraRecord, projectId: string) {
  const now = new Date().toISOString();
  await db().prepare("INSERT INTO spectora_links (owner, inspection_id, project_id, inspection_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'linked', ?, ?)")
    .bind(accountId, inspection.id, projectId, JSON.stringify(inspection).slice(0, 200_000), now, now).run();
}

/** Link an existing project to one of the company's Spectora inspections. */
export async function linkProject(projectId: string, inspectionId: string): Promise<Link> {
  const c = await getConnection();
  if (!c) throw new AppError(409, "Connect Spectora first.");
  await getProject(projectId);
  if (await linkForProject(projectId)) throw new AppError(409, "This project is already linked to a Spectora inspection.");
  const taken = await linkForInspection(inspectionId);
  if (taken) throw new AppError(409, "That inspection is already linked to another project.");
  const inspection = await new SpectoraClient(c.apiKey).getInspection(inspectionId);
  await insertLink(owner(), inspection, projectId);
  return (await linkForProject(projectId))!;
}

export async function unlinkProject(projectId: string) {
  await db().prepare("DELETE FROM spectora_links WHERE project_id = ? AND owner = ?").bind(projectId, owner()).run();
}

/** A new project pre-filled from a Spectora inspection, using the account's usual company details. */
export async function projectFromInspection(inspection: SpectoraRecord, accountId: string): Promise<Project> {
  const mapped = inspectionFields(inspection);
  const previous = (await listProjects())[0];
  const now = new Date().toISOString();
  const notes = [mapped.client && `Client: ${mapped.client}.`, mapped.agent && `Agent: ${mapped.agent}.`, mapped.services.length && `Spectora services: ${mapped.services.join(", ")}.`].filter(Boolean).join(" ");
  const project: Project = {
    id: crypto.randomUUID(), revision: 1, createdAt: now, updatedAt: now,
    vertical: "home",
    property: { address: mapped.property.address || `Spectora inspection ${inspection.id}`, city: mapped.property.city, kind: mapped.property.kind },
    vehicle: { year: "", make: "", model: "", trim: "", vin: "", mileage: "", location: "" },
    inspection: { date: mapped.inspection.date || now.slice(0, 10), type: INSPECTION_TYPES.home.includes(mapped.inspection.type) ? mapped.inspection.type : "Pre-purchase" },
    company: previous?.company ?? { name: "", people: mapped.people, phone: "", website: "", accent: "" },
    voice: previous?.voice ?? { mode: "ai", voice: "ash" },
    notes,
    video: null,
    supporting: [],
  };
  if (!project.company.people.length && mapped.people.length) project.company = { ...project.company, people: mapped.people };
  await insertProject(project);
  await insertLink(accountId, inspection, project.id);
  return project;
}

/** Create a project for a Spectora inspection the inspector picked from the list. */
export async function importInspection(inspectionId: string): Promise<Project> {
  const c = await getConnection();
  if (!c) throw new AppError(409, "Connect Spectora first.");
  const existing = await linkForInspection(inspectionId);
  if (existing) return getProject(existing.projectId);
  const inspection = await new SpectoraClient(c.apiKey).getInspection(inspectionId);
  return projectFromInspection(inspection, owner());
}

/** Recent inspections with their link state, for pickers. */
export async function recentInspections(size = 20) {
  const c = await getConnection();
  if (!c) throw new AppError(409, "Connect Spectora first.");
  const records = await new SpectoraClient(c.apiKey).listInspections({ size });
  return Promise.all(records.map(async r => ({ id: r.id, ...inspectionFields(r), link: await linkForInspection(r.id) })));
}

// ---------- webhook deliveries ----------

export type Handled = { event: string; inspectionId: string | null; action: "created" | "exists" | "updated" | "ignored" | "unrecognized"; projectId?: string };

/**
 * A delivery is only a hint: the inspection is re-read from Spectora with the company's own key
 * before anything is created, so a forged POST can at most cause a lookup.
 */
export async function handleWebhook(connection: Connection, payload: unknown): Promise<Handled> {
  const { event, inspectionId } = parseWebhook(payload);
  const accountId = connection.owner;
  return asOwner(accountId, async () => {
    try {
      if (!event || !inspectionId) {
        await noteEvent(accountId, event || "(no event)", "Delivery had no recognizable event or inspection id. Check the webhook's event selection in Spectora.");
        return { event, inspectionId, action: "unrecognized" };
      }
      const existing = await linkForInspection(inspectionId, accountId);
      if (event === "inspection.canceled" || event === "inspection.deleted") {
        if (existing) await db().prepare("UPDATE spectora_links SET status = ?, updated_at = ? WHERE owner = ? AND inspection_id = ?").bind(event.endsWith("deleted") ? "deleted" : "canceled", new Date().toISOString(), accountId, inspectionId).run();
        await noteEvent(accountId, event, null);
        return { event, inspectionId, action: existing ? "updated" : "ignored", projectId: existing?.projectId };
      }
      if (event === "inspection.created" || event === "inspection.confirmed" || event === "inspection.rescheduled") {
        const client = new SpectoraClient(connection.apiKey);
        const inspection = await client.getInspection(inspectionId);
        if (existing) {
          const now = new Date().toISOString();
          await db().prepare("UPDATE spectora_links SET inspection_json = ?, status = 'linked', updated_at = ? WHERE owner = ? AND inspection_id = ?").bind(JSON.stringify(inspection).slice(0, 200_000), now, accountId, inspectionId).run();
          await noteEvent(accountId, event, null);
          return { event, inspectionId, action: "exists", projectId: existing.projectId };
        }
        if (!connection.autoCreate) { await noteEvent(accountId, event, null); return { event, inspectionId, action: "ignored" }; }
        const project = await projectFromInspection(inspection, accountId);
        await noteEvent(accountId, event, null);
        return { event, inspectionId, action: "created", projectId: project.id };
      }
      if (event === "inspection.published") {
        if (existing) await pushIfReady(existing.projectId, accountId).catch(() => {});
        await noteEvent(accountId, event, null);
        return { event, inspectionId, action: existing ? "updated" : "ignored", projectId: existing?.projectId };
      }
      await noteEvent(accountId, event, null);
      return { event, inspectionId, action: "ignored" };
    } catch (e) {
      await noteEvent(accountId, event || "(error)", e instanceof Error ? e.message : String(e)).catch(() => {});
      throw e;
    }
  });
}

// ---------- pushing the finished reel back ----------

const host = () => applicationOrigin().host;

/** Attach the reel's poster frame, named after the watch link, to the Spectora inspection. */
export async function pushToSpectora(projectId: string, accountId = owner()): Promise<Link> {
  const c = await getConnection(accountId);
  if (!c) throw new AppError(409, "Connect Spectora first.");
  const link = await linkForProject(projectId, accountId);
  if (!link) throw new AppError(409, "Link this project to a Spectora inspection first.");
  const dir = jobDir(projectId);
  const run = await readRun(projectId);
  if (run.state !== "done") throw new AppError(409, "Finish the video before attaching it to Spectora.");
  const now = new Date().toISOString();
  await db().prepare("UPDATE spectora_links SET push_attempted_at = ? WHERE owner = ? AND inspection_id = ?").bind(now, accountId, link.inspectionId).run();
  try {
    const share = await ensureShare(projectId, accountId);
    const poster = await readFile(join(dir, OUTPUTS.poster.file)).catch(() => null);
    if (!poster) throw new AppError(409, "The video's poster image isn't available yet.");
    const name = `Watch the highlight video - ${host()}/w/${share.token}.jpg`;
    const description = `Highlight video and report: ${share.url}`;
    const attachment = await new SpectoraClient(c.apiKey).createAttachment(link.inspectionId, { bytes: poster, name, type: "image/jpeg" }, { report: false, internalOnly: false, description });
    await db().prepare("UPDATE spectora_links SET pushed_at = ?, push_error = NULL, attachment_id = ?, updated_at = ? WHERE owner = ? AND inspection_id = ?")
      .bind(new Date().toISOString(), attachment?.id ?? null, new Date().toISOString(), accountId, link.inspectionId).run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db().prepare("UPDATE spectora_links SET push_error = ?, updated_at = ? WHERE owner = ? AND inspection_id = ?").bind(message.slice(0, 500), new Date().toISOString(), accountId, link.inspectionId).run();
    throw e;
  }
  return (await linkForProject(projectId, accountId))!;
}

/**
 * Called when a job finishes and when a finished project is viewed: pushes once, automatically,
 * for linked projects whose connection asks for it. Never throws; the outcome lands on the link.
 */
export async function pushIfReady(projectId: string, accountId: string) {
  const c = await getConnection(accountId);
  if (!c?.autoPush) return;
  const row = await db().prepare("SELECT pushed_at, push_attempted_at FROM spectora_links WHERE project_id = ? AND owner = ?").bind(projectId, accountId).first<{ pushed_at: string | null; push_attempted_at: string | null }>();
  if (!row || row.pushed_at) return;
  if (row.push_attempted_at && Date.now() - Date.parse(row.push_attempted_at) < 10 * 60_000) return;  // one try per ten minutes
  if ((await readRun(projectId)).state !== "done") return;
  await pushToSpectora(projectId, accountId).catch(e => console.error("Spectora push failed", projectId, e));
}

/** The owner of a project, for follow-ups that start from a job rather than a request. */
export async function projectOwner(projectId: string): Promise<string | null> {
  const row = await db().prepare("SELECT owner FROM projects WHERE id = ?").bind(projectId).first<{ owner: string }>();
  return row?.owner ?? null;
}
