# Inspect Flow pipeline

Turns a raw walkthrough video into a **2–3 minute highlight reel** and a **PDF report**.
An AI director agent watches the footage, decides what matters, and edits the reel with a
designed scene library. The renderer and report builder are deterministic, so the same edit
always produces the same video.

```
upload ─► ingest ─► transcribe ─► director agent ──────────────► render ─► out/highlight-reel.mp4
          proxy      local         (Claude Code, headless,        HTML→MP4    out/report.pdf
          filmstrip  faster-       in this container)             (HyperFrames) summary.md
          shot cuts  whisper       writes findings.json + edit.json
                                   uses tools: frames, voice, music,
                                   build, snap, render, report
```

## Why it's built this way

- **The agent works like an editor, not a script runner.** It reads the transcript, looks at every
  filmstrip, pulls full-resolution frames to verify what it's claiming, writes the narration,
  places annotations from gridded frames, then *looks at snapshots of its own edit* and fixes
  mistakes before rendering.
- **Creative choices are the agent's; the look is ours.** The agent writes an edit decision list
  (`edit.json`), and `reel/compile.ts` turns it into a HyperFrames composition using a fixed
  design system (`reel/theme.css`). Every video looks professional and on-brand, and the
  storyboard is plain data a UI can show and let people edit before rendering.
- **One provider key.** Agent, narration, and music go through OpenRouter. The default director
  is `anthropic/claude-opus-5.5`; any OpenRouter model id works via `AGENT_MODEL`. Transcription
  runs locally (free, private).

## Contracts (`reel/schema.ts`)

| File | Written by | Read by |
|---|---|---|
| `brief.json` | the app (user's form) | agent, compiler, report |
| `findings.json` | agent (later: editable in app) | compiler, report, app review screen |
| `edit.json` | agent (later: storyboard editor) | voice/music tools, compiler |
| `reel/timeline.json` | compiler | agent (snap times), app (storyboard timing) |

Scene types: `title`, `overview` (counts computed from findings), `finding` (footage +
card + optional freeze-zoom callout), `montage` ("done right"), `punchlist`, `outro`.
Voice modes: `ai` (agent writes the script; TTS via `openai/gpt-audio-mini` with a
word-for-word check) or `source` (the inspector's own words, cut on word boundaries).

## Run a job

```sh
docker build -t inspect-flow-worker:dev pipeline
mkdir -p job/input && cp walkthrough.mp4 job/input/walkthrough.mp4 && $EDITOR job/brief.json
docker run --rm --shm-size=2g --env-file .env -v "$PWD/job:/job" inspect-flow-worker:dev
python3 pipeline/tools/progress.py job        # live progress + spend
```

`.env` needs `OPENROUTER_API_KEY`. Optional: `AGENT_MODEL`, `TTS_MODEL`, `MUSIC_MODEL`,
`AGENT_MAX_TURNS`, `RENDER_QUALITY` (`draft|looks|delivery`).

## Layout

```
stages/      ingest.py (proxy, shot cuts, filmstrip), transcribe.py (faster-whisper)
tools/       frames.py, audio.py (voice + music via OpenRouter), progress.py
bin/         the agent's commands (thin wrappers; run from a job directory)
reel/        schema.ts, compile.ts, theme.css, assets/ (fonts, GSAP)
report/      compile.ts (HTML → PDF with headless Chrome)
agent/       PLAYBOOK.md (director instructions), KICKOFF.md, profiles/<domain>.md
run-job.sh   container entrypoint
```

New report types (car inspection, remodel progress) are a new `agent/profiles/*.md` plus,
where needed, scene variants: the pipeline doesn't change.
