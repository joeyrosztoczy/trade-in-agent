# Stotz Corporate Sales Deployment Runbook

This runbook covers deploying the Trade-In Agent sidecar and agent instructions onto the Stotz corporate sales OpenClaw deployment so the flow can be tested from Microsoft Teams.

The target deployment is managed from the OpenClaw on Azure day-two operations repo:

```text
~/.openclaw/workspaces/openclaw-on-azure/repo/deployments/stotz-corp-sales.json
```

The deployment currently runs the sidecar on the same VM as OpenClaw and exposes it only on localhost:

```text
http://127.0.0.1:8788
```

Do not commit deployment secrets, OpenAI API keys, SSH private keys, Azure certs, or generated SSH config files.

## Target Runtime

The production-like Stotz Teams test target is:

- Azure resource group: `prod-sales-agent`
- VM: `stotz-sales-agent-prod-vmss_015271c9`
- OpenClaw workspace: `/home/openclaw/openclaw-workspace`
- Sidecar app root: `/home/openclaw/openclaw-workspace/trade-in-agent`
- Agent tool docs: `/home/openclaw/openclaw-workspace/docs/trade-in-agent/TRADE-IN-TOOLS.md`
- Agent project instructions: `/home/openclaw/openclaw-workspace/PROJECT.md`
- Sidecar systemd unit: `/etc/systemd/system/trade-in-agent-sidecar.service`
- Sidecar database: Postgres database `trade_in_agent_prod`

The sidecar should use the same Stotz corporate sales OpenAI key as OpenClaw. On the VM, source it from OpenClaw's existing environment file and write only the `OPENAI_API_KEY=...` assignment into the sidecar `.env`. Never print the key in logs or documentation.

## Deployment Steps

From the local trade-in-agent repo, package the repository without macOS AppleDouble files:

```bash
COPYFILE_DISABLE=1 tar \
  --exclude='.git' \
  --exclude='app/node_modules' \
  --exclude='.env' \
  -czf /tmp/trade-in-agent.tar.gz .
```

Generate or locate the Azure SSH config from the OpenClaw on Azure repo, then set:

```bash
export SSH_CONFIG=/path/to/generated/sshconfig
export SSH_HOST=prod-sales-agent-stotz-sales-agent-prod-vmss_015271c9
```

Copy the package:

```bash
scp -F "$SSH_CONFIG" /tmp/trade-in-agent.tar.gz "$SSH_HOST:/tmp/trade-in-agent.tar.gz"
```

Install on the VM:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" 'sudo bash -s' <<'REMOTE'
set -euo pipefail

APP_ROOT=/home/openclaw/openclaw-workspace/trade-in-agent
WORKSPACE=/home/openclaw/openclaw-workspace
DB_NAME=trade_in_agent_prod
DB_USER=trade_in_agent
DB_PASSWORD=trade_in_agent

apt-get update
apt-get install -y postgresql nodejs npm

mkdir -p "$APP_ROOT" "$WORKSPACE/docs/trade-in-agent"
tar -xzf /tmp/trade-in-agent.tar.gz -C "$APP_ROOT"
find "$APP_ROOT" -name '._*' -type f -delete
chown -R openclaw:openclaw "$APP_ROOT" "$WORKSPACE/docs/trade-in-agent"

sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL

OPENAI_KEY=""
if [ -f /home/openclaw/.openclaw/.env ]; then
  OPENAI_KEY="$(grep -E '^OPENAI_API_KEY=' /home/openclaw/.openclaw/.env | tail -1 | cut -d= -f2- || true)"
fi

cat > "$APP_ROOT/.env" <<ENV
PORT=8788
DATABASE_URL=postgres://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME
SIDECAR_URL=http://127.0.0.1:8788
OPENAI_API_KEY=$OPENAI_KEY
OPENAI_VISION_MODE=live
OPENAI_VISION_MODEL=gpt-5.4-mini
OPENAI_VISION_REVIEW_MODEL=gpt-5.4
ENV
chown openclaw:openclaw "$APP_ROOT/.env"
chmod 600 "$APP_ROOT/.env"

sudo -u openclaw -H bash -lc "cd '$APP_ROOT/app' && npm ci"
sudo -u openclaw -H bash -lc "cd '$APP_ROOT/app' && npm run migrate && npm run seed && npm test"

cp "$APP_ROOT/agent/TRADE-IN-TOOLS.md" "$WORKSPACE/docs/trade-in-agent/TRADE-IN-TOOLS.md"
chown openclaw:openclaw "$WORKSPACE/docs/trade-in-agent/TRADE-IN-TOOLS.md"

python3 - <<'PY'
from pathlib import Path

