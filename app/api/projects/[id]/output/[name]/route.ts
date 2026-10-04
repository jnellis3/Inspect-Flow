import { api, getProject } from "@/lib/inspection/store";
import { streamOutput } from "@/lib/inspection/outputs";

type Context = { params: Promise<{ id: string; name: string }> };

/** A finished output for the signed-in owner. */
export const GET = (req: Request, c: Context) => api(req, async () => {
  const { id, name } = await c.params;
  return streamOutput(req, await getProject(id), name);
});
