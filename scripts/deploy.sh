#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "[deploy] failed at line $LINENO" >&2; exit 1' ERR

log() { echo "[$(date -Is)] $*"; }

# Guard: prefer to run as appuser in production
if [[ "${REQUIRE_APPUSER:-1}" == "1" ]]; then
  if [[ "$(id -un)" != "appuser" ]]; then
    echo "[deploy] must run as appuser (current: $(id -un))" >&2
    exit 1
  fi
fi

APP_DIR="/opt/myapp/notion-nextup"
HEALTH_HOST="${HEALTH_HOST:-notion.api}"
HEALTH_URL="https://${HEALTH_HOST}:443/healthz"

cd "${APP_DIR}"

log "fetch + hard reset to origin/main"
git fetch origin
git reset --hard origin/main

log "install dependencies"
npm ci --silent

log "build application"
npm run --silent build

log "reload pm2 (zero-downtime)"
pm2 reload notion-webhook --update-env

log "health check ${HEALTH_URL}"
# -k to tolerate IP-based checks if HEALTH_HOST is an IP without cert SAN
curl -ksSf "${HEALTH_URL}" | grep -qx 'ok'

log "deploy succeeded"


