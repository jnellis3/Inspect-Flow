import { resolve } from "node:path";
import { LocalBucket, LocalDatabase } from "./local-storage";

export { AppError } from "./local-storage";

/** Root of all persistent state: SQLite, uploaded objects, and pipeline job directories. */
export const dataDir = () => resolve(process.env.DATA_DIR || "./data");

/** Where the app hands work to the pipeline worker (one directory per project). */
export const jobsDir = () => resolve(process.env.JOBS_DIR || `${dataDir()}/jobs`);

let database: LocalDatabase | undefined;
let objects: LocalBucket | undefined;

export function db() {
  return database ??= new LocalDatabase(dataDir(), resolve(process.cwd(), "drizzle"));
}

export function bucket() {
  return objects ??= new LocalBucket(dataDir());
}
