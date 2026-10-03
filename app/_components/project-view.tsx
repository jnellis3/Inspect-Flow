"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Check, CircleAlert, Download, FileText, Film, ImageIcon, LoaderCircle, Paperclip, Pencil, RotateCcw, Send, Sparkles, Square, Trash2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatDate, request, timeAgo } from "./api";
import ProjectForm from "./project-form";
import { StateBadge } from "./state-badge";
import { uploadFile } from "./uploader";
import { Markdown } from "./markdown";
import type { FindingSummary, Project, ProjectDetail, RunStatus } from "@/lib/inspection/types";

const PRIORITY: Record<FindingSummary["priority"], { label: string; dot: string }> = {
  safety: { label: "Safety", dot: "bg-red-500" },
  repair: { label: "Repair", dot: "bg-amber-500" },
  minor: { label: "Minor fix", dot: "bg-blue-500" },
  monitor: { label: "Monitor", dot: "bg-slate-400" },
};

export default function ProjectView({ id }: { id: string }) {
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const load = useCallback(() => request<ProjectDetail>(`/api/projects/${id}`).then(setData).catch(e => setError(e.message)), [id]);
  useEffect(() => { void load(); }, [load]);

  const active = data?.run.state === "queued" || data?.run.state === "running";
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [active, load]);

  if (error && !data) return <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-900">{error}</p>;
  if (!data) return <div className="grid min-h-[40vh] place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div>;
  const { project, run, outputs } = data;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Projects</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold">{project.property.address}</h1>
            <StateBadge state={run.state} hasVideo={project.video?.status === "ready"} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{[project.inspection.type, formatDate(project.inspection.date), project.property.city].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="bg-white" onClick={() => setEditing(!editing)}>{editing ? <X /> : <Pencil />}{editing ? "Close" : "Edit details"}</Button>
          <DeleteButton id={project.id} disabled={active} />
        </div>
      </div>

      {editing && (
        <div className="mt-6 rounded-2xl border bg-card p-6 sm:p-8">
          <ProjectForm initial={project} submitLabel="Save details" onSubmit={async fields => {
            await request(`/api/projects/${project.id}`, { method: "PATCH", body: fields });
            setEditing(false);
            await load();
          }} />
          {outputs.reel && <p className="mt-4 text-sm text-muted-foreground">Saved details reach the video the next time you request changes.</p>}
        </div>
      )}

      {!data.workerOnline && (active || run.state === "idle") && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p><b>The video engine isn’t running.</b> Uploads still work, and queued jobs start as soon as it’s back. If you host this yourself, start the <code>worker</code> service.</p>
        </div>
      )}

      <div className="mt-8 grid gap-8">
        {active && <Progress run={run} onCancel={async () => { await request(`/api/projects/${project.id}/run`, { method: "POST", body: { action: "cancel" } }); await load(); }} />}
        {run.state === "failed" && <Failed run={run} onRetry={async () => {
          await request(`/api/projects/${project.id}/run`, { method: "POST", body: run.kind === "revise" ? { action: "revise", message: data.revisions.at(-1)?.message ?? "Please finish the previous change request." } : { action: "produce" } });
          await load();
        }} />}
        {outputs.reel ? <Results data={data} reload={load} /> : !active && <Prepare project={project} run={run} onChange={load} />}
      </div>
    </div>
  );
}

function DeleteButton({ id, disabled }: { id: string; disabled: boolean }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <Button variant={armed ? "destructive" : "ghost"} size="sm" disabled={disabled} onClick={async () => {
      if (!armed) return setArmed(true);
      await request(`/api/projects/${id}`, { method: "DELETE" });
      router.push("/");
    }}><Trash2 />{armed ? "Click again to delete" : "Delete"}</Button>
  );
}

// ---------- before the first run: uploads ----------

