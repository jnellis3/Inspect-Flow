import { z } from "zod";
import { api, body, getProject } from "@/lib/inspection/store";
import { linkForProject, linkProject, pushToSpectora, rawInspection, unlinkProject } from "@/lib/inspection/spectora/store";

type Context = { params: Promise<{ id: string }> };

/** The link plus the raw Spectora record (handy for checking what the mapping saw). */
export const GET = (req: Request, c: Context) => api(req, async () => {
  const project = await getProject((await c.params).id);
  return Response.json({ link: await linkForProject(project.id), raw: await rawInspection(project.id) });
});

export const POST = (req: Request, c: Context) => api(req, async () => {
  const project = await getProject((await c.params).id);
  const input = await body(req, z.discriminatedUnion("action", [
    z.object({ action: z.literal("link"), inspectionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }),
    z.object({ action: z.literal("unlink") }),
    z.object({ action: z.literal("push") }),
  ]));
  if (input.action === "link") return Response.json({ link: await linkProject(project.id, input.inspectionId) });
  if (input.action === "unlink") { await unlinkProject(project.id); return Response.json({ link: null }); }
  return Response.json({ link: await pushToSpectora(project.id) });
});
