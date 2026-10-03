import { api, body, bucket, deleteProject, getProject, updateProject } from "@/lib/inspection/store";
import { detail, removeJob } from "@/lib/inspection/jobs";
import { ProjectFields } from "@/lib/inspection/fields";

type Context = { params: Promise<{ id: string }> };

export const GET = (req: Request, c: Context) => api(req, async () => {
  const project = await getProject((await c.params).id);
  return Response.json({ project, ...(await detail(project)) });
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
  await deleteProject(project.id);
  return Response.json({ deleted: true });
});
