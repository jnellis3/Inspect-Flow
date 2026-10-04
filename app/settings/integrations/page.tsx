"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, LoaderCircle, Plug, RefreshCw, Unplug } from "lucide-react";
import Shell from "../../_components/shell";
import { formatDate, request, timeAgo } from "../../_components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Project, SpectoraLink } from "@/lib/inspection/types";

type View = { connected: false } | { connected: true; webhookUrl: string; keyHint: string; autoCreate: boolean; autoPush: boolean; createdAt: string; lastEventAt: string | null; lastEvent: string | null; lastError: string | null };
type Inspection = SpectoraLink["mapped"] & { id: string; link: SpectoraLink | null };

const EVENTS = ["inspection.created", "inspection.confirmed", "inspection.rescheduled", "inspection.canceled", "inspection.published"];

export default function IntegrationsPage() {
  return <Shell><Integrations /></Shell>;
}

function Integrations() {
  const [view, setView] = useState<View | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => request<{ spectora: View; canManage: boolean }>("/api/integrations/spectora").then(d => { setView(d.spectora); setCanManage(d.canManage); }).catch(e => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl font-bold">Integrations</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">Connect the software you already schedule and publish in. New inspections become projects here, and finished videos go back.</p>
      {error && <p className="mb-6 rounded-xl bg-orange-50 p-4 text-sm text-orange-900">{error}</p>}
      {!view ? <div className="grid h-40 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div>
        : !canManage ? <MemberView connected={view.connected} />
        : view.connected ? <Connected view={view} reload={load} /> : <Connect onConnected={load} />}
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

/** Teammates use the connection; the workspace owner manages it. */
function MemberView({ connected }: { connected: boolean }) {
  if (!connected) return <Card title="Spectora" description="Not connected yet. Ask your workspace owner to connect it here." />;
  return (
    <div className="grid gap-6">
      <Card title="Spectora is connected" description="New inspections become projects here, and finished videos go back. Your workspace owner manages the connection." />
      <RecentInspections />
    </div>
  );
}

function Connect({ onConnected }: { onConnected: () => Promise<unknown> }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card title="Spectora" description="Paste a Spectora API key. Creating one needs company admin permission in Spectora.">
      <form className="grid gap-4" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        try { await request("/api/integrations/spectora", { method: "POST", body: { apiKey: key } }); setKey(""); await onConnected(); }
        catch (err) { setError((err as Error).message); }
        finally { setBusy(false); }
      }}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">API key
          <Input className="h-10 bg-white font-mono" type="password" autoComplete="off" spellCheck={false} required value={key} onChange={e => setKey(e.target.value)} placeholder="Paste the whole key" />
          <span className="text-xs font-normal text-muted-foreground">Get one at <a className="underline underline-offset-4" href="https://developer.spectora.com/settings/api-keys" target="_blank" rel="noreferrer">developer.spectora.com/settings/api-keys</a>. The key is checked against Spectora, then stored encrypted.</span>
        </label>
        {error && <p className="rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-900" role="alert">{error}</p>}
        <div><Button disabled={busy || !key.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : <Plug />}Connect Spectora</Button></div>
      </form>
    </Card>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" className="bg-white" onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check /> : <Copy />}{done ? "Copied" : label}
    </Button>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-1 size-4 accent-primary" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span><span className="font-medium">{label}</span><span className="block text-muted-foreground">{hint}</span></span>
    </label>
  );
}

