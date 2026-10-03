import { reportStatus, workerRoute } from "@/lib/inspection/worker-api";

type Context = { params: Promise<{ id: string }> };

/** Progress from the worker running this job. The response says whether to cancel it. */
export const POST = (req: Request, c: Context) => workerRoute(req, async workerId => {
  const patch = await req.json().catch(() => ({}));
  return Response.json(await reportStatus((await c.params).id, workerId, patch));
});