function Prepare({ project, run, onChange }: { project: Project; run: RunStatus; onChange: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = project.video?.status === "ready" && project.supporting.every(f => f.status === "ready");
  return (
    <>
      <section className="rounded-2xl border bg-card p-6 sm:p-8">
        <h2 className="text-lg font-semibold">1. The walkthrough video</h2>
        <p className="mt-1 text-sm text-muted-foreground">The raw recording from your phone or camera, ideally with you talking through what you see. MP4 or MOV, up to 6 GB.</p>
        <div className="mt-5"><VideoUpload project={project} onChange={onChange} /></div>
      </section>
      <section className="rounded-2xl border bg-card p-6 sm:p-8">
        <h2 className="text-lg font-semibold">2. Supporting files <span className="font-normal text-muted-foreground">(optional)</span></h2>
        <p className="mt-1 text-sm text-muted-foreground">Close-up photos, extra clips, or notes. The AI uses close-ups to show issues more clearly in the video and report.</p>
        <div className="mt-5"><SupportingUpload project={project} onChange={onChange} editable={run.state === "idle"} /></div>
      </section>
      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-primary p-6 text-primary-foreground sm:flex-row sm:items-center sm:p-8">
        <div>
          <h2 className="text-lg font-semibold">3. Make the video</h2>
          <p className="mt-1 text-sm text-white/70">
            {project.voice.mode === "ai" ? "AI narrator" : "Your own voice"} · about 2–3 minutes · plus a PDF report. Usually ready in 30–60 minutes.
          </p>
          {error && <p className="mt-2 text-sm text-highlight">{error}</p>}
        </div>
        <Button size="lg" disabled={!ready || busy} className="h-12 rounded-xl bg-highlight px-6 text-base text-foreground hover:bg-highlight/90" onClick={async () => {
          setBusy(true); setError("");
          try { await request(`/api/projects/${project.id}/run`, { method: "POST", body: { action: "produce" } }); await onChange(); }
          catch (e) { setError((e as Error).message); }
          finally { setBusy(false); }
        }}>{busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{run.state === "cancelled" ? "Start again" : "Make my video"}</Button>
      </section>
    </>
  );
}

function useDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); },
    },
  };
}

function VideoUpload({ project, onChange }: { project: Project; onChange: () => Promise<unknown> }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const start = async (file?: File) => {
    if (!file) return;
    setError(""); setProgress(0);
    try { await uploadFile(project.id, "video", file, setProgress); await onChange(); }
    catch (e) { setError((e as Error).message); }
    finally { setProgress(null); }
  };
  const drop = useDrop(files => void start(files[0]));
  const video = project.video;

  if (progress !== null) return (
    <div className="rounded-xl border bg-muted/40 p-5">
      <div className="flex items-center justify-between text-sm"><span className="font-medium">Uploading…</span><span className="tabular-nums text-muted-foreground">{Math.round(progress * 100)}%</span></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 100}%` }} /></div>
      <p className="mt-2 text-xs text-muted-foreground">Keep this tab open. If the connection drops, choose the same file again to pick up where it left off.</p>
    </div>
  );
  if (video?.status === "ready") return (
    <div className="flex items-center gap-3 rounded-xl border bg-emerald-50/60 p-4">
      <span className="grid size-10 place-items-center rounded-lg bg-emerald-500 text-white"><Check className="size-5" /></span>
      <div className="min-w-0 flex-1"><p className="truncate font-medium">{video.name}</p><p className="text-sm text-muted-foreground">{formatBytes(video.size)} · uploaded</p></div>
      <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>Replace</Button>
      <input ref={input} type="file" accept="video/*,.mov,.mp4,.m4v" hidden onChange={e => void start(e.target.files?.[0])} />
    </div>
  );
  return (
    <>
      <button type="button" {...drop.props} onClick={() => input.current?.click()}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${drop.over ? "border-foreground bg-accent" : "border-input bg-muted/30 hover:bg-muted/60"}`}>
        <span className="grid size-12 place-items-center rounded-xl bg-primary text-highlight"><Upload className="size-5" /></span>
        <span className="mt-1 font-semibold">{video?.status === "uploading" ? `Resume uploading ${video.name}` : "Drop your walkthrough here, or click to choose"}</span>
        <span className="text-sm text-muted-foreground">{video?.status === "uploading" ? "Choose the same file to continue where it stopped." : "MP4 or MOV"}</span>
      </button>
      <input ref={input} type="file" accept="video/*,.mov,.mp4,.m4v" hidden onChange={e => void start(e.target.files?.[0])} />
      {error && <p className="mt-2 text-sm text-orange-800">{error}</p>}
    </>
  );
}

