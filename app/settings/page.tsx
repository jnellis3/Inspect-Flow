"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, LoaderCircle, UserMinus } from "lucide-react";
import Shell from "../_components/shell";
import { request } from "../_components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Company, Invite, Member, Role, Workspace } from "@/lib/inspection/types";

type Settings = { workspace: Workspace; members: Member[]; invites: Invite[]; me: { id: string; role: Role } };

export default function SettingsPage() {
  return <Shell><WorkspaceSettings /></Shell>;
}

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function WorkspaceSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [teamError, setTeamError] = useState("");
  const load = useCallback(() => request<Settings>("/api/workspace").then(setData).catch(e => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);

  if (error && !data) return <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-900">{error}</p>;
  if (!data) return <div className="grid min-h-[40vh] place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div>;
  const owner = data.me.role === "owner";
  const { used, limit } = data.workspace.usage;

  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everyone in {data.workspace.company.name} shares its projects and company profile.</p>
      </div>

      <Card title="Company" description={owner ? "Shown in every video's opening and closing, and on the report. Changes reach each video the next time it's made or revised." : "Only the workspace owner can change these."}>
        <CompanyForm initial={data.workspace.company} editable={owner} onSaved={workspace => { setData({ ...data, workspace }); dispatchEvent(new Event("inspection-workspace-change")); }} />
      </Card>

      <Card title="Videos">
        <p className="text-sm">{limit === null
          ? <>Unlimited videos. <span className="text-muted-foreground">{used} made so far.</span></>
          : <><b>{used} of {limit}</b> free videos used. <span className="text-muted-foreground">Requesting changes to a video you’ve made is always free.</span></>}</p>
        {limit !== null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div>}
      </Card>

      <Card title="Team" description={owner ? "Invite your inspectors so they can upload walkthroughs and share projects." : undefined}>
        <ul className="divide-y rounded-xl border bg-white">
          {data.members.map(m => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.username}{m.id === data.me.id && <span className="font-normal text-muted-foreground"> (you)</span>}</p>
                <p className="text-xs text-muted-foreground">{m.role === "owner" ? "Owner" : "Member"} · joined {day(m.createdAt)}</p>
              </div>
              {owner && m.id !== data.me.id && <RemoveButton name={m.username} onConfirm={async () => {
                setTeamError("");
                try { setData({ ...data, ...await request<Pick<Settings, "members" | "invites">>("/api/workspace", { method: "POST", body: { action: "remove", userId: m.id } }) }); }
                catch (e) { setTeamError((e as Error).message); }
              }} />}
            </li>
          ))}
        </ul>
        {teamError && <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-900" role="alert">{teamError}</p>}
        {owner && <Invites invites={data.invites} onChange={invites => setData({ ...data, invites })} />}
      </Card>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CompanyForm({ initial, editable, onSaved }: { initial: Company; editable: boolean; onSaved: (w: Workspace) => void }) {
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Company>) => { setC(prev => ({ ...prev, ...patch })); setSaved(false); };
  const input = "h-10 bg-white";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { workspace } = await request<{ workspace: Workspace }>("/api/workspace", { method: "PATCH", body: c });
      onSaved(workspace);
      setSaved(true);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <fieldset disabled={!editable} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Company name<Input className={input} required maxLength={120} value={c.name} onChange={e => set({ name: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Phone<Input className={input} maxLength={40} value={c.phone} onChange={e => set({ phone: e.target.value })} placeholder="(281) 555-0100" /></label>
          <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">Website<Input className={input} maxLength={120} value={c.website} onChange={e => set({ website: e.target.value })} placeholder="example.com" /></label>
        </div>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Brand color
          <div className="flex items-center gap-3">
            <input type="color" aria-label="Pick brand color" className="h-10 w-14 cursor-pointer rounded-md border bg-white p-1" value={c.accent || "#ffd23f"} onChange={e => set({ accent: e.target.value })} />
            <Input className={`${input} max-w-36 font-mono`} aria-label="Brand color hex code" value={c.accent} onChange={e => set({ accent: e.target.value })} placeholder="#FFD23F" />
            {c.accent && editable && <button type="button" className="text-sm font-normal text-muted-foreground underline-offset-4 hover:underline" onClick={() => set({ accent: "" })}>Use default</button>}
          </div>
          <span className="text-xs font-normal text-muted-foreground">Used for callouts and highlights in the video. Leave empty for the default yellow.</span>
        </div>
      </fieldset>
      {error && <p className="rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-900" role="alert">{error}</p>}
      {editable && (
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Check className="size-4" />Saved</span>}
          <Button disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}Save company</Button>
        </div>
      )}
    </form>
  );
}

function RemoveButton({ name, onConfirm }: { name: string; onConfirm: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <Button variant={armed ? "destructive" : "ghost"} size="sm" disabled={busy} aria-label={`Remove ${name}`} onClick={async () => {
      if (!armed) return setArmed(true);
      setBusy(true);
      try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
    }}><UserMinus />{armed ? "Click again to remove" : "Remove"}</Button>
  );
}

function Invites({ invites, onChange }: { invites: Invite[]; onChange: (invites: Invite[]) => void }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true); setError(""); setCopied(false);
    try {
      const data = await request<{ url: string; invites: Invite[] }>("/api/workspace", { method: "POST", body: { action: "invite" } });
      setUrl(data.url);
      onChange(data.invites);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-6 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Invite a teammate</h3>
          <p className="text-sm text-muted-foreground">Each link lets one person create an account here. It works once and expires in 7 days.</p>
        </div>
        <Button variant="outline" className="bg-white" disabled={busy} onClick={create}>{busy ? <LoaderCircle className="animate-spin" /> : <Link2 />}Create invite link</Button>
      </div>
      {url && (
        <div className="rounded-xl border bg-accent/40 p-4">
          <div className="flex gap-2">
            <Input readOnly value={url} className="h-10 bg-white font-mono text-xs" onFocus={e => e.currentTarget.select()} aria-label="Invite link" />
            <Button variant="outline" className="h-10 bg-white" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Send it only to the person you’re inviting. This is the only time it’s shown.</p>
        </div>
      )}
      {error && <p className="rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-900" role="alert">{error}</p>}
      {invites.length > 0 && (
        <ul className="divide-y rounded-xl border bg-white">
          {invites.map(i => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Unused link created {day(i.createdAt)} · expires {day(i.expiresAt)}</span>
              <Button variant="ghost" size="sm" onClick={async () => {
                const data = await request<{ invites: Invite[] }>("/api/workspace", { method: "POST", body: { action: "revoke", id: i.id } }).catch(e => { setError(e.message); return null; });
                if (data) onChange(data.invites);
              }}>Revoke</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
