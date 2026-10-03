#!/usr/bin/env bash
# Install a systemd timer that runs scripts/autodeploy.sh every 2 minutes as the current user.
#   sudo -v && scripts/install-autodeploy.sh        (once, on the production server)
#   journalctl -u inspect-flow-deploy -f            (watch deploys)
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)"
user="$(id -un)"
sudo tee /etc/systemd/system/inspect-flow-deploy.service >/dev/null <<UNIT
[Unit]
Description=Deploy the latest Inspect Flow release
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=$user
ExecStart=$dir/scripts/autodeploy.sh
UNIT
sudo tee /etc/systemd/system/inspect-flow-deploy.timer >/dev/null <<UNIT
[Unit]
Description=Check for Inspect Flow releases every 2 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now inspect-flow-deploy.timer
systemctl list-timers inspect-flow-deploy.timer --no-pager
