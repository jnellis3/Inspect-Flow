"use client";
import { use } from "react";
import Shell from "../../_components/shell";
import ProjectView from "../../_components/project-view";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Shell><ProjectView id={id} /></Shell>;
}
