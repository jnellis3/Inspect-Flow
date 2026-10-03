import { z } from "zod";
import { AppError, api, body, mutation } from "@/lib/inspection/store";
import { completeUpload, removeSupporting, startUpload, uploadPart, type Target } from "@/lib/inspection/uploads";

type Context = { params: Promise<{ id: string }> };
const kind = z.enum(["video", "supporting"]);

const target = (k: "video" | "supporting", id?: string | null): Target => {
  if (k === "video") return { kind: "video" };
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new AppError(400, "Missing file id.");
  return { kind: "supporting", id };
};

export const POST = (req: Request, c: Context) => api(req, async () => {
  const { id } = await c.params;
  const input = await body(req, z.discriminatedUnion("action", [
    z.object({ action: z.literal("start"), target: kind, name: z.string().min(1).max(300), type: z.string().max(100), size: z.number().int().positive(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }),
    z.object({ action: z.literal("complete"), target: kind, fileId: z.string().optional() }),
    z.object({ action: z.literal("remove"), fileId: z.string() }),
  ]));
  if (input.action === "start") return Response.json(await startUpload(id, input.target, input));
  if (input.action === "complete") return Response.json({ project: await completeUpload(id, target(input.target, input.fileId)) });
  return Response.json({ project: await removeSupporting(id, input.fileId) });
});

/** One 8 MiB part: PUT ?target=video|supporting&file=<id>&part=<n> with X-Part-Size. */
export const PUT = (req: Request, c: Context) => api(req, async () => {
  mutation(req);
  const { id } = await c.params;
  const url = new URL(req.url);
  const t = target(kind.parse(url.searchParams.get("target")), url.searchParams.get("file"));
  return Response.json({ part: await uploadPart(id, t, Number(url.searchParams.get("part")), req) });
});
