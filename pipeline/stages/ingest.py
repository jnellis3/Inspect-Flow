"""Prepare a job's source footage for analysis and editing.

Inputs:  <job>/input/walkthrough.*   (any container/codec ffmpeg can decode)
Outputs: <job>/media/proxy.mp4        1080p H.264, 1s GOP: fast, frame-accurate seeking for the renderer
         <job>/media/audio16k.wav     mono 16 kHz for transcription
         <job>/analysis/probe.json    source facts (duration, size, rotation, fps, audio)
         <job>/analysis/shots.json    hard-cut boundaries, so edits don't straddle a cut
         <job>/analysis/filmstrip/    timestamped contact sheets (1 frame / 2 s) for the agent's first look

Every step is skipped when its output already exists, so the stage is resumable.
"""
import argparse
import json
import math
import pathlib
import re
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont

FONT = pathlib.Path(__file__).resolve().parent.parent / "reel" / "assets" / "fonts" / "Inter.ttf"


def run(args, **kw):
    r = subprocess.run(args, capture_output=True, text=True, **kw)
    if r.returncode:
        raise RuntimeError(f"{args[0]} failed: {r.stderr[-3000:]}")
    return r


def has_nvenc():
    r = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True)
    if "h264_nvenc" not in r.stdout:
        return False
    # The encoder can be compiled in without a usable GPU; prove it with a tiny encode.
    t = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=s=256x256:d=0.1", "-c:v", "h264_nvenc", "-f", "null", "-"], capture_output=True)
    return t.returncode == 0


def stamp(t):
    t = int(t)
    return f"{t // 60:02}:{t % 60:02}"


def probe(src):
    meta = json.loads(run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(src)]).stdout)
    video = next((s for s in meta["streams"] if s["codec_type"] == "video"), None)
    if not video:
        raise ValueError("The upload has no readable video stream.")
    rotation = 0
    for sd in video.get("side_data_list", []):
        if "rotation" in sd:
            rotation = int(float(sd["rotation"]))
    rotation = rotation or int(float(video.get("tags", {}).get("rotate", 0)))
    w, h = video["width"], video["height"]
    if abs(rotation) % 180 == 90:
        w, h = h, w
    num, den = (video.get("avg_frame_rate") or "30/1").split("/")
    return {
        "duration": float(meta["format"].get("duration") or video.get("duration")),
        "width": w, "height": h, "rotation": rotation,
        "fps": round(float(num) / float(den or 1), 3) if float(den or 1) else 30,
        "videoCodec": video["codec_name"],
        "hasAudio": any(s["codec_type"] == "audio" for s in meta["streams"]),
        "sizeBytes": int(meta["format"]["size"]),
    }


def make_proxy(src, dst, info):
    # Landscape proxies are 1920 wide, portrait ones 1080 wide; ffmpeg applies rotation metadata itself.
    scale = "scale=1920:-2" if info["width"] >= info["height"] else "scale=1080:-2"
    if has_nvenc():
        enc = ["-c:v", "h264_nvenc", "-preset", "p5", "-cq", "23"]
    else:
        enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21"]
    tmp = dst.with_suffix(".tmp.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", f"{scale}:flags=lanczos,fps=30", *enc,
         "-g", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(tmp)])
    tmp.replace(dst)


def detect_shots(proxy, out):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(proxy), "-an", "-vf", "scale=320:-2,select='gt(scene,0.32)',showinfo", "-f", "null", "-"],
                       capture_output=True, text=True)
    cuts = sorted({round(float(m), 2) for m in re.findall(r"pts_time:([\d.]+)", r.stderr)})
    out.write_text(json.dumps({"cuts": cuts}, indent=1))
    return cuts


def filmstrip(proxy, duration, outdir, every=2, cols=5, rows=6):
    """Contact sheets of 384x216 frames, each labeled with its source time."""
    outdir.mkdir(parents=True, exist_ok=True)
    frames = outdir / "_frames"
    frames.mkdir(exist_ok=True)
    run(["ffmpeg", "-v", "error", "-y", "-i", str(proxy), "-vf", f"fps=1/{every},scale=384:216:force_original_aspect_ratio=decrease,pad=384:216:(ow-iw)/2:(oh-ih)/2",
         "-q:v", "4", str(frames / "f_%05d.jpg")])
    files = sorted(frames.glob("f_*.jpg"))
    font = ImageFont.truetype(str(FONT), 20) if FONT.exists() else ImageFont.load_default()
    per = cols * rows
    sheets = []
    for k in range(0, len(files), per):
        sheet = Image.new("RGB", (cols * 384, rows * 216), "#111")
        draw = ImageDraw.Draw(sheet)
        for j, f in enumerate(files[k:k + per]):
            t = (k + j) * every  # fps filter emits the frame at t=0,2,4...
            x, y = (j % cols) * 384, (j // cols) * 216
            sheet.paste(Image.open(f), (x, y))
            draw.rectangle((x, y, x + 74, y + 28), fill="#000")
            draw.text((x + 6, y + 3), stamp(t), font=font, fill="#ffd23f")
        start, end = k * every, min(duration, (k + per) * every)
        name = f"sheet_{len(sheets) + 1:02}_{stamp(start).replace(':', '')}-{stamp(end).replace(':', '')}.jpg"
        sheet.save(outdir / name, quality=82)
        sheets.append({"file": name, "start": start, "end": end})
    shutil.rmtree(frames)
    return sheets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("job", type=pathlib.Path)
    args = ap.parse_args()
    job = args.job
    src = next((p for p in sorted((job / "input").glob("walkthrough.*"))), None)
    if not src:
        raise SystemExit("No input/walkthrough.* in job")
    media, analysis = job / "media", job / "analysis"
    media.mkdir(exist_ok=True)
    analysis.mkdir(exist_ok=True)

    info = probe(src)
    if not 1 <= info["duration"] <= 90 * 60:
        raise SystemExit("Video must be between 1 second and 90 minutes.")
    (analysis / "probe.json").write_text(json.dumps(info, indent=1))

    proxy = media / "proxy.mp4"
    if not proxy.exists():
        make_proxy(src, proxy, info)
    if info["hasAudio"] and not (media / "audio16k.wav").exists():
        run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(media / "audio16k.wav")])
    if not (analysis / "shots.json").exists():
        detect_shots(proxy, analysis / "shots.json")
    if not (analysis / "filmstrip" / "index.json").exists():
        sheets = filmstrip(proxy, info["duration"], analysis / "filmstrip")
        (analysis / "filmstrip" / "index.json").write_text(json.dumps(sheets, indent=1))
    print(json.dumps({"duration": info["duration"], "size": [info["width"], info["height"]], "audio": info["hasAudio"]}))


if __name__ == "__main__":
    main()
