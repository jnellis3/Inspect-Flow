import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Captions, Check, Clock, FileText, Lock, MessageSquare, Mic, Palette, ScanSearch, Upload, Video } from "lucide-react";
import { Logo } from "./auth-gate";

export const metadata: Metadata = {
  title: "Inspect Flow · Inspection videos your clients actually watch",
  description: "Upload your raw walkthrough. Inspect Flow's AI editor finds every issue you pointed out, labels it on screen, narrates it in plain English, and hands you a 2–3 minute highlight video and a matching PDF report.",
  openGraph: {
    title: "Inspect Flow · Inspection videos your clients actually watch",
    description: "Turn a raw inspection walkthrough into a narrated, labeled highlight video and a matching report.",
    images: ["/marketing/explainer-poster.jpg"],
  },
};

const steps = [
  { icon: Upload, title: "Upload the raw walkthrough", text: "The video straight from your phone. Talk through what you see, like you already do. Add close-up photos if you have them." },
  { icon: ScanSearch, title: "The AI editor does the work", text: "It listens to what you said, watches what you filmed, finds every issue you pointed out, and picks the clearest shot of each one." },
  { icon: Video, title: "Send a video they'll watch", text: "A 2–3 minute highlight reel with every issue labeled and explained, plus a PDF report with the same findings." },
];

const features = [
  { icon: ScanSearch, title: "Freeze, zoom, circle", text: "The video stops on the clearest frame, zooms in, and draws a labeled ring around the problem. Nobody has to guess what you meant." },
  { icon: Bot, title: "Plain-English narration", text: "Jargon gets explained in passing. Your own judgment comes through: if you said it's minor, it says it's minor." },
  { icon: Mic, title: "Your voice or an AI narrator", text: "Use your own words from the recording, trimmed and captioned, or a polished AI voice reading a script written from your walkthrough." },
  { icon: FileText, title: "A report that matches", text: "Every finding gets a page with an annotated photo, why it matters, what to do, and the timestamp in your footage." },
  { icon: MessageSquare, title: "Change it in plain words", text: "\"Make it shorter.\" \"Lead with the roof.\" The editor remembers every decision it made, makes the change, and re-renders." },
  { icon: Palette, title: "Your brand on every video", text: "Your company name, inspectors, contact details and brand color in the opening, the callouts, and the closing card." },
];

