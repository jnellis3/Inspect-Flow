// Build the written report (PDF) from findings.json, sharing the reel's design language.
//
//   node report/compile.ts <job>
//
// Writes <job>/report/report.html (+ photo assets) and prints it to <job>/out/report.pdf
// with headless Chrome (CHROME_BIN, or the first Chrome/Chromium found).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Brief, Edit, Findings, type Annotation, type Finding } from "../reel/schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const job = resolve(process.argv[2] ?? ".");
const readJson = (p: string) => JSON.parse(readFileSync(join(job, p), "utf8"));
const brief = Brief.parse(readJson("brief.json"));
const data = Findings.parse(readJson("findings.json"));
const edit = existsSync(join(job, "edit.json")) ? Edit.parse(readJson("edit.json")) : null;
const probe = readJson("analysis/probe.json") as { width: number; height: number };
const accent = brief.company.accent ?? "#FFD23F";
const out = join(job, "report");
mkdirSync(join(out, "assets", "photos"), { recursive: true });
mkdirSync(join(job, "out"), { recursive: true });
for (const f of ["InterVariable.ttf", "InterDisplay-Bold.ttf"]) copyFileSync(join(HERE, "..", "reel", "assets", "fonts", f), join(out, "assets", f));

const PRIORITY: Record<string, { label: string; color: string; blurb: string }> = {
  safety: { label: "Safety", color: "#DC2626", blurb: "Address right away" },
  repair: { label: "Repair", color: "#D97706", blurb: "Should be fixed" },
  minor: { label: "Minor fix", color: "#2563EB", blurb: "Small fix or touch-up" },
  monitor: { label: "Monitor", color: "#64748B", blurb: "Keep an eye on it" },
};
const WHO: Record<string, string> = { builder: "Builder", homeowner: "Homeowner", specialist: "Specialist" };
const ORDER = ["safety", "repair", "minor", "monitor"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function photo(t: number) {
  const name = `assets/photos/t${t.toFixed(2).replace(".", "_")}.jpg`;
  if (!existsSync(join(out, name))) {
    const src = readdirSync(join(job, "input")).find(f => f.startsWith("walkthrough."))!;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", join(job, "input", src), "-frames:v", "1", "-vf", "scale='min(2400,iw)':-2", "-q:v", "3", join(out, name)]);
  }
  return name;
}

// A photo with the same ring/box/dot callouts as the video, in crop-relative coordinates.
function figure(at: number, anns: Annotation[], crop?: { x: number; y: number; w: number; h: number }) {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const aspect = (probe.width * c.w) / (probe.height * c.h);
  const vw = 1000, vh = vw / aspect;
  const X = (x: number) => ((x - c.x) / c.w) * vw, Y = (y: number) => ((y - c.y) / c.h) * vh;
  const shapes = anns.map(a => {
    let g = "";
    if (a.shape === "box" && a.w && a.h) g = `<rect x="${X(a.x - a.w / 2)}" y="${Y(a.y - a.h / 2)}" width="${(a.w / c.w) * vw}" height="${(a.h / c.h) * vh}" rx="10" class="s"/>`;
    else if (a.shape === "dot") g = `<circle cx="${X(a.x)}" cy="${Y(a.y)}" r="9" class="d"/>`;
    else g = `<circle cx="${X(a.x)}" cy="${Y(a.y)}" r="${Math.max(16, (a.r / c.h) * vh)}" class="s"/>`;
    const label = a.label ? `<text x="${X(a.x)}" y="${Y(a.y) - (a.shape === "box" && a.h ? ((a.h / c.h) * vh) / 2 : (a.r / c.h) * vh) - 14}" class="t">${esc(a.label)}</text>` : "";
    return g + label;
  }).join("");
  return `<div class="fig" style="aspect-ratio:${aspect}">
    <img src="${photo(at)}" style="width:${100 / c.w}%;left:${(-c.x / c.w) * 100}%;top:${(-c.y / c.h) * 100}%">
    <svg viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">${shapes}</svg>
    <span class="ts">Video ${mmss(at)}</span></div>`;
}

const sorted = [...data.findings].sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority));
const counts = ORDER.map(k => [k, data.findings.filter(f => f.priority === k).length] as const).filter(([, n]) => n);
const heroAt = edit?.scenes.find(s => s.type === "title")?.type === "title" ? (edit!.scenes.find(s => s.type === "title") as any).shot.in + 1 : data.findings[0]?.photo.at ?? 0;

