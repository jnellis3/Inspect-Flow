"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Clapperboard, FileText, LoaderCircle, Plus, Upload, Video } from "lucide-react";
import Shell from "./_components/shell";
import { formatDate, request, timeAgo } from "./_components/api";
import { StateBadge } from "./_components/state-badge";
import { Button } from "@/components/ui/button";
import type { ProjectListItem } from "@/lib/inspection/types";

export default function Home() {
  return <Shell><Projects /></Shell>;
}

function Projects() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request<{ projects: ProjectListItem[] }>("/api/projects").then(d => setProjects(d.projects)).catch(e => setError(e.message));
  }, []);

  if (error) return <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-900">{error}</p>;
  if (!projects) return <div className="grid min-h-[40vh] place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div>;
  if (!projects.length) return <Welcome />;

  return (
    <>
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Your projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Each project turns one walkthrough into a highlight video and a written report.</p>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map(p => (
          <Link key={p.id} href={`/p/${p.id}`} className="group overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgb(11_18_32/0.45)]">
            <div className="relative aspect-video bg-[radial-gradient(circle_at_30%_20%,#1c2a44,#0b1220)]">
              {p.poster
                // eslint-disable-next-line @next/next/no-img-element -- authenticated API image
                ? <img src={`/api/projects/${p.id}/output/poster`} alt="" className="size-full object-cover" />
                : <div className="grid size-full place-items-center text-white/30"><Video className="size-10" /></div>}
              <div className="absolute left-3 top-3"><StateBadge state={p.state} hasVideo={p.hasVideo} /></div>
            </div>
            <div className="p-4">
              <h2 className="truncate font-semibold">{p.property.address}</h2>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {[p.inspection.type, formatDate(p.inspection.date), p.property.city].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">Updated {timeAgo(p.updatedAt)}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function Welcome() {
  const steps = [
    { icon: Upload, title: "Upload your walkthrough", text: "The raw video from your phone, talking through what you see. Add close-up photos if you have them." },
    { icon: Clapperboard, title: "AI edits it for you", text: "It finds every issue you pointed out, picks the clearest shots, labels them, and writes the narration." },
    { icon: FileText, title: "Send a video and a report", text: "A 2–3 minute highlight reel and a matching PDF your client can act on." },
  ];
  return (
    <section className="mx-auto max-w-3xl py-10 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Welcome</p>
      <h1 className="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl">Turn a walkthrough into a video<br className="hidden sm:block" /> your client will actually watch.</h1>
      <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <div key={title} className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" /></span><span className="text-xs font-semibold text-muted-foreground">Step {i + 1}</span></div>
            <h2 className="mt-3 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
      <Button asChild size="lg" className="mt-10 h-12 rounded-xl px-7 text-base"><Link href="/new"><Plus />Start your first project</Link></Button>
    </section>
  );
}
