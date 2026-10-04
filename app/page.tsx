import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Captions, Check, Clock, FileText, Lock, MessageSquare, Mic, Palette, ScanSearch, Upload, Video } from "lucide-react";
import { Cta, Demo, Faq, Features, Footer, Header, Hero, HowItWorks, Mark, Problem } from "./_components/marketing";

// Rendered per request so the link-preview image uses the runtime APP_ORIGIN (see app/layout.tsx).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inspect Flow · Inspection videos your clients actually watch",
  description: "Upload your raw walkthrough. Inspect Flow's AI editor finds every issue you pointed out, labels it on screen, narrates it in plain English, and hands you a 2–3 minute highlight video and a matching PDF report.",
  openGraph: {
    title: "Inspect Flow · Inspection videos your clients actually watch",
    description: "Turn a raw inspection walkthrough into a narrated, labeled highlight video and a matching report.",
    images: ["/marketing/explainer-poster.jpg"],
    type: "website",
    siteName: "Inspect Flow",
  },
  twitter: { card: "summary_large_image" },
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
      <Header links={[{ href: "/vehicles", label: "Vehicles" }]} />
      <main>
        <Hero
          badge="For home inspectors"
          title={<>Inspection videos your clients <Mark>actually watch</Mark>.</>}
          lead="Upload the raw walkthrough from your phone. Inspect Flow’s AI editor finds every issue you pointed out, labels it on screen, explains it in plain English, and hands you a 2–3 minute highlight video and a matching report."
          start="/projects"
        />
        <Demo src="/marketing/explainer.mp4" poster="/marketing/explainer-poster.jpg" />
        <Problem
          title="You walk the whole house. Your client skims the PDF."
          points={["Reports are long, and clients are busy.", "Photos without context don't show why something matters.", "Important items get skimmed past, then become surprises."]}
          punch="A two-minute video with every issue shown and explained gets watched."
        />
        <HowItWorks
          title="From raw footage to a finished video, without editing anything."
          steps={steps}
          stills={[
            { src: "/marketing/ai-editor.jpg", alt: "The AI editor matching what the inspector said to findings, each with a priority" },
            { src: "/marketing/deliverables.jpg", alt: "The finished highlight reel, a matching PDF report, and a change request in plain words" },
          ]}
        />
        <Features
          kicker="What your client gets"
          title="Every issue, shown and explained."
          lead="Not a slideshow. A real edit: the right moments of your footage, each problem circled and labeled, in a voice that sounds like a person who cares about the house."
          still={{ src: "/marketing/explainer-poster.jpg", alt: "A freeze-frame callout circling moisture trapped at the base of a stucco wall" }}
          features={features}
          extras={[[Captions, "Captions on every line"], [Clock, "Ready while you're on the next job"], [Lock, "Private to your account"], [Check, "You approve before it's sent"]]}
        />

        {/* Use cases */}
        <section className="mx-auto mt-28 max-w-6xl px-5">
          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border bg-card p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Built for</p>
              <h3 className="mt-3 font-display text-3xl font-bold tracking-tight">Home inspections</h3>
              <p className="mt-2 text-muted-foreground">Pre-purchase, pre-listing, new construction and 11-month warranty inspections. New builds get a ready-made builder punch list.</p>
            </div>
            <Link href="/vehicles" className="group rounded-2xl border bg-card p-6 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgb(11_18_32/0.45)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Also for</p>
              <h3 className="mt-3 font-display text-3xl font-bold tracking-tight">Vehicle inspections</h3>
              <p className="mt-2 text-muted-foreground">Pre-purchase and pre-sale inspections for specialist shops, turned into a video the buyer can actually see.</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">See how it works<ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
            </Link>
            <div className="rounded-2xl border border-dashed p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coming next</p>
              <h4 className="mt-3 font-semibold">Remodel progress updates</h4>
              <p className="mt-1 text-sm text-muted-foreground">Weekly site walks, turned into a two-minute update for the homeowner.</p>
            </div>
          </div>
        </section>

        <Faq items={faqs} />
        <Cta title="Send your next report as a video." text="Upload one walkthrough and see what your clients will see." start="/projects" />
      </main>
      <Footer />
    </div>
  );
}