project = Path("/home/openclaw/openclaw-workspace/PROJECT.md")
project.touch(exist_ok=True)
text = project.read_text()
start = "<!-- trade-in-agent-sidecar:start -->"
end = "<!-- trade-in-agent-sidecar:end -->"
block = f"""{start}

## Trade-In Agent Sidecar

Use the local sidecar at `http://127.0.0.1:8788` for John Deere trade-in evaluation workflows.

Tool contract and Teams evidence-loop guidance:

`/home/openclaw/openclaw-workspace/docs/trade-in-agent/TRADE-IN-TOOLS.md`

For Teams users, keep replies field-focused: accepted evidence, retakes, missing evidence, visible condition notes, and next best photo/video request. Treat visual findings as visible observations, not a replacement for a licensed mechanical inspection.

{end}
"""
if start in text and end in text:
    before = text.split(start)[0]
    after = text.split(end, 1)[1]
    text = before + block + after
else:
    text = text.rstrip() + "\n\n" + block + "\n"
project.write_text(text)
PY
chown openclaw:openclaw "$WORKSPACE/PROJECT.md"

cat > /etc/systemd/system/trade-in-agent-sidecar.service <<UNIT
[Unit]
Description=Trade-In Agent Sidecar
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=$APP_ROOT/app
EnvironmentFile=$APP_ROOT/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable trade-in-agent-sidecar.service
systemctl restart trade-in-agent-sidecar.service
systemctl restart openclaw-gateway
REMOTE
```

## Verification

Check service health:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" 'set -e;
  echo sidecar=$(sudo systemctl is-active trade-in-agent-sidecar.service);
  echo gateway=$(sudo systemctl is-active openclaw-gateway);
  curl -fsS http://127.0.0.1:8788/health;
  echo'
```

Run the sidecar smoke test as the OpenClaw user:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo -u openclaw -H bash -lc "cd /home/openclaw/openclaw-workspace/trade-in-agent && ./scripts/smoke-test.sh"'
```

Expected smoke output:

- `ok: true`
- a new `tradeCaseId`
- `visibleFindingCount` greater than `0`
- `route` usually `needs_more_evidence`
- field guidance describing accepted, missing, or rejected evidence

Confirm live OpenAI inference was used:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  "sudo -u postgres psql -d trade_in_agent_prod -c \"SELECT provider, model, mode FROM visual_inference_results ORDER BY created_at DESC LIMIT 3;\""
```

Expected:

```text
provider | model        | mode
openai   | gpt-5.4-mini | live
```

Inspect recent sidecar logs:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo journalctl -u trade-in-agent-sidecar.service -n 200 --no-pager'
```

Inspect recent OpenClaw gateway logs:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo journalctl -u openclaw-gateway -n 200 --no-pager'
```

## Teams Phone QA

In Microsoft Teams on iPhone, DM the Stotz sales agent:

```text
Start a trade-in evaluation for a 2021 John Deere S780 combine. It has 1200 engine hours and 850 separator hours. This is a live test.
```

Upload two to four machine photos. If a machine is not available, upload a non-machine image first to verify that visual inference rejects irrelevant evidence.

Then send:

```text
Use the photos I just uploaded for this trade evaluation. Tell me what is accepted, what needs a retake, and what you still need while I am in the field.
```

Expected behavior:

- The agent creates or finds an active trade case for the Teams conversation.
- The agent registers available media metadata with the sidecar.
- The sidecar sends accessible image evidence to the OpenAI API for inference.
- The agent replies with accepted evidence, retakes, missing evidence, visible notes, and the next best field ask.

Useful reviewer handoff prompt:

```text
Generate the draft packet for reviewer handoff.
```

If the agent says it cannot access Teams attachments, capture the exact Teams reply and check the OpenClaw gateway logs. That indicates the remaining issue is the Teams attachment handoff layer, not the sidecar, database, or OpenAI inference path.

## Rollback And Restart

Restart only the sidecar:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo systemctl restart trade-in-agent-sidecar.service'
```

Disable the sidecar without touching OpenClaw:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo systemctl disable --now trade-in-agent-sidecar.service'
```

Remove the agent instruction block from `/home/openclaw/openclaw-workspace/PROJECT.md` by deleting the section between:

```text
<!-- trade-in-agent-sidecar:start -->
<!-- trade-in-agent-sidecar:end -->
```

Restart OpenClaw after instruction changes:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo systemctl restart openclaw-gateway'
```

## Current Known Gap

The backend sidecar, Postgres persistence, OpenAI vision call, and OpenClaw instruction deployment have been verified on the Stotz corporate sales VM.

The live Teams attachment path must still be validated from a real Teams client. If attachments are not exposed to the agent as accessible URLs or local media references, the next implementation task is to bridge Teams attachment retrieval into the sidecar evidence registration and analysis call.
