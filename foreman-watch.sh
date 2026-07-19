#!/usr/bin/env bash
# Foreman Auto-Update Watcher
# Pulls latest code every 60s and restarts PM2 apps if changed

set -euo pipefail

REPO_DIR="/home/sovranamr/projects/foreman"
BRANCH="main"
REMOTE="autonomous"
INTERVAL=60

cd "$REPO_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Foreman watcher started"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Watching $REMOTE/$BRANCH every ${INTERVAL}s"

while true; do
  sleep "$INTERVAL"

  # Fetch latest from remote
  if ! git fetch "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fetch failed, retrying next cycle"
    continue
  fi

  LOCAL=$(git rev-parse HEAD)
  REMOTE_HEAD=$(git rev-parse "$REMOTE/$BRANCH")

  if [ "$LOCAL" != "$REMOTE_HEAD" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Update detected: $LOCAL -> $REMOTE_HEAD"

    # Pull changes
    if git pull --no-rebase "$REMOTE" "$BRANCH"; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pull succeeded, restarting foreman-web"
      pm2 restart foreman-web || true
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pull failed, manual intervention needed"
    fi
  fi
done