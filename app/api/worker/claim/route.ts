import { claim, workerRoute } from "@/lib/inspection/worker-api";

export const dynamic = "force-dynamic";

/** A remote worker asks for its next job: 200 with the job, or 204 when there's nothing to do. */
export const POST = (req: Request) => workerRoute(req, async workerId => {
  const job = await claim(workerId);
  return job ? Response.json(job) : new Response(null, { status: 204 });
});
