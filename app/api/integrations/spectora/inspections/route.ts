import { z } from "zod";
import { api, body } from "@/lib/inspection/store";
import { importInspection, recentInspections } from "@/lib/inspection/spectora/store";

/** The company's recent Spectora inspections, with the project each one became (if any). */
export const GET = (req: Request) => api(req, async () => {
  const size = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("size")) || 20));
  return Response.json({ inspections: await recentInspections(size) });
});

/** Create a project from one Spectora inspection (or return the one it already has). */
export const POST = (req: Request) => api(req, async () => {
  const { inspectionId } = await body(req, z.object({ inspectionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }));
  return Response.json({ project: await importInspection(inspectionId) }, { status: 201 });
});
