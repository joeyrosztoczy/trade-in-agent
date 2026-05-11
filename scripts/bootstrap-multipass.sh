#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VM_NAME="${VM_NAME:-trade-in-agent-dev}"
VM_CPUS="${VM_CPUS:-4}"
VM_MEMORY="${VM_MEMORY:-8G}"
VM_DISK="${VM_DISK:-40G}"
REMOTE_DIR="/home/ubuntu/trade-in-agent"

command -v multipass >/dev/null || { echo "ERROR: multipass is required"; exit 1; }

if ! multipass info "$VM_NAME" >/dev/null 2>&1; then
  multipass launch 24.04 --name "$VM_NAME" --cpus "$VM_CPUS" --memory "$VM_MEMORY" --disk "$VM_DISK"
fi

if ! multipass info "$VM_NAME" | grep -q "State:.*Running"; then
  multipass start "$VM_NAME"
fi

if multipass info "$VM_NAME" | grep -q "$REMOTE_DIR"; then
  echo "Repo already appears mounted at $REMOTE_DIR"
else
  multipass mount "$ROOT" "$VM_NAME:$REMOTE_DIR" || true
fi

multipass exec "$VM_NAME" -- bash -lc "
set -euo pipefail
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg postgresql postgresql-contrib
if ! command -v node >/dev/null || [[ \$(node --version | sed 's/v//' | cut -d. -f1) -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo -u postgres psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='trade_in_agent'\" | grep -q 1 || sudo -u postgres psql -c \"CREATE ROLE trade_in_agent WITH LOGIN PASSWORD 'trade_in_agent';\"
sudo -u postgres psql -tc \"SELECT 1 FROM pg_database WHERE datname='trade_in_agent_dev'\" | grep -q 1 || sudo -u postgres createdb -O trade_in_agent trade_in_agent_dev
cd '$REMOTE_DIR'
cp -n infra/local/env.example .env || true
grep -q '^OPENAI_VISION_MODE=' .env || echo 'OPENAI_VISION_MODE=fixture' >> .env
grep -q '^OPENAI_VISION_MODEL=' .env || echo 'OPENAI_VISION_MODEL=gpt-5.4-mini' >> .env
grep -q '^OPENAI_VISION_REVIEW_MODEL=' .env || echo 'OPENAI_VISION_REVIEW_MODEL=gpt-5.4' >> .env
cd app
npm install
npm run migrate
npm run seed
npm test
sudo tee /etc/systemd/system/trade-in-agent-sidecar.service >/dev/null <<'UNIT'
[Unit]
Description=Trade-In Agent Sidecar
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/trade-in-agent/app
EnvironmentFile=/home/ubuntu/trade-in-agent/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo tee /etc/systemd/system/trade-in-agent-worker.service >/dev/null <<'UNIT'
[Unit]
Description=Trade-In Agent Evidence Analysis Worker
After=network-online.target postgresql.service trade-in-agent-sidecar.service
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/trade-in-agent/app
EnvironmentFile=/home/ubuntu/trade-in-agent/.env
Environment=TRADE_IN_WORKER_MODE=separate
Environment=TRADE_IN_ANALYSIS_CONCURRENCY=4
Environment=TRADE_IN_ANALYSIS_PER_CASE_CONCURRENCY=2
ExecStart=/usr/bin/node src/worker.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable trade-in-agent-sidecar.service
sudo systemctl enable trade-in-agent-worker.service
sudo systemctl restart trade-in-agent-sidecar.service
sudo systemctl restart trade-in-agent-worker.service
ready=0
for i in {1..20}; do
  if curl -fsS http://127.0.0.1:8788/health >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done
if [[ "\$ready" != "1" ]]; then
  sudo systemctl --no-pager --full status trade-in-agent-sidecar.service
  exit 1
fi
sudo systemctl is-active --quiet trade-in-agent-worker.service || {
  sudo systemctl --no-pager --full status trade-in-agent-worker.service
  exit 1
}
"

echo "Multipass bootstrap complete for $VM_NAME."
echo "Sidecar service: trade-in-agent-sidecar.service"
echo "Worker service: trade-in-agent-worker.service"
echo "Run smoke test: multipass exec $VM_NAME -- bash -lc 'cd $REMOTE_DIR && ./scripts/smoke-test.sh'"
