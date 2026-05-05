# Manual QA

For live Stotz corporate sales deployment and Microsoft Teams phone QA, use [docs/stotz-corp-sales-deployment-runbook.md](stotz-corp-sales-deployment-runbook.md).

## Phase One Sidecar QA

These steps verify the Phase One local foundations without requiring a UI.

## Multipass QA Path

The sidecar-only verified path uses the Multipass VM named `trade-in-agent-dev`.

The full OpenClaw + sidecar path must be bootstrapped for the VM you want to test. In the most recent integrated QA run, that VM was `trade-in-agent-openclaw-dev`.

### Full OpenClaw + Sidecar Bootstrap

Use this path when you want the local VM to include the Stotz corporate sales OpenClaw deployment plus the trade-in sidecar:

```bash
./scripts/bootstrap-openclaw-multipass.sh
```

This delegates the OpenClaw install to:

`~/.openclaw/workspaces/openclaw-on-azure/repo/scripts/local/qa.sh`

with the default deployment plan:

`deployments/stotz-corp-sales.json`

Then it installs the trade-in sidecar onto the same VM.

The OpenClaw QA script may return nonzero from post-smoke reconciler validation even after the gateway and Teams/SharePoint/Fabric smoke checks pass. The trade-in bootstrap continues for local development if `openclaw-gateway` is active. To make the OpenClaw validation failure stop the bootstrap, run:

```bash
OPENCLAW_STRICT_QA=1 ./scripts/bootstrap-openclaw-multipass.sh
```

Validate both services:

```bash
multipass exec trade-in-agent-dev -- sudo systemctl is-active openclaw-gateway
multipass exec trade-in-agent-dev -- sudo systemctl is-active trade-in-agent-sidecar.service
```

If you are using the already verified integrated QA VM from the current development machine, run:

```bash
multipass exec trade-in-agent-openclaw-dev -- sudo systemctl is-active openclaw-gateway
multipass exec trade-in-agent-openclaw-dev -- sudo systemctl is-active trade-in-agent-sidecar.service
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent && ./scripts/smoke-test.sh'
```

If `agent-tui` reports `Pairing required`, list and approve the pending request as the `openclaw` user:

```bash
multipass shell trade-in-agent-openclaw-dev
sudo -u openclaw -H env HOME=/home/openclaw openclaw devices list
sudo -u openclaw -H env HOME=/home/openclaw openclaw devices approve <requestId>
agent-tui
```

If approval itself triggers a scope-upgrade request, rerun `openclaw devices list` and approve the newest request id.

### 1. Bootstrap VM

```bash
./scripts/bootstrap-multipass.sh
```

This provisions:

- Ubuntu 24.04 VM
- Postgres
- Node 22
- app dependencies
- database migrations
- seed data
- unit tests

### 2. Verify Sidecar Service In VM

```bash
multipass exec trade-in-agent-dev -- systemctl is-active trade-in-agent-sidecar.service
```

Expected:

- `active`

To restart it manually:

```bash
multipass exec trade-in-agent-dev -- sudo systemctl restart trade-in-agent-sidecar.service
```

### 3. Health Check

```bash
multipass exec trade-in-agent-dev -- curl -fsS http://127.0.0.1:8788/health
```

Expected:

- JSON response with `ok: true`
- `service` equals `trade-in-agent-sidecar`

### 4. Run Smoke Test

```bash
multipass exec trade-in-agent-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent && ./scripts/smoke-test.sh'
```

Expected:

- smoke script prints JSON with `ok: true`
- a new trade case id
- checklist counts
- packet id
- route, usually `needs_more_evidence` because the smoke test only uploads one evidence item
- review status and targeted next evidence requests

### 5. Manual API Walkthrough

Create a trade case:

```bash
curl -fsS http://127.0.0.1:8788/trade-cases \
  -H 'Content-Type: application/json' \
  -d '{
    "createdBy": "manual-qa",
    "machine": {
      "unitType": "combine",
      "make": "John Deere",
      "model": "S780",
      "modelYear": 2021,
      "serialOrPin": "QA-PIN",
      "engineHours": 1200,
      "separatorHours": 850,
      "location": "Manual QA"
    }
  }'
```

Set `CASE_ID` from the returned `id`, then register evidence:

```bash
curl -fsS "http://127.0.0.1:8788/trade-cases/$CASE_ID/evidence" \
  -H 'Content-Type: application/json' \
  -d '{
    "uploadedBy": "manual-qa",
    "mediaType": "photo",
    "storageUri": "fixtures/media/front-45-placeholder.jpg",
    "checklistSlot": "front_45",
    "qualityStatus": "accepted"
  }'
```

Fetch checklist:

```bash
curl -fsS "http://127.0.0.1:8788/trade-cases/$CASE_ID/checklist"
```

Compute routing:

```bash
curl -fsS -X POST "http://127.0.0.1:8788/trade-cases/$CASE_ID/routing"
```

Generate packet:

```bash
curl -fsS -X POST "http://127.0.0.1:8788/trade-cases/$CASE_ID/packet"
```

Expected packet includes:

- machine identity
- evidence completeness
- missing evidence
- route
- review status
- confidence
- risk flags
- targeted follow-up questions
- recommendation / next step

## Phase Two Evidence Loop QA

The Phase Two smoke test exercises the Teams-style evidence loop in fixture mode:

- creates a case with `sourceConversationId`
- registers Teams/OpenClaw-style attachment metadata
- runs visual inference through the sidecar fixture adapter
- stores visible condition and evidence quality findings
- returns field guidance
- generates a packet that includes findings and limitations

```bash
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent && ./scripts/smoke-test.sh'
```

Expected:

- `visibleFindingCount` is greater than `0`
- `guidance` includes accepted evidence, visible notes, missing evidence, route, review status, and limitations
- `route` is `needs_more_evidence` until all required baseline slots are accepted

To run live OpenAI visual inference, add an API key to the VM `.env`, switch out of fixture mode, restart the service, and rerun the smoke path:

```bash
multipass exec trade-in-agent-openclaw-dev -- bash -lc "cd /home/ubuntu/trade-in-agent && printf '\nOPENAI_API_KEY=sk-...\nOPENAI_VISION_MODE=live\n' >> .env"
multipass exec trade-in-agent-openclaw-dev -- sudo systemctl restart trade-in-agent-sidecar.service
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent && ./scripts/smoke-test.sh'
```

When bootstrapping through `scripts/bootstrap-openclaw-multipass.sh`, the sidecar automatically uses the `OPENAI_API_KEY` from the selected OpenClaw deployment secrets file when it is present. For the Stotz corporate sales deployment, that means the sidecar and OpenClaw usage are tracked against the same OpenAI key.

The model policy is:

- `OPENAI_VISION_MODEL=gpt-5.4-mini` for routine field evidence analysis
- `OPENAI_VISION_REVIEW_MODEL=gpt-5.4` for high-risk or reviewer-grade analysis

Use the review model by passing `analysisMode: "high_risk"`, `analysisMode: "review_grade"`, `escalate: true`, or `useReviewModel: true` to the evidence analysis endpoint.

Do not commit real API keys. The default `OPENAI_VISION_MODE=fixture` path is the repeatable local QA path when deployment secrets are unavailable.

## Host QA Path

Host QA requires Postgres reachable via `DATABASE_URL`.

```bash
cp -n infra/local/env.example .env
./scripts/bootstrap-host.sh
./scripts/dev.sh
```

In another terminal:

```bash
./scripts/smoke-test.sh
```

On this Mac, host QA currently needs a separately installed local Postgres or container runtime. The Multipass path is the verified Postgres-backed path.