function SupportingUpload({ project, onChange, editable }: { project: Project; onChange: () => Promise<unknown>; editable: boolean }) {
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: File[]) => {
    setError("");
    for (const file of files) {
      setUploading(u => [...u, { name: file.name, progress: 0 }]);
      try { await uploadFile(project.id, "supporting", file, p => setUploading(u => u.map(x => x.name === file.name ? { ...x, progress: p } : x))); }
      catch (e) { setError(`${file.name}: ${(e as Error).message}`); }
      setUploading(u => u.filter(x => x.name !== file.name));
      await onChange();
    }
  };
  const drop = useDrop(files => void add(files));
  const icon = (type: string) => type.startsWith("image/") ? ImageIcon : type.startsWith("video/") ? Film : FileText;
  return (
    <div className="grid gap-3">
      {project.supporting.map(f => {
        const Icon = icon(f.type);
        return (
          <div key={f.id} className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
            <span className="text-xs text-muted-foreground">{f.status === "ready" ? formatBytes(f.size) : "incomplete"}</span>
            {editable && <button type="button" aria-label={`Remove ${f.name}`} className="text-muted-foreground hover:text-foreground" onClick={async () => {
              await request(`/api/projects/${project.id}/upload`, { method: "POST", body: { action: "remove", fileId: f.id } }).catch(e => setError(e.message));
              await onChange();
            }}><X className="size-4" /></button>}
          </div>
        );
      })}
      {uploading.map(u => (
        <div key={u.name} className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5">
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{Math.round(u.progress * 100)}%</span>
        </div>
      ))}
      <button type="button" {...drop.props} onClick={() => input.current?.click()}
        className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm transition ${drop.over ? "border-foreground bg-accent" : "border-input text-muted-foreground hover:bg-muted/50"}`}>
        <Paperclip className="size-4" />Drop photos, clips or notes here, or click to add
      </button>
      <input ref={input} type="file" multiple accept="image/*,video/*,.heic,.pdf,.txt,.md" hidden onChange={e => void add(Array.from(e.target.files ?? []))} />
      {error && <p className="text-sm text-orange-800">{error}</p>}
    </div>
  );
}

// ---------- while working ----------

const STAGES = [
  { id: "ingest", label: "Preparing your footage" },
  { id: "transcribe", label: "Listening to the walkthrough" },
  { id: "index", label: "Watching the whole video" },
  { id: "direct", label: "Editing your video" },
  { id: "verify", label: "Final touches" },
];

function Progress({ run, onCancel }: { run: RunStatus; onCancel: () => Promise<void> }) {
  const current = run.state === "queued" ? -1 : Math.max(0, STAGES.findIndex(s => s.id === run.stage || (run.stage === "web" && s.id === "verify")));
  const started = run.startedAt ? new Date(run.startedAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const minutes = started ? Math.floor((now - started) / 60000) : 0;
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary px-6 py-5 text-primary-foreground">
        <div>
          <h2 className="text-lg font-semibold">{run.state === "queued" ? "Waiting to start" : run.kind === "revise" ? "Making your changes" : "Making your video"}</h2>
          <p className="text-sm text-white/70">{run.state === "queued" ? "It will start as soon as the video engine is free." : `${minutes} min so far · usually 30–60 min. You can close this page; it keeps going.`}</p>
        </div>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={onCancel}><Square className="fill-current" />Stop</Button>
      </div>
      <ol className="grid gap-0 p-6">
        {STAGES.map((stage, i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li key={stage.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${state === "done" ? "bg-emerald-500 text-white" : state === "active" ? "bg-highlight text-foreground" : "bg-muted text-muted-foreground"}`}>
                  {state === "done" ? <Check className="size-4" /> : state === "active" ? <LoaderCircle className="size-4 animate-spin" /> : i + 1}
                </span>
                {i < STAGES.length - 1 && <span className={`my-1 w-px flex-1 ${i < current ? "bg-emerald-500" : "bg-border"}`} />}
              </div>
              <div className="pb-5">
                <p className={`text-sm font-medium ${state === "todo" ? "text-muted-foreground" : ""}`}>{stage.label}</p>
                {state === "active" && stage.id === "direct" && (run.activity || run.note) && (
                  <div className="mt-1.5 max-w-2xl">
                    {run.activity && <p className="text-sm font-medium">{run.activity}…</p>}
                    {run.note && <p className="mt-1 border-l-2 border-highlight pl-3 text-sm italic text-muted-foreground">“{run.note}”</p>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Failed({ run, onRetry }: { run: RunStatus; onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-orange-700" />
        <div>
          <h2 className="font-semibold text-orange-950">{run.kind === "revise" ? "The changes didn't finish" : "The video didn't finish"}</h2>
          <p className="mt-1 text-sm text-orange-900/80">Nothing is lost; trying again picks up where it stopped.</p>
          {run.error && <p className="mt-2 font-mono text-xs text-orange-900/70">{run.error}</p>}
        </div>
      </div>
      <Button disabled={busy} onClick={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }}>{busy ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}Try again</Button>
    </section>
  );
}

// ---------- finished ----------

function Results({ data, reload }: { data: ProjectDetail; reload: () => Promise<unknown> }) {
  const { project, outputs, findings, positives, run } = data;
  const base = `/api/projects/${project.id}/output`;
  const busy = run.state === "queued" || run.state === "running";
  const counts = (["safety", "repair", "minor", "monitor"] as const).map(k => [k, findings.filter(f => f.priority === k).length] as const).filter(([, n]) => n);
  return (
    <>
      <section className="overflow-hidden rounded-2xl border bg-black shadow-[0_30px_80px_-40px_rgb(11_18_32/0.6)]">
        <video key={outputs.version} className="aspect-video w-full" controls preload="metadata" poster={outputs.poster ? `${base}/poster?v=${outputs.version}` : undefined} src={`${base}/reel?v=${outputs.version}`} />
      </section>
      <div className="-mt-4 flex flex-wrap items-center gap-3">
        <Button asChild size="lg" className="rounded-xl"><a href={`${base}/reel?download`}><Download />Download video</a></Button>
        {outputs.report && <Button asChild size="lg" variant="outline" className="rounded-xl bg-white"><a href={`${base}/report`} target="_blank" rel="noreferrer"><FileText />Open PDF report</a></Button>}
        <span className="text-sm text-muted-foreground">{run.finishedAt ? `Finished ${timeAgo(run.finishedAt)}` : ""}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">What the video covers</h2>
            <p className="text-sm text-muted-foreground">{counts.map(([k, n]) => `${n} ${PRIORITY[k].label.toLowerCase()}`).join(" · ")}{positives.length ? ` · ${positives.length} done right` : ""}</p>
          </div>
          <ul className="mt-4 grid gap-2.5">
            {findings.map(f => (
              <li key={f.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className={`size-2 rounded-full ${PRIORITY[f.priority].dot}`} />{PRIORITY[f.priority].label} · {f.area}{f.confidence !== "confirmed" && <span className="rounded bg-muted px-1.5 py-0.5">{f.confidence}</span>}</div>
                <p className="mt-1 font-semibold">{f.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.summary}</p>
                <p className="mt-2 text-sm font-medium">→ {f.fix}</p>
              </li>
            ))}
          </ul>
          {positives.length > 0 && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-sm font-semibold text-emerald-900">Done right</p>
              <ul className="mt-1.5 grid gap-1 text-sm text-emerald-900/80">{positives.map(p => <li key={p.title} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" />{p.title}</li>)}</ul>
            </div>
          )}
        </section>
        <aside className="grid content-start gap-6">
          <Revise projectId={project.id} disabled={busy} history={data.revisions} onSent={reload} />
          {data.editorNotes && (
            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Notes from the AI editor</summary>
              <div className="mt-3 text-sm"><Markdown text={data.editorNotes} /></div>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}

function Revise({ projectId, disabled, history, onSent }: { projectId: string; disabled: boolean; history: { message: string; at: string }[]; onSent: () => Promise<unknown> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Want changes?</h2>
      <p className="mt-1 text-sm text-muted-foreground">Tell the editor in plain words. It remembers every decision it made, changes what you ask, and re-renders.</p>
      <Textarea className="mt-3 min-h-28 bg-white" value={message} onChange={e => setMessage(e.target.value)} disabled={disabled || busy}
        placeholder={"e.g. Make it shorter. Lead with the roof issues. The window seal isn't clearly visible, so leave it out of the video."} />
      {error && <p className="mt-2 text-sm text-orange-800">{error}</p>}
      <Button className="mt-3 w-full" disabled={disabled || busy || message.trim().length < 3} onClick={async () => {
        setBusy(true); setError("");
        try { await request(`/api/projects/${projectId}/run`, { method: "POST", body: { action: "revise", message } }); setMessage(""); await onSent(); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
      }}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}Send to the editor</Button>
      {history.length > 0 && (
        <ul className="mt-4 grid gap-2 border-t pt-3">
          {[...history].reverse().map(h => <li key={h.at} className="text-sm"><span className="text-xs text-muted-foreground">{timeAgo(h.at)}</span><p className="text-muted-foreground">“{h.message}”</p></li>)}
        </ul>
      )}
    </section>
  );
}
