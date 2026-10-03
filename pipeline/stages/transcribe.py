"""Transcribe a job's audio with word-level timestamps.

Writes analysis/transcript.json (segments + words) and analysis/transcript.txt
(one timestamped line per segment, the form agents read most easily).

Runs locally with faster-whisper so footage never leaves the host. Uses CUDA
when available and falls back to CPU int8.
"""
import argparse
import ctypes
import glob
import json
import os
import pathlib
import site
import sys
import time


def preload_cuda_libs():
    # pip-installed NVIDIA wheels aren't on the loader path; preload them so
    # ctranslate2 can find cuBLAS/cuDNN without LD_LIBRARY_PATH gymnastics.
    for root in site.getsitepackages():
        for lib in sorted(glob.glob(os.path.join(root, "nvidia", "*", "lib", "*.so*"))):
            try:
                ctypes.CDLL(lib, mode=ctypes.RTLD_GLOBAL)
            except OSError:
                pass


def pick_device():
    """WHISPER_DEVICE if set; otherwise CUDA only when a GPU *and* its libraries are usable.
    (A GPU pod without cuBLAS would otherwise fail mid-transcription.)"""
    wanted = os.environ.get("WHISPER_DEVICE", "auto")
    if wanted != "auto":
        return wanted
    import ctranslate2
    if ctranslate2.get_cuda_device_count() == 0:
        return "cpu"
    try:
        ctypes.CDLL("libcublas.so.12")
        return "cuda"
    except OSError:
        return "cpu"


def stamp(t):
    t = int(t)
    return f"{t // 60:02}:{t % 60:02}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("job", type=pathlib.Path)
    ap.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "auto"))
    ap.add_argument("--device", default="auto")
    args = ap.parse_args()

    audio = args.job / "media" / "audio16k.wav"
    out = args.job / "analysis"
    out.mkdir(parents=True, exist_ok=True)

    preload_cuda_libs()
    from faster_whisper import WhisperModel
    device = pick_device() if args.device == "auto" else args.device
    compute = "float16" if device == "cuda" else "int8"
    if args.model == "auto":  # medium is worth it on a GPU; small keeps CPU-only hosts fast
        args.model = "medium.en" if device == "cuda" else "small.en"
    started = time.time()
    model = WhisperModel(args.model, device=device, compute_type=compute)
    # Decode the 16 kHz mono WAV ourselves: faster-whisper's PyAV path breaks
    # across PyAV releases, and the prepare stage already normalized the audio.
    import numpy as np
    import wave
    with wave.open(str(audio)) as w:
        samples = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    segments, info = model.transcribe(
        samples, word_timestamps=True, vad_filter=True, beam_size=5,
        condition_on_previous_text=False,
    )
    result = {"language": info.language, "duration": info.duration, "model": args.model, "segments": []}
    lines = []
    for s in segments:
        words = [{"start": round(w.start, 2), "end": round(w.end, 2), "word": w.word.strip(), "p": round(w.probability, 3)} for w in (s.words or [])]
        result["segments"].append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(), "words": words})
        lines.append(f"[{stamp(s.start)}-{stamp(s.end)}] {s.text.strip()}")
        print(lines[-1], file=sys.stderr)
    (out / "transcript.json").write_text(json.dumps(result, indent=1))
    (out / "transcript.txt").write_text("\n".join(lines) + "\n")
    print(json.dumps({"segments": len(lines), "device": device, "seconds": round(time.time() - started, 1)}))


if __name__ == "__main__":
    main()
