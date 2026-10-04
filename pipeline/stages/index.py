"""A first watch of the whole walkthrough by a video-native model (Gemini via OpenRouter).

Writes analysis/index.json and analysis/index.md: a timestamped map of where the camera is,
how usable the footage is, and candidate issues/positives with how clearly each is on camera.
It is a starting point for the director, not a source of truth: candidates must be verified.

Cost is roughly $0.03 per minute of footage. Env: OPENROUTER_API_KEY, INDEX_MODEL.
"""
import base64
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import urllib.request
from concurrent.futures import ThreadPoolExecutor

MODEL = os.environ.get("INDEX_MODEL", "google/gemini-3.5-flash")
CHUNK = 120

PROMPT = """You are indexing raw walkthrough footage for a video editor. This clip is source time {a}s to {b}s
(clip time 0 = source {a}s; report SOURCE seconds). The person filming is: {who}.

Return ONLY JSON, no prose:
{{"segments": [{{"start": s, "end": s, "area": "where the camera is (e.g. Roof, Attic, Engine bay, Underside…)",
   "camera": "steady|walking|talking-to-camera|close-up-detail|unusable (sky/ground/blur/whip)",
   "shows": "what is on screen, concrete", "said": "gist of what is said, or empty"}}],
 "moments": [{{"at": s, "kind": "issue|positive|establishing|people",
   "what": "short description", "where_in_frame": "e.g. lower-left, centre",
   "on_camera": "clear|partial|not-shown",
   "source": "said|seen|both"}}]}}

Rules: segments cover the clip end to end (3-20 s each). For moments: 'issue' only when the person
says something is wrong or a defect is unmistakable; things they say they *look for* are not issues.
'establishing' = good wide shots of the home or vehicle. 'people' = friendly shots of the inspectors.
Timestamps to 0.5 s precision."""


def chunk_file(proxy, a, b, tmp):
    out = pathlib.Path(tmp) / f"chunk_{a:05d}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-t", str(b - a), "-i", str(proxy),
                    "-vf", "scale=-2:360,fps=2", "-c:v", "libx264", "-crf", "32", "-preset", "veryfast",
                    "-c:a", "aac", "-b:a", "32k", "-ac", "1", str(out)], check=True)
    return out


def ask(path, a, b, who):
    body = {"model": MODEL, "messages": [{"role": "user", "content": [
        {"type": "text", "text": PROMPT.format(a=a, b=b, who=who)},
        {"type": "video_url", "video_url": {"url": "data:video/mp4;base64," + base64.b64encode(path.read_bytes()).decode()}}]}]}
    for attempt in range(3):
        req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + os.environ["OPENROUTER_API_KEY"], "Content-Type": "application/json"})
        d = json.load(urllib.request.urlopen(req, timeout=600))
        text = d["choices"][0]["message"]["content"].strip()
        text = text[text.find("{"): text.rfind("}") + 1]
        try:
            return json.loads(text), float((d.get("usage") or {}).get("cost") or 0)
        except ValueError:
            continue
    raise RuntimeError(f"index model returned unreadable output for {a}-{b}s")


def stamp(t):
    t = int(t)
    return f"{t // 60:02}:{t % 60:02}"


def main():
    job = pathlib.Path(sys.argv[1])
    if (job / "analysis" / "index.json").exists():
        return
    duration = json.loads((job / "analysis" / "probe.json").read_text())["duration"]
    brief = json.loads((job / "brief.json").read_text())
    # The model and trim help the indexer name parts; a street address wouldn't.
    subject = (brief.get("subject") or {}).get("title", "") if brief.get("vehicle") else ""
    who = f"{brief['company']['name']} doing a {brief['inspection']['type'].lower()} inspection" + (f" of {subject}" if subject else "")
    windows = [(a, min(duration, a + CHUNK)) for a in range(0, int(duration) + 1, CHUNK) if a < duration - 1]
    with tempfile.TemporaryDirectory() as tmp:
        files = [chunk_file(job / "media" / "proxy.mp4", a, b, tmp) for a, b in windows]
        with ThreadPoolExecutor(6) as pool:
            results = list(pool.map(lambda w: ask(w[0], w[1][0], w[1][1], who), zip(files, windows)))
    segments = [s for r, _ in results for s in r.get("segments", [])]
    moments = sorted((m for r, _ in results for m in r.get("moments", [])), key=lambda m: m.get("at", 0))
    cost = sum(c for _, c in results)
    (job / "analysis" / "index.json").write_text(json.dumps({"model": MODEL, "segments": segments, "moments": moments}, indent=1))
    lines = [f"# Video index ({MODEL}; candidates, verify before use)", "", "## Moments"]
    lines += [f"- {stamp(m['at'])} [{m.get('kind')}] {m.get('what')} (on camera: {m.get('on_camera')}, {m.get('where_in_frame', '')}; from: {m.get('source')})" for m in moments]
    lines += ["", "## Segments"]
    lines += [f"- {stamp(s['start'])}–{stamp(s['end'])} {s.get('area', '')} · {s.get('camera', '')} · {s.get('shows', '')}" + (f" — “{s['said']}”" if s.get("said") else "") for s in segments]
    (job / "analysis" / "index.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"segments": len(segments), "moments": len(moments), "costUsd": round(cost, 3)}))


if __name__ == "__main__":
    main()
