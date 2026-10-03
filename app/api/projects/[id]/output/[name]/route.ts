import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { AppError, api, getProject } from "@/lib/inspection/store";
import { OUTPUTS, jobDir } from "@/lib/inspection/jobs";

type Context = { params: Promise<{ id: string; name: string }> };

/** Stream a finished output. Supports byte ranges (video seeking); ?download for an attachment. */
export const GET = (req: Request, c: Context) => api(req, async () => {
  const { id, name } = await c.params;
  const output = OUTPUTS[name as keyof typeof OUTPUTS];
  if (!output) throw new AppError(404, "Unknown output.");
  const project = await getProject(id);
  const path = join(jobDir(project.id), output.file);
  const info = await stat(path).catch(() => null);
  if (!info) throw new AppError(404, "This output isn't ready yet.");

  const slug = project.property.address.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "inspection";
  const headers = new Headers({
    "Content-Type": output.type,
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${new URL(req.url).searchParams.has("download") ? "attachment" : "inline"}; filename="${slug}-${output.download}"`,
  });
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start >= info.size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(info.size));
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers });
});