const faqs = [
  { q: "How long does it take?", a: "Usually 30–60 minutes for a 10-minute walkthrough. Upload it and close the tab; it keeps working and the finished video is waiting for you." },
  { q: "Do I have to edit anything?", a: "No. You review the result, and if you want something different you say so in plain words. There's no timeline to learn." },
  { q: "What does a good walkthrough look like?", a: "Film the way you inspect and talk through each issue as you find it: what it is, where it is, and what should happen. Close-up photos help the AI show small defects clearly." },
  { q: "Will it make things up?", a: "It's built not to. Findings come from what you said or what is plainly visible, uncertain items are flagged for you, and it never claims anything meets code unless you said so. You review everything before it goes to a client." },
  { q: "Where does my footage go?", a: "Your projects are private to your account. Videos are processed on demand on dedicated cloud machines that shut down when the work is done." },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5"><Logo className="size-8" /><span className="font-display text-lg font-bold tracking-tight">Inspect Flow</span></Link>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground sm:block">How it works</a>
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground sm:block">Features</a>
            <a href="#faq" className="hidden rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground sm:block">FAQ</a>
            <Link href="/projects" className="ml-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90">Sign in</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pt-14 text-center sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-sm font-medium text-muted-foreground">
            <span className="size-2 rounded-full bg-highlight" />For home inspectors
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
            Inspection videos your clients <span className="relative isolate inline-block">actually watch<span className="absolute inset-x-0 bottom-1 -z-10 h-[0.32em] rounded bg-highlight sm:bottom-2" /></span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Upload the raw walkthrough from your phone. Inspect Flow&rsquo;s AI editor finds every issue you pointed out, labels it on screen, explains it in plain English, and hands you a 2–3 minute highlight video and a matching report.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/projects" className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-[0_10px_30px_-12px_rgb(11_18_32/0.6)] hover:bg-primary/90">Get started<ArrowRight className="size-4" /></Link>
            <a href="#demo" className="inline-flex h-12 items-center gap-2 rounded-xl border bg-white px-6 text-base font-semibold hover:bg-muted">Watch the 45-second demo</a>
          </div>
        </section>

        <section id="demo" className="mx-auto mt-14 max-w-5xl scroll-mt-24 px-5">
          <div className="overflow-hidden rounded-2xl border bg-primary shadow-[0_40px_120px_-40px_rgb(11_18_32/0.55)] sm:rounded-3xl">
            <video className="aspect-video w-full" src="/marketing/explainer.mp4" poster="/marketing/explainer-poster.jpg" autoPlay muted loop playsInline controls preload="metadata" />
          </div>
          <p className="mt-3 text-center text-sm text-muted-foreground">Made with Inspect Flow&rsquo;s own editing engine. Turn the sound on for the music.</p>
        </section>

        {/* Problem */}
        <section className="mx-auto mt-24 max-w-6xl px-5">
          <div className="grid gap-10 rounded-3xl bg-primary px-6 py-14 text-primary-foreground sm:px-12 md:grid-cols-[1.1fr_1fr] md:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-highlight">The problem</p>
              <h2 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">You walk the whole house. Your client skims the PDF.</h2>
            </div>
            <ul className="grid gap-4 text-lg text-white/80">
              {["Reports are long, and clients are busy.", "Photos without context don't show why something matters.", "Important items get skimmed past, then become surprises."].map(t => (
                <li key={t} className="flex gap-3"><span className="mt-2.5 size-2 shrink-0 rounded-full bg-highlight" />{t}</li>
              ))}
              <li className="mt-2 font-semibold text-white">A two-minute video with every issue shown and explained gets watched.</li>
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto mt-28 max-w-6xl scroll-mt-24 px-5">
          <p className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">How it works</p>
          <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-4xl font-bold tracking-tight sm:text-5xl">From raw footage to a finished video, without editing anything.</h2>
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
            {/* eslint-disable-next-line @next/next/no-img-element -- static marketing stills */}
            <img src="/marketing/ai-editor.jpg" alt="The AI editor matching what the inspector said to findings, each with a priority" className="w-full rounded-2xl border" loading="lazy" />
            {/* eslint-disable-next-line @next/next/no-img-element -- static marketing stills */}
            <img src="/marketing/deliverables.jpg" alt="The finished highlight reel, a matching PDF report, and a change request in plain words" className="w-full rounded-2xl border" loading="lazy" />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto mt-28 max-w-6xl scroll-mt-24 px-5">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">What your client gets</p>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Every issue, shown and explained.</h2>
              <p className="mt-5 text-lg text-muted-foreground">Not a slideshow. A real edit: the right moments of your footage, each problem circled and labeled, in a voice that sounds like a person who cares about the house.</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- static marketing still */}
              <img src="/marketing/explainer-poster.jpg" alt="A freeze-frame callout circling moisture trapped at the base of a stucco wall" className="mt-8 w-full rounded-2xl border" loading="lazy" />
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
                  {[[Captions, "Captions on every line"], [Clock, "Ready while you're on the next job"], [Lock, "Private to your account"], [Check, "You approve before it's sent"]].map(([Icon, label]) => {
                    const I = Icon as typeof Check;
                    return <span key={label as string} className="flex items-center gap-2"><I className="size-4 text-muted-foreground" />{label as string}</span>;
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="mx-auto mt-28 max-w-6xl px-5">
          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border bg-card p-6 md:col-span-1">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Built for</p>
              <h3 className="mt-3 font-display text-3xl font-bold tracking-tight">Home inspections</h3>
              <p className="mt-2 text-muted-foreground">Pre-purchase, pre-listing, new construction and 11-month warranty inspections. New builds get a ready-made builder punch list.</p>
            </div>
            <div className="rounded-2xl border border-dashed p-6 md:col-span-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coming next</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><h4 className="font-semibold">Vehicle inspections</h4><p className="mt-1 text-sm text-muted-foreground">A walkaround and test drive, turned into a clear report for the buyer.</p></div>
                <div><h4 className="font-semibold">Remodel progress updates</h4><p className="mt-1 text-sm text-muted-foreground">Weekly site walks, turned into a two-minute update for the homeowner.</p></div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto mt-28 max-w-3xl scroll-mt-24 px-5">
          <h2 className="text-center font-display text-4xl font-bold tracking-tight">Questions</h2>
          <div className="mt-10 divide-y rounded-2xl border bg-card">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group p-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {q}<span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-lg leading-none transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto mt-28 max-w-6xl px-5">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12">
            <h2 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Send your next report as a video.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">Upload one walkthrough and see what your clients will see.</p>
            <Link href="/projects" className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-highlight px-6 text-base font-semibold text-foreground hover:bg-highlight/90">Get started<ArrowRight className="size-4" /></Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto mt-20 flex max-w-6xl flex-col items-center justify-between gap-4 border-t px-5 py-10 text-sm text-muted-foreground sm:flex-row">
        <span className="flex items-center gap-2"><Logo className="size-6 rounded-lg" /><span className="font-semibold text-foreground">Inspect Flow</span></span>
        <span>Videos are a visual summary; your written inspection report is the complete record.</span>
        <Link href="/projects" className="hover:text-foreground">Sign in</Link>
      </footer>
    </div>
  );
}
