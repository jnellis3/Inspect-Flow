// Compile edit.json + findings.json (+ voice/music manifests) into a HyperFrames project.
//
//   node reel/compile.ts <job>
//
// Writes <job>/reel/index.html, <job>/reel/assets/*, and <job>/reel/timeline.json (scene
// timings + warnings for the agent and the storyboard UI). Deterministic: the same inputs
// always produce the same composition.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, readdirSync, lstatSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Brief, Edit, Findings, Shot, type Annotation, type Finding, type Scene } from "./schema.ts";

const W = 1920, H = 1080;
const HERE = dirname(fileURLToPath(import.meta.url));
const PRIORITY: Record<string, { label: string; color: string }> = {
  safety: { label: "Safety", color: "#EF4444" },
  repair: { label: "Repair", color: "#F59E0B" },
  minor: { label: "Minor fix", color: "#3B82F6" },
  monitor: { label: "Monitor", color: "#94A3B8" },
};
const WHO: Record<string, string> = { builder: "Builder", homeowner: "Homeowner", specialist: "Specialist" };
const GOOD = "#22C55E";

type Word = { w: string; start: number; end: number };
type Voice = Record<string, { file: string; duration: number; words: Word[] }>;

const job = resolve(process.argv[2] ?? ".");
const readJson = (p: string) => JSON.parse(readFileSync(join(job, p), "utf8"));
const optJson = (p: string) => (existsSync(join(job, p)) ? readJson(p) : null);

const brief = Brief.parse(readJson("brief.json"));
const findings = Findings.parse(readJson("findings.json"));
const edit = Edit.parse(readJson("edit.json"));
const probe = readJson("analysis/probe.json") as { duration: number; width: number; height: number };
const voice: Voice = optJson("reel/audio/vo.json") ?? {};
const music = optJson("reel/audio/music.json") as { file: string; duration: number } | null;
const transcript = optJson("analysis/transcript.json") as { segments: { words: { start: number; end: number; word: string }[] }[] } | null;
const byId = new Map(findings.findings.map(f => [f.id, f]));
const accent = brief.company.accent ?? "#FFD23F";
const warnings: string[] = [];
const out = join(job, "reel");
mkdirSync(join(out, "assets", "stills"), { recursive: true });

// ---------- helpers ----------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------- sources ----------
// The walkthrough, or one of the user's supporting clips/photos (normalized by ingest).
type Source = { path: string; kind: "video" | "image"; width: number; height: number; duration: number; original: string };
const walkthroughFile = readdirSync(join(job, "input")).find(f => f.startsWith("walkthrough.")) ?? "";
const MAIN: Source = { path: "media/proxy.mp4", kind: "video", width: probe.width, height: probe.height, duration: probe.duration, original: join(job, "input", walkthroughFile) };
const supporting = (optJson("analysis/supporting.json") ?? []) as { kind: string; path?: string; width?: number; height?: number; duration?: number }[];
function sourceOf(src?: string): Source {
  if (!src) return MAIN;
  const item = supporting.find(i => i.path === src);
  if (!item || !item.width || !item.height) { warnings.push(`unknown supporting source ${src}; using the walkthrough`); return MAIN; }
  return { path: src, kind: item.kind === "image" ? "image" : "video", width: item.width, height: item.height, duration: item.duration ?? Infinity, original: join(job, src) };
}

// Source frame → screen pixels. Landscape media fills the frame (cover); portrait phone
// footage and photos are shown whole (contain) over a blurred copy of themselves.
type Geometry = { fill: "cover" | "contain"; map: (x: number, y: number) => { x: number; y: number }; px: number; box: { x: number; y: number; w: number; h: number } };
function geometry(src: Source): Geometry {
  const fill = src.width / src.height >= 1.3 ? "cover" : "contain";
  const s = fill === "cover" ? Math.max(W / src.width, H / src.height) : Math.min(W / src.width, H / src.height);
  const dw = src.width * s, dh = src.height * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
  return { fill, map: (x, y) => ({ x: ox + x * dw, y: oy + y * dh }), px: dh, box: { x: ox, y: oy, w: dw, h: dh } };
}
const MAIN_GEO = geometry(MAIN);

// A zoom that brings (x,y) toward screen centre while keeping the picture covering the frame
// wherever it is big enough to.
function zoomTo(geo: Geometry, x: number, y: number, z: number) {
  const p = geo.map(x, y);
  const axis = (target: number, lo: number, size: number, screen: number) =>
    size * z >= screen ? clamp(screen / 2 - target * z, screen - (lo + size) * z, -lo * z) : screen / 2 - (lo + size / 2) * z;
  const tx = axis(p.x, geo.box.x, geo.box.w, W), ty = axis(p.y, geo.box.y, geo.box.h, H);
  return { tx: r3(tx), ty: r3(ty), z, at: (q: { x: number; y: number }) => ({ x: q.x * z + tx, y: q.y * z + ty }) };
}

