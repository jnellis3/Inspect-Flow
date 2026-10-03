import { AppError } from "@/lib/inspection/server";
import { assertClaimed, readFileFor, workerRoute, writeFileFor } from "@/lib/inspection/worker-api";

type Context = { params: Promise<{ id: string }> };
const pathOf = (req: Request) => {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) throw new AppError(400, "Missing path.");
  return path;
};

/** Inputs for the job (uploads, brief, request, saved state). */
export const GET = (req: Request, c: Context) => workerRoute(req, async workerId => {
  const { id } = await c.params;
  await assertClaimed(id, workerId);
  return readFileFor(id, pathOf(req));
});

/** Results from the job (video, report, findings, notes, saved state). */
export const PUT = (req: Request, c: Context) => workerRoute(req, async workerId => {
  const { id } = await c.params;
  await assertClaimed(id, workerId);
  return Response.json({ bytes: await writeFileFor(id, pathOf(req), req.body) });
});
