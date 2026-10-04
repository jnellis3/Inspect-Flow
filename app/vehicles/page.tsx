import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BadgeCheck, Captions, Check, CircleDollarSign, Gauge, Gem, Lock, MessageSquare, Mic, Palette, PhoneOff,
  ScanSearch, Search, Send, Share2, Sparkles, Tag, Upload, Video, Wrench,
} from "lucide-react";
import { Cta, Faq, Features, Footer, Header, HowItWorks } from "../_components/marketing";

// Rendered per request so the link-preview image uses the runtime APP_ORIGIN (see app/layout.tsx).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inspect Flow for specialist car shops · White-glove inspection reports on film",
  description: "For specialists in exotic, luxury and collector cars. Film your inspection or service visit the way you already do; Inspect Flow turns it into a polished, narrated film of the car, every finding shown and explained, with a matching report under your name.",
  openGraph: {
    title: "White-glove work deserves a white-glove report.",
    description: "Turn your inspection footage into a polished, narrated film of your client's car, with a matching report under your name.",
    images: ["/marketing/explainer-vehicle-poster.jpg"],
    type: "website",
    siteName: "Inspect Flow",
  },
  twitter: { card: "summary_large_image" },
};

// New projects started from this page are vehicle inspections.
const START = "/new?type=vehicle";

const gap = [
  "You spend hours with a paint meter, a borescope and a scan tool. The client receives a checklist and forty photos.",
  "They're deciding on a six-figure car, or trusting you with one they love, often without ever standing next to it.",
  "Questions come back by phone, one at a time, and the care you took gets lost in the formatting.",
];

const value = [
  { icon: Sparkles, title: "A premium experience, end to end", text: "Clients who expect concierge service get a report that feels like it: their car, on film, explained by the people who looked after it." },
  { icon: PhoneOff, title: "Fewer calls, faster decisions", text: "They see exactly what you saw, so questions are answered before they're asked and decisions come sooner." },
  { icon: Gem, title: "A top tier worth paying for", text: "Offer the film with your premium inspection or service package. A report this polished supports the price." },
  { icon: Share2, title: "The report they forward", text: "Owners share their car's film with partners, buyers and fellow enthusiasts, with your name on every frame." },
];

const steps = [
  { icon: Upload, title: "Film the inspection", text: "Straight from your phone, the way you already work: walkaround, on the lift, road test. Talk through what you find, and attach scan reports, compression results and close-ups." },
  { icon: ScanSearch, title: "The AI editor does the work", text: "It listens to what you said, watches what you filmed, reads your attachments, and chooses the clearest shot of every finding." },
  { icon: Send, title: "Send it under your name", text: "A 2–3 minute narrated film with every finding labeled and explained, plus a matching PDF with the photos and the numbers. You approve it before it goes out." },
];

const features = [
  { icon: ScanSearch, title: "Freeze, zoom, circle", text: "The film stops on the clearest frame of the seep, the panel gap or the old repair, zooms in, and labels it. Nothing is left to interpretation." },
  { icon: Gauge, title: "Precision they can trust", text: "Codes, compression and leak-down, tread depth and paint readings appear exactly as you recorded them, never rounded or guessed." },
  { icon: Palette, title: "Your name on every frame", text: "Your shop, technicians, colors and contact details run through the opening, every callout, the closing card and the PDF. Clients see your brand, never ours." },
  { icon: BadgeCheck, title: "What's right gets its due", text: "Original paint, a clean scan, a documented history: what makes the car special is presented as carefully as what needs attention." },
  { icon: CircleDollarSign, title: "Estimates only from you", text: "Mention a cost on camera or in your notes and it appears beside that finding. Prices are never invented." },
  { icon: Mic, title: "Your voice, or a polished narrator", text: "Your own words from the recording, trimmed and captioned, or a calm, professional AI voice reading a script written from your inspection." },
];

const uses = [
  { icon: Search, title: "Pre-purchase inspections", text: "For the buyer flying in from across the country, or not flying in at all. They see the car through your eyes before the money moves." },
  { icon: Tag, title: "Consignment and auction listings", text: "A transparent, beautifully presented condition film that earns bidders' trust and answers their questions before they ask." },
  { icon: Wrench, title: "Service and ongoing care", text: "After a service or annual inspection, show the owner what you found, what you did and what's coming due. Concierge care they can watch." },
];

const faqs = [
  { q: "Who is it for?", a: "Independent specialists, service and restoration shops, and pre-purchase inspectors working on exotic, luxury, classic and collector cars. If the care you take is what clients pay for, this is how they get to see it." },
  { q: "Will it look like my shop, or like Inspect Flow?", a: "Like your shop. Your name, technicians, contact details and brand color run through the film and the PDF. Inspect Flow's name doesn't appear on anything your client receives." },
  { q: "Will it make things up?", a: "It's built not to. Findings come from what you said, what you attached, or what is plainly visible. Numbers appear exactly as recorded, prices only when you give them, and it never tells a client to buy or walk away unless you did. You review everything before it's sent." },
  { q: "What should I film?", a: "Film the inspection the way you do it now and talk through each finding as you find it: what it is, where it is, and what it means for the owner or buyer. Attach scan reports, compression or leak-down results and close-up photos; the editor reads them and uses them as close-ups." },
  { q: "Can I change the result?", a: "Yes, in plain words: \"Lead with the oil seep.\" \"Keep it under two minutes.\" The editor remembers every decision it made, makes the change, and re-renders." },
  { q: "How long does it take?", a: "Usually 30–60 minutes for a 10–15 minute inspection video. Upload it and get back to the car; the finished film is waiting when you're done." },
  { q: "Where does my footage go?", a: "Your projects are private to your account. Videos are processed on demand on dedicated cloud machines that shut down when the work is done." },
];

