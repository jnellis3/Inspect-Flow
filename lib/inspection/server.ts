import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { AppError, LocalBucket, LocalDatabase } from "./local-storage";

export { AppError } from "./local-storage";

function secret(name: string): string | undefined {
  const direct = process.env[name]?.trim();
  const file = process.env[`${name}_FILE`]?.trim();
  if (direct && file) throw new AppError(503, `Configure ${name} or ${name}_FILE, not both.`);
  if (!file) return direct || undefined;
  try {
    if (statSync(file).size > 8192) throw new Error("Oversized secret file");
    return readFileSync(file, "utf8").trim() || undefined;
  } catch {
    throw new AppError(503, `The ${name}_FILE secret could not be read. Check the server configuration.`);
  }
}

// Getters are evaluated only by server code. Secrets are never bundled into the UI.
export const runtime = {
  get OPENAI_API_KEY() { return secret("OPENAI_API_KEY"); },
  get OPENAI_MODEL() { return process.env.OPENAI_MODEL?.trim() || undefined; },
};

let database: LocalDatabase | undefined;
let objects: LocalBucket | undefined;
export function db() {
  return database ??= new LocalDatabase(resolve(process.env.DATA_DIR || "./data"), resolve(process.cwd(), "drizzle"));
}
export function bucket() {
  return objects ??= new LocalBucket(resolve(process.env.DATA_DIR || "./data"));
}
