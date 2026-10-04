import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { SpectoraClient, inspectionFields, inspectionType, isoDay, parseWebhook, toRecord } from "../lib/inspection/spectora/client";
import { open, seal } from "../lib/inspection/secrets";

test("sealed secrets round-trip and reject tampering", () => {
  const key = randomBytes(32);
  const sealed = seal("spk_live_example_key", key);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(open(sealed, key), "spk_live_example_key");
  assert.throws(() => open(sealed, randomBytes(32)));
  const [v, iv, body, tag] = sealed.split(".");
  assert.throws(() => open([v, iv, body.slice(0, -2) + "AA", tag].join("."), key));
});

test("inspection records are read from JSON:API or flat envelopes", () => {
  const jsonApi = toRecord({ data: { id: 123, type: "inspection", attributes: { address: "1 Main St" }, links: { self: "https://x/1" } } });
  assert.equal(jsonApi?.id, "123");
  assert.equal(jsonApi?.attributes.address, "1 Main St");
  const flat = toRecord({ id: "abc", address: "2 Main St" });
  assert.equal(flat?.attributes.address, "2 Main St");
  assert.equal(toRecord(null), null);
  assert.equal(toRecord({ data: [] }), null);
});

test("inspection fields tolerate several attribute spellings", () => {
  const nestedAddress = inspectionFields({ id: "1", attributes: {
    address: { street: "1234 Oak Hollow Ln", city: "Cypress", state: "TX", zip: "77433", square_feet: 3200, year_built: 2019 },
    scheduled_at: "2026-10-03T14:00:00-05:00",
    services: [{ name: "Residential Inspection" }, { name: "Pre-Listing Add-on" }],
    inspectors: [{ first_name: "Tyler", last_name: "Reed" }],
    clients: [{ name: "Jordan Lee" }],
    agents: [{ full_name: "Sam Agent" }],
  } });
  assert.deepEqual(nestedAddress.property, { address: "1234 Oak Hollow Ln", city: "Cypress, TX 77433", kind: "about 3,200 sq ft, built 2019" });
  assert.equal(nestedAddress.inspection.date, "2026-10-03");
  assert.equal(nestedAddress.inspection.type, "Pre-listing");
  assert.deepEqual(nestedAddress.people, ["Tyler Reed"]);
  assert.equal(nestedAddress.client, "Jordan Lee");
  assert.equal(nestedAddress.agent, "Sam Agent");

  const flat = inspectionFields({ id: "2", attributes: { address_1: "9 Elm", city: "Austin", state: "TX", start_time: "2026-11-01T09:00:00Z", inspection_type: "New Construction Final" }, links: { self: "https://app.spectora.com/i/2" } });
  assert.equal(flat.property.address, "9 Elm");
  assert.equal(flat.property.city, "Austin, TX");
  assert.equal(flat.inspection.type, "New construction");
  assert.equal(flat.url, "https://app.spectora.com/i/2");

  const empty = inspectionFields({ id: "3", attributes: {} });
  assert.equal(empty.property.address, "");
  assert.equal(empty.inspection.type, "Pre-purchase");
});

test("service names map onto this app's inspection types", () => {
  assert.equal(inspectionType(["11-Month Builder Warranty"]), "Warranty (11-month)");
  assert.equal(inspectionType(["Re-Inspection"]), "Re-inspection");
  assert.equal(inspectionType(["Buyer's Inspection", "Radon"]), "Pre-purchase");
  assert.equal(isoDay("2026-10-03"), "2026-10-03");
  assert.equal(isoDay("nonsense"), "");
});

test("webhook deliveries yield an event and inspection id, or nothing recognizable", () => {
  assert.deepEqual(parseWebhook({ event: "inspection.confirmed", data: { id: 55, type: "inspection" } }), { event: "inspection.confirmed", inspectionId: "55" });
  assert.deepEqual(parseWebhook({ type: "Inspection.Created", data: { inspection: { id: "abc-1" } } }), { event: "inspection.created", inspectionId: "abc-1" });
  assert.deepEqual(parseWebhook({ event_type: "inspection.published", inspection_id: 9 }), { event: "inspection.published", inspectionId: "9" });
  assert.deepEqual(parseWebhook({ event: "contact.updated", data: { id: 7, type: "contact" } }), { event: "contact.updated", inspectionId: null });
  assert.deepEqual(parseWebhook("junk"), { event: "", inspectionId: null });
  assert.equal(parseWebhook({ event: "inspection.created", data: { id: "../../etc" } }).inspectionId, null);
});

test("the client sends a bearer key, retries one 429, and builds the documented multipart body", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let first = true;
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    if (first) { first = false; return new Response("slow down", { status: 429, headers: { "retry-after": "0" } }); }
    if (String(input).endsWith("/v2/inspection_attachments")) return Response.json({ data: { id: "att-1", attributes: {} } }, { status: 201 });
    return Response.json({ data: [{ id: 1, attributes: { address: "1 Main" } }], meta: { pagination: { total: 1 } } });
  };
  const client = new SpectoraClient("test-key-1234", fetchImpl);
  const inspections = await client.listInspections({ size: 5 });
  assert.equal(inspections.length, 1);
  assert.equal(calls.length, 2);
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer test-key-1234");
  assert.match(calls[0].url, /\/v2\/inspections\?page%5Bsize%5D=5&page%5Bnumber%5D=1$/);

  const attachment = await client.createAttachment("77", { bytes: new Uint8Array([255, 216, 255]), name: "watch.jpg", type: "image/jpeg" }, { description: "Highlight video" });
  assert.equal(attachment?.id, "att-1");
  const form = calls.at(-1)!.init.body as FormData;
  assert.equal(form.get("data[attributes][inspection_id]"), "77");
  assert.equal(form.get("data[attributes][report]"), "false");
  assert.equal(form.get("data[attributes][internal_only]"), "false");
  assert.equal(form.get("data[attributes][description]"), "Highlight video");
  assert.equal((form.get("data[attributes][file]") as File).name, "watch.jpg");

  await assert.rejects(new SpectoraClient("bad", async () => Response.json({ errors: [{ detail: "Unauthorized" }] }, { status: 401 })).verify(), /Spectora: Unauthorized/);
});
