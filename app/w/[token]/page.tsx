import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, FileText, Play } from "lucide-react";
import { detail } from "@/lib/inspection/jobs";
import { projectForShare } from "@/lib/inspection/share";
import { POSITIVES_LABEL, projectDetails, projectTitle } from "@/lib/inspection/types";

// Public page for a finished reel. Only the random share token grants access; it is never cached.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await projectForShare((await params).token).catch(() => null);
  if (!project) return { title: "Inspect Flow" };
  const title = `${projectTitle(project)} · Inspection highlights`;
  return { title, description: `A ${project.company.name || "home inspection"} highlight video.`, openGraph: { title, images: [`/api/w/${(await params).token}/poster`], type: "video.other" }, robots: { index: false, follow: false } };
}

const PRIORITY: Record<string, string> = { safety: "Safety", repair: "Repair", minor: "Minor fix", monitor: "Monitor" };

export default async function WatchPage({ params }: Props) {
  const { token } = await params;
  const project = await projectForShare(token).catch(() => null);
  if (!project) notFound();
  const info = await detail(project);
  if (!info.outputs.reel) notFound();
  const base = `/api/w/${token}`;
  const company = project.company;
  const details = [project.inspection.type, project.inspection.date, ...projectDetails(project)].filter(Boolean).join(" · ");

  return (
    <main className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 pt-8">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={company.accent ? { color: company.accent } : undefined}>{company.name || "Inspection highlights"}</p>
          <h1 className="mt-1 truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">{projectTitle(project)}</h1>
          {details && <p className="mt-1 text-sm text-muted-foreground">{details}</p>}
        </div>
      </header>
      <section className="mx-auto mt-6 max-w-4xl px-5">
        <div className="overflow-hidden rounded-2xl border bg-black shadow-[0_30px_80px_-40px_rgb(11_18_32/0.6)]">
          <video className="aspect-video w-full" controls playsInline preload="metadata" poster={info.outputs.poster ? `${base}/poster` : undefined} src={`${base}/reel`} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {info.outputs.report && <a className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90" href={`${base}/report`} target="_blank" rel="noreferrer"><FileText className="size-4" />Open the PDF report</a>}
          <a className="inline-flex h-11 items-center gap-2 rounded-xl border bg-white px-5 text-sm font-semibold hover:bg-muted" href={`${base}/reel?download`}><Download className="size-4" />Download the video</a>
        </div>
      </section>
      {info.findings.length > 0 && (
        <section className="mx-auto mt-10 max-w-4xl px-5">
          <h2 className="text-lg font-semibold">What the video covers</h2>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {info.findings.map(f => (
              <li key={f.id} className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">{PRIORITY[f.priority] ?? f.priority} · {f.area}</p>
                <p className="mt-1 font-semibold">{f.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.summary}</p>
              </li>
            ))}
          </ul>
          {info.positives.length > 0 && <p className="mt-4 text-sm text-muted-foreground">{POSITIVES_LABEL[project.vertical]}: {info.positives.map(p => p.title).join(" · ")}</p>}
        </section>
      )}
      <footer className="mx-auto mt-14 max-w-4xl px-5 pb-12 text-sm text-muted-foreground">
        {(company.phone || company.website) && <p>{[company.name, company.phone, company.website].filter(Boolean).join(" · ")}</p>}
        <p className="mt-6 inline-flex items-center gap-1.5 text-xs"><span className="grid size-5 place-items-center rounded-md bg-primary text-highlight"><Play className="size-2.5 fill-current" /></span>Made with Inspect Flow</p>
      </footer>
    </main>
  );
}
