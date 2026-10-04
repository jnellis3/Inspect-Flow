import { api, body, insertProject, listProjects } from "@/lib/inspection/store";
import { OUTPUTS, jobDir, readRun } from "@/lib/inspection/jobs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Project, ProjectListItem } from "@/lib/inspection/types";
import { ProjectFields } from "@/lib/inspection/fields";
import { videoUsage } from "@/lib/inspection/workspaces";

export const GET = (req: Request) => api(req, async () => {
  const projects = await listProjects();
  const items: ProjectListItem[] = await Promise.all(projects.map(async p => ({
    id: p.id, vertical: p.vertical, property: p.property, vehicle: p.vehicle, inspection: p.inspection, updatedAt: p.updatedAt,
    state: (await readRun(p.id)).state,
    hasVideo: p.video?.status === "ready",
    poster: !!(await stat(join(jobDir(p.id), OUTPUTS.poster.file)).catch(() => null)),
  })));
  // New projects start from the kind of inspection, inspectors and voice used last time in this workspace.
  const defaults = projects[0] ? { vertical: projects[0].vertical, inspectors: projects[0].inspectors, voice: projects[0].voice } : null;
  const { used, limit } = await videoUsage();
  return Response.json({ projects: items, defaults, usage: { used, limit } });
});

export const POST = (req: Request) => api(req, async () => {
  const fields = await body(req, ProjectFields);
  const now = new Date().toISOString();
  const project: Project = { ...fields, id: crypto.randomUUID(), revision: 1, createdAt: now, updatedAt: now, video: null, supporting: [] };
  await insertProject(project);
  return Response.json({ project }, { status: 201 });
});
