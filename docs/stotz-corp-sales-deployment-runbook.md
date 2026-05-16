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
- Agent route docs: `/home/openclaw/openclaw-workspace/docs/trade-in-agent/TRADE-IN-EVALUATION-ROUTE.md`
- Agent project instructions: `/home/openclaw/openclaw-workspace/PROJECT.md`
- OpenAPI contract: `/home/openclaw/openclaw-workspace/trade-in-agent/app/openapi.json`
- Product-owned OpenClaw plugin package: `/home/openclaw/openclaw-workspace/trade-in-agent/packages/openclaw-plugin`
- Sidecar systemd unit: `/etc/systemd/system/trade-in-agent-sidecar.service`
- Sidecar database: Postgres database `trade_in_agent_prod`
- OpenClaw desired runtime config: `/home/openclaw/openclaw-workspace/.openclaw/runtime-config.json`
- OpenClaw actual runtime config: `/home/openclaw/.openclaw/openclaw.json`

The sidecar should use the same Stotz corporate sales OpenAI key as OpenClaw. On the VM, source it from OpenClaw's existing environment file and write only the `OPENAI_API_KEY=...` assignment into the sidecar `.env`. Never print the key in logs or documentation.

## Boundary Contract

The sidecar/OpenClaw boundary is versioned as:

```text
trade-in-sidecar/v1
```

`trade-in-agent` owns:

- sidecar request and response schemas
- `app/openapi.json`
- contract tests
- `packages/openclaw-plugin`
- trade-in workflow business logic

`openclaw-on-azure` should only need deployment-shape fields like:

```json
{
  "tools": {
    "tradeInAgent": {
      "enabled": true,
      "baseUrl": "http://127.0.0.1:8788",
      "timeoutMs": 240000,
      "pluginPackage": "@premier/trade-in-agent-openclaw-plugin",
      "apiVersion": "trade-in-sidecar/v1"
    }
  }
}
```

Do not duplicate endpoint payload details or trade-in business rules in `openclaw-on-azure`.

Live demo packet generation uses GPT-5.5/public web research and can take longer than 60 seconds. The Trade-In Agent plugin timeout must be `240000` in both:

```text
/home/openclaw/openclaw-workspace/.openclaw/runtime-config.json -> pluginConfigs.trade-in-agent.config.timeoutMs
/home/openclaw/.openclaw/openclaw.json -> plugins.entries.trade-in-agent.config.timeoutMs
```

If the first-class `trade_in_generate_packet` tool reports `timed out after 60000ms`, the desired workspace config may have been updated without applying the actual OpenClaw config. Patch/apply the actual config and restart `openclaw-gateway`.

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
apt-get install -y postgresql nodejs npm ffmpeg

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
OPENCLAW_MEDIA_ROOT=/home/openclaw/.openclaw/media
FFMPEG_PATH=ffmpeg
TRADE_IN_VIDEO_FRAME_COUNT=3
TRADE_IN_VIDEO_FRAME_INTERVAL_SECONDS=5
DEMO_VALUATION_ENABLED=true
DEMO_VALUATION_MODE=live
DEMO_VALUATION_MODEL=gpt-5.5
DEMO_VALUATION_WEB_SEARCH=true
DEMO_VALUATION_WEB_SEARCH_REQUIRED=true
DEMO_VALUATION_SEARCH_CONTEXT_SIZE=medium
DEMO_VALUATION_EXTERNAL_WEB_ACCESS=true
CORS_ALLOW_ORIGIN=https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com
ENV
chown openclaw:openclaw "$APP_ROOT/.env"
chmod 600 "$APP_ROOT/.env"

sudo -u openclaw -H bash -lc "cd '$APP_ROOT/app' && npm ci"
sudo -u openclaw -H bash -lc "set -a; source '$APP_ROOT/.env'; set +a; cd '$APP_ROOT/app' && npm run migrate && npm run seed && npm test"

cp "$APP_ROOT/agent/TRADE-IN-TOOLS.md" "$WORKSPACE/docs/trade-in-agent/TRADE-IN-TOOLS.md"
cp "$APP_ROOT/agent/TRADE-IN-EVALUATION-ROUTE.md" "$WORKSPACE/docs/trade-in-agent/TRADE-IN-EVALUATION-ROUTE.md"
chown openclaw:openclaw "$WORKSPACE/docs/trade-in-agent/TRADE-IN-TOOLS.md" "$WORKSPACE/docs/trade-in-agent/TRADE-IN-EVALUATION-ROUTE.md"

