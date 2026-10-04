"use client";
import { useState } from "react";
import { Bot, Car, House, LoaderCircle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_VEHICLE, INSPECTION_TYPES, VOICES, type Project, type Vertical } from "@/lib/inspection/types";

export type Fields = Pick<Project, "vertical" | "property" | "vehicle" | "inspection" | "company" | "voice" | "notes">;

export const EMPTY: Fields = {
  vertical: "home",
  property: { address: "", city: "", kind: "" },
  vehicle: EMPTY_VEHICLE,
  inspection: { date: new Date().toISOString().slice(0, 10), type: INSPECTION_TYPES.home[0] },
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

const COPY = {
  home: {
    company: "Lone Star Home Inspections", people: "Tyler, Chris",
    notes: "e.g. First-time buyers, keep it reassuring. The window seal issue is the one they asked about.",
  },
  vehicle: {
    company: "Redline Motorwerks", people: "Marco",
    notes: "e.g. The buyer is out of state and asked about the service history. Compression and scan results are in the attached PDF. My estimate for the water pump job is $1,100–1,400.",
  },
} as const;

/** Switch what's being inspected, keeping the inspection type valid for it. */
export function withVertical(f: Fields, vertical: Vertical): Fields {
  const types = INSPECTION_TYPES[vertical];
  return { ...f, vertical, inspection: { ...f.inspection, type: types.includes(f.inspection.type) ? f.inspection.type : types[0] } };
}

export default function ProjectForm({ initial, submitLabel, onSubmit, chooseVertical = false }: { initial: Fields; submitLabel: string; onSubmit: (f: Fields) => Promise<void>; chooseVertical?: boolean }) {
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
  const copy = COPY[f.vertical];
  return (
    <form onSubmit={submit}>
      {chooseVertical && (
        <Section title="What are you inspecting?">
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { vertical: "home", icon: House, title: "A home", text: "New construction, resale, pre-listing or warranty walkthroughs." },
              { vertical: "vehicle", icon: Car, title: "A vehicle", text: "Pre-purchase, consignment and service inspections." },
            ] as const).map(({ vertical, icon: Icon, title, text }) => (
              <button type="button" key={vertical} onClick={() => setF(prev => withVertical(prev, vertical))} aria-pressed={f.vertical === vertical}
                className={`rounded-xl border-2 bg-white p-4 text-left transition ${f.vertical === vertical ? "border-foreground" : "border-transparent ring-1 ring-border hover:ring-foreground/30"}`}>
                <span className="flex items-center gap-2 font-semibold"><Icon className="size-4" />{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {f.vertical === "home" ? (
        <Section title="The property" description="Shown in the video's title and on the report's cover.">
          <Field label="Address"><Input className={input} required value={f.property.address} onChange={e => set("property", { address: e.target.value })} placeholder="1234 Oak Hollow Ln" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City, state"><Input className={input} value={f.property.city} onChange={e => set("property", { city: e.target.value })} placeholder="Cypress, TX" /></Field>
            <Field label="About the home" hint="Optional"><Input className={input} value={f.property.kind} onChange={e => set("property", { kind: e.target.value })} placeholder="Single-family, about 3,200 sq ft" /></Field>
          </div>
        </Section>
      ) : (
        <Section title="The vehicle" description="Shown in the video's title and on the report's cover.">
          <div className="grid gap-4 sm:grid-cols-[110px_1fr_1fr]">
            <Field label="Year"><Input className={input} inputMode="numeric" maxLength={4} value={f.vehicle.year} onChange={e => set("vehicle", { year: e.target.value.replace(/\D/g, "") })} placeholder="2011" /></Field>
            <Field label="Make"><Input className={input} required value={f.vehicle.make} onChange={e => set("vehicle", { make: e.target.value })} placeholder="Porsche" /></Field>
            <Field label="Model"><Input className={input} required value={f.vehicle.model} onChange={e => set("vehicle", { model: e.target.value })} placeholder="911" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trim" hint="Optional"><Input className={input} value={f.vehicle.trim} onChange={e => set("vehicle", { trim: e.target.value })} placeholder="Carrera S" /></Field>
            <Field label="Mileage" hint="Optional"><Input className={input} value={f.vehicle.mileage} onChange={e => set("vehicle", { mileage: e.target.value })} placeholder="48,210" /></Field>
            <Field label="VIN" hint="Optional. Printed on the report's cover."><Input className={`${input} font-mono uppercase`} maxLength={17} value={f.vehicle.vin} onChange={e => set("vehicle", { vin: e.target.value.toUpperCase() })} placeholder="WP0AB2A9XBS720000" /></Field>
            <Field label="Where it was inspected" hint="Optional"><Input className={input} value={f.vehicle.location} onChange={e => set("vehicle", { location: e.target.value })} placeholder="Scottsdale, AZ" /></Field>
          </div>
        </Section>
      )}

      <Section title="The inspection">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select className="h-10 rounded-md border border-input bg-white px-3 text-sm" value={f.inspection.type} onChange={e => set("inspection", { type: e.target.value })}>
              {INSPECTION_TYPES[f.vertical].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Date"><Input className={input} type="date" value={f.inspection.date} onChange={e => set("inspection", { date: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="Your company" description="Used in the video's opening, closing and report. Remembered for your next project.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name"><Input className={input} value={f.company.name} onChange={e => set("company", { name: e.target.value })} placeholder={copy.company} /></Field>
          <Field label="Inspectors" hint="Comma-separated"><Input className={input} value={people} onChange={e => setPeople(e.target.value)} placeholder={copy.people} /></Field>
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
          placeholder={copy.notes} />
      </Section>

      {error && <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-900" role="alert">{error}</p>}
      <div className="flex justify-end border-t pt-6">
        <Button size="lg" className="h-11 rounded-xl px-6" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}
