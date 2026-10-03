#!/usr/bin/env bash
# Pull-based deploy for the production server; run every few minutes by inspect-flow-deploy.timer
# (see scripts/install-autodeploy.sh). Fast-forwards this checkout (compose file, scripts), pulls
# the newest app image CI published, and recreates the app container only if something changed.
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git merge -q --ff-only origin/main
  echo "checkout now at $(git rev-parse --short HEAD)"
fi
compose=(docker compose -f compose.prod.yaml)
"${compose[@]}" pull -q app
"${compose[@]}" up -d --no-build --remove-orphans 2>&1 | grep -E "Recreated|Created|Started" || true
docker image prune -f >/dev/null
