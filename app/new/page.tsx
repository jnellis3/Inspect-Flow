"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import Shell from "../_components/shell";
import ProjectForm, { EMPTY, withVertical, type Fields } from "../_components/project-form";
import { request } from "../_components/api";
import type { Project, Vertical } from "@/lib/inspection/types";

export default function NewProjectPage() {
  return <Shell><NewProject /></Shell>;
}

function NewProject() {
  const router = useRouter();
  const [initial, setInitial] = useState<Fields | null>(null);
  useEffect(() => {
    // Start from the inspectors, voice and kind of inspection used last time in this workspace;
    // a link like /new?type=vehicle (from a landing page) picks the kind.
    const asked = new URLSearchParams(window.location.search).get("type");
    const start = (d: Partial<Fields>) => {
      const vertical: Vertical = asked === "vehicle" || asked === "home" ? asked : d.vertical ?? "home";
      setInitial(withVertical({ ...EMPTY, ...d }, vertical));
    };
    request<{ defaults: Pick<Fields, "vertical" | "inspectors" | "voice"> | null }>("/api/projects")
      .then(d => start(d.defaults ?? {}))
      .catch(() => start({}));
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl font-bold">New project</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">Tell us about the inspection. You’ll upload the walkthrough next.</p>
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        {initial ? (
          <ProjectForm chooseVertical initial={initial} submitLabel="Continue to upload" onSubmit={async fields => {
            const { project } = await request<{ project: Project }>("/api/projects", { method: "POST", body: fields });
            router.push(`/p/${project.id}`);
          }} />
        ) : <div className="grid h-40 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div>}
      </div>
    </div>
  );
}
