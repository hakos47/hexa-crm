#!/usr/bin/env bash
# Deploy hexa-crm adapter-node build to Incus container voura:nix-c-web
# Prerequisites: SSH tunnel to voura (incus-ui-voura), local npm build green.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${INCUS_REMOTE:-voura}"
INSTANCE="${INCUS_INSTANCE:-nix-c-web}"
TARGET="/root/nix-c"
TGZ="${TMPDIR:-/tmp}/hexa-crm-server-deploy.tgz"

cd "$ROOT"
VER="$(node -p "require('./package.json').version")"
echo "==> Deploy hexa-crm v${VER} → ${REMOTE}:${INSTANCE}:${TARGET}"

if [[ ! -d build ]]; then
  echo "Missing build/; run: npm run build" >&2
  exit 1
fi

tar -czf "$TGZ" build package.json package-lock.json
echo "==> Archive $(du -h "$TGZ" | awk '{print $1}')"

incus file push "$TGZ" "${REMOTE}:${INSTANCE}/tmp/hexa-crm-server.tgz"
incus exec "${REMOTE}:${INSTANCE}" -- sh -lc "
  set -e
  mkdir -p ${TARGET}
  cd ${TARGET}
  tar -xzf /tmp/hexa-crm-server.tgz
  npm ci --omit=dev
  # OpenRC service name remains nix-c for continuity
  if command -v rc-service >/dev/null 2>&1; then
    rc-service nix-c restart || (rc-service nix-c stop; rc-service nix-c start)
    sleep 1
    rc-service nix-c status || true
  fi
  # quick health
  wget -qO- http://127.0.0.1:3000/ >/dev/null && echo 'HTTP 3000 OK' || echo 'HTTP check failed'
  node -e \"console.log('package', require('./package.json').version)\"
"
echo "==> Done hexa-crm v${VER}"