// A full-resolution frame of a video source at time t (or the photo itself).
const stillCache = new Map<string, string>();
function still(t: number, src: Source = MAIN) {
  if (src.kind === "image") return src.path;
  const key = `${src.path}@${Math.round(t * 100) / 100}`;
  if (stillCache.has(key)) return stillCache.get(key)!;
  const tag = src === MAIN ? "" : src.path.replace(/^.*\//, "").replace(/\.\w+$/, "") + "-";
  const name = `assets/stills/${tag}t${(Math.round(t * 100) / 100).toFixed(2).replace(".", "_")}.jpg`;
  const dest = join(out, name);
  if (!existsSync(dest)) {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(Math.round(t * 100) / 100), "-i", src.original, "-frames:v", "1",
      "-vf", "scale='min(3840,iw)':-2", "-q:v", "2", dest]);
  }
  stillCache.set(key, name);
  return name;
}

// Copy shipped assets and link the proxy into the project so the renderer can read it.
for (const f of ["gsap.min.js", "fonts/InterVariable.ttf", "fonts/InterDisplay-Bold.ttf", "fonts/InterDisplay-SemiBold.ttf"]) {
  mkdirSync(dirname(join(out, "assets", f)), { recursive: true });
  copyFileSync(join(HERE, "assets", f), join(out, "assets", f));
}
mkdirSync(join(out, "media"), { recursive: true });
for (const f of ["proxy.mp4", "voice.wav", "supporting"]) {
  const target = join(job, "media", f), link = join(out, "media", f);
  if (existsSync(target) && !existsSync(link)) {
    try { lstatSync(link); } catch { symlinkSync(relative(dirname(link), target), link); }
  }
}

// ---------- timing ----------
const LEAD = 0.35, TAIL = 0.55;
const shotLen = (s: Shot) => (s.out - s.in) / s.speed;

type Timed = { scene: Scene; start: number; dur: number; voStart: number; shots: Shot[] };
const timed: Timed[] = [];
const unvoiced: string[] = [];
let clock = 0;
for (const scene of edit.scenes) {
  const vo = voice[scene.id];
  const said = edit.voice.mode === "ai" ? (vo?.duration ?? 0) : (scene.audio ?? []).reduce((a, r) => a + (r.out - r.in), 0);
  if (edit.voice.mode === "ai" && scene.vo && !vo) unvoiced.push(scene.id);
  // The inspector's own voice is picture-synced, so it can't lead the cut.
  const lead = edit.voice.mode === "source" ? 0 : scene.type === "title" ? 1.0 : LEAD;
  const need = said > 0 ? lead + said + TAIL : 0;
  let shots: Shot[] = [];
  let natural = 0;
  switch (scene.type) {
    case "title": shots = [scene.shot]; natural = Math.max(5, shotLen(scene.shot)); break;
    case "finding": {
      shots = scene.shots.length ? scene.shots.map(s => ({ ...s })) : (scene.audio ?? []).map(r => Shot.parse({ in: r.in, out: r.out }));
      if (!shots.length) { warnings.push(`${scene.id}: no shots (and no audio ranges to derive them from)`); shots = [Shot.parse({ in: 0, out: 3 })]; }
      natural = shots.reduce((a, s) => a + shotLen(s), 0);
      break;
    }
    case "montage": shots = scene.items.map(i => i.shot); natural = shots.reduce((a, s) => a + shotLen(s), 0); break;
    case "overview": natural = 6; break;
    case "punchlist": natural = 3 + findings.findings.length * 0.3; break;
    case "outro": if (scene.shot) shots = [scene.shot]; natural = Math.max(5, scene.shot ? shotLen(scene.shot) : 0); break;
  }
  let dur = Math.max(natural, need);
  // Footage scenes stretch their last shot to cover the narration.
  if (shots.length && need > natural + 0.05 && scene.type !== "overview" && scene.type !== "punchlist") {
    const last = shots[shots.length - 1];
    const wantOut = last.out + (need - natural) * last.speed;
    const maxOut = sourceOf(last.src).duration - 0.1;
    last.out = Math.min(wantOut, maxOut);
    if (wantOut > maxOut) warnings.push(`${scene.id}: footage ran out before the narration ended.`);
    if (scene.type !== "title" && need - natural > 4) warnings.push(`${scene.id}: narration is ${(need - natural).toFixed(1)}s longer than the chosen shots; the last shot was extended. Consider adding a shot.`);
  }
  if (said > 0 && natural > need + 4 && scene.type === "finding") warnings.push(`${scene.id}: shots run ${(natural - need).toFixed(1)}s past the narration; consider trimming.`);
  if (scene.type === "finding" || scene.type === "montage" || scene.type === "title" || scene.type === "outro") {
    dur = Math.max(dur, shots.reduce((a, s) => a + shotLen(s), 0));
    // Footage must cover the whole scene (minimum lengths, narration): grow the last shot.
    const covered = shots.reduce((a, s) => a + shotLen(s), 0);
    if (shots.length && covered < dur - 0.01) {
      const last = shots[shots.length - 1];
      last.out = Math.min(sourceOf(last.src).duration - 0.1, last.out + (dur - covered) * last.speed);
    }
  }
  timed.push({ scene, start: r3(clock), dur: r3(dur), voStart: r3(clock + lead), shots });
  clock += dur;
}
const total = r3(clock);
// A narrated reel without its narration is worse than no reel: refuse to build it.
if (unvoiced.length && !process.env.ALLOW_SILENT) {
  console.error(`Narration is missing for: ${unvoiced.join(", ")}. Run \`voice\` (and fix any error it reports) before building.`);
  process.exit(1);
}

