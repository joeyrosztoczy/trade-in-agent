# Manual QA

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

Generate packet:

```bash
curl -fsS -X POST "http://127.0.0.1:8788/trade-cases/$CASE_ID/packet"
```

Expected packet includes:

- machine identity
- evidence completeness
- missing evidence
- route
- recommendation / next step

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
