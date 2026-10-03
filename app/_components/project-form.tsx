"use client";
import { useState } from "react";
import { Bot, LoaderCircle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INSPECTION_TYPES, VOICES, type Project } from "@/lib/inspection/types";

export type Fields = Pick<Project, "property" | "inspection" | "company" | "voice" | "notes">;

export const EMPTY: Fields = {
  property: { address: "", city: "", kind: "" },
  inspection: { date: new Date().toISOString().slice(0, 10), type: "New construction" },
  company: { name: "", people: [], phone: "", website: "", accent: "" },
  voice: { mode: "ai", voice: "ash" },
  notes: "",
};

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium ${className}`}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-t py-7 first:border-t-0 first:pt-0 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

export default function ProjectForm({ initial, submitLabel, onSubmit }: { initial: Fields; submitLabel: string; onSubmit: (f: Fields) => Promise<void> }) {
  const [f, setF] = useState<Fields>(initial);
  const [people, setPeople] = useState(initial.company.people.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Fields>(key: K, value: Partial<Fields[K]>) => setF(prev => ({ ...prev, [key]: typeof value === "object" ? { ...(prev[key] as object), ...value } : value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({ ...f, company: { ...f.company, people: people.split(",").map(s => s.trim()).filter(Boolean) } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "h-10 bg-white";
  return (
    <form onSubmit={submit}>
      <Section title="The property" description="Shown in the video's title and on the report's cover.">
        <Field label="Address"><Input className={input} required value={f.property.address} onChange={e => set("property", { address: e.target.value })} placeholder="1234 Oak Hollow Ln" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City, state"><Input className={input} value={f.property.city} onChange={e => set("property", { city: e.target.value })} placeholder="Cypress, TX" /></Field>
          <Field label="About the home" hint="Optional"><Input className={input} value={f.property.kind} onChange={e => set("property", { kind: e.target.value })} placeholder="Single-family, about 3,200 sq ft" /></Field>
        </div>
      </Section>

      <Section title="The inspection">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select className="h-10 rounded-md border border-input bg-white px-3 text-sm" value={f.inspection.type} onChange={e => set("inspection", { type: e.target.value })}>
              {INSPECTION_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Date"><Input className={input} type="date" value={f.inspection.date} onChange={e => set("inspection", { date: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="Your company" description="Used in the video's opening, closing and report. Remembered for your next project.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name"><Input className={input} value={f.company.name} onChange={e => set("company", { name: e.target.value })} placeholder="Lone Star Home Inspections" /></Field>
          <Field label="Inspectors" hint="Comma-separated"><Input className={input} value={people} onChange={e => setPeople(e.target.value)} placeholder="Tyler, Chris" /></Field>
          <Field label="Phone"><Input className={input} value={f.company.phone} onChange={e => set("company", { phone: e.target.value })} placeholder="(281) 555-0100" /></Field>
          <Field label="Website"><Input className={input} value={f.company.website} onChange={e => set("company", { website: e.target.value })} placeholder="example.com" /></Field>
        </div>
        <Field label="Brand color" hint="Used for callouts and highlights in the video. Leave empty for the default yellow.">
          <div className="flex items-center gap-3">
            <input type="color" aria-label="Pick brand color" className="h-10 w-14 cursor-pointer rounded-md border bg-white p-1" value={f.company.accent || "#ffd23f"} onChange={e => set("company", { accent: e.target.value })} />
            <Input className={`${input} max-w-36 font-mono`} value={f.company.accent} onChange={e => set("company", { accent: e.target.value })} placeholder="#FFD23F" />
            {f.company.accent && <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => set("company", { accent: "" })}>Use default</button>}
          </div>
        </Field>
      </Section>

      <Section title="Narration" description="Who does the talking in the video.">
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            { mode: "ai", icon: Bot, title: "AI narrator", text: "A professional voice reads a script written from your walkthrough. Tight, polished, consistent." },
            { mode: "source", icon: Mic, title: "Use my voice", text: "Your own words from the recording, trimmed and captioned. Best when you talk through each issue clearly." },
          ] as const).map(({ mode, icon: Icon, title, text }) => (
            <button type="button" key={mode} onClick={() => set("voice", { mode })}
              className={`rounded-xl border-2 bg-white p-4 text-left transition ${f.voice.mode === mode ? "border-foreground" : "border-transparent ring-1 ring-border hover:ring-foreground/30"}`}>
              <span className="flex items-center gap-2 font-semibold"><Icon className="size-4" />{title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
            </button>
          ))}
        </div>
        {f.voice.mode === "ai" && (
          <Field label="Voice">
            <select className="h-10 max-w-sm rounded-md border border-input bg-white px-3 text-sm" value={f.voice.voice} onChange={e => set("voice", { voice: e.target.value })}>
              {VOICES.map(v => <option key={v.id} value={v.id}>{v.label} ({v.description})</option>)}
            </select>
          </Field>
        )}
      </Section>

      <Section title="Notes for the editor" description="Optional. Anything the AI should know before it starts.">
        <Textarea className="min-h-28 bg-white" value={f.notes} onChange={e => setF(prev => ({ ...prev, notes: e.target.value }))}
          placeholder={"e.g. First-time buyers, keep it reassuring. The window seal issue is the one they asked about."} />
      </Section>

      {error && <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-900" role="alert">{error}</p>}
      <div className="flex justify-end border-t pt-6">
        <Button size="lg" className="h-11 rounded-xl px-6" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}