// ---------- emit ----------
const html: string[] = [];
const js: string[] = [];
let uid = 0;
const id = (p: string) => `${p}-${++uid}`;
let track = 0;

function cam(src: string, kind: "video" | "img", start: number, dur: number, mediaStart = 0, rate = 1, extraClass = "", fill: Geometry["fill"] = "cover", backdrop?: string) {
  const camId = id("cam"), elId = id(kind === "video" ? "v" : "img");
  const timing = `data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="${track++ % 4}"`;
  const cls = `clip fill${fill === "contain" ? " contain" : ""}`;
  const media = kind === "video"
    ? `<video id="${elId}" class="${cls}" src="${src}" ${timing} data-media-start="${r3(mediaStart)}"${rate !== 1 ? ` data-playback-rate="${rate}"` : ""} muted playsinline></video>`
    : `<img id="${elId}" class="${cls}" src="${src}" ${timing} />`;
  if (fill === "contain" && backdrop) {
    html.push(`<div class="cam backdrop"><img id="${id("bd")}" class="clip fill" src="${backdrop}" data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="4" /></div>`);
  }
  html.push(`<div class="cam ${extraClass}" id="${camId}">${media}</div>`);
  return camId;
}

function layer(start: number, dur: number, inner: string, cls = "") {
  const lid = id("layer");
  html.push(`<div id="${lid}" class="clip layer ${cls}" data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="${5 + (uid % 3)}">${inner}</div>`);
  return lid;
}