export default function VehiclesLanding() {
  return (
    <div className="min-h-dvh bg-background">
      <Header links={[{ href: "/", label: "Homes" }]} />
      <main>
        {/* Hero, with the film */}
        <section className="relative overflow-hidden bg-primary text-primary-foreground">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_560px_at_50%_-8%,rgb(255_210_63/0.16),transparent_62%)]" />
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 text-center sm:pb-24 sm:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-white/75">
              <span className="size-2 rounded-full bg-highlight" />For specialists in exotic, luxury and collector cars
            </p>
            <h1 className="mx-auto mt-7 max-w-4xl font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
              White-glove work deserves a <span className="text-highlight">white-glove report</span>.
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl">
              Your clients trust you with cars worth six and seven figures, often from across the country. Inspect Flow turns your inspection footage into a polished, narrated film of their car, every finding shown and explained, with a matching report under your name.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={START} className="inline-flex h-12 items-center gap-2 rounded-xl bg-highlight px-6 text-base font-semibold text-foreground shadow-[0_12px_34px_-12px_rgb(255_210_63/0.55)] hover:bg-highlight/90">Get started<ArrowRight className="size-4" /></Link>
              <a href="#demo" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 px-6 text-base font-semibold text-white hover:bg-white/10"><Video className="size-4" />Watch the 45-second film</a>
            </div>
            <div id="demo" className="mx-auto mt-16 max-w-5xl scroll-mt-24">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_50px_140px_-40px_rgb(0_0_0/0.9)] sm:rounded-3xl">
                <video className="aspect-video w-full" src="/marketing/explainer-vehicle.mp4" poster="/marketing/explainer-vehicle-poster.jpg" autoPlay muted loop playsInline controls preload="metadata" />
              </div>
              <p className="mt-4 text-sm text-white/50">Made with Inspect Flow&rsquo;s own editing engine. Turn the sound on for the music.</p>
            </div>
          </div>
        </section>

        {/* The gap */}
        <section className="mx-auto mt-24 max-w-6xl px-5">
          <div className="grid gap-10 md:grid-cols-[1fr_1.1fr] md:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">The gap</p>
              <h2 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Your work is meticulous. Your report is a PDF.</h2>
            </div>
            <div className="grid gap-5 text-lg text-muted-foreground">
              {gap.map(t => <p key={t} className="flex gap-3"><span className="mt-2.5 size-2 shrink-0 rounded-full bg-highlight" />{t}</p>)}
              <p className="mt-1 border-l-4 border-highlight pl-4 font-semibold text-foreground">Inspect Flow closes the gap. The client sees the car through your eyes, in your words, under your name.</p>
            </div>
          </div>
        </section>

        {/* What it does for the shop */}
        <section className="mx-auto mt-24 max-w-6xl px-5">
          <div className="rounded-3xl bg-primary px-6 py-14 text-primary-foreground sm:px-12">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-highlight">What it does for your shop</p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">The report becomes part of the service.</h2>
            <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {value.map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <span className="grid size-10 place-items-center rounded-lg bg-white/10 text-highlight"><Icon className="size-5" /></span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <HowItWorks
          title="From inspection footage to a finished film, without editing anything."
          steps={steps}
          stills={[
            { src: "/marketing/vehicle-ai-editor.jpg", alt: "The AI editor matching what the inspector said to findings: an oil leak, factory paint, and old tires" },
            { src: "/marketing/vehicle-deliverables.jpg", alt: "The finished highlight film, a matching PDF report with a repair estimate, and a change request in plain words" },
          ]}
        />
        <Features
          kicker="What your client receives"
          title="Every detail, shown with the care you took."
          lead="Not a slideshow. A real edit of your footage, paced like a film: each finding frozen, circled and labeled, narrated in plain English, with the numbers that matter on screen."
          still={{ src: "/marketing/explainer-vehicle-poster.jpg", alt: "A freeze-frame callout circling oil tracking down the seam between the engine and transmission, with a repair estimate" }}
          features={features}
          extras={[[MessageSquare, "Changes in plain words"], [Captions, "Captions on every line"], [Lock, "Private to your account"], [Check, "You approve before it's sent"]]}
        />

        {/* Use cases */}
        <section className="mx-auto mt-28 max-w-6xl px-5">
          <p className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Built for</p>
          <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-4xl font-bold tracking-tight sm:text-5xl">Every moment a client needs to see the car.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {uses.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border bg-card p-6">
                <span className="grid size-10 place-items-center rounded-lg bg-primary text-highlight"><Icon className="size-5" /></span>
                <h3 className="mt-4 font-display text-2xl font-bold tracking-tight">{title}</h3>
                <p className="mt-2 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <Faq items={faqs} />
        <Cta title="Give your next client the white-glove report." text="Upload one inspection and see what they'll see." start={START} />
      </main>
      <Footer />
    </div>
  );
}