function findingPage(f: Finding, i: number) {
  const p = PRIORITY[f.priority];
  const quote = f.evidence.find(e => e.quote);
  return `<section class="finding" style="--c:${p.color}">
    <header><span class="n">${String(i + 1).padStart(2, "0")}</span><div><div class="area">${esc(f.area)}</div><h2>${esc(f.title)}</h2>
      <div class="chips"><span class="chip pri"><i></i>${p.label}</span><span class="chip">${WHO[f.who]}</span>${f.confidence !== "confirmed" ? `<span class="chip soft">${f.confidence === "likely" ? "Likely" : "Possible, verify"}</span>` : ""}</div></div></header>
    <div class="body">${figure(f.photo.at, f.photo.annotations, f.photo.crop)}
    <div class="cols">
      <div><h3>What we saw</h3><p>${esc(f.summary)}</p></div>
      <div><h3>Why it matters</h3><p>${esc(f.whyItMatters)}</p></div>
      <div class="todo"><h3>What to do</h3><p>${esc(f.recommendation)}</p></div>
    </div></div>
    ${quote ? `<blockquote>“${esc(quote.quote!.trim())}”<cite>Inspector, video ${mmss(quote.in)}</cite></blockquote>` : `<div class="evidence">In the video at ${f.evidence.map(e => `${mmss(e.in)}–${mmss(e.out)}`).join(", ")}</div>`}
  </section>`;
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(brief.property.address)}: Inspection report</title>
<style>
@font-face { font-family: Inter; src: url(assets/InterVariable.ttf); font-weight: 100 900; }
@font-face { font-family: "Inter Display"; src: url(assets/InterDisplay-Bold.ttf); font-weight: 700; }
@page { size: Letter; margin: 0.55in 0.6in 0.65in; @bottom-left { content: ""; } }
:root { --accent: ${accent}; --ink: #0b1220; --muted: #5b6577; --line: #e6e8ee; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Inter, sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.5; margin: 0; }
h1, h2 { font-family: "Inter Display", Inter, sans-serif; letter-spacing: -0.015em; margin: 0; }
.cover { height: 9.8in; display: flex; flex-direction: column; break-after: page; }
.hero { position: relative; height: 4.6in; border-radius: 18px; overflow: hidden; background: #111; }
.hero img { width: 100%; height: 100%; object-fit: cover; }
.hero .shade { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(8,12,20,.86), rgba(8,12,20,.1) 65%); }
.hero .txt { position: absolute; left: 32px; right: 32px; bottom: 28px; color: #fff; }
.kicker { font-size: 8.5pt; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--accent); }
.hero h1 { font-size: 34pt; line-height: 1.02; margin-top: 8px; }
.hero .sub { font-size: 12pt; opacity: .85; margin-top: 6px; }
.meta { display: flex; gap: 28px; margin: 22px 2px 0; font-size: 9.5pt; color: var(--muted); }
.meta b { display: block; color: var(--ink); font-size: 10.5pt; }
.glance { margin-top: 26px; padding: 22px 24px; border-radius: 16px; background: #f5f6f9; }
.glance p { font-size: 12.5pt; line-height: 1.45; margin: 8px 0 16px; }
.tiles { display: flex; gap: 12px; }
.tile { flex: 1; padding: 12px 14px; border-radius: 12px; background: #fff; border: 1px solid var(--line); }
.tile b { font-family: "Inter Display", Inter; font-size: 24pt; line-height: 1; display: block; }
.tile span { font-size: 9pt; color: var(--muted); display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.tile span i, .chip.pri i, td i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); display: inline-block; }
.brandline { margin-top: auto; display: flex; justify-content: space-between; font-size: 9pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: 12px; }
.brandline b { color: var(--ink); }
.list { break-after: page; }
.list h1, .good h1 { font-size: 22pt; margin: 6px 0 14px; }
table { width: 100%; border-collapse: collapse; font-size: 9.8pt; }
th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 600; padding: 6px 8px; border-bottom: 1.5px solid var(--ink); }
td { padding: 9px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
td.num { color: var(--muted); width: 26px; } td.pri { white-space: nowrap; } td.pri i { margin-right: 6px; }
td .fix { color: var(--muted); font-size: 9pt; }
.finding { break-inside: avoid; page-break-inside: avoid; padding-top: 4px; margin-bottom: 26px; }
.finding + .finding { border-top: 1px solid var(--line); padding-top: 22px; }
.finding header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 12px; }
.finding .n { font-family: "Inter Display", Inter; font-size: 22pt; color: var(--c); line-height: 1; padding-top: 2px; }
.finding .area { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); }
.finding h2 { font-size: 17pt; line-height: 1.15; margin: 2px 0 8px; }
.chips { display: flex; gap: 6px; }
.chip { font-size: 8.5pt; font-weight: 600; padding: 3px 10px; border-radius: 99px; background: #eef0f4; display: inline-flex; gap: 6px; align-items: center; }
.chip.pri { background: color-mix(in srgb, var(--c) 14%, white); color: color-mix(in srgb, var(--c) 70%, black); }
.chip.soft { background: #fff; border: 1px dashed #b8bfcc; }
.fig { position: relative; width: 100%; overflow: hidden; border-radius: 12px; background: #111; }
.body { display: grid; grid-template-columns: 58% 1fr; gap: 18px; align-items: start; }
.fig img { position: absolute; height: auto; }
.fig svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.fig .s { fill: none; stroke: var(--accent); stroke-width: 5; filter: drop-shadow(0 0 3px rgba(0,0,0,.6)); }
.fig .d { fill: var(--accent); }
.fig .t { font: 700 22px Inter; fill: #111; paint-order: stroke; stroke: var(--accent); stroke-width: 14px; stroke-linejoin: round; text-anchor: middle; }
.fig .ts { position: absolute; right: 10px; bottom: 10px; font-size: 8pt; font-weight: 600; color: #fff; background: rgba(0,0,0,.6); padding: 2px 8px; border-radius: 6px; }
.cols { display: flex; flex-direction: column; gap: 10px; font-size: 9.8pt; line-height: 1.42; }
.cols h3 { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin: 0 0 4px; }
.cols p { margin: 0; }
.todo p { font-weight: 600; }
blockquote { margin: 12px 0 0; padding: 8px 14px; border-left: 3px solid var(--accent); background: #fafaf7; font-style: italic; color: #333; }
cite { display: block; font-style: normal; font-size: 8.5pt; color: var(--muted); margin-top: 2px; }
.evidence { margin-top: 10px; font-size: 9pt; color: var(--muted); }
.good { break-before: page; }
.goodgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.goodgrid h3 { font-size: 11pt; margin: 8px 0 2px; } .goodgrid p { margin: 0; font-size: 9.5pt; color: #333; }
.limits { margin-top: 24px; padding: 16px 18px; border-radius: 12px; background: #f5f6f9; font-size: 9pt; color: #444; }
</style></head><body>
<section class="cover">
  <div class="hero"><img src="${photo(heroAt)}"><div class="shade"></div><div class="txt">
    <div class="kicker">${esc(brief.inspection.type)} inspection</div>
    <h1>${esc(brief.property.address)}</h1>${brief.property.city ? `<div class="sub">${esc(brief.property.city)}${brief.property.kind ? ` · ${esc(brief.property.kind)}` : ""}</div>` : ""}</div></div>
  <div class="meta"><div><b>${esc(brief.inspection.date)}</b>Inspection date</div><div><b>${esc(brief.company.name)}</b>Inspected by</div>${brief.company.people.length ? `<div><b>${esc(brief.company.people.join(", "))}</b>Inspectors</div>` : ""}</div>
  <div class="glance"><div class="kicker" style="color:var(--muted)">At a glance</div><p>${esc(data.summary)}</p>
    <div class="tiles">${counts.map(([k, n]) => `<div class="tile" style="--c:${PRIORITY[k].color}"><b>${n}</b><span><i></i>${PRIORITY[k].label}</span></div>`).join("")}${data.positives.length ? `<div class="tile" style="--c:#16A34A"><b>${data.positives.length}</b><span><i></i>Done right</span></div>` : ""}</div></div>
  <div class="brandline"><span><b>${esc(brief.company.name)}</b>${brief.company.phone ? ` · ${esc(brief.company.phone)}` : ""}${brief.company.website ? ` · ${esc(brief.company.website)}` : ""}</span><span>Companion to your highlight video</span></div>
</section>
<section class="list"><div class="kicker" style="color:var(--muted)">Summary</div><h1>Punch list</h1>
<table><thead><tr><th>#</th><th>Item</th><th>Area</th><th>Priority</th><th>Who</th><th>Video</th></tr></thead><tbody>
${sorted.map((f, i) => `<tr><td class="num">${i + 1}</td><td><b>${esc(f.title)}</b><div class="fix">${esc(f.fix)}</div></td><td>${esc(f.area)}</td><td class="pri" style="--c:${PRIORITY[f.priority].color}"><i></i>${PRIORITY[f.priority].label}</td><td>${WHO[f.who]}</td><td>${mmss(f.evidence[0].in)}</td></tr>`).join("")}
</tbody></table>
</section>
${sorted.map(findingPage).join("\n")}
${data.positives.length ? `<section class="good"><div class="kicker" style="color:var(--muted)">Good news</div><h1>Done right</h1><div class="goodgrid">
${data.positives.map(p => `<div>${figure(p.at, [])}<h3>${esc(p.title)}</h3><p>${esc(p.note)}</p></div>`).join("")}</div></section>` : ""}
${data.limitations.length ? `<div class="limits"><b>About this report.</b> ${data.limitations.map(esc).join(" ")}</div>` : ""}
</body></html>`;

writeFileSync(join(out, "report.html"), html);

const chrome = process.env.CHROME_BIN ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].find(existsSync);
if (!chrome) throw new Error("No Chrome found; set CHROME_BIN.");
execFileSync(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files",
  `--print-to-pdf=${join(job, "out", "report.pdf")}`, `file://${join(out, "report.html")}`], { stdio: "pipe", timeout: 120000 });
console.log(JSON.stringify({ pdf: join(job, "out", "report.pdf"), findings: data.findings.length }));
