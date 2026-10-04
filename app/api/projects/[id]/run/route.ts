import { z } from "zod";
import { api, body, getProject } from "@/lib/inspection/store";
import { cancelRun, detail, queueRun } from "@/lib/inspection/jobs";
import { videoUsage } from "@/lib/inspection/workspaces";

type Context = { params: Promise<{ id: string }> };

/** Start the video, request changes to it, or stop the current job. */
export const POST = (req: Request, c: Context) => api(req, async () => {
  const input = await body(req, z.discriminatedUnion("action", [
    z.object({ action: z.literal("produce") }),
    z.object({ action: z.literal("revise"), message: z.string().trim().min(3, "Describe the changes you'd like.").max(4000) }),
    z.object({ action: z.literal("cancel") }),
  ]));
  const project = await getProject((await c.params).id);
  if (input.action === "cancel") await cancelRun(project.id);
  else await queueRun(project, input.action, input.action === "revise" ? input.message : "");
  return Response.json({ project, ...(await detail(project)), usage: await videoUsage(project.id) });
});
