// A thin client for Spectora's public API (https://developer.spectora.com). API keys are scoped
// to one Spectora company and sent as a Bearer token. Responses follow JSON:API conventions
// (`data`, `attributes`, `relationships`, `meta.pagination`), but the exact attribute names of an
// inspection are not published, so `inspectionFields` below reads several plausible spellings and
// the raw record is kept on each link so the mapping can be refined against real data.
import { INSPECTION_TYPES, type Project } from "../types";

export const SPECTORA_API = () => (process.env.SPECTORA_API_BASE?.trim() || "https://connect.spectora.com").replace(/\/+$/, "");

export class SpectoraError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "SpectoraError"; this.status = status; }
}

type Json = Record<string, unknown>;
export type SpectoraRecord = { id: string; type?: string; attributes: Json; links?: Json; relationships?: Json };

/** Normalize a JSON:API resource (or a flat object) into `{ id, attributes }`. */
export function toRecord(input: unknown): SpectoraRecord | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Json;
  const data = (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data) ? obj.data : obj) as Json;
  const id = data.id ?? data.inspection_id ?? data.uuid;
  if (id === undefined || id === null) return null;
  const attributes = (data.attributes && typeof data.attributes === "object" ? data.attributes : data) as Json;
  return { id: String(id), type: typeof data.type === "string" ? data.type : undefined, attributes, links: data.links as Json | undefined, relationships: data.relationships as Json | undefined };
}

