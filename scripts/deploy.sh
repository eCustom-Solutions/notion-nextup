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
HEALTH_PORT="${HEALTH_PORT:-443}"
HEALTH_URL="${HEALTH_URL:-}"
if [[ -z "${HEALTH_URL}" ]]; then
  HEALTH_URL="https://${HEALTH_HOST}:${HEALTH_PORT}/healthz"
fi

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
# Retry health check to avoid brief reload gaps
for i in {1..15}; do
  if curl -ksSf "${HEALTH_URL}" | grep -qx 'ok'; then
    log "health check passed"
    break
  fi
  log "health not ready (attempt ${i}), retrying..."
  sleep 2
done

# Final assert
curl -ksSf "${HEALTH_URL}" | grep -qx 'ok'

log "deploy succeeded"


