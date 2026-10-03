"""Pull frames from the job's footage so the agent can look closely.

  frames <job> 152.5                      one frame, 1600px wide, from the full-resolution source
  frames <job> 152.5 --grid               same, with a 10% coordinate grid for placing annotations
  frames <job> 152.5 --crop .4,.3,.3,.3   zoom into a region (x,y,w,h as fractions of the frame)
  frames <job> 150 152 154 156            several moments tiled into one labeled sheet
  frames <job> --range 150 158 --step 0.5 a strip across a range (camera steadiness, freeze points)
  frames <job> --evidence 90-112 213-221   one evidence sheet per window: a 12-frame strip across it
                                          (sharpest frame outlined) above a full-resolution, gridded
                                          still of that sharpest frame. Many windows per call.

  frames <job> --src media/supporting/roof.jpg --grid   a supporting photo (time ignored) or clip

Prints the path of the image it wrote (under <job>/scratch/frames/).
Coordinates are always fractions of the full frame: x=0 left, x=1 right, y=0 top, y=1 bottom.
"""
import argparse
import hashlib
import io
import json
import math
import pathlib
import subprocess
from concurrent.futures import ThreadPoolExecutor
from PIL import ImageFilter, ImageStat
from PIL import Image, ImageDraw, ImageFont

FONT = pathlib.Path(__file__).resolve().parent.parent / "reel" / "assets" / "fonts" / "Inter.ttf"


def font(size):
    try:
        return ImageFont.truetype(str(FONT), size)
    except OSError:
        return ImageFont.load_default()


def source(job):
    src = next(iter(sorted((job / "input").glob("walkthrough.*"))), None)
    return src or job / "media" / "proxy.mp4"


def grab(path, t):
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", str(path), "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"],
                       capture_output=True)
    if r.returncode or not r.stdout:
        raise SystemExit(f"Could not read a frame at {t}s: {r.stderr.decode()[-400:]}")
    return Image.open(io.BytesIO(r.stdout)).convert("RGB")


def stamp(t):
    return f"{int(t) // 60:02}:{t % 60:05.2f}"


