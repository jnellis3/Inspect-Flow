import { api, body, bucket, deleteProject, getProject, owner, updateProject } from "@/lib/inspection/store";
import { detail, removeJob } from "@/lib/inspection/jobs";
import { ProjectFields } from "@/lib/inspection/fields";
import { getShare, revokeShares } from "@/lib/inspection/share";
import { linkForProject, pushIfReady, unlinkProject } from "@/lib/inspection/spectora/store";

type Context = { params: Promise<{ id: string }> };

export const GET = (req: Request, c: Context) => api(req, async () => {
  const project = await getProject((await c.params).id);
  const info = await detail(project);
  // Finished while nobody was watching (local worker mode has no completion callback): catch up now.
  if (info.run.state === "done") await pushIfReady(project.id, owner());
  return Response.json({ project, ...info, spectora: await linkForProject(project.id), share: await getShare(project.id) });
});

/** Edit the project's details. Changes reach the video on the next run or revision. */
export const PATCH = (req: Request, c: Context) => api(req, async () => {
  const fields = await body(req, ProjectFields);
  const project = await updateProject((await c.params).id, p => ({ ...p, ...fields }));
  return Response.json({ project });
});

export const DELETE = (req: Request, c: Context) => api(req, async () => {
  const project = await getProject((await c.params).id);
  await removeJob(project.id);
  await bucket().delete([`${project.id}/source`, ...project.supporting.map(f => `${project.id}/supporting/${f.id}`)]);
  await revokeShares(project.id);
  await unlinkProject(project.id);
  await deleteProject(project.id);
  return Response.json({ deleted: true });
});
