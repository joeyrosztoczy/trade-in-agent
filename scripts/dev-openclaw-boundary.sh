#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
SIDECAR_URL="${SIDECAR_URL:-http://127.0.0.1:8788}"
RUN_SMOKE="${RUN_SMOKE:-0}"

cd "$APP_DIR"

echo "[boundary] app: $APP_DIR"
echo "[boundary] sidecar: $SIDECAR_URL"

if ! node -e "import('./src/db.js').then(async m => { await m.query('SELECT 1'); await m.closePool(); }).catch(error => { console.error(error.message); process.exit(1); })"; then
  cat >&2 <<EOF
[boundary] Postgres is not reachable.

Start local Postgres with:
  cd "$ROOT_DIR"
  docker compose -f infra/local/docker-compose.yml up -d postgres

or set DATABASE_URL before running this script.
EOF
  exit 1
fi

npm run migrate
npm run contracts:check

if ! curl -fsS "$SIDECAR_URL/health" >/dev/null 2>&1; then
  echo "[boundary] starting sidecar on $SIDECAR_URL"
  HOST="127.0.0.1" PORT="${SIDECAR_URL##*:}" npm start &
  SIDECAR_PID=$!
  trap 'kill "$SIDECAR_PID" >/dev/null 2>&1 || true' EXIT

  for _ in $(seq 1 30); do
    if curl -fsS "$SIDECAR_URL/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

curl -fsS "$SIDECAR_URL/health" >/dev/null

echo
echo "OpenClaw boundary is ready."
echo
echo "Health:"
echo "  $SIDECAR_URL/health"
echo
echo "OpenAPI:"
echo "  $APP_DIR/openapi.json"
echo
echo "Plugin package:"
echo "  $ROOT_DIR/packages/openclaw-plugin"
echo
echo "OpenClaw env:"
echo "  TRADE_IN_SIDECAR_URL=$SIDECAR_URL"
echo "  TRADE_IN_PLUGIN_PACKAGE=packages/openclaw-plugin"
echo "  TRADE_IN_API_VERSION=trade-in-sidecar/v1"

if [[ "$RUN_SMOKE" == "1" ]]; then
  SIDECAR_URL="$SIDECAR_URL" npm run smoke
fi

