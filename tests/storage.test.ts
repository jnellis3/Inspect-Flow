import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { LocalBucket, LocalDatabase, AppError } from "../lib/inspection/local-storage";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "inspect-flow-storage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("SQLite persists across restart, applies migrations once, and rolls back a failed batch", async t => {
  const directory = await fixture(t);
  const migrations = resolve("drizzle");
  let database = new LocalDatabase(directory, migrations);
  await database.prepare("INSERT INTO app_users (id,username,password_hash,created_at) VALUES (?,?,?,?)").bind("test-id", "storage-test", "synthetic-test-hash", 1).run();
  const changed = await database.prepare("UPDATE app_users SET created_at=? WHERE id=?").bind(2, "test-id").run();
  assert.equal(changed.meta.changes, 1);
  await assert.rejects(database.batch([
    database.prepare("UPDATE app_users SET created_at=3 WHERE id=?").bind("test-id"),
    database.prepare("INSERT INTO app_users (id,username,password_hash,created_at) VALUES (?,?,?,?)").bind("duplicate-id", "storage-test", "synthetic-test-hash", 1),
  ]), /UNIQUE/);
  assert.equal((await database.withSession("first-primary").prepare("SELECT created_at FROM app_users WHERE id=?").bind("test-id").first<{created_at: number}>())?.created_at, 2);
  database.close();
  database = new LocalDatabase(directory, migrations);
  t.after(() => database.close());
  assert.equal((await database.prepare("SELECT username FROM app_users").all<{username: string}>()).results[0].username, "storage-test");
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM _inspect_flow_migrations").first<{count: number}>())?.count, (await readdir(migrations)).filter(name => name.endsWith(".sql")).length);
});

test("migration changes fail safely and partially failing new migrations roll back", async t => {
  const directory = await fixture(t);
  const migrations = join(directory, "migrations");
  await mkdir(migrations);
  await writeFile(join(migrations, "0000_first.sql"), "CREATE TABLE example (value TEXT);");
  const database = new LocalDatabase(join(directory, "data"), migrations);
  database.close();
  await writeFile(join(migrations, "0000_first.sql"), "CREATE TABLE example (changed TEXT);");
  assert.throws(() => new LocalDatabase(join(directory, "data"), migrations), /migration was changed/);
  await writeFile(join(migrations, "0000_first.sql"), "CREATE TABLE example (value TEXT);");
  await writeFile(join(migrations, "0001_second.sql"), "CREATE TABLE partial (value TEXT); SELECT invalid FROM missing_table;");
  assert.throws(() => new LocalDatabase(join(directory, "data"), migrations));
  await rm(join(migrations, "0001_second.sql"));
  const recovered = new LocalDatabase(join(directory, "data"), migrations);
  t.after(() => recovered.close());
  assert.equal(await recovered.prepare("SELECT name FROM sqlite_master WHERE name='partial'").first(), null);
});

test("object bytes, metadata, and byte ranges survive a new bucket instance", async t => {
  const directory = await fixture(t);
  await new LocalBucket(directory).put("project/source", "0123456789", { httpMetadata: { contentType: "video/mp4" }, expectedSize: 10 });
  const bucket = new LocalBucket(directory);
  const object = await bucket.get("project/source");
  assert.equal(object?.size, 10);
  assert.equal(await object?.text(), "0123456789");
  const headers = new Headers(); object!.writeHttpMetadata(headers);
  assert.equal(headers.get("content-type"), "video/mp4");
  for (const [input, expected, offset] of [
    [new Headers({ range: "bytes=2-4" }), "234", 2],
    [new Headers({ range: "bytes=8-" }), "89", 8],
    [new Headers({ range: "bytes=-3" }), "789", 7],
    [new Headers({ range: "bytes=8-100" }), "89", 8],
    [{ offset: 3, length: 2 }, "34", 3],
    [{ suffix: 2 }, "89", 8],
  ] as const) {
    const partial = await bucket.get("project/source", { range: input });
    assert.deepEqual(partial?.range, { offset, length: expected.length });
    assert.equal(await partial?.text(), expected);
  }
  for (const range of ["bytes=10-", "bytes=5-2", "bytes=-0", "bytes=0-1,4-5", "bytes=-"]) {
    await assert.rejects(bucket.get("project/source", { range: new Headers({ range }) }), (error: unknown) => error instanceof AppError && error.status === 416);
  }
  await bucket.delete("project/source");
  assert.equal(await bucket.head("project/source"), null);
});

