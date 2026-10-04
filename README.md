# Inspect Flow

Upload a raw inspection walkthrough video; get back a **2–3 minute narrated highlight reel** and a
matching **PDF report** that a homeowner will actually watch and act on.

An AI director watches the footage, finds every issue the inspector pointed out (plus close-up
photos you attach), picks the clearest shots, freezes and labels each problem, writes the
narration (or uses your own voice), and checks its own edit before rendering. Don't like
something? Ask for changes in plain words and it re-edits.

## Run it

Requires Docker with Compose and an [OpenRouter](https://openrouter.ai/keys) API key.

```sh
cp .env.example .env        # paste your OPENROUTER_API_KEY
docker compose up -d --build
```

Open **http://localhost:3000** and create the first account (registration closes after it unless
`ALLOW_REGISTRATION=true`). Use a passphrase of at least 15 characters; there is no password
recovery yet.

> In OpenRouter, turn **off** the *Sensitive Info* guardrail for this key. It redacts addresses
> and emails the report needs, and it blocks long agent sessions (`redaction_context_lost`).

## How it works

```
 browser ──► app (Next.js) ──writes──► /data/jobs/<project>/ ◄──watches── worker (pipeline image)
              accounts, uploads,       brief.json, input/, supporting/      ingest → transcribe → video index
              progress, outputs        request.json, status.json, out/      → AI director → render → PDF
```

- **app** (this directory): accounts, projects, resumable chunked uploads, live progress, video
  playback and downloads, change requests. SQLite + files on the `inspection-data` volume.
- **worker** ([`pipeline/`](pipeline/README.md)): runs one job at a time. The director is Claude
  Code running headless inside the container, talking to OpenRouter; narration
  (`openai/gpt-audio-mini`), music (`google/lyria-3-pro-preview`) and the first-pass video index
  (`google/gemini-3.5-flash`) also go through OpenRouter. Transcription runs locally.
- The two share nothing but the volume: the app writes a job directory and `status.json:
  queued`; the worker picks it up and writes progress, results and outputs back.

Typical job: 30–60 minutes for a 10-minute walkthrough, a few dollars of API usage with the default
Sonnet 5.5 director. Set `AGENT_MODEL=anthropic/claude-opus-5.5` for the premium director.

## Production: app on a small server, video engines on RunPod

The video worker needs real CPU and memory only while a video is being made, so in production
the app runs alone on a small server and starts a **RunPod** GPU pod per batch of work:

```
 Caddy (TLS) ──► app (compose.prod.yaml) ──REST──► RunPod: starts/terminates pods on demand
                   ▲  /api/worker/* (token)                │
                   └───────────────────────────────────────┘ pod pulls ghcr.io/<owner>/inspect-flow-worker,
                                                             claims a job, uploads results, idles out
```

```sh
git clone https://github.com/jnellis3/Inspect-Flow.git && cd Inspect-Flow
cat > .env <<EOF   # chmod 600
APP_ORIGIN=https://your.domain
BIND_ADDRESS=<private IP your proxy can reach>
OPENROUTER_API_KEY=...
RUNPOD_API_KEY=...
EOF
docker compose -f compose.prod.yaml up -d
scripts/install-autodeploy.sh        # optional: deploy every push to main automatically
```

- **CI/CD:** every push to `main` runs the checks and, only if they pass, publishes
  `ghcr.io/<owner>/inspect-flow` (app) and `ghcr.io/<owner>/inspect-flow-worker` (worker). With
  autodeploy installed, the server fast-forwards its checkout and pulls the new app image within
  two minutes (`journalctl -u inspect-flow-deploy`); new RunPod pods always start from the
  newest worker image. Both GHCR packages must be **public** so the server and RunPod can pull them.
- Pods reach the app at `APP_ORIGIN` (override with `WORKER_APP_URL`) using a token the app
  generates and stores on its volume. A pod is terminated 4 minutes after the queue empties;
  one that never connects is replaced; a job whose worker goes silent is requeued.