function Connected({ view, reload }: { view: Extract<View, { connected: true }>; reload: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const patch = async (body: { autoCreate?: boolean; autoPush?: boolean }) => { await request("/api/integrations/spectora", { method: "PATCH", body }); await reload(); };
  return (
    <div className="grid gap-6">
      <Card title="Spectora is connected" description={`API key ending in ${view.keyHint}, connected ${timeAgo(view.createdAt)}.`}>
        <div className="grid gap-4">
          <Toggle checked={view.autoCreate} onChange={v => void patch({ autoCreate: v })} label="Create a project for each new inspection" hint="When Spectora tells us an inspection was created or confirmed, a project appears here with the address, date and client filled in. You just upload the walkthrough." />
          <Toggle checked={view.autoPush} onChange={v => void patch({ autoPush: v })} label="Attach the finished video to the Spectora inspection" hint="When a video finishes, its poster frame is added to the inspection's documents, named after the public watch link, so clients and agents find it where they already look." />
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button variant="outline" size="sm" className="bg-white" onClick={() => { setArmed(false); setBusy(true); void reload().finally(() => setBusy(false)); }}><RefreshCw className={busy ? "animate-spin" : ""} />Refresh</Button>
            <Button variant={armed ? "destructive" : "ghost"} size="sm" onClick={async () => {
              if (!armed) return setArmed(true);
              await request("/api/integrations/spectora", { method: "DELETE" }); await reload();
            }}><Unplug />{armed ? "Click again to disconnect" : "Disconnect"}</Button>
          </div>
        </div>
      </Card>

      <Card title="Tell Spectora where to send events" description="Spectora registers webhooks from its own dashboard, not through the API. This takes about a minute.">
        <ol className="grid gap-3 text-sm">
          <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span><span>In Spectora, open <b>Integrations</b> (user menu) → <b>Custom integrations</b> → <b>Webhooks</b>, then <b>+ Add Endpoint</b>.</span></li>
          <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
            <span className="min-w-0 flex-1">Paste this URL as the endpoint:
              <span className="mt-1.5 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">{view.webhookUrl}</code><CopyButton value={view.webhookUrl} /></span>
              <span className="mt-1 block text-xs text-muted-foreground">The long token is your workspace&rsquo;s secret. Treat the URL like a password.</span>
            </span></li>
          <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span><span>Select these events: {EVENTS.map(e => <code key={e} className="mx-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{e}</code>)}</span></li>
        </ol>
        <div className="mt-5 rounded-xl border bg-muted/40 p-4 text-sm">
          {view.lastEventAt
            ? <p><b>Last event:</b> <code className="font-mono text-xs">{view.lastEvent}</code> {timeAgo(view.lastEventAt)}.{view.lastError && <span className="mt-1 block text-orange-800">{view.lastError}</span>}</p>
            : <p className="text-muted-foreground">No events yet. Once the endpoint is saved, schedule or confirm a test inspection in Spectora and a project should appear within a few seconds.</p>}
        </div>
      </Card>

      <RecentInspections />
    </div>
  );
}

function RecentInspections() {
  const router = useRouter();
  const [rows, setRows] = useState<Inspection[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => request<{ inspections: Inspection[] }>("/api/integrations/spectora/inspections").then(d => setRows(d.inspections)).catch(e => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <Card title="Recent Spectora inspections" description="Start a project from any inspection by hand, for example while the webhook is still being set up.">
      {error && <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-900">{error}</p>}
      {!rows ? <div className="grid h-24 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">Spectora returned no inspections for this company yet.</p>
        : (
          <ul className="divide-y">
            {rows.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.property.address || `Inspection ${r.id}`}</p>
                  <p className="truncate text-xs text-muted-foreground">{[r.inspection.date && formatDate(r.inspection.date), r.property.city, r.client && `Client: ${r.client}`, r.services.join(", ")].filter(Boolean).join(" · ")}</p>
                </div>
                {r.link
                  ? <Button asChild variant="outline" size="sm" className="bg-white"><Link href={`/p/${r.link.projectId}`}>Open project<ExternalLink /></Link></Button>
                  : <Button size="sm" disabled={busy === r.id} onClick={async () => {
                    setBusy(r.id); setError("");
                    try { const { project } = await request<{ project: Project }>("/api/integrations/spectora/inspections", { method: "POST", body: { inspectionId: r.id } }); router.push(`/p/${project.id}`); }
                    catch (e) { setError((e as Error).message); setBusy(""); }
                  }}>{busy === r.id ? <LoaderCircle className="animate-spin" /> : <Plug />}Create project</Button>}
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}