def draw_grid(img, region=(0, 0, 1, 1)):
    """Label gridlines in full-frame coordinates even when showing a crop."""
    d = ImageDraw.Draw(img, "RGBA")
    W, H = img.size
    rx, ry, rw, rh = region
    f = font(max(14, W // 90))
    step = 0.1 if rw > 0.5 else 0.05 if rw > 0.2 else 0.02
    v = math.ceil(rx / step) * step
    while v < rx + rw - 1e-9:
        px = (v - rx) / rw * W
        d.line([(px, 0), (px, H)], fill=(255, 210, 63, 140), width=1)
        d.text((px + 3, 3), f"{v:.2f}", font=f, fill=(255, 210, 63, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
        v += step
    v = math.ceil(ry / step) * step
    while v < ry + rh - 1e-9:
        py = (v - ry) / rh * H
        d.line([(0, py), (W, py)], fill=(255, 210, 63, 140), width=1)
        d.text((3, py + 3), f"{v:.2f}", font=f, fill=(255, 210, 63, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
        v += step


def label(img, text):
    d = ImageDraw.Draw(img)
    f = font(max(18, img.width // 60))
    box = d.textbbox((0, 0), text, font=f)
    d.rectangle((0, 0, box[2] + 16, box[3] + 12), fill="#000")
    d.text((8, 5), text, font=f, fill="#ffd23f")


def sharpness(img):
    g = img.convert("L").resize((480, 270))
    return ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).var[0]


def evidence(job, window, src_full, proxy, out_dir, duration):
    a, b = (float(v) for v in window.split("-"))
    a, b = max(0, a), min(duration - 0.05, b)
    n = 12
    times = [round(a + (b - a) * i / (n - 1), 2) for i in range(n)]
    with ThreadPoolExecutor(6) as pool:
        frames = list(pool.map(lambda t: grab(proxy, t), times))
    scores = [sharpness(f) for f in frames]
    best = max(range(n), key=lambda i: scores[i])
    still = grab(src_full, times[best])
    still = still.resize((1920, round(still.height * 1920 / still.width)), Image.LANCZOS)
    draw_grid(still)
    label(still, f"{stamp(times[best])}  auto-picked sharpest frame, full res (choose another with: frames <t> --grid)")
    tw, th = 320, round(320 * frames[0].height / frames[0].width)
    sheet = Image.new("RGB", (1920, 2 * th + still.height), "#111")
    d = ImageDraw.Draw(sheet)
    for i, (t, f) in enumerate(zip(times, frames)):
        tile = f.resize((tw, th), Image.LANCZOS)
        label(tile, stamp(t))
        x, y = (i % 6) * tw, (i // 6) * th
        sheet.paste(tile, (x, y))
        if i == best:
            d.rectangle((x + 2, y + 2, x + tw - 3, y + th - 3), outline="#ffd23f", width=5)
    sheet.paste(still, (0, 2 * th))
    out = out_dir / f"evidence_{a:08.2f}-{b:08.2f}.jpg"
    sheet.save(out, quality=86)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job", type=pathlib.Path)
    ap.add_argument("times", nargs="*", type=float)
    ap.add_argument("--range", nargs=2, type=float)
    ap.add_argument("--evidence", nargs="+", metavar="A-B")
    ap.add_argument("--src", help="a supporting clip or photo (path from analysis/supporting.json)")
    ap.add_argument("--step", type=float, default=1.0)
    ap.add_argument("--crop", help="x,y,w,h fractions of the frame")
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--width", type=int, default=1600)
    args = ap.parse_args()

    if args.evidence:
        duration = json.loads((args.job / "analysis" / "probe.json").read_text())["duration"]
        out_dir = args.job / "scratch" / "frames"
        out_dir.mkdir(parents=True, exist_ok=True)
        for w in args.evidence:
            print(evidence(args.job, w, source(args.job), args.job / "media" / "proxy.mp4", out_dir, duration))
        return

    times = list(args.times)
    if args.range:
        a, b = args.range
        n = int(round((b - a) / args.step)) + 1
        times += [round(a + i * args.step, 3) for i in range(min(n, 48))]
    if not times and not args.src:
        raise SystemExit("Give one or more times, or --range A B.")
    if args.src:
        src_path = args.job / args.src
        if not src_path.exists():
            raise SystemExit(f"No such supporting file: {args.src}")
        if src_path.suffix.lower() == ".jpg":
            times = [0.0]
            duration = 1.0
        else:
            info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(src_path)], capture_output=True, text=True).stdout)
            duration = float(info["format"]["duration"])
    else:
        duration = json.loads((args.job / "analysis" / "probe.json").read_text())["duration"]
    times = [min(max(0, t), duration - 0.05) for t in times or [0.0]]
    region = tuple(float(v) for v in args.crop.split(",")) if args.crop else (0, 0, 1, 1)
    # Single frames come from the full-resolution original (detail for crops and stills);
    # strips and sheets use the 1080p proxy, which seeks an order of magnitude faster.
    src = args.job / args.src if args.src else source(args.job) if len(times) == 1 else args.job / "media" / "proxy.mp4"

    def cropped(t):
        img = Image.open(src).convert("RGB") if src.suffix.lower() == ".jpg" else grab(src, t)
        W, H = img.size
        x, y, w, h = region
        return t, img.crop((int(x * W), int(y * H), int((x + w) * W), int((y + h) * H)))

    with ThreadPoolExecutor(6) as pool:
        tiles = list(pool.map(cropped, times))

    out_dir = args.job / "scratch" / "frames"
    out_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(json.dumps([times, region, args.grid, args.width]).encode()).hexdigest()[:10]

    if len(tiles) == 1:
        t, img = tiles[0]
        img = img.resize((args.width, max(1, round(img.height * args.width / img.width))), Image.LANCZOS)
        if args.grid:
            draw_grid(img, region)
        label(img, stamp(t) + (f"  crop {args.crop}" if args.crop else ""))
        out = out_dir / f"frame_{t:08.2f}_{key}.jpg"
    else:
        cols = 4 if len(tiles) > 6 else 3 if len(tiles) > 4 else 2
        tw = max(320, args.width // cols)
        th = round(tw * tiles[0][1].height / tiles[0][1].width)
        rows = math.ceil(len(tiles) / cols)
        img = Image.new("RGB", (cols * tw, rows * th), "#111")
        for i, (t, tile) in enumerate(tiles):
            tile = tile.resize((tw, th), Image.LANCZOS)
            if args.grid:
                draw_grid(tile, region)
            label(tile, stamp(t))
            img.paste(tile, ((i % cols) * tw, (i // cols) * th))
        out = out_dir / f"sheet_{times[0]:08.2f}-{times[-1]:08.2f}_{key}.jpg"
    img.save(out, quality=88)
    print(out)


if __name__ == "__main__":
    main()