// Annotations drawn at screen positions; `map` converts source coords to screen.
function annotations(list: Annotation[], start: number, dur: number, map: (p: { x: number; y: number }) => { x: number; y: number }, zoom = 1, avoidCard = true, geo: Geometry = MAIN_GEO) {
  const cover = geo;
  if (!list.length) return;
  const parts: string[] = [];
  const anims: [string, number, string][] = [];
  list.forEach((a, i) => {
    const p = map(cover.map(a.x, a.y));
    const gid = id("ann");
    const t0 = start + a.delay + i * 0.35;
    let shape = "", len = 0, rx = 0, ry = 0;
    if (a.shape === "box" && a.w && a.h) {
      const tl = map(cover.map(a.x - a.w / 2, a.y - a.h / 2)), br = map(cover.map(a.x + a.w / 2, a.y + a.h / 2));
      const w = br.x - tl.x, h = br.y - tl.y;
      len = 2 * (w + h); rx = w / 2; ry = h / 2;
      shape = `<rect class="ann-shadow" x="${r3(tl.x)}" y="${r3(tl.y)}" width="${r3(w)}" height="${r3(h)}" rx="14"/><rect class="ann-stroke" x="${r3(tl.x)}" y="${r3(tl.y)}" width="${r3(w)}" height="${r3(h)}" rx="14" stroke-dasharray="${r3(len)}" stroke-dashoffset="${r3(len)}"/>`;
    } else if (a.shape === "dot") {
      rx = ry = 18;
      shape = `<circle class="ann-pulse" cx="${r3(p.x)}" cy="${r3(p.y)}" r="18"/><circle class="ann-dot" cx="${r3(p.x)}" cy="${r3(p.y)}" r="11"/>`;
    } else {
      const r = clamp(a.r * cover.px * zoom, 34, 300);
      rx = ry = r; len = 2 * Math.PI * r;
      shape = `<circle class="ann-shadow" cx="${r3(p.x)}" cy="${r3(p.y)}" r="${r3(r)}"/><circle class="ann-stroke" cx="${r3(p.x)}" cy="${r3(p.y)}" r="${r3(r)}" stroke-dasharray="${r3(len)}" stroke-dashoffset="${r3(len)}" transform="rotate(-90 ${r3(p.x)} ${r3(p.y)})"/>`;
    }
    let label = "";
    if (a.label) {
      // Pick the side with the most room, staying clear of the finding card (top-left).
      let side = a.side;
      if (side === "auto") side = p.x < W * 0.55 ? "right" : "left";
      const gap = 28, lw = Math.min(560, 26 + a.label.length * 17.5), lh = 58;
      let lx = side === "right" ? p.x + rx + gap : side === "left" ? p.x - rx - gap - lw : p.x - lw / 2;
      let ly = side === "top" ? p.y - ry - gap - lh : side === "bottom" ? p.y + ry + gap : p.y - lh / 2;
      lx = clamp(lx, 60, W - 60 - lw); ly = clamp(ly, 60, H - 200 - lh);
      if (avoidCard && lx < 1100 && ly < 340) ly = Math.min(H - 200 - lh, Math.max(ly, 360));
      const ax = lx + (lx > p.x ? 0 : lw), ay = ly + lh / 2;
      const ex = p.x + (ax - p.x) * (rx / Math.max(1, Math.hypot(ax - p.x, ay - p.y))), ey = p.y + (ay - p.y) * (ry / Math.max(1, Math.hypot(ax - p.x, ay - p.y)));
      const lead = a.shape === "dot" ? `<line class="ann-lead" x1="${r3(p.x)}" y1="${r3(p.y)}" x2="${r3(ax)}" y2="${r3(ay)}"/>` : `<line class="ann-lead" x1="${r3(ex)}" y1="${r3(ey)}" x2="${r3(ax)}" y2="${r3(ay)}"/>`;
      label = `${lead}<foreignObject x="${r3(lx)}" y="${r3(ly)}" width="${r3(lw)}" height="${lh}"><div xmlns="http://www.w3.org/1999/xhtml" class="ann-label">${esc(a.label)}</div></foreignObject>`;
    }
    parts.push(`<g id="${gid}" class="ann">${shape}${label}</g>`);
    anims.push([gid, t0, a.shape]);
  });
  const lid = layer(start, dur, `<svg class="ann-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join("")}</svg>`, "ann-layer");
  for (const [gid, t0] of anims) {
    js.push(`tl.fromTo("#${gid} .ann-stroke",{strokeDashoffset:(i,el)=>el.getAttribute("stroke-dasharray")},{strokeDashoffset:0,duration:0.55,ease:"power2.inOut"},${r3(t0)});`);
    js.push(`tl.fromTo("#${gid} .ann-shadow, #${gid} .ann-dot",{opacity:0},{opacity:1,duration:0.3},${r3(t0)});`);
    js.push(`tl.fromTo("#${gid} .ann-pulse",{scale:0.6,opacity:0.9,transformOrigin:"50% 50%"},{scale:2.4,opacity:0,duration:1.1,repeat:2,ease:"power1.out"},${r3(t0)});`);
    js.push(`tl.fromTo("#${gid} .ann-lead",{opacity:0},{opacity:1,duration:0.25},${r3(t0 + 0.35)});`);
    js.push(`tl.fromTo("#${gid} foreignObject",{opacity:0,y:10},{opacity:1,y:0,duration:0.35,ease:"back.out(2)"},${r3(t0 + 0.4)});`);
  }
  js.push(`tl.to("#${lid} .ann",{opacity:0,duration:0.25},${r3(start + dur - 0.3)});`);
}

