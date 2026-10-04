"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Link2Off, LoaderCircle, Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, request, timeAgo } from "./api";
import type { ProjectDetail, SpectoraLink } from "@/lib/inspection/types";

type Props = { data: ProjectDetail; reload: () => Promise<unknown> };
type Inspection = SpectoraLink["mapped"] & { id: string; link: SpectoraLink | null };

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return <Button type="button" variant="outline" size="sm" className="bg-white" onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? <Check /> : <Copy />}{done ? "Copied" : "Copy"}</Button>;
}

/** Share link and Spectora link for one project. Shown once the project exists; most useful once the reel is done. */
export default function SpectoraCard({ data, reload }: Props) {
  const { project, outputs, spectora, share } = data;
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { request<{ spectora: { connected: boolean } }>("/api/integrations/spectora").then(d => setConnected(d.spectora.connected)).catch(() => setConnected(false)); }, []);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError("");
    try { await fn(); await reload(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Share with the client</h2>
      {share ? (
        <div className="mt-2 grid gap-2">
          <p className="text-sm text-muted-foreground">Anyone with this link can watch the video and open the report. No sign-in needed.</p>
          <div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">{share.url}</code><CopyButton value={share.url} /></div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="bg-white"><a href={share.url} target="_blank" rel="noreferrer"><ExternalLink />Open</a></Button>
            <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => act("revoke", () => request(`/api/projects/${project.id}/share`, { method: "POST", body: { action: "revoke" } }))}>Turn the link off</Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 grid gap-2">
          <p className="text-sm text-muted-foreground">{outputs.reel ? "Make a public link your client can open on any device." : "Once the video is finished you can make a public link for your client."}</p>
          <div><Button size="sm" disabled={!outputs.reel || !!busy} onClick={() => act("share", () => request(`/api/projects/${project.id}/share`, { method: "POST", body: { action: "create" } }))}>{busy === "share" ? <LoaderCircle className="animate-spin" /> : <Link2 />}Make a watch link</Button></div>
        </div>
      )}

      <div className="mt-5 border-t pt-4">
        <h3 className="text-sm font-semibold">Spectora</h3>
        {connected === null ? <LoaderCircle className="mt-2 size-4 animate-spin text-muted-foreground" />
          : !connected ? <p className="mt-1 text-sm text-muted-foreground">Not connected. <Link className="underline underline-offset-4" href="/settings/integrations">Connect Spectora</Link> to pull inspections in and push videos back.</p>
          : spectora ? <Linked link={spectora} ready={outputs.reel} busy={busy} onPush={() => act("push", () => request(`/api/projects/${project.id}/spectora`, { method: "POST", body: { action: "push" } }))} onUnlink={() => act("unlink", () => request(`/api/projects/${project.id}/spectora`, { method: "POST", body: { action: "unlink" } }))} />
          : <Picker busy={busy} onLink={id => act("link", () => request(`/api/projects/${project.id}/spectora`, { method: "POST", body: { action: "link", inspectionId: id } }))} />}
        {error && <p className="mt-2 text-sm text-orange-800">{error}</p>}
      </div>
    </section>
  );
}

function Linked({ link, ready, busy, onPush, onUnlink }: { link: SpectoraLink; ready: boolean; busy: string; onPush: () => void; onUnlink: () => void }) {
  const m = link.mapped;
  return (
    <div className="mt-1 grid gap-2 text-sm">
      <p className="text-muted-foreground">Linked to inspection <code className="font-mono text-xs">{link.inspectionId}</code>{m.inspection.date && ` on ${formatDate(m.inspection.date)}`}{m.client && `, client ${m.client}`}.{link.status !== "linked" && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-900">{link.status} in Spectora</span>}</p>
      {link.pushedAt
        ? <p className="flex items-center gap-1.5 text-emerald-800"><Check className="size-4" />Attached to the Spectora inspection {timeAgo(link.pushedAt)}.</p>
        : link.pushError ? <p className="text-orange-800">Attaching failed: {link.pushError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!ready || !!busy} onClick={onPush}>{busy === "push" ? <LoaderCircle className="animate-spin" /> : <Send />}{link.pushedAt ? "Attach again" : "Attach to Spectora"}</Button>
        {m.url && <Button asChild variant="outline" size="sm" className="bg-white"><a href={m.url} target="_blank" rel="noreferrer"><ExternalLink />Open in Spectora</a></Button>}
        <Button variant="ghost" size="sm" disabled={!!busy} onClick={onUnlink}><Link2Off />Unlink</Button>
      </div>
      {!ready && <p className="text-xs text-muted-foreground">The poster frame of the finished video, named after the watch link, is added to the inspection&rsquo;s documents. It attaches automatically when the video finishes if that option is on in <Link className="underline underline-offset-4" href="/settings/integrations">Integrations</Link>.</p>}
    </div>
  );
}

function Picker({ busy, onLink }: { busy: string; onLink: (id: string) => void }) {
  const [rows, setRows] = useState<Inspection[] | null>(null);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { request<{ inspections: Inspection[] }>("/api/integrations/spectora/inspections").then(d => { const open = d.inspections.filter(i => !i.link); setRows(open); setChoice(open[0]?.id ?? ""); }).catch(e => setError(e.message)); }, []);
  if (error) return <p className="mt-1 text-sm text-orange-800">{error}</p>;
  if (!rows) return <LoaderCircle className="mt-2 size-4 animate-spin text-muted-foreground" />;
  if (!rows.length) return <p className="mt-1 text-sm text-muted-foreground">Every recent Spectora inspection already has a project. <Link className="underline underline-offset-4" href="/settings/integrations">See them</Link>.</p>;
  return (
    <div className="mt-1 grid gap-2">
      <p className="text-sm text-muted-foreground">Link this project to a Spectora inspection so the finished video can be attached to it.</p>
      <div className="flex gap-2">
        <select className="h-9 min-w-0 flex-1 rounded-md border border-input bg-white px-2 text-sm" value={choice} onChange={e => setChoice(e.target.value)}>
          {rows.map(r => <option key={r.id} value={r.id}>{[r.property.address || `Inspection ${r.id}`, r.inspection.date && formatDate(r.inspection.date)].filter(Boolean).join(" · ")}</option>)}
        </select>
        <Button size="sm" disabled={!choice || !!busy} onClick={() => onLink(choice)}>{busy === "link" ? <LoaderCircle className="animate-spin" /> : <Link2 />}Link</Button>
      </div>
      <p className="text-xs text-muted-foreground"><Settings2 className="mr-1 inline size-3.5" />Manage the connection in <Link className="underline underline-offset-4" href="/settings/integrations">Integrations</Link>.</p>
    </div>
  );
}
