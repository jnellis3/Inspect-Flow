#!/usr/bin/env bash
# Run one job end to end inside the worker container.
#
#   run-job.sh /job            (job dir holds brief.json and input/walkthrough.*)
#
# Stages: ingest → transcribe → video index → director agent (Claude Code, headless) → verify → web copy.
# request.json {"kind":"produce"} (default) or {"kind":"revise","message":"…"} picks what the agent does;
# a revision resumes the agent's own session so it remembers every decision it made.
# Each stage is resumable; re-running skips work that is already done.
#
# Env:
#   OPENROUTER_API_KEY   required: agent, narration and music all go through OpenRouter
#   AGENT_MODEL          default anthropic/claude-sonnet-5.5 (any OpenRouter model id)
#   AGENT_MAX_TURNS      default 400
set -euo pipefail
JOB="$(cd "${1:?usage: run-job.sh <job-dir>}" && pwd)"
PIPELINE="${PIPELINE_HOME:-$(cd "$(dirname "$0")" && pwd)}"
PY="${PIPELINE_PYTHON:-$PIPELINE/.venv/bin/python}"
MODEL="${AGENT_MODEL:-anthropic/claude-sonnet-5.5}"
mkdir -p "$JOB/logs" "$JOB/out"
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$JOB/logs/job.log" >&2; }
stage() { printf '{"stage":"%s","at":"%s"}\n' "$1" "$(date -Is)" > "$JOB/logs/stage.json"; log "stage: $1"; }

[ -n "${OPENROUTER_API_KEY:-}" ] || { log "OPENROUTER_API_KEY is not set"; exit 2; }
[ -f "$JOB/brief.json" ] || { log "brief.json missing"; exit 2; }

stage ingest
"$PY" "$PIPELINE/stages/ingest.py" "$JOB" >> "$JOB/logs/job.log"

stage transcribe
if [ ! -f "$JOB/analysis/transcript.json" ] && [ -f "$JOB/media/audio16k.wav" ]; then
  "$PY" "$PIPELINE/stages/transcribe.py" "$JOB" 2>> "$JOB/logs/transcribe.log" >> "$JOB/logs/job.log"
fi

stage index
"$PY" "$PIPELINE/stages/index.py" "$JOB" >> "$JOB/logs/job.log" 2>> "$JOB/logs/index.log" || log "video index failed; the agent will work without it"

