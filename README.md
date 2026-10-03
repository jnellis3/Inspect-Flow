# Inspect Flow

A self-hosted workspace for reviewing home walkthrough videos, discussing tentative observations, and producing matching homeowner recap videos and PDF reports after inspector approval.

## Run with Docker

Requires Docker Engine with Docker Compose. No Sites or Cloudflare account is needed.

```sh
git clone git@github.com:jnellis3/Inspect-Flow.git
cd Inspect-Flow
cp .env.example .env
docker compose up -d --build
```

Open **http://localhost:3000** and create the first account. The default deployment binds to localhost, and registration closes after the first account. Use a passphrase of at least 15 characters. There is no password-recovery flow yet, so retain it in a password manager.

The app works without an API key for saving footage, notes, and manual findings. Analysis, review chat, generated narration, and export require an OpenAI API project with access to the configured Agents API/model and audio services. The application is self-hosted; AI inference and the processing/rendering sandbox run on OpenAI and can incur API charges. Uploaded footage, sampled evidence, notes, and narration needed for these operations are sent to OpenAI when you start them.

## Configure OpenAI securely

Prefer a mounted secret file:

1. Create `secrets/openai_api_key` locally using your editor or secret manager. Put only the API key in the file. Keep the directory private and the file readable by the container's `node` user (UID 1000).
2. Start with the secret override:

```sh
docker compose -f compose.yaml -f compose.secrets.yaml up -d --build
```

Alternatively set `OPENAI_API_KEY` in your untracked `.env`. Do not put keys in source code, browser storage, build arguments, or chat. `.env`, `secrets/`, local databases, and media are ignored by Git; the Docker build context uses an allowlist and excludes these files. Secrets are read only on the server at runtime and are not supplied to the agent sandbox. Recreate the container after changing configuration. Keep the same Compose file combination for subsequent commands when using mounted secrets.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | `http://localhost:3000` | Exact browser origin for CSRF checks and cookie policy. External origins require HTTPS. |
| `BIND_ADDRESS` | `127.0.0.1` | Host interface published by Compose. |
| `PORT` | `3000` | Published host port; update `APP_ORIGIN` if changed. |
| `OPENAI_API_KEY` | empty | Server-only API credential; optional until AI is used. |
| `OPENAI_API_KEY_FILE` | unset | Runtime secret file, enabled by `compose.secrets.yaml`. |
| `OPENAI_MODEL` | `gpt-6.1-sol` | Agents model; no silent fallback. |
| `ALLOW_REGISTRATION` | `false` | Set `true` deliberately to allow additional accounts. |
| `DATA_DIR` | `/data` in Docker | Database, private media, and in-progress uploads. |

For remote access, finish initial account creation on localhost, then put a trusted HTTPS reverse proxy in front of the app and set `APP_ORIGIN=https://your-host.example`. Preserve the browser's Origin header. Allow upload chunks of at least 8 MiB and processing requests up to four minutes. Configure proxy access restrictions and rate limits appropriate to your deployment. The app does not trust forwarded identity/IP headers for authentication or rate limiting. Authentication attempts are limited by username and across the instance.

## Persistent storage and backups

Compose creates a named `inspection-data` volume mounted at `/data`. SQLite stores accounts, sessions, projects, review decisions, and jobs; the same volume stores video, evidence, multipart uploads, and exports. Migrations apply automatically. Container restart/recreation preserves this volume. **Do not run `docker compose down -v` unless you intend to delete all inspection data.**

Run one application instance against one local volume. This version does not support multiple replicas or a shared network filesystem.

For a consistent backup, stop the app and copy `/data` from the stopped container to a private backup folder:

```sh
mkdir -p backups
docker compose stop app
docker compose cp app:/data ./backups/inspection-data
docker compose start app
```

Use a new destination per backup. Protect backups: they contain footage, account password hashes, sessions, and inspection details. To restore, stop the app, restore the complete directory into its data volume, ensure UID/GID 1000 can read/write it, then start it. Restore SQLite together with its WAL files and object storage; do not mix snapshots. API secrets are backed up separately.

## How processing works

1. Upload the source in resumable chunks; choose the same file to resume an interrupted upload.
2. OpenAI Agents runs the supplied preparation script in a hosted environment with outbound network disabled. It samples up to 120 frames, at intervals of at least 10 seconds, and extracts narration audio.
3. Whisper transcribes optional spoken notes. The agent reviews sampled images, notes, and the timestamped transcript and proposes tentative findings.
4. Validate, edit, approve, or dismiss each finding. Review chat receives the saved text context; it does not automatically rewatch additional footage. Invalid structured findings can receive at most two format-repair turns.
5. Approve the generated narration script. OpenAI speech generation uses the Cedar voice.
6. A fixed FFmpeg/Python renderer in an OpenAI-hosted session assembles selected source clips, annotations, explanatory cards/diagrams, and narration. A PDF is produced from the same approved snapshot. Output manifests, revisions, sizes, and checksums are checked before download is enabled.

The recap follows fixed editing rules, including clips of up to eight seconds around each approved timestamp. Original audio is omitted. An optional inspector-confirmed historical aerial opening uses USGS/USDA NAIP imagery and a 2D zoom/rotation; it is location context, not current inspection evidence. Preparing that option sends the entered address to the U.S. Census geocoder and coordinates to the USGS imagery service.

AI findings remain tentative until inspector review. Sampled video does not establish a complete inspection, code compliance, absence of defects, or certified diagnoses. The application never approves suggestions automatically.

## Current limits

- MP4, MOV, or WebM; up to 1 GiB and 90 minutes per inspection.
- Up to 20 approved observations per recap, or 19 with the aerial opening.
- Keep the inspection page open while processing. Individual hosted agent turns can continue after it closes, but staging, transcription, speech generation, and result import advance through browser polling. Reopening resumes coordination. There is no independent background queue worker.
- Failed jobs retain processing state for retry. Completed or cancelled jobs attempt temporary OpenAI file/session cleanup.
- Hosted processing requires access to OpenAI's current Agents API. A conventional API key without the relevant capability will not make that path work.
- Private data from another installation is not bundled or migrated by this repository. New Docker installations start empty.

## Development and verification

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run audit:privacy
```

`npm run test:smoke` requires FFmpeg on the test host and runs a synthetic upload/auth/persistence API scenario against `SMOKE_ORIGIN` (default `http://localhost:3000`). Run it only against a disposable, empty test installation; it creates synthetic accounts and inspection data and intentionally exercises rejected requests. It never calls OpenAI. The initial phase expects default closed-after-first-account registration; to exercise cross-account isolation, recreate the disposable container with `ALLOW_REGISTRATION=true` before the resume phase. The script records its random test credentials in `SMOKE_STATE` (default a temporary OS file), outside this repository, to verify a subsequent container restart with `SMOKE_PHASE=resume`.

No production account, uploaded video, address, secret, private deployment ID, or prior private Git history is included. Run the privacy audit before committing; it supplements manual review. Use a GitHub noreply commit email to avoid publishing personal email metadata.

Deployment follows Next.js [self-hosting](https://nextjs.org/docs/app/guides/self-hosting) and [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) support. Local persistence uses Node's [SQLite API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html).
