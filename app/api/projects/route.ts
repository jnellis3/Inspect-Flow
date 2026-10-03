import { api, body, insertProject, listProjects } from "@/lib/inspection/store";
import { OUTPUTS, jobDir, readRun } from "@/lib/inspection/jobs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Project, ProjectListItem } from "@/lib/inspection/types";
import { ProjectFields } from "@/lib/inspection/fields";


export const GET = (req: Request) => api(req, async () => {
  const projects = await listProjects();
  const items: ProjectListItem[] = await Promise.all(projects.map(async p => ({
    id: p.id, property: p.property, inspection: p.inspection, updatedAt: p.updatedAt,
    state: (await readRun(p.id)).state,
    hasVideo: p.video?.status === "ready",
    poster: !!(await stat(join(jobDir(p.id), OUTPUTS.poster.file)).catch(() => null)),
  })));
  return Response.json({ projects: items, defaults: projects[0] ? { company: projects[0].company, voice: projects[0].voice } : null });
});

export const POST = (req: Request) => api(req, async () => {
  const fields = await body(req, ProjectFields);
  const now = new Date().toISOString();
  const project: Project = { ...fields, id: crypto.randomUUID(), revision: 1, createdAt: now, updatedAt: now, video: null, supporting: [] };
  await insertProject(project);
  return Response.json({ project }, { status: 201 });
});
