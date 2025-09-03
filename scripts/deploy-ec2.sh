#!/usr/bin/env bash
# deploy-ec2.sh — One-liner deployment helper for the Notion-NextUp webhook server.
#
# Usage:
#   ./scripts/deploy-ec2.sh [commit-ish]
#
# Environment variables (all have sensible defaults):
#   EC2_HOST        — Public hostname or IP of the EC2 instance.   (default: 3.131.200.212)
#   EC2_USER        — SSH username.                               (default: admin)
#   SSH_KEY_PATH    — Path to private SSH key.                     (default: ~/.ssh/id_ed25519)
#   REMOTE_DIR      — Absolute path to repo on the instance.       (default: /opt/myapp/notion-nextup)
#   PM2_APP_NAME    — pm2 process name to restart.                 (default: notion-webhook)
#
# The script performs the following steps on the remote host:
#   1. git fetch origin
#   2. git reset --hard <commit-ish> (defaults to origin/main)
#   3. npm ci --silent
#   4. npm run --silent build
#   5. pm2 restart <PM2_APP_NAME> --update-env
#
# Any argument passed to the script is treated as the desired commit-ish to deploy
# (e.g. a specific commit hash, tag, or branch). If omitted, origin/main is used.
#
set -euo pipefail

EC2_HOST="${EC2_HOST:-3.131.200.212}"
EC2_USER="${EC2_USER:-admin}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/opt/myapp/notion-nextup}"
PM2_APP_NAME="${PM2_APP_NAME:-notion-webhook}"

COMMITISH="${1:-origin/main}"

SSH_OPTS="-o ConnectTimeout=30 -o StrictHostKeyChecking=no -i ${SSH_KEY_PATH}"

echo "🚀 Deploying ${COMMITISH} to ${EC2_USER}@${EC2_HOST}:${REMOTE_DIR} (pm2 app: ${PM2_APP_NAME})"

ssh ${SSH_OPTS} "${EC2_USER}@${EC2_HOST}" \
  "cd ${REMOTE_DIR} && \
   sudo -u appuser git fetch origin && \
   sudo -u appuser git reset --hard ${COMMITISH} && \
   sudo -u appuser npm ci --silent && \
   sudo -u appuser npm run --silent build && \
   sudo -u appuser pm2 restart ${PM2_APP_NAME} --update-env"

echo "✅ Deployment complete."
