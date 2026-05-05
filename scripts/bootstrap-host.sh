#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp infra/local/env.example .env
  echo "Created .env from infra/local/env.example"
fi
grep -q '^OPENAI_VISION_MODE=' .env || echo 'OPENAI_VISION_MODE=fixture' >> .env
grep -q '^OPENAI_VISION_MODEL=' .env || echo 'OPENAI_VISION_MODEL=gpt-5.4-mini' >> .env
grep -q '^OPENAI_VISION_REVIEW_MODEL=' .env || echo 'OPENAI_VISION_REVIEW_MODEL=gpt-5.4' >> .env

set -a
# shellcheck disable=SC1091
source .env
set +a

command -v node >/dev/null || { echo "ERROR: node is required"; exit 1; }
command -v npm >/dev/null || { echo "ERROR: npm is required"; exit 1; }

if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  docker compose -f infra/local/docker-compose.yml up -d
else
  echo "Docker compose not found; assuming Postgres is already reachable via DATABASE_URL."
fi

cd app
npm install
npm run migrate
npm run seed
npm test

echo "Host bootstrap complete. Start the sidecar with: ./scripts/dev.sh"
