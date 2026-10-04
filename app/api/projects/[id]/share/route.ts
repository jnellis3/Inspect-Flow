import { z } from "zod";
import { api, body, getProject } from "@/lib/inspection/store";
import { ensureShare, getShare, revokeShares } from "@/lib/inspection/share";

type Context = { params: Promise<{ id: string }> };

export const GET = (req: Request, c: Context) => api(req, async () => {
  const project = await getProject((await c.params).id);
  return Response.json({ share: await getShare(project.id) });
});

/** Mint a public watch link, or revoke every link this project has had. */
export const POST = (req: Request, c: Context) => api(req, async () => {
  const project = await getProject((await c.params).id);
  const { action } = await body(req, z.object({ action: z.enum(["create", "revoke"]) }));
  if (action === "revoke") { await revokeShares(project.id); return Response.json({ share: null }); }
  return Response.json({ share: await ensureShare(project.id) });
});
