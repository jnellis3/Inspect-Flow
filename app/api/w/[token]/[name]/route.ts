import { AppError, api } from "@/lib/inspection/store";
import { projectForShare } from "@/lib/inspection/share";
import { streamOutput } from "@/lib/inspection/outputs";

type Context = { params: Promise<{ token: string; name: string }> };

/** Media for a public watch page: anyone holding the share token may stream the reel, poster and report. */
export const GET = (req: Request, c: Context) => api(req, async () => {
  const { token, name } = await c.params;
  if (!["reel", "poster", "report"].includes(name)) throw new AppError(404, "Unknown output.");
  const shared = await projectForShare(token);
  if (!shared) throw new AppError(404, "This link isn't valid anymore.");
  const response = await streamOutput(req, shared.project, name, { cache: "private, max-age=300" });
  return response;
}, { public: true });