// One shot: video, optional freeze (still + zoom + annotations), optional push.
function renderShot(s: Shot, start: number, opts: { cardVisible: boolean }) {
  const len = shotLen(s);
  const src = sourceOf(s.src), geo = geometry(src);
  const pieces: { kind: "video" | "still"; start: number; dur: number; media: number }[] = [];
  if (s.freeze) {
    const fa = (s.freeze.at - s.in) / s.speed;
    const resume = fa + s.freeze.hold;
    if (fa > 0.05) pieces.push({ kind: "video", start: 0, dur: fa, media: s.in });
    pieces.push({ kind: "still", start: fa, dur: Math.min(s.freeze.hold, len - fa), media: s.freeze.at });
    if (resume < len - 0.05) pieces.push({ kind: "video", start: resume, dur: len - resume, media: s.in + resume * s.speed });
  } else pieces.push({ kind: "video", start: 0, dur: len, media: s.in });

  for (const p of pieces) {
    const t = start + p.start;
    if (p.kind === "video") {
      const backdrop = geo.fill === "contain" ? still(src.kind === "image" ? 0 : p.media, src) : undefined;
      const c = src.kind === "image"
        ? cam(src.path, "img", t, p.dur, 0, 1, "", geo.fill, backdrop)
        : cam(src.path, "video", t, p.dur, p.media, s.speed, "", geo.fill, backdrop);
      if (s.push) {
        const o = geo.map(s.push.x, s.push.y);
        js.push(`tl.fromTo("#${c}",{scale:${s.push.from},transformOrigin:"${r3(o.x)}px ${r3(o.y)}px"},{scale:${s.push.to},duration:${r3(p.dur)},ease:"none"},${r3(t)});`);
      }
    } else {
      const f = s.freeze!;
      const frame = still(f.at, src);
      const c = cam(frame, "img", t, p.dur, 0, 1, "still", geo.fill, geo.fill === "contain" ? frame : undefined);
      const z = zoomTo(geo, f.x, f.y, f.zoom);
      const zin = 0.75, zout = 0.45;
      const endsShot = p.start + p.dur >= len - 0.05;
      js.push(`tl.fromTo("#${c}",{x:0,y:0,scale:1,transformOrigin:"0px 0px"},{x:${z.tx},y:${z.ty},scale:${z.z},duration:${zin},ease:"power3.inOut"},${r3(t)});`);
      if (!endsShot) js.push(`tl.to("#${c}",{x:0,y:0,scale:1,duration:${zout},ease:"power2.inOut"},${r3(t + p.dur - zout)});`);
      // Shutter flash + "freeze" tag: the viewer knows the picture paused on purpose.
      layer(t, 0.35, `<div class="flash"></div>`);
      const tag = layer(t, p.dur, `<div class="freeze-tag"><span class="freeze-dot"></span>Closer look</div>`);
      js.push(`tl.fromTo("#${tag} .freeze-tag",{opacity:0,y:-8},{opacity:1,y:0,duration:0.3},${r3(t + 0.2)});`);
      const annDur = p.dur - zin - (endsShot ? 0.1 : zout);
      if (annDur > 0.5) annotations(f.annotations, t + zin, annDur, z.at, f.zoom, opts.cardVisible, geo);
    }
  }
  if (s.annotations.length) annotations(s.annotations, start, len, q => q, 1, opts.cardVisible, geo);
}

// Captions grouped into short phrases; the spoken word lights up.
function captions(words: Word[], offset: number, sceneEnd: number) {
  if (!words.length) return;
  const phrases: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const text = cur.map(x => x.w).join(" ");
    if (cur.length && (text.length + w.w.length > 40 || (/[.,;:?!]$/.test(cur[cur.length - 1].w) && text.length > 16))) { phrases.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) phrases.push(cur);
  phrases.forEach((ph, i) => {
    const s = offset + ph[0].start;
    const next = phrases[i + 1] ? offset + phrases[i + 1][0].start : Math.min(sceneEnd, offset + ph[ph.length - 1].end + 0.6);
    const spans = ph.map((w, k) => `<span id="${id("w")}" data-k="${k}">${esc(w.w)}</span>`).join(" ");
    const lid = layer(s, Math.max(0.3, next - s), `<div class="caption">${spans}</div>`, "caption-layer");
    ph.forEach((w, k) => js.push(`tl.set("#${lid} [data-k='${k}']",{color:"${accent}"},${r3(offset + w.start)});tl.set("#${lid} [data-k='${k}']",{color:"#ffffff"},${r3(offset + w.end + 0.05)});`));
  });
}

function chips(f: Finding) {
  const p = PRIORITY[f.priority];
  return `<span class="chip" style="--c:${p.color}"><i></i>${p.label}</span><span class="chip ghost">${WHO[f.who]}</span>`;
}

const findingScenes = timed.filter(t => t.scene.type === "finding");
const sceneVoices: { id: string; file: string; start: number; dur: number }[] = [];

