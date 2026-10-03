"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import Shell from "../_components/shell";
import ProjectForm, { EMPTY, type Fields } from "../_components/project-form";
import { request } from "../_components/api";
import type { Project } from "@/lib/inspection/types";

export default function NewProjectPage() {
  return <Shell><NewProject /></Shell>;
}

function NewProject() {
  const router = useRouter();
  const [initial, setInitial] = useState<Fields | null>(null);
  useEffect(() => {
    // Start from the company details and voice used last time.
    request<{ defaults: Pick<Fields, "company" | "voice"> | null }>("/api/projects")
      .then(d => setInitial({ ...EMPTY, ...(d.defaults ?? {}) }))
      .catch(() => setInitial(EMPTY));
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl font-bold">New project</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">Tell us about the inspection. You’ll upload the walkthrough next.</p>
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        {initial ? (
          <ProjectForm initial={initial} submitLabel="Continue to upload" onSubmit={async fields => {
            const { project } = await request<{ project: Project }>("/api/projects", { method: "POST", body: fields });
            router.push(`/p/${project.id}`);
          }} />
        ) : <div className="grid h-40 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div>}
      </div>
    </div>
  );
}