- Pod shape: `RUNPOD_GPU_TYPES` (comma-separated RunPod GPU ids; default A4000/A4500/A5000/
  4000 Ada/3090), `RUNPOD_CLOUD_TYPE` (`SECURE`), `RUNPOD_DISK_GB` (80), `RUNPOD_MIN_VCPU` (8),
  `RUNPOD_MIN_RAM_GB` (24). Roughly $0.25/h while a job runs.
- Revisions work across pods: after each run the worker uploads the agent's working state
  (session, edit, audio) to the app, and the next pod restores it.

## Spectora integration

Inspectors who schedule and publish in [Spectora](https://www.spectora.com) can connect it under
**Integrations** (the plug icon). Spectora's public API uses company-scoped API keys, so each
account pastes its own key; it is verified against Spectora and stored encrypted.

```
 Spectora ──webhook──► /api/integrations/spectora/webhook/<token> ──► re-read inspection via API
                                                                       └─► new project, pre-filled
 video finishes ──► poster frame attached to the Spectora inspection, named after /w/<share token>
```

- **Inspections in:** Spectora registers webhooks from its own dashboard (Integrations → Custom
  integrations → Webhooks → *Add Endpoint*). The settings page shows the URL to paste and the
  events to tick. Each delivery is treated as a hint only: the inspection is re-read with the
  company's key before a project is created, so a forged POST cannot create anything.
- **Videos out:** Spectora attachments accept images only (JPG, PNG, GIF; no PDF or video), so the
  reel's poster frame is attached as an *Additional Document* whose filename and description carry
  the public watch link. The watch page (`/w/<token>`) streams the reel and report to anyone with
  the link, needs no account, and can be turned off per project.
- **Field mapping:** Spectora does not publish the inspection schema. `lib/inspection/spectora/
  client.ts` reads several plausible attribute names; the raw record is kept on each link and
  shown by `GET /api/projects/<id>/spectora` so the mapping can be tuned against real data.
- Set `SPECTORA_API_BASE` to point at a different host (default `https://connect.spectora.com`).

## Configuration (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | Required by the worker (agent, narration, music, video index). |
| `AGENT_MODEL` | `anthropic/claude-sonnet-5.5` | Director model; any OpenRouter id. |
| `APP_ORIGIN` | `http://localhost:3000` | Exact public origin (CSRF and cookies). HTTPS required beyond localhost. |
| `BIND_ADDRESS` / `PORT` | `127.0.0.1` / `3000` | Where the app is published on the host. |
| `ALLOW_REGISTRATION` | `false` | Allow accounts beyond the first. |
| `APP_SECRET_KEY` | generated | 64 hex chars; encrypts stored third-party API keys. Kept at `$DATA_DIR/.secret-key` if unset. |

To keep the key out of `.env`, put it in `secrets/openrouter_api_key` and run
`docker compose -f compose.yaml -f compose.secrets.yaml up -d --build`.

For remote access, put a TLS reverse proxy (e.g. Caddy) in front of the app, set `APP_ORIGIN`
to the public `https://` origin, and allow request bodies of at least 9 MB (upload parts are 8 MB).

## Data and backups

Everything lives in the `inspection-data` volume: the SQLite database, uploaded media, and each
project's job directory (working files and outputs). **`docker compose down -v` deletes it all.**
To back up, stop both services and copy the volume (`docker compose cp app:/data ./backups/<date>`).

## Development

```sh
npm ci && npm run dev          # app on :3000 (DATA_DIR=./data)
npm run typecheck && npm test
npm run audit:privacy          # before committing
```

`scripts/e2e.mjs` drives a full job against a **disposable** installation (it signs up a test
account and spends API credit): `E2E_ORIGIN=http://localhost:3100 node scripts/e2e.mjs clip.mp4`.
See [`pipeline/README.md`](pipeline/README.md) for the video pipeline itself.