for (const t of timed) {
  const { scene, start, dur } = t;
  const end = start + dur;
  // Every scene softly dips at its head so cuts land cleanly.
  if (start > 0) {
    const dip = layer(start - 0.18, 0.36, `<div class="dip"></div>`);
    js.push(`tl.fromTo("#${dip} .dip",{opacity:0},{opacity:0.75,duration:0.18,yoyo:true,repeat:1,ease:"sine.inOut"},${r3(start - 0.18)});`);
  }

  if (scene.type === "title") {
    renderShot(t.shots[0], start, { cardVisible: false });
    const meta = [brief.inspection.date, `Inspected by ${brief.company.name}`].join("  ·  ");
    const lid = layer(start, dur, `<div class="shade-left"></div><div class="title-block">
      <div class="brand">${esc(brief.company.name)}</div>
      <div class="kicker">${esc(scene.kicker)}</div>
      <h1 class="title">${esc(scene.title)}</h1>
      ${scene.subtitle ? `<div class="subtitle">${esc(scene.subtitle)}</div>` : ""}
      <div class="meta">${esc(meta)}</div></div>`);
    js.push(`tl.fromTo("#${lid} .shade-left",{opacity:0},{opacity:1,duration:0.8},${r3(start)});`);
    js.push(`tl.fromTo("#${lid} .title-block > *",{opacity:0,y:36},{opacity:1,y:0,duration:0.8,stagger:0.12,ease:"power3.out"},${r3(start + 0.3)});`);
    js.push(`tl.to("#${lid} .title-block",{opacity:0,y:-20,duration:0.4},${r3(end - 0.45)});`);
  }

  if (scene.type === "overview") {
    cam(still(scene.still), "img", start, dur, 0, 1, "blurred");
    const counts = Object.keys(PRIORITY).map(k => [k, findings.findings.filter(f => f.priority === k).length] as const).filter(([, n]) => n > 0);
    const tiles = counts.map(([k, n]) => `<div class="tile" style="--c:${PRIORITY[k].color}"><div class="num" data-n="${n}">0</div><div class="lbl"><i></i>${PRIORITY[k].label}</div></div>`).join("")
      + (findings.positives.length ? `<div class="tile" style="--c:${GOOD}"><div class="num" data-n="${findings.positives.length}">0</div><div class="lbl"><i></i>Done right</div></div>` : "");
    const areas = [...new Set(findings.findings.map(f => f.area))].map(a => `<span class="area">${esc(a)} <b>${findings.findings.filter(f => f.area === a).length}</b></span>`).join("");
    const lid = layer(start, dur, `<div class="overview"><div class="kicker">At a glance</div><h2>${esc(scene.headline)}</h2><div class="tiles">${tiles}</div><div class="areas">${areas}</div></div>`);
    js.push(`tl.fromTo("#${lid} .kicker, #${lid} h2",{opacity:0,y:30},{opacity:1,y:0,duration:0.7,stagger:0.12,ease:"power3.out"},${r3(start + 0.2)});`);
    js.push(`tl.fromTo("#${lid} .tile",{opacity:0,y:40,scale:0.96},{opacity:1,y:0,scale:1,duration:0.6,stagger:0.12,ease:"back.out(1.6)"},${r3(start + 0.7)});`);
    js.push(`document.querySelectorAll("#${lid} .num").forEach((el,i)=>{const o={v:0};tl.to(o,{v:+el.dataset.n,duration:0.9,ease:"power2.out",onUpdate:()=>{el.textContent=Math.round(o.v)}},${r3(start + 0.8)}+i*0.12);});`);
    js.push(`tl.fromTo("#${lid} .area",{opacity:0,y:16},{opacity:1,y:0,duration:0.4,stagger:0.08},${r3(start + 1.6)});`);
  }

  if (scene.type === "finding") {
    const f = byId.get(scene.finding);
    if (!f) { warnings.push(`${scene.id}: unknown finding "${scene.finding}"`); continue; }
    let s0 = start;
    const cardIn = scene.chapter ? 1.5 : 0.35;
    for (const s of t.shots) { renderShot(s, s0, { cardVisible: true }); s0 += shotLen(s); }
    const n = findingScenes.indexOf(t) + 1;
    const p = PRIORITY[f.priority];
    if (scene.chapter) {
      const chapterNo = timed.filter(x => x.scene.type === "finding" && (x.scene as any).chapter && x.start <= start).length;
      const bid = layer(start, 1.9, `<div class="shade-left soft"></div><div class="bumper"><div class="bumper-no">${String(chapterNo).padStart(2, "0")}</div><div class="bumper-name">${esc(scene.chapter)}</div></div>`);
      js.push(`tl.fromTo("#${bid} .bumper > *",{opacity:0,x:-60},{opacity:1,x:0,duration:0.55,stagger:0.1,ease:"power3.out"},${r3(start + 0.05)});`);
      js.push(`tl.to("#${bid} .bumper, #${bid} .shade-left",{opacity:0,duration:0.35},${r3(start + 1.5)});`);
    }
    const lid = layer(start + cardIn, dur - cardIn, `<div class="card-wrap"><div class="card" style="--c:${p.color}">
      <div class="card-kicker">${esc(f.area)} <span>·</span> ${n} of ${findingScenes.length}</div>
      <div class="card-title">${esc(f.title)}</div>
      <div class="card-chips">${chips(f)}</div></div>
      <div class="card-fix"><span class="arrow">→</span>${esc(f.fix)}</div></div>`);
    js.push(`tl.fromTo("#${lid} .card",{opacity:0,x:-40},{opacity:1,x:0,duration:0.55,ease:"power3.out"},${r3(start + cardIn)});`);
    js.push(`tl.fromTo("#${lid} .card-fix",{opacity:0,x:-30},{opacity:1,x:0,duration:0.5,ease:"power3.out"},${r3(start + Math.max(cardIn + 1, dur * 0.55))});`);
    js.push(`tl.to("#${lid} .card-wrap",{opacity:0,x:-24,duration:0.3},${r3(end - 0.35)});`);
  }

  if (scene.type === "montage") {
    let s0 = start;
    const head = layer(start, dur, `<div class="montage-head"><span class="check">✓</span>${esc(scene.title)}</div>`);
    js.push(`tl.fromTo("#${head} .montage-head",{opacity:0,x:-30},{opacity:1,x:0,duration:0.5,ease:"power3.out"},${r3(start + 0.2)});`);
    scene.items.forEach((item, i) => {
      const len = shotLen(item.shot) + (i === scene.items.length - 1 ? dur - t.shots.reduce((a, s) => a + shotLen(s), 0) : 0);
      renderShot({ ...item.shot, out: item.shot.in + len * item.shot.speed }, s0, { cardVisible: true });
      const lid = layer(s0, len, `<div class="good-label"><span class="check">✓</span>${esc(item.label)}</div>`);
      js.push(`tl.fromTo("#${lid} .good-label",{opacity:0,y:20},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r3(s0 + 0.25)});`);
      s0 += len;
    });
  }

  if (scene.type === "punchlist") {
    if (scene.still !== undefined) cam(still(scene.still), "img", start, dur, 0, 1, "blurred dark");
    else html.push(`<div class="clip layer paper" data-start="${start}" data-duration="${dur}" data-track-index="0"></div>`);
    const order = ["safety", "repair", "minor", "monitor"];
    const items = [...findings.findings].sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
    const rows = items.map(f => `<li style="--c:${PRIORITY[f.priority].color}"><i></i><span class="pl-title">${esc(f.title)}</span><span class="pl-who">${WHO[f.who]}</span></li>`).join("");
    const lid = layer(start, dur, `<div class="punch ${items.length > 12 ? "two" : ""}"><div class="kicker">Next steps</div><h2>${esc(scene.title)}</h2><ul>${rows}</ul><div class="punch-foot">Photos, timestamps and details for every item are in your written report.</div></div>`);
    js.push(`tl.fromTo("#${lid} .kicker, #${lid} h2",{opacity:0,y:24},{opacity:1,y:0,duration:0.6,stagger:0.1,ease:"power3.out"},${r3(start + 0.2)});`);
    js.push(`tl.fromTo("#${lid} li",{opacity:0,x:-24},{opacity:1,x:0,duration:0.4,stagger:${r3(Math.min(0.18, 2.2 / items.length))},ease:"power2.out"},${r3(start + 0.7)});`);
    js.push(`tl.fromTo("#${lid} .punch-foot",{opacity:0},{opacity:1,duration:0.5},${r3(start + 1.2 + Math.min(2.2, items.length * 0.18))});`);
  }

  if (scene.type === "outro") {
    if (scene.shot) renderShot(t.shots[0], start, { cardVisible: false });
    else if (scene.still !== undefined) cam(still(scene.still), "img", start, dur, 0, 1, "blurred dark");
    const contact = [brief.company.phone, brief.company.website].filter(Boolean).join("   ·   ");
    const lid = layer(start, dur, `<div class="shade-left"></div><div class="outro">
      <div class="kicker">${esc(brief.company.name)}</div><h2>${esc(scene.headline)}</h2>
      ${brief.company.people.length ? `<div class="people">${esc(brief.company.people.join(", "))}</div>` : ""}
      ${contact ? `<div class="contact">${esc(contact)}</div>` : ""}
      <div class="disclaimer">Highlights from a visual walkthrough${edit.voice.mode === "ai" ? ", narrated with an AI voice" : ""}. Your written inspection report is the complete record.</div></div>`);
    js.push(`tl.fromTo("#${lid} .shade-left",{opacity:0},{opacity:1,duration:0.8},${r3(start)});`);
    js.push(`tl.fromTo("#${lid} .outro > *",{opacity:0,y:28},{opacity:1,y:0,duration:0.7,stagger:0.12,ease:"power3.out"},${r3(start + 0.4)});`);
  }

  // Voice + captions
  if (edit.voice.mode === "ai" && voice[scene.id]) {
    const v = voice[scene.id];
    sceneVoices.push({ id: scene.id, file: v.file, start: t.voStart, dur: v.duration });
    captions(v.words, t.voStart, end);
  } else if (edit.voice.mode === "source" && scene.audio) {
    let at = t.voStart;
    for (const r of scene.audio) {
      sceneVoices.push({ id: `${scene.id}-${r.in}`, file: "media/voice.wav", start: at, dur: r.out - r.in, ...{ media: r.in } } as any);
      const words = (transcript?.segments ?? []).flatMap(s => s.words).filter(w => w.start >= r.in - 0.05 && w.end <= r.out + 0.05)
        .map(w => ({ w: w.word, start: w.start - r.in, end: w.end - r.in }));
      captions(words, at, end);
      at += r.out - r.in;
    }
  }
}