stage direct
profile="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["profile"])' "$JOB/brief.json")"
cp "$PIPELINE/agent/PLAYBOOK.md" "$JOB/CLAUDE.md"
cp "$PIPELINE/agent/PLAYBOOK.md" "$JOB/AGENTS.md"
cp "$PIPELINE/agent/profiles/$profile.md" "$JOB/profile.md"
mkdir -p "$JOB/.claude/agents" && cp "$PIPELINE"/agent/agents/*.md "$JOB/.claude/agents/"

# Claude Code talks to OpenRouter's Anthropic-compatible endpoint; the model is any OpenRouter id.
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
export ANTHROPIC_API_KEY=""
export ANTHROPIC_DEFAULT_OPUS_MODEL="${ANTHROPIC_DEFAULT_OPUS_MODEL:-anthropic/claude-opus-5.5}"
export ANTHROPIC_DEFAULT_SONNET_MODEL="${ANTHROPIC_DEFAULT_SONNET_MODEL:-anthropic/claude-sonnet-5.5}"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="${ANTHROPIC_DEFAULT_HAIKU_MODEL:-anthropic/claude-haiku-4.5}"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export PATH="$PIPELINE/bin:$PATH"

# Keep the agent's session inside the job so a failed run can resume instead of starting over.
export CLAUDE_CONFIG_DIR="$JOB/logs/claude"
mkdir -p "$CLAUDE_CONFIG_DIR"

# A field from the latest "result" event in the agent log (session id, error status…).
result_field() {
  python3 - "$JOB/logs/agent.jsonl" "$1" <<'PY'
import json, sys
r = {}
for line in open(sys.argv[1]):
    if line.startswith('{"type":"user"'):  # tool results carrying images: huge, never a result
        continue
    try: e = json.loads(line)
    except ValueError: continue
    if e.get("type") == "result": r = e
v = r.get(sys.argv[2])
print("" if v is None else v)
PY
}

# A request is either the first production or a revision with the client's feedback.
request_field() { python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2]) or "")
except Exception: print("")' "$JOB/request.json" "$1"; }
KIND="$(request_field kind)"; KIND="${KIND:-produce}"

# The agent runs with permission checks off, so it only ever runs inside the worker container.
if [ ! -f /.dockerenv ] && [ -z "${ALLOW_HOST_AGENT:-}" ]; then
  log "not in a container: skipping the agent (set ALLOW_HOST_AGENT=1 to override)"
  AGENT_DISABLED=1
fi

cd "$JOB"
agent_args=(--model "$MODEL" --dangerously-skip-permissions --max-turns "${AGENT_MAX_TURNS:-400}" --output-format stream-json --verbose)
touch "$JOB/logs/agent.jsonl"
if [ -n "${AGENT_DISABLED:-}" ]; then
  :
elif [ "$KIND" = "revise" ]; then
  prompt="$(cat "$PIPELINE/agent/REVISE.md")

The client's request (their words; follow it unless it conflicts with the playbook's non-negotiables):
<request>
$(request_field message)
</request>"
  session="$(result_field session_id)"
  if [ -n "$session" ]; then
    claude -p "$prompt" --resume "$session" "${agent_args[@]}" >> "$JOB/logs/agent.jsonl" 2>> "$JOB/logs/agent.stderr" || log "agent exited non-zero"
  else
    claude -p "$prompt" "${agent_args[@]}" >> "$JOB/logs/agent.jsonl" 2>> "$JOB/logs/agent.stderr" || log "agent exited non-zero"
  fi
elif [ -s "$JOB/out/highlight-reel.mp4" ] && [ -n "$(result_field session_id)" ] && [ "$(result_field is_error)" != "True" ]; then
  log "already produced; nothing for the agent to do"
else
  session="$(result_field session_id)"
  if [ -n "$session" ]; then  # an earlier attempt was interrupted
    claude -p "Your previous run of this job was interrupted. Continue from where you left off." --resume "$session" "${agent_args[@]}" \
      >> "$JOB/logs/agent.jsonl" 2>> "$JOB/logs/agent.stderr" || log "agent exited non-zero"
  else
    claude -p "$(cat "$PIPELINE/agent/KICKOFF.md")" "${agent_args[@]}" \
      >> "$JOB/logs/agent.jsonl" 2>> "$JOB/logs/agent.stderr" || log "agent exited non-zero"
  fi
fi
# Provider hiccups (rate limits, 5xx, gateway blocks) end a session early; resume it, twice at most.
for attempt in 1 2; do
  [ -z "${AGENT_DISABLED:-}" ] && [ "$(result_field is_error)" = "True" ] && [ -n "$(result_field api_error_status)" ] || break
  log "agent stopped on API error $(result_field api_error_status); resuming (attempt $attempt)"
  sleep 20
  claude -p "The previous request failed on a provider error. Continue the job from where you left off." \
    --resume "$(result_field session_id)" "${agent_args[@]}" \
    >> "$JOB/logs/agent.jsonl" 2>> "$JOB/logs/agent.stderr" || log "agent exited non-zero"
done

stage verify
# Rebuild anything the agent left stale or undone, so the user always gets current output.
newer() { [ -e "$1" ] && { [ ! -e "$2" ] || [ "$1" -nt "$2" ]; }; }
if newer "$JOB/edit.json" "$JOB/out/highlight-reel.mp4" || newer "$JOB/findings.json" "$JOB/out/highlight-reel.mp4"; then
  log "reel is older than the edit; rendering"; { build >/dev/null && render; } || log "fallback render failed"
fi
[ -f "$JOB/edit.json" ] || log "agent stopped before storyboarding; no reel"
if newer "$JOB/findings.json" "$JOB/out/report.pdf"; then
  log "report is older than the findings; building"; report >/dev/null || log "fallback report failed"
fi

stage web
# The render is mastering quality (~15 Mbit/s). Make a copy that is easy to stream and email.
if newer "$JOB/out/highlight-reel.mp4" "$JOB/out/highlight-reel-web.mp4"; then
  ffmpeg -v error -y -i "$JOB/out/highlight-reel.mp4" -c:v libx264 -preset medium -crf 23 -maxrate 5M -bufsize 10M \
    -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$JOB/out/highlight-reel-web.tmp.mp4" \
    && mv "$JOB/out/highlight-reel-web.tmp.mp4" "$JOB/out/highlight-reel-web.mp4"
  ffmpeg -v error -y -ss 2.5 -i "$JOB/out/highlight-reel.mp4" -frames:v 1 -vf scale=1280:-2 -q:v 3 "$JOB/out/poster.jpg" || true
fi

python3 - "$JOB" <<'EOF'
import json, sys, pathlib
job = pathlib.Path(sys.argv[1])
cost = turns = 0
for line in (job / "logs" / "agent.jsonl").read_text().splitlines():
    if line.startswith('{"type":"user"'):
        continue
    try: e = json.loads(line)
    except ValueError: continue
    if e.get("type") == "result":  # one per session attempt and revision; sum them
        cost += e.get("total_cost_usd", 0); turns += e.get("num_turns", 0)
print(json.dumps({"totalCostUsd": round(cost, 2), "agentTurns": turns,
                  "reel": (job / "out/highlight-reel-web.mp4").exists(), "report": (job / "out/report.pdf").exists()}))
EOF
stage done