export class SpectoraClient {
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private async call<T>(method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string>; retry?: boolean } = {}): Promise<T> {
    const response = await this.fetchImpl(`${SPECTORA_API()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json", ...init.headers },
      body: init.body,
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429 && init.retry !== false) {
      const wait = Math.min(10, Number(response.headers.get("retry-after") || 2));
      await new Promise(r => setTimeout(r, wait * 1000));
      return this.call<T>(method, path, { ...init, retry: false });
    }
    const text = await response.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
    if (!response.ok) {
      const detail = (json as { errors?: { detail?: string; title?: string }[]; error?: string; message?: string } | null);
      const message = detail?.errors?.[0]?.detail || detail?.errors?.[0]?.title || detail?.error || detail?.message || text.slice(0, 200) || response.statusText;
      throw new SpectoraError(response.status, `Spectora: ${message}`);
    }
    return json as T;
  }

  /** The cheapest request that proves the key works. */
  async verify() {
    const page = await this.call<Json>("GET", "/v2/inspections?page[size]=1");
    return { ok: true, sample: toRecord(Array.isArray(page.data) ? page.data[0] : null) };
  }

  async listInspections(options: { size?: number; page?: number; query?: Record<string, string> } = {}): Promise<SpectoraRecord[]> {
    const params = new URLSearchParams({ "page[size]": String(options.size ?? 25), "page[number]": String(options.page ?? 1), ...options.query });
    const page = await this.call<Json>("GET", `/v2/inspections?${params}`);
    const rows = Array.isArray(page.data) ? page.data : [];
    return rows.map(toRecord).filter((r): r is SpectoraRecord => !!r);
  }

  async getInspection(id: string): Promise<SpectoraRecord> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new SpectoraError(400, "Spectora: invalid inspection id.");
    const record = toRecord(await this.call<Json>("GET", `/v2/inspections/${encodeURIComponent(id)}`));
    if (!record) throw new SpectoraError(502, "Spectora: unexpected inspection response.");
    return record;
  }

  /**
   * Attach an image to an inspection. Spectora accepts .jpg/.jpeg/.png/.gif only (no PDF, no video),
   * so the reel is delivered as its poster frame named after the public watch link.
   * `report: true` files the attachment under Reports; otherwise it is an Additional Document.
   */
  async createAttachment(inspectionId: string, file: { bytes: Uint8Array; name: string; type: string }, options: { report?: boolean; internalOnly?: boolean; description?: string } = {}) {
    const build = (withDescription: boolean) => {
      const form = new FormData();
      form.set("data[attributes][inspection_id]", inspectionId);
      form.set("data[attributes][report]", String(options.report ?? false));
      if (!options.report) form.set("data[attributes][internal_only]", String(options.internalOnly ?? false));
      if (withDescription && options.description) form.set("data[attributes][description]", options.description);
      form.set("data[attributes][file]", new Blob([file.bytes as BlobPart], { type: file.type }), file.name);
      return form;
    };
    try {
      return toRecord(await this.call<Json>("POST", "/v2/inspection_attachments", { body: build(true) }));
    } catch (e) {
      // The attachment schema's optional fields are not published; fall back to the documented ones.
      if (e instanceof SpectoraError && e.status === 422 && options.description) return toRecord(await this.call<Json>("POST", "/v2/inspection_attachments", { body: build(false) }));
      throw e;
    }
  }
}

// ---------- mapping an inspection onto a project ----------

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const pick = (obj: Json | undefined, ...keys: string[]) => { for (const k of keys) { const v = str(obj?.[k]); if (v) return v; } return ""; };
const nested = (obj: Json, ...keys: string[]) => { for (const k of keys) { const v = obj[k]; if (v && typeof v === "object" && !Array.isArray(v)) return v as Json; } return undefined; };
const people = (v: unknown): string[] => {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.map(p => typeof p === "string" ? p.trim() : typeof p === "object" && p ? (pick(p as Json, "name", "full_name", "display_name") || [pick(p as Json, "first_name"), pick(p as Json, "last_name")].filter(Boolean).join(" ")) : "").filter(Boolean);
};

/** "2026-10-03T14:00:00-05:00" → "2026-10-03" (the inspection's local day when the API gives one). */
export function isoDay(value: string) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (m) return m[1];
  const t = Date.parse(value);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

/** Spectora service names → this app's home inspection types. */
export function inspectionType(services: string[]): string {
  const text = services.join(" ").toLowerCase();
  const types = INSPECTION_TYPES.home;
  if (/new\s*construction|phase|pre-?drywall|final walk/.test(text)) return "New construction";
  if (/pre-?listing|seller/.test(text)) return "Pre-listing";
  if (/warranty|11-?month|builder'?s? warranty/.test(text)) return "Warranty (11-month)";
  if (/re-?inspection|follow-?up/.test(text)) return "Re-inspection";
  return types.includes("Pre-purchase") ? "Pre-purchase" : types[0];
}

export type MappedInspection = {
  property: Project["property"];
  inspection: Project["inspection"];
  people: string[];
  client: string;
  agent: string;
  services: string[];
  url: string;
};

/** Best-effort read of the fields a project needs from a Spectora inspection record. */
export function inspectionFields(record: SpectoraRecord): MappedInspection {
  const a = record.attributes;
  const address = nested(a, "address", "property", "location") ?? {};
  const street = pick(a, "address", "street", "address_1", "address1", "line1", "street_address", "full_address")
    || pick(address, "street", "address", "address_1", "address1", "line1", "full_address", "formatted");
  const city = pick(a, "city") || pick(address, "city", "locality");
  const state = pick(a, "state", "region") || pick(address, "state", "region", "state_code");
  const zip = pick(a, "zip", "zip_code", "postal_code") || pick(address, "zip", "zip_code", "postal_code");
  const kindBits = [pick(a, "property_type", "home_type", "dwelling_type") || pick(address, "property_type"), (() => { const sq = pick(a, "square_feet", "sqft", "sq_ft") || pick(address, "square_feet", "sqft"); return sq ? `about ${Number(sq).toLocaleString("en-US")} sq ft` : ""; })(), (() => { const y = pick(a, "year_built") || pick(address, "year_built"); return y ? `built ${y}` : ""; })()].filter(Boolean);
  const when = pick(a, "scheduled_at", "start_time", "starts_at", "scheduled_for", "inspection_date", "date", "start", "scheduled_start");
  const servicesRaw = a.services ?? a.service_names ?? a.service_name ?? a.inspection_type ?? a.type_of_inspection;
  const services = Array.isArray(servicesRaw) ? servicesRaw.map(s => typeof s === "string" ? s : pick(s as Json, "name", "title")).filter(Boolean) : str(servicesRaw) ? [str(servicesRaw)] : [];
  const inspectors = people(a.inspectors ?? a.inspector ?? a.assigned_inspectors);
  const clients = people(a.clients ?? a.client ?? a.buyer ?? a.buyers);
  const agents = people(a.agents ?? a.agent ?? a.buyers_agent ?? a.buyer_agent);
  const url = pick(a, "url", "web_url", "inspection_url", "report_url", "published_report_url") || pick(record.links, "self", "web", "html");
  return {
    property: { address: street, city: [city, state].filter(Boolean).join(", ") + (zip ? ` ${zip}` : ""), kind: kindBits.join(", ") },
    inspection: { date: when ? isoDay(when) : "", type: inspectionType(services) },
    people: inspectors,
    client: clients.join(", "),
    agent: agents.join(", "),
    services,
    url,
  };
}

// ---------- webhook deliveries ----------

export const WEBHOOK_EVENTS = ["inspection.created", "inspection.confirmed", "inspection.rescheduled", "inspection.canceled", "inspection.deleted", "inspection.published"] as const;
export type WebhookEvent = { event: string; inspectionId: string | null };

/** Read the event name and inspection id from a delivery, whatever envelope Spectora uses. */
export function parseWebhook(payload: unknown): WebhookEvent {
  const p = (payload && typeof payload === "object" ? payload : {}) as Json;
  const data = nested(p, "data", "payload", "object") ?? {};
  const inspection = nested(data, "inspection", "attributes") ?? nested(p, "inspection") ?? {};
  const event = pick(p, "event", "type", "event_type", "name", "topic", "action") || pick(data, "event", "event_type") || (typeof p.meta === "object" && p.meta ? pick(p.meta as Json, "event", "type") : "");
  let inspectionId = pick(data, "inspection_id") || pick(p, "inspection_id") || pick(inspection, "id", "inspection_id");
  if (!inspectionId && (data.type === undefined || /inspection/i.test(str(data.type)))) inspectionId = pick(data, "id");
  if (!inspectionId && /^inspection\./.test(event)) inspectionId = pick(p, "id");
  return { event: event.toLowerCase(), inspectionId: inspectionId && /^[A-Za-z0-9_-]{1,64}$/.test(inspectionId) ? inspectionId : null };
}
