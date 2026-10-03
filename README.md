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

## Configuration (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | Required by the worker (agent, narration, music, video index). |
| `AGENT_MODEL` | `anthropic/claude-sonnet-5.5` | Director model; any OpenRouter id. |
| `APP_ORIGIN` | `http://localhost:3000` | Exact public origin (CSRF and cookies). HTTPS required beyond localhost. |
| `BIND_ADDRESS` / `PORT` | `127.0.0.1` / `3000` | Where the app is published on the host. |
| `ALLOW_REGISTRATION` | `false` | Allow accounts beyond the first. |

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