// Audio: voice clips + one music bed that ducks under speech.
for (const v of sceneVoices as any[]) {
  html.push(`<audio id="${id("vo")}" src="${v.file}" data-start="${r3(v.start)}" data-duration="${r3(v.dur)}"${v.media !== undefined ? ` data-media-start="${r3(v.media)}"` : ""} data-track-index="10" data-volume="1"></audio>`);
}
if (music && edit.music) {
  const bed = edit.music.level;
  const pts: { t: number; v: number }[] = [{ t: 0, v: 0 }, { t: 0.6, v: 0.55 }];
  const speech = sceneVoices.map(v => [v.start, v.start + v.dur]).sort((a, b) => a[0] - b[0]);
  for (const [s, e] of speech) pts.push({ t: Math.max(0, s - 0.4), v: pts[pts.length - 1].v }, { t: s, v: bed }, { t: e, v: bed });
  const tail = Math.min(total, music.duration);
  pts.push({ t: Math.max(0, tail - 3), v: 0.5 }, { t: tail, v: 0 });
  const clean = pts.sort((a, b) => a.t - b.t).filter((p, i, arr) => i === 0 || p.t > arr[i - 1].t + 0.01).map(p => ({ t: r3(p.t), v: p.v }));
  html.push(`<audio id="music-bed" src="${music.file}" data-start="0" data-duration="${r3(tail)}" data-track-index="11" data-volume="1" data-automation='${JSON.stringify({ version: 1, lanes: [{ target: "volume", points: clean }] })}'></audio>`);
  if (music.duration < total - 1) warnings.push(`music bed is ${music.duration.toFixed(0)}s but the reel is ${total.toFixed(0)}s; regenerate music with the reel length.`);
}

