import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, chmodSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "AppError"; this.status = status; }
}

type QueryResult<T = Record<string, unknown>> = { success: true; results: T[]; meta: { changes: number; last_row_id?: number } };

/** The subset of D1 used by the application, backed by one local SQLite database. */
export class LocalStatement {
  readonly database: LocalDatabase;
  readonly sql: string;
  readonly values: SQLInputValue[];
  constructor(database: LocalDatabase, sql: string, values: SQLInputValue[] = []) {
    this.database = database; this.sql = sql; this.values = values;
  }
  bind(...values: unknown[]) {
    return new LocalStatement(this.database, this.sql, values.map(value => {
      if (value === undefined) return null;
      if (typeof value === "boolean") return Number(value);
      if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || ArrayBuffer.isView(value)) return value as SQLInputValue;
      throw new TypeError("Unsupported database parameter");
    }));
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.database.connection.prepare(this.sql).get(...this.values);
    return row ? (column ? row[column] : { ...row }) as T : null;
  }
  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    const results = this.database.connection.prepare(this.sql).all(...this.values).map(row => ({ ...row }) as T);
    return { success: true, results, meta: { changes: 0 } };
  }
  runSync(): QueryResult {
    const result = this.database.connection.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async run() { return this.runSync(); }
}

export class LocalDatabase {
  readonly connection: DatabaseSync;
  constructor(dataDir: string, migrationsDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const filename = join(dataDir, "inspect-flow.sqlite");
    this.connection = new DatabaseSync(filename);
    chmodSync(filename, 0o600);
    this.connection.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    try { this.migrate(migrationsDir); } catch (error) { this.connection.close(); throw error; }
  }
  private migrate(directory: string) {
    const migrations = readdirSync(directory).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort();
    if (!migrations.length) throw new Error("No database migrations found");
    this.connection.exec("CREATE TABLE IF NOT EXISTS _inspect_flow_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)");
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      for (const name of migrations) {
        const sql = readFileSync(join(directory, name), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        const existing = this.connection.prepare("SELECT sha256 FROM _inspect_flow_migrations WHERE name = ?").get(name);
        if (existing) {
          if (existing.sha256 !== checksum) throw new Error(`Applied database migration was changed: ${name}`);
          continue;
        }
        this.connection.exec(sql);
        this.connection.prepare("INSERT INTO _inspect_flow_migrations (name,sha256,applied_at) VALUES (?,?,?)").run(name, checksum, new Date().toISOString());
      }
      this.connection.exec("COMMIT");
    } catch (error) { this.connection.exec("ROLLBACK"); throw error; }
  }
  prepare(sql: string) { return new LocalStatement(this, sql); }
  withSession(_constraint?: string) { return this; }
  async batch(statements: LocalStatement[]) {
    if (statements.some(statement => statement.database !== this)) throw new Error("Cannot mix database connections in a batch");
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(statement => statement.runSync());
      this.connection.exec("COMMIT");
      return results;
    } catch (error) { this.connection.exec("ROLLBACK"); throw error; }
  }
  close() { this.connection.close(); }
}

export type UploadedPart = { partNumber: number; etag: string };
type HttpMetadata = { contentType?: string; contentDisposition?: string; cacheControl?: string; contentEncoding?: string; contentLanguage?: string };
type PutOptions = { httpMetadata?: HttpMetadata; expectedSize?: number };
type ByteInput = ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string;
type ObjectMetadata = { version: 1; key: string; file: string; size: number; etag: string; httpMetadata: HttpMetadata; uploaded: string };
type RangeInput = { offset?: number; length?: number; suffix?: number };
type ResolvedRange = { offset: number; length: number };
type MultipartManifest = { version: 1; key: string; httpMetadata: HttpMetadata; completed?: ObjectMetadata; completionParts?: UploadedPart[] };
type PartMetadata = UploadedPart & { file: string; size: number };
const MAX_OBJECT_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_PART_BYTES = 64 * 1024 * 1024;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const locks = new Map<string, Promise<void>>();