test("failed and truncated streams never replace a published object", async t => {
  const directory = await fixture(t);
  const bucket = new LocalBucket(directory);
  await bucket.put("project/report", "previous");
  const failure = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.error(new Error("synthetic source interruption")); } });
  await assert.rejects(bucket.put("project/report", failure), /source interruption/);
  await assert.rejects(bucket.put("project/report", "short", { expectedSize: 10 }), /length/);
  assert.equal(await (await bucket.get("project/report"))?.text(), "previous");
  for (const key of ["../escape", "/absolute", "safe/../escape", "safe\\escape", "safe//empty"]) await assert.rejects(bucket.put(key, "invalid"), /storage key/);
});

test("an active reader keeps its original bytes while a new object is published", async t => {
  const directory = await fixture(t);
  const bucket = new LocalBucket(directory);
  await bucket.put("project/output", "original output");
  const original = await bucket.get("project/output");
  await bucket.put("project/output", "replacement output");
  assert.equal(await original?.text(), "original output");
  assert.equal(await (await bucket.get("project/output"))?.text(), "replacement output");
});

test("multipart resumes after restart, rejects stale etags, and completion is idempotent", async t => {
  const directory = await fixture(t);
  const bucket = new LocalBucket(directory);
  const upload = await bucket.createMultipartUpload("project/source", { httpMetadata: { contentType: "video/mp4" } });
  const stale = await upload.uploadPart(1, "old");
  const first = await upload.uploadPart(1, "part one");
  const resumed = new LocalBucket(directory).resumeMultipartUpload("project/source", upload.uploadId);
  const second = await resumed.uploadPart(2, " part two");
  await assert.rejects(resumed.complete([stale, second]), /part changed/);
  await assert.rejects(new LocalBucket(directory).resumeMultipartUpload("different/source", upload.uploadId).complete([first, second]), /does not match/);
  const complete = await resumed.complete([first, second]);
  assert.equal(complete.size, 17);
  assert.equal(complete.etag, createHash("sha256").update("part one part two").digest("hex"));
  assert.equal(await (await bucket.get("project/source"))?.text(), "part one part two");
  const again = await new LocalBucket(directory).resumeMultipartUpload("project/source", upload.uploadId).complete([first, second]);
  assert.equal(again.etag, complete.etag);
  await assert.rejects(resumed.uploadPart(3, "more"), /already complete/);
  await resumed.abort(); // Removing multipart state must preserve the published object.
  assert.equal(await (await bucket.get("project/source"))?.text(), "part one part two");
  await assert.rejects(resumed.uploadPart(1, "no"), /no longer exists/);
});

test("multipart checks actual persisted bytes before publishing", async t => {
  const directory = await fixture(t);
  const bucket = new LocalBucket(directory);
  const upload = await bucket.createMultipartUpload("project/source");
  const part = await upload.uploadPart(1, "correct bytes");
  const metadata = JSON.parse(await readFile(join(upload.directory, "1.json"), "utf8")) as {file: string};
  await writeFile(join(upload.directory, metadata.file), "tampered data");
  await assert.rejects(upload.complete([part]), /checksum/);
  assert.equal(await bucket.head("project/source"), null);
});

test("large media is streamed without building a whole-file buffer", async t => {
  const directory = await fixture(t);
  const bucket = new LocalBucket(directory);
  const chunkSize = 1024 * 1024;
  const count = 66;
  let produced = 0;
  const source = new ReadableStream<Uint8Array>({ pull(controller) { if (produced === count) { controller.close(); return; } controller.enqueue(new Uint8Array(chunkSize).fill(produced++)); } });
  await bucket.put("project/large-video", source, { expectedSize: count * chunkSize });
  const object = await bucket.get("project/large-video");
  assert.equal(object?.size, count * chunkSize);
  await assert.rejects(object!.arrayBuffer(), /stream/);
  const tail = await bucket.get("project/large-video", { range: { suffix: 16 } });
  assert.deepEqual(new Uint8Array(await tail!.arrayBuffer()), new Uint8Array(16).fill(count - 1));
  let consumed = 0;
  const reader = (await bucket.get("project/large-video"))!.body.getReader();
  while (true) { const result = await reader.read(); if (result.done) break; consumed += result.value.length; }
  assert.equal(consumed, count * chunkSize);
});
