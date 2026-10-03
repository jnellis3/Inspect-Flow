// The contract between the director agent, the storyboard UI, and the renderer.
//
// findings.json  – what was found (feeds the video, the PDF, and the app's review screen)
// edit.json      – how the highlight reel tells it (scene list referencing findings)
//
// All source times are seconds in the original upload. All positions are fractions
// of the full source frame (x: 0 left → 1 right, y: 0 top → 1 bottom).
import { z } from "zod";

const frac = z.number().min(0).max(1);
const seconds = z.number().min(0);

export const Annotation = z.object({
  shape: z.enum(["ring", "box", "dot"]).default("ring"),
  x: frac,
  y: frac,
  // ring: radius as a fraction of frame height; box: size as fractions of the frame
  r: z.number().min(0.01).max(0.5).default(0.07),
  w: frac.optional(),
  h: frac.optional(),
  label: z.string().max(40).optional(),
  // Where the label sits relative to the shape. "auto" picks the side with most room.
  side: z.enum(["auto", "left", "right", "top", "bottom"]).default("auto"),
  // Seconds after the annotation's moment begins (shot start, or freeze zoom landing).
  delay: z.number().min(0).default(0),
});
export type Annotation = z.infer<typeof Annotation>;

export const Freeze = z.object({
  at: seconds,                         // source time of the frozen frame (inside the shot)
  hold: z.number().min(1).max(8),       // seconds the picture holds; source picture skips ahead by the same amount
  zoom: z.number().min(1).max(4).default(1.8),
  x: frac.default(0.5),                 // zoom target (centre of interest)
  y: frac.default(0.5),
  annotations: z.array(Annotation).default([]),
});

export const Shot = z.object({
  in: seconds,
  out: seconds,
  speed: z.number().min(0.25).max(4).default(1),
  // Slow push toward a point across the whole shot (live footage).
  push: z.object({ x: frac, y: frac, from: z.number().min(1).max(3).default(1), to: z.number().min(1).max(3).default(1.15) }).optional(),
  annotations: z.array(Annotation).default([]),  // on live footage: keep to steady moments
  freeze: Freeze.optional(),
}).refine(s => s.out > s.in, { message: "shot out must be after in" })
  .refine(s => !s.freeze || (s.freeze.at >= s.in && s.freeze.at < s.out), { message: "freeze.at must fall inside the shot" });
export type Shot = z.infer<typeof Shot>;

// Source-voice mode: the inspector's own words, as source ranges (cut "ums" by splitting ranges).
const SourceAudio = z.array(z.object({ in: seconds, out: seconds })).min(1);

const base = { id: z.string().regex(/^[a-z0-9-]+$/), vo: z.string().max(600).optional(), audio: SourceAudio.optional() };

export const Scene = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("title"), shot: Shot, kicker: z.string().max(48), title: z.string().max(60), subtitle: z.string().max(80).optional() }),
  z.object({ ...base, type: z.literal("overview"), still: seconds, headline: z.string().max(70) }),
  // Source mode: omit shots to show exactly the audio ranges (lips stay in sync).
  z.object({ ...base, type: z.literal("finding"), finding: z.string(), chapter: z.string().max(24).optional(), shots: z.array(Shot).max(6).default([]) }),
  z.object({ ...base, type: z.literal("montage"), title: z.string().max(40), items: z.array(z.object({ shot: Shot, label: z.string().max(48) })).min(2).max(5) }),
  z.object({ ...base, type: z.literal("punchlist"), title: z.string().max(40).default("Your punch list"), still: seconds.optional() }),
  z.object({ ...base, type: z.literal("outro"), shot: Shot.optional(), still: seconds.optional(), headline: z.string().max(60) }),
]);
export type Scene = z.infer<typeof Scene>;

export const Edit = z.object({
  version: z.literal(1),
  voice: z.object({
    mode: z.enum(["ai", "source"]),
    voice: z.string().default("ash"),       // TTS voice id (ai mode)
  }),
  music: z.object({
    prompt: z.string().max(400),
    level: z.number().min(0).max(1).default(0.16),  // bed level under voice
  }).optional(),
  scenes: z.array(Scene).min(3).max(40),
});
export type Edit = z.infer<typeof Edit>;

export const Priority = z.enum(["safety", "repair", "minor", "monitor"]);

export const Finding = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  area: z.string().max(24),              // Roof, Exterior, Grounds, Windows, Attic…
  title: z.string().max(64),             // plain language, homeowner-readable
  priority: Priority,
  who: z.enum(["builder", "homeowner", "specialist"]),
  summary: z.string().max(400),          // what we saw
  whyItMatters: z.string().max(400),
  recommendation: z.string().max(300),
  fix: z.string().max(60),               // the one-line action shown on screen
  evidence: z.array(z.object({ in: seconds, out: seconds, quote: z.string().max(300).optional() })).min(1),
  photo: z.object({ at: seconds, crop: z.object({ x: frac, y: frac, w: frac, h: frac }).optional(), annotations: z.array(Annotation).default([]) }),
  confidence: z.enum(["confirmed", "likely", "possible"]),
});
export type Finding = z.infer<typeof Finding>;

export const Findings = z.object({
  version: z.literal(1),
  summary: z.string().max(600),           // the inspector's overall take, plain language
  findings: z.array(Finding).max(40),
  positives: z.array(z.object({ id: z.string(), area: z.string(), title: z.string().max(64), note: z.string().max(300), at: seconds })).default([]),
  limitations: z.array(z.string().max(300)).default([]),
});
export type Findings = z.infer<typeof Findings>;

export const Brief = z.object({
  profile: z.string(),
  audience: z.string().default("homeowner"),
  targetSeconds: z.tuple([z.number(), z.number()]).default([120, 180]),
  voice: z.object({ mode: z.enum(["ai", "source"]), voice: z.string().default("ash") }),
  property: z.object({ address: z.string(), city: z.string().optional(), kind: z.string().optional() }),
  inspection: z.object({ date: z.string(), type: z.string() }),
  company: z.object({ name: z.string(), people: z.array(z.string()).default([]), phone: z.string().optional(), website: z.string().optional(), accent: z.string().optional() }),
  notes: z.string().default(""),
});
export type Brief = z.infer<typeof Brief>;