const css = readFileSync(join(HERE, "theme.css"), "utf8").replace("__ACCENT__", accent);
const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<title>${esc(brief.property.address)} · Inspection highlights</title>
<script src="assets/gsap.min.js"></script>
<style>${css}</style>
</head>
<body>
<div id="root" data-composition-id="reel" data-start="0" data-width="${W}" data-height="${H}" data-duration="${total}">
${html.join("\n")}
</div>
<script>
const tl = gsap.timeline({ paused: true });
${js.join("\n")}
window.__timelines["reel"] = tl;
</script>
</body>
</html>
`;
writeFileSync(join(out, "index.html"), doc);
const timeline = {
  duration: total,
  scenes: timed.map(t => ({ id: t.scene.id, type: t.scene.type, start: t.start, duration: t.dur, voice: voice[t.scene.id]?.duration ?? null })),
  freezes: timed.flatMap(t => {
    let s0 = t.start; const outp: { scene: string; at: number }[] = [];
    for (const s of t.shots) { if (s.freeze) outp.push({ scene: t.scene.id, at: r3(s0 + (s.freeze.at - s.in) / s.speed + 1.4) }); s0 += shotLen(s); }
    return outp;
  }),
  warnings,
};
writeFileSync(join(out, "timeline.json"), JSON.stringify(timeline, null, 1));
console.log(JSON.stringify({ duration: total, scenes: timed.length, warnings }, null, 1));