python3 - <<'PY'
from pathlib import Path

project = Path("/home/openclaw/openclaw-workspace/PROJECT.md")
project.touch(exist_ok=True)
text = project.read_text()
start = "<!-- trade-in-agent-sidecar:start -->"
end = "<!-- trade-in-agent-sidecar:end -->"
block = f"""{start}

## Trade-In Agent Sidecar

Trade-in evaluation is a first-class active route, not a generic intake topic.

If the user asks to start, continue, evaluate, appraise, price, or build a reconditioning budget for an equipment trade, first use the local sidecar at `http://127.0.0.1:8788` before replying.

Trigger examples include `start a trade-in evaluation`, `evaluate a trade`, `combine trade`, `tractor trade`, `trade appraisal`, `used equipment evaluation`, `recon budget for this machine`, and `are these photos enough for a trade`.

Required behavior:

1. Check `GET /health`.
2. Check active case with `GET /trade-cases/active?sourceConversationId=<id>` when a Teams conversation id is available.
3. If no active case exists, call `POST /trade-cases`.
4. On create or resume, always include the returned `caseNumber` and `id` in the user-facing reply.
5. Use sidecar checklist and guidance for the next evidence ask.
6. Register Teams photos/videos with the async field upload path (`trade_case_register_field_uploads` / `trade_in_register_field_uploads`) and reply immediately with the returned acknowledgement.
7. Do not call the single-evidence analysis tool in the same Teams turn after uploads; use processing status/guidance for follow-up.
8. Use the guidance route, confidence, risk flags, and review status when replying.
9. Use `POST /trade-cases/:id/packet` for reviewer handoff.

Tool contract and Teams evidence-loop guidance:

`/home/openclaw/openclaw-workspace/docs/trade-in-agent/TRADE-IN-TOOLS.md`

Route trigger guidance:

`/home/openclaw/openclaw-workspace/docs/trade-in-agent/TRADE-IN-EVALUATION-ROUTE.md`

For Teams users, keep replies field-focused: accepted evidence, retakes, missing evidence, current route, confidence, visible condition notes, and next best photo/video request. Treat visual findings as visible observations, not a replacement for a licensed mechanical inspection.

Demo valuation limit: when demo valuation is enabled, the packet may include a GPT-5.5/public-web-researched demo trade value range and demo reconditioning budget. These are controlled QA estimates, not approved offers, confirmed sale prices, or final shop estimates. The workflow still requires used-team review, internal sales history/business-system context, and technician escalation when the route requires it.

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

## Production Review UI Hosting

The M6 review UI can be hosted from the same Stotz Sales VM through Caddy.

Public URL:

```text
https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com/trade-review/
```

The production route should be same-origin:

- `GET /trade-review/*` serves static files from `/var/www/trade-in-review-ui`.
- `GET/POST /review/*` is reverse-proxied to `127.0.0.1:8788`.
- Caddy applies temporary Basic Auth to both `/trade-review/*` and `/review/*`.
- The sidecar should keep `CORS_ALLOW_ORIGIN` set to the public HTTPS origin.

Do not commit Basic Auth plaintext passwords or Caddy hashes.

Publish the static UI bundle after each app deploy:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" 'sudo rm -rf /var/www/trade-in-review-ui && sudo mkdir -p /var/www/trade-in-review-ui && sudo cp -R /home/openclaw/openclaw-workspace/trade-in-agent/review-ui/. /var/www/trade-in-review-ui/ && sudo chown -R root:www-data /var/www/trade-in-review-ui && sudo find /var/www/trade-in-review-ui -type d -exec chmod 755 {} \; && sudo find /var/www/trade-in-review-ui -type f -exec chmod 644 {} \;'
```

Example Caddy route shape in `/etc/caddy/conf.d/trade-in-review-ui.caddy`:

```caddyfile
redir /trade-review /trade-review/ 308

@tradeReviewUi path /trade-review/*
handle @tradeReviewUi {
  basic_auth {
    stotz-review <caddy-bcrypt-hash>
  }
  uri strip_prefix /trade-review
  root * /var/www/trade-in-review-ui
  file_server
  header {
    X-Content-Type-Options nosniff
    Referrer-Policy same-origin
    X-Frame-Options DENY
  }
}

@tradeReviewApi path /review/*
handle @tradeReviewApi {
  basic_auth {
    stotz-review <caddy-bcrypt-hash>
  }
  reverse_proxy 127.0.0.1:8788
}
```

After applying Caddy config:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" 'sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy'
```

Then verify:

```bash
curl -I https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com/trade-review/
curl -u "$USER:$PASSWORD" -I https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com/trade-review/
curl -u "$USER:$PASSWORD" https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com/review/cases?limit=1
```

This Basic Auth gate is temporary. Replace it with Microsoft Entra OAuth/OIDC under [Milestone 7](milestone-review-ui-entra-auth.md).

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
- `reviewStatus` is present
- targeted `nextEvidenceRequests` are present
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

Confirm the packet tool timeout is applied:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo -u openclaw jq -r ".plugins.entries[\"trade-in-agent\"].config.timeoutMs" /home/openclaw/.openclaw/openclaw.json'
```

Expected:

```text
240000
```

## Live Teams QA Replay

From the Stotz Sales Agent Teams chat, use a QA/demo prompt like:

```text
Please start a NEW trade-in evaluation case for a 2021 John Deere S770 combine, about 1,320 engine hours and 910 separator hours, duals, 40 ft draper included, known issue: feeder house chain looks worn, no photos yet. Route this through the trade-in sidecar before answering. Please reply with the case number/id, current evidence status, the next 3 photos or videos needed, and generate a demo valuation/recon packet using public comps/web research if the workflow supports it. Mark it QA/demo only, not an approved offer.
```

Expected behavior:

- The agent creates or resumes a durable sidecar case and shows both case number and UUID.
- The agent asks for the next evidence slots from sidecar guidance, not chat memory.
- The first-class `trade_in_generate_packet` tool completes without a 60-second timeout.
- The reply is explicitly QA/demo only and includes field status, next evidence requests, demo trade value range, and demo recon range.

2026-05-08 production QA passed from the Stotz corporate sales Teams interface:

- Case: `TIA-914FA7B7`
- Case ID: `914fa7b7-b887-4ede-b93f-1a7afc7ffcc8`
- First-class packet ID: `e68bf32a-663e-4e18-aa7b-c7e1d8de92a1`
- Tool path: `trade_in_generate_packet`
- Tool duration: about 87 seconds, with `240000ms` timeout applied
- Demo trade value range: `$205,000-$275,000`
- Demo recon range: `$45,000-$95,000`

## Live Teams Attachment Bridge QA

Use [docs/milestone-two-live-teams-attachment-bridge.md](milestone-two-live-teams-attachment-bridge.md) for the Milestone 2.5 implementation spec.

The current Stotz corporate sales runtime is configured for direct-message testing:

- `channels.msteams.enabled=true`
- `channels.msteams.dmPolicy=allowlist`
- `channels.msteams.groupPolicy=disabled`
- `channels.msteams.sharePointSiteId` is present
- OpenClaw media root is `/home/openclaw/.openclaw/media`

Trace recent inbound media without printing secrets:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo find /home/openclaw/.openclaw/media/inbound -maxdepth 1 -type f -printf "%TY-%Tm-%Td %TH:%TM %s %p\n" | sort | tail -20'
```

For this milestone, the critical path is proving that a Teams-uploaded photo becomes one of:

- `media://inbound/<media-id>`
- `/home/openclaw/.openclaw/media/inbound/<file>`
- a staged workspace media path passed to the agent

The sidecar should then resolve that reference, analyze the real image with OpenAI, persist evidence metadata, and respond with the case number plus accepted/retake/missing guidance.

Milestone 2.5 requires these sidecar runtime settings:

```text
OPENCLAW_MEDIA_ROOT=/home/openclaw/.openclaw/media
FFMPEG_PATH=ffmpeg
TRADE_IN_VIDEO_FRAME_COUNT=3
TRADE_IN_VIDEO_FRAME_INTERVAL_SECONDS=5
```

The sidecar resolver accepts `media://inbound/<media-id>`, guarded local OpenClaw media paths, and guarded `file://` paths. `media://inbound/...` is scoped to the inbound media folder only. Paths outside the allowlisted roots, symlinks, null-byte paths, and traversal escapes are rejected.

Video evidence is frame-sampled through `ffmpeg` before being sent to the OpenAI vision model. If frame sampling fails, the item is marked `unsupported` instead of being retried indefinitely, and the field guidance asks for still photos of the highest-priority missing sections.

Check video support on the VM:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" 'ffmpeg -version | head -1'
```

Check sidecar media resolution without exposing secrets:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" 'sudo -u openclaw -H bash -lc "set -a; source /home/openclaw/openclaw-workspace/trade-in-agent/.env; set +a; cd /home/openclaw/openclaw-workspace/trade-in-agent/app && node --input-type=module -e \"import fs from '\\''node:fs/promises'\\''; import path from '\\''node:path'\\''; import { resolveImageUrl } from '\\''./src/visualInference.js'\\''; await fs.mkdir(path.join(process.env.OPENCLAW_MEDIA_ROOT, '\\''inbound'\\''), { recursive: true }); await fs.writeFile(path.join(process.env.OPENCLAW_MEDIA_ROOT, '\\''inbound'\\'', '\\''codex-media-check.jpg'\\''), Buffer.from('\\''media-check'\\'')); const url = await resolveImageUrl('\\''media://inbound/codex-media-check.jpg'\\'', '\\''image/jpeg'\\''); if (!url?.startsWith('\\''data:image/jpeg;base64,'\\'')) throw new Error('\\''media resolver failed'\\''); console.log('\\''media resolver ok'\\'');\""'
```

Known live trace from May 5, 2026:

- A Teams desktop PNG upload was saved as `/home/openclaw/.openclaw/media/inbound/9a09d4d9-cdf7-4491-a032-264ddafb4a32.png`.
- The sidecar registered that physical path as evidence and analyzed it with `gpt-5.4-mini` in live mode.
- OpenClaw also logged a native prompt-image hydration failure because optional dependency `sharp` was missing, with `promptImages=0`.

Before relying on native OpenClaw image prompt blocks, check gateway logs for:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo journalctl -u openclaw-gateway --since "30 minutes ago" --no-pager | grep -Ei "Native image|sharp|promptImages|failed to load"'
```

The sidecar bridge can still succeed by registering and analyzing the physical OpenClaw media path, but Milestone 2.5 should add a deployment dependency check for `sharp` or another supported image optimization path.

## Teams Phone QA

In Microsoft Teams on iPhone, DM the Stotz sales agent:

```text
Start a trade-in evaluation for a 2021 John Deere S780 combine. It has 1200 engine hours and 850 separator hours. This is a live test.
```

Expected first response:

- The agent creates or resumes a durable trade case through the sidecar.
- The reply includes a visible `caseNumber`, such as `TIA-1234ABCD`, and the internal UUID `id`.
- The agent asks for the next two or three evidence items instead of giving only generic intake guidance.

Upload two to four machine photos. If a machine is not available, upload a non-machine image first to verify that visual inference rejects irrelevant evidence.

Then send:

```text
Use the photos I just uploaded for this trade evaluation. Tell me what is accepted, what needs a retake, and what you still need while I am in the field.
```

Expected behavior:

- The agent creates or finds an active trade case for the Teams conversation.
- The agent registers available media metadata with the sidecar.
- The sidecar queues accessible image evidence for background OpenAI inference.
- The agent replies quickly with the case number, registered count, processing acknowledgement, and the next best field ask.
- A follow-up status request reports accepted evidence, retakes, missing evidence, visible notes, queued/processing/complete counts, and the next best field ask.

Useful follow-up while processing:

```text
What do you have so far, and are the photos done processing?
```

Expected:

- The agent calls `GET /trade-cases/:id/processing-status`.
- The reply includes the case number.
- The reply distinguishes queued, processing, complete, failed, and still-needed evidence.

Useful reviewer handoff prompt:

```text
Generate the draft packet for reviewer handoff.
```

If the agent says it cannot access Teams attachments, capture the exact Teams reply and check the OpenClaw gateway logs. That indicates the remaining issue is the Teams attachment handoff layer, not the sidecar, database, or OpenAI inference path.

## Regression Prompt

Use this after each workspace or sidecar deployment:

```text
I'd like to start a trade-in evaluation for a 2021 John Deere S780 combine with 1200 engine hours and 850 separator hours.
```

Expected:

- create or resume a sidecar trade case
- return `caseNumber` and `id`
- ask for the first evidence slots, typically front 45, rear 45, and cab display/hours
- avoid responding as a generic sales intake request

## Rollback And Restart

Restart only the sidecar:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo systemctl restart trade-in-agent-sidecar.service'
```

Restart only the async evidence worker:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo systemctl restart trade-in-agent-worker.service'
```

Check queue health:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'curl -fsS http://127.0.0.1:8788/health'
```

Worker logs:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo journalctl -u trade-in-agent-worker.service --since "30 minutes ago" --no-pager'
```

Disable the sidecar without touching OpenClaw:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo systemctl disable --now trade-in-agent-sidecar.service trade-in-agent-worker.service'
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
