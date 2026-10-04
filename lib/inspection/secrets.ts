// Small secrets kept in the database (third-party API keys) are sealed with AES-256-GCM.
// The key comes from APP_SECRET_KEY (64 hex characters) or, failing that, from a file created
// once on the data volume, so a copy of the SQLite file alone reveals nothing.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./server";

let cached: Buffer | null = null;

function secretKey(): Buffer {
  if (cached) return cached;
  const fromEnv = process.env.APP_SECRET_KEY?.trim();
  if (fromEnv) {
    if (!/^[a-f0-9]{64}$/i.test(fromEnv)) throw new Error("APP_SECRET_KEY must be 64 hex characters (32 bytes).");
    return (cached = Buffer.from(fromEnv, "hex"));
  }
  const path = join(dataDir(), ".secret-key");
  try { cached = Buffer.from(readFileSync(path, "utf8").trim(), "hex"); }
  catch {
    mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
    cached = randomBytes(32);
    writeFileSync(path, cached.toString("hex"), { mode: 0o600 });
    chmodSync(path, 0o600);
  }
  if (cached.length !== 32) throw new Error("The stored secret key is damaged.");
  return cached;
}

/** "v1.<iv>.<ciphertext>.<tag>" in base64url. */
export function seal(plain: string, key = secretKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function open(sealed: string, key = secretKey()): string {
  const [version, iv, body, tag] = sealed.split(".");
  if (version !== "v1" || !iv || !body || !tag) throw new Error("Unrecognized sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
