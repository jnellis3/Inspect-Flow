// Sections shared by the public landing pages (/ for homes, /vehicles for vehicles).
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Logo } from "../auth-gate";

export type Item = { icon: LucideIcon; title: string; text: string };

export function Header({ links = [] }: { links?: { href: string; label: string }[] }) {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5"><Logo className="size-8" /><span className="font-display text-lg font-bold tracking-tight">Inspect Flow</span></Link>
        <nav className="flex items-center gap-1 text-sm">
          {[{ href: "#how", label: "How it works" }, { href: "#features", label: "Features" }, { href: "#faq", label: "FAQ" }, ...links].map(l => (
            <Link key={l.href} href={l.href} className="hidden rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground sm:block">{l.label}</Link>
          ))}
          <Link href="/projects" className="ml-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}

/** Highlighter stroke under a phrase. */
export function Mark({ children }: { children: React.ReactNode }) {
  return <span className="relative isolate inline-block">{children}<span className="absolute inset-x-0 bottom-1 -z-10 h-[0.32em] rounded bg-highlight sm:bottom-2" /></span>;
}

export function Hero({ badge, title, lead, start }: { badge: string; title: React.ReactNode; lead: string; start: string }) {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-14 text-center sm:pt-20">
      <p className="inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-sm font-medium text-muted-foreground">
        <span className="size-2 rounded-full bg-highlight" />{badge}
      </p>
      <h1 className="mx-auto mt-6 max-w-4xl font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">{title}</h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">{lead}</p>
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href={start} className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-[0_10px_30px_-12px_rgb(11_18_32/0.6)] hover:bg-primary/90">Get started<ArrowRight className="size-4" /></Link>
        <a href="#demo" className="inline-flex h-12 items-center gap-2 rounded-xl border bg-white px-6 text-base font-semibold hover:bg-muted">Watch the 45-second demo</a>
      </div>
    </section>
  );
}

export function Demo({ src, poster }: { src: string; poster: string }) {
  return (
    <section id="demo" className="mx-auto mt-14 max-w-5xl scroll-mt-24 px-5">
      <div className="overflow-hidden rounded-2xl border bg-primary shadow-[0_40px_120px_-40px_rgb(11_18_32/0.55)] sm:rounded-3xl">
        <video className="aspect-video w-full" src={src} poster={poster} autoPlay muted loop playsInline controls preload="metadata" />
      </div>
      <p className="mt-3 text-center text-sm text-muted-foreground">Made with Inspect Flow&rsquo;s own editing engine. Turn the sound on for the music.</p>
    </section>
  );
}

export function Problem({ title, points, punch }: { title: string; points: string[]; punch: string }) {
  return (
    <section className="mx-auto mt-24 max-w-6xl px-5">
      <div className="grid gap-10 rounded-3xl bg-primary px-6 py-14 text-primary-foreground sm:px-12 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-highlight">The problem</p>
          <h2 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h2>
        </div>
        <ul className="grid gap-4 text-lg text-white/80">
          {points.map(t => (
            <li key={t} className="flex gap-3"><span className="mt-2.5 size-2 shrink-0 rounded-full bg-highlight" />{t}</li>
          ))}
          <li className="mt-2 font-semibold text-white">{punch}</li>
        </ul>
      </div>
    </section>
  );
}

export function HowItWorks({ title, steps, stills }: { title: string; steps: Item[]; stills: { src: string; alt: string }[] }) {
  return (
    <section id="how" className="mx-auto mt-28 max-w-6xl scroll-mt-24 px-5">
      <p className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">How it works</p>
      <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h2>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <div key={title} className="rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-primary text-highlight"><Icon className="size-5" /></span>
              <span className="font-display text-4xl font-bold text-border">{i + 1}</span>
            </div>
            <h3 className="mt-5 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {stills.map(s => (
          // eslint-disable-next-line @next/next/no-img-element -- static marketing stills
          <img key={s.src} src={s.src} alt={s.alt} className="w-full rounded-2xl border" loading="lazy" />
        ))}
      </div>
    </section>
  );
}

export function Features({ kicker, title, lead, still, features, extras }: {
  kicker: string; title: string; lead: string; still: { src: string; alt: string }; features: Item[]; extras: [LucideIcon, string][];
}) {
  return (
    <section id="features" className="mx-auto mt-28 max-w-6xl scroll-mt-24 px-5">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{kicker}</p>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h2>
          <p className="mt-5 text-lg text-muted-foreground">{lead}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- static marketing still */}
          <img src={still.src} alt={still.alt} className="mt-8 w-full rounded-2xl border" loading="lazy" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border bg-card p-6">
              <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-5" /></span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
          <div className="rounded-2xl border bg-card p-6 sm:col-span-2">
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium">
              {extras.map(([Icon, label]) => <span key={label} className="flex items-center gap-2"><Icon className="size-4 text-muted-foreground" />{label}</span>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section id="faq" className="mx-auto mt-28 max-w-3xl scroll-mt-24 px-5">
      <h2 className="text-center font-display text-4xl font-bold tracking-tight">Questions</h2>
      <div className="mt-10 divide-y rounded-2xl border bg-card">
        {items.map(({ q, a }) => (
          <details key={q} className="group p-6 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
              {q}<span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-lg leading-none transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Cta({ title, text, start }: { title: string; text: string; start: string }) {
  return (
    <section className="mx-auto mt-28 max-w-6xl px-5">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12">
        <h2 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">{text}</p>
        <Link href={start} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-highlight px-6 text-base font-semibold text-foreground hover:bg-highlight/90">Get started<ArrowRight className="size-4" /></Link>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto mt-20 flex max-w-6xl flex-col items-center justify-between gap-4 border-t px-5 py-10 text-sm text-muted-foreground sm:flex-row">
      <span className="flex items-center gap-2"><Logo className="size-6 rounded-lg" /><span className="font-semibold text-foreground">Inspect Flow</span></span>
      <span>Videos are a visual summary; your written inspection report is the complete record.</span>
      <span className="flex gap-5">
        <Link href="/" className="hover:text-foreground">Homes</Link>
        <Link href="/vehicles" className="hover:text-foreground">Vehicles</Link>
        <Link href="/projects" className="hover:text-foreground">Sign in</Link>
      </span>
    </footer>
  );
}