function missing(error: unknown) { return (error as NodeJS.ErrnoException)?.code === "ENOENT"; }
function objectId(key: string) {
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\") || key.includes("\0") || key.split("/").some(part => !part || part === "." || part === "..")) throw new AppError(400, "Invalid storage key.");
  return createHash("sha256").update(key).digest("hex");
}
function safeFile(name: string) {
  if (!/^[a-f0-9-]{36}\.(?:data|part)$/.test(name)) throw new Error("Invalid storage manifest");
  return name;
}
async function exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  locks.set(key, current);
  await previous;
  try { return await fn(); } finally { release(); if (locks.get(key) === current) locks.delete(key); }
}
async function syncDirectory(directory: string) {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}
async function atomicJSON(filename: string, value: unknown) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }); }
}
function byteStream(stream: Readable) {
  return Readable.toWeb(stream, { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>;
}
async function* chunks(input: ByteInput): AsyncGenerator<Uint8Array> {
  if (typeof input === "string") { yield Buffer.from(input); return; }
  if (input instanceof ArrayBuffer) { yield new Uint8Array(input); return; }
  if (ArrayBuffer.isView(input)) { yield new Uint8Array(input.buffer, input.byteOffset, input.byteLength); return; }
  const reader = input.getReader();
  let done = false;
  try {
    while (true) { const result = await reader.read(); if (result.done) { done = true; return; } yield result.value; }
  } finally { if (!done) await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function writeBytes(filename: string, input: ByteInput, maximum: number, expected?: number) {
  const handle = await open(filename, "wx", 0o600);
  const hash = createHash("sha256");
  let size = 0;
  try {
    for await (const chunk of chunks(input)) {
      size += chunk.byteLength;
      if (size > maximum) throw new AppError(413, "The stored file exceeds the supported size limit.");
      if (expected !== undefined && size > expected) throw new AppError(400, "File length did not match the expected size.");
      hash.update(chunk);
      // FileHandle.write can write fewer bytes than requested.
      let offset = 0;
      while (offset < chunk.length) { const result = await handle.write(chunk, offset, chunk.length - offset); if (!result.bytesWritten) throw new Error("File write made no progress"); offset += result.bytesWritten; }
    }
    if (expected !== undefined && size !== expected) throw new AppError(400, "File length did not match the expected size.");
    await handle.sync();
    return { size, etag: hash.digest("hex") };
  } catch (error) { await rm(filename, { force: true }); throw error; } finally { await handle.close(); }
}
function resolveRange(input: Headers | RangeInput | undefined, size: number): ResolvedRange | undefined {
  if (!input) return undefined;
  let range: RangeInput;
  if (input instanceof Headers) {
    const value = input.get("range");
    if (!value) return undefined;
    const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
    if (!match || (!match[1] && !match[2])) throw new AppError(416, "Requested byte range is not supported.");
    if (!match[1]) range = { suffix: Number(match[2]) };
    else {
      const offset = Number(match[1]);
      const end = match[2] ? Number(match[2]) : size - 1;
      if (!Number.isSafeInteger(end) || end < offset) throw new AppError(416, "Requested byte range is not satisfiable.");
      range = { offset, length: end - offset + 1 };
    }
  } else range = input;
  if (!size) throw new AppError(416, "Requested byte range is not satisfiable.");
  if (range.suffix !== undefined) {
    if (range.offset !== undefined || range.length !== undefined || !Number.isSafeInteger(range.suffix) || range.suffix <= 0) throw new AppError(416, "Requested byte range is not satisfiable.");
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  const offset = range.offset ?? 0;
  const length = range.length ?? size - offset;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size || !Number.isSafeInteger(length) || length <= 0) throw new AppError(416, "Requested byte range is not satisfiable.");
  return { offset, length: Math.min(length, size - offset) };
}

export class LocalObject {
  readonly size: number;
  readonly etag: string;
  readonly key: string;
  readonly uploaded: Date;
  readonly httpMetadata: HttpMetadata;
  readonly range?: ResolvedRange;
  readonly body: ReadableStream<Uint8Array>;
  constructor(metadata: ObjectMetadata, body: ReadableStream<Uint8Array>, range?: ResolvedRange) {
    this.size = metadata.size; this.etag = metadata.etag; this.key = metadata.key; this.uploaded = new Date(metadata.uploaded);
    this.httpMetadata = metadata.httpMetadata; this.body = body; this.range = range;
  }
  writeHttpMetadata(headers: Headers) {
    for (const [key, value] of Object.entries(this.httpMetadata)) if (value) headers.set(({ contentType: "Content-Type", contentDisposition: "Content-Disposition", cacheControl: "Cache-Control", contentEncoding: "Content-Encoding", contentLanguage: "Content-Language" } as Record<string, string>)[key], value);
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    if ((this.range?.length ?? this.size) > MAX_BUFFER_BYTES) { await this.body.cancel(); throw new AppError(413, "Read large files as a stream."); }
    return new Response(this.body).arrayBuffer();
  }
  async text() { return new TextDecoder().decode(await this.arrayBuffer()); }
}

/** Files never use caller-controlled paths; immutable payloads publish via atomic metadata rename. */
export class LocalBucket {
  readonly root: string;
  constructor(dataDir: string) { this.root = join(dataDir, "objects"); mkdirSync(this.root, { recursive: true, mode: 0o700 }); }
  directory(key: string) { return join(this.root, objectId(key)); }
  private async metadata(key: string): Promise<ObjectMetadata | null> {
    try {
      const metadata = JSON.parse(await readFile(join(this.directory(key), "object.json"), "utf8")) as ObjectMetadata;
      if (metadata.version !== 1 || metadata.key !== key || !Number.isSafeInteger(metadata.size) || metadata.size < 0 || metadata.size > MAX_OBJECT_BYTES) throw new Error("Invalid storage metadata");
      safeFile(metadata.file);
      return metadata;
    } catch (error) { if (missing(error)) return null; throw error; }
  }
  /** Absolute path of a stored object's bytes (for hard-linking into pipeline job directories). */
  async path(key: string): Promise<string | null> {
    const metadata = await this.metadata(key);
    return metadata ? join(this.directory(key), safeFile(metadata.file)) : null;
  }
  async head(key: string): Promise<LocalObject | null> {
    const metadata = await this.metadata(key);
    return metadata ? new LocalObject(metadata, new ReadableStream({ start(controller) { controller.close(); } })) : null;
  }
  async get(key: string, options: { range?: Headers | RangeInput } = {}): Promise<LocalObject | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const metadata = await this.metadata(key);
      if (!metadata) return null;
      const range = resolveRange(options.range, metadata.size);
      try {
        const handle = await open(join(this.directory(key), safeFile(metadata.file)), "r");
        const actual = await handle.stat();
        if (actual.size !== metadata.size) { await handle.close(); throw new Error("Stored object size changed"); }
        const stream = handle.createReadStream({ autoClose: true, ...(range ? { start: range.offset, end: range.offset + range.length - 1 } : {}) });
        return new LocalObject(metadata, byteStream(stream), range);
      } catch (error) { if (!missing(error)) throw error; }
    }
    throw new AppError(503, "The stored file is temporarily unavailable. Please retry.");
  }
  async put(key: string, input: ByteInput, options: PutOptions = {}): Promise<LocalObject> {
    const directory = this.directory(key);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = `${randomUUID()}.data`;
    const filename = join(directory, file);
    const value = await writeBytes(filename, input, MAX_OBJECT_BYTES, options.expectedSize);
    return exclusive(directory, async () => {
      const previous = await this.metadata(key);
      const metadata: ObjectMetadata = { version: 1, key, file, ...value, uploaded: new Date().toISOString(), httpMetadata: options.httpMetadata || {} };
      let published = false;
      try { await atomicJSON(join(directory, "object.json"), metadata); published = true; await syncDirectory(directory); }
      catch (error) { if (!published) await rm(filename, { force: true }); throw error; }
      if (previous) await rm(join(directory, safeFile(previous.file)), { force: true });
      return new LocalObject(metadata, new ReadableStream({ start(controller) { controller.close(); } }));
    });
  }
  async delete(key: string | string[]) {
    for (const item of Array.isArray(key) ? key : [key]) {
      const directory = this.directory(item);
      await exclusive(directory, async () => {
        const previous = await this.metadata(item);
        if (!previous) return;
        await unlink(join(directory, "object.json"));
        await syncDirectory(directory);
        await rm(join(directory, safeFile(previous.file)), { force: true });
      });
    }
  }
  async createMultipartUpload(key: string, options: PutOptions = {}) {
    objectId(key);
    const uploadId = randomUUID();
    const upload = this.resumeMultipartUpload(key, uploadId);
    await mkdir(upload.directory, { recursive: true, mode: 0o700 });
    await atomicJSON(join(upload.directory, "manifest.json"), { version: 1, key, httpMetadata: options.httpMetadata || {} } satisfies MultipartManifest);
    await syncDirectory(upload.directory);
    return upload;
  }
  resumeMultipartUpload(key: string, uploadId: string) {
    objectId(key);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(uploadId)) throw new AppError(400, "Invalid upload identifier.");
    return new LocalMultipart(this, key, uploadId);
  }
}

export class LocalMultipart {
  readonly bucket: LocalBucket;
  readonly key: string;
  readonly uploadId: string;
  readonly directory: string;
  constructor(bucket: LocalBucket, key: string, uploadId: string) {
    this.bucket = bucket; this.key = key; this.uploadId = uploadId; this.directory = join(bucket.root, "multipart", uploadId);
  }
  private async manifest() {
    let value: MultipartManifest;
    try { value = JSON.parse(await readFile(join(this.directory, "manifest.json"), "utf8")) as MultipartManifest; }
    catch (error) { if (missing(error)) throw new AppError(404, "This upload no longer exists. Start a new inspection."); throw error; }
    if (value.version !== 1 || value.key !== this.key) throw new AppError(409, "The upload does not match this video.");
    return value;
  }
  async uploadPart(partNumber: number, input: ByteInput): Promise<UploadedPart> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new AppError(400, "Invalid upload part.");
    return exclusive(this.directory, async () => {
      const manifest = await this.manifest();
      if (manifest.completed) throw new AppError(409, "This upload is already complete.");
      const file = `${randomUUID()}.part`;
      const value = await writeBytes(join(this.directory, file), input, MAX_PART_BYTES);
      if (!value.size) { await rm(join(this.directory, file), { force: true }); throw new AppError(400, "Upload parts cannot be empty."); }
      const pointer = join(this.directory, `${partNumber}.json`);
      let previous: PartMetadata | undefined;
      try { previous = JSON.parse(await readFile(pointer, "utf8")) as PartMetadata; } catch (error) { if (!missing(error)) throw error; }
      await atomicJSON(pointer, { partNumber, file, ...value } satisfies PartMetadata);
      await syncDirectory(this.directory);
      if (previous) await rm(join(this.directory, safeFile(previous.file)), { force: true });
      return { partNumber, etag: value.etag };
    });
  }
  async complete(parts: UploadedPart[]): Promise<LocalObject> {
    if (!parts.length || parts.length > 10000 || parts.some((part, index) => part.partNumber !== index + 1 || !/^[a-f0-9]{64}$/.test(part.etag))) throw new AppError(400, "Upload parts must be complete and ordered.");
    return exclusive(this.directory, async () => {
      const manifest = await this.manifest();
      if (manifest.completed) {
        if (JSON.stringify(parts) !== JSON.stringify(manifest.completionParts)) throw new AppError(409, "The completed upload parts do not match.");
        const object = await this.bucket.head(this.key);
        if (!object || object.etag !== manifest.completed.etag) throw new AppError(409, "The completed video has changed.");
        return object;
      }
      const saved: PartMetadata[] = [];
      for (const part of parts) {
        let value: PartMetadata;
        try { value = JSON.parse(await readFile(join(this.directory, `${part.partNumber}.json`), "utf8")) as PartMetadata; }
        catch (error) { if (missing(error)) throw new AppError(409, "The upload is incomplete. Select the same video to resume."); throw error; }
        if (value.partNumber !== part.partNumber || value.etag !== part.etag || !Number.isSafeInteger(value.size) || value.size <= 0 || value.size > MAX_PART_BYTES) throw new AppError(409, "An upload part changed. Select the same video to resume.");
        safeFile(value.file); saved.push(value);
      }
      const expected = saved.reduce((sum, part) => sum + part.size, 0);
      if (expected > MAX_OBJECT_BYTES) throw new AppError(413, "The uploaded file exceeds the supported size limit.");
      const directory = this.directory;
      async function* source() {
        for (const part of saved) {
          const handle = await open(join(directory, part.file), "r");
          const hash = createHash("sha256"); let size = 0;
          for await (const chunk of handle.createReadStream({ autoClose: true })) { size += chunk.length; hash.update(chunk); yield chunk as Uint8Array; }
          if (size !== part.size || hash.digest("hex") !== part.etag) throw new AppError(409, "An upload part failed its checksum. Select the same video to resume.");
        }
      }
      const object = await this.bucket.put(this.key, byteStream(Readable.from(source(), { objectMode: false, highWaterMark: 64 * 1024 })), { httpMetadata: manifest.httpMetadata, expectedSize: expected });
      const metadata = JSON.parse(await readFile(join(this.bucket.directory(this.key), "object.json"), "utf8")) as ObjectMetadata;
      await atomicJSON(join(this.directory, "manifest.json"), { ...manifest, completed: metadata, completionParts: parts });
      await syncDirectory(this.directory);
      for (const part of saved) await rm(join(this.directory, part.file), { force: true });
      return object;
    });
  }
  async abort() {
    await exclusive(this.directory, async () => {
      try { await this.manifest(); } catch (error) { if (error instanceof AppError && error.status === 404) return; throw error; }
      await rm(this.directory, { recursive: true, force: true });
    });
  }
}
