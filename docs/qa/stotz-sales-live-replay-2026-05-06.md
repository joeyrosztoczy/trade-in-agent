# Stotz Sales Live Replay

Date: 2026-05-06

Branch deployed:

```text
codex/goal-initial-user-qa
```

Deployed commit:

```text
4368a05 Harden live smoke routing
```

Target VM:

```text
resource group: prod-sales-agent
vm: stotz-sales-agent-prod-vmss_015271c9
app root: /home/openclaw/openclaw-workspace/trade-in-agent
sidecar: http://127.0.0.1:8788
```

## Deployment Verification

Remote service state:

```text
trade-in-agent-sidecar: active
openclaw-gateway: active
sidecar /health: ok
```

Remote tests:

```text
npm test: 19/19 passing
./scripts/smoke-test.sh: ok
```

Live inference confirmation:

```text
provider | model        | mode | count
openai   | gpt-5.4-mini | live | 26
```

## Live Replay Run

Command:

```bash
sudo -u openclaw -H bash -lc \
  'set -a; source /home/openclaw/openclaw-workspace/trade-in-agent/.env; set +a; cd /home/openclaw/openclaw-workspace/trade-in-agent/app && npm run qa:user-flow'
```

Run id:

```text
2026-05-06T12-45-42-368Z
```

Output directory:

```text
/home/openclaw/openclaw-workspace/qa-output/2026-05-06T12-45-42-368Z/
```

Scenarios:

| Scenario | Case | Route | Review status | Result |
|---|---|---|---|---|
| `partial-field-walkaround` | `TIA-0D89999D` | `needs_more_evidence` | `field_collection` | Passed automated guidance and packet checks |
| `full-walkaround-with-startup-video` | `TIA-C3845772` | `needs_more_evidence` | `field_collection` | Passed automated guidance and packet checks |

Automated observations passed for both scenarios:

- case number visible to the rep
- no raw checklist slot ids in guidance
- next action included
- reviewer brief present
- readable evidence summary present
- startup-video limitation captured

## Teams Phone Replay Path

Use the Stotz Sales Agent in Teams.

### 1. Start A Case

Send:

```text
Start a trade-in evaluation for a 2020 John Deere S780 combine. It has about 1,039 engine hours and 683 separator hours. I am out with the customer and can upload photos.
```

Expected:

- The agent creates or resumes a trade case.
- The response includes a `TIA-...` case number.
- The response asks for the first few useful evidence slots.

### 2. Upload A Partial Walkaround

Upload 3-4 photos:

- front 45-degree view
- left side
- rear 45-degree view
- front tire or track close-up

Then ask:

```text
Are these enough to keep going? What should I send next?
```

Expected:

- Accepted evidence is named in plain language.
- The next ask is short, usually right side, serial/PIN, and model badging.
- The response should not show internal names like `front_45`.

### 3. Upload The Full Baseline Set

Continue with:

- right side
- serial plate / PIN
- model badging
- cab display with engine and separator hours
- feeder house opening
- engine compartment
- front and rear tires or tracks
- close-up of visible damage, leaks, rust, welds, or missing guards
- startup video

Startup video guidance:

- Capture cold start if possible.
- Hold through idle.
- Include exhaust.
- Include warning lights / display.
- Let abnormal sound be audible if safe to record.

Then ask:

```text
What still needs a retake or clearer evidence before the used team reviews this?
```

Expected:

- Weak or unclear uploads are called out as `Need better evidence` or retakes.
- Startup video should not be treated as complete unless it contains enough real startup context.
- The case remains in field collection if required evidence is missing, weak, or retake-needed.

### 4. Ask For Used-Team Handoff

Send:

```text
Generate the used team review packet for this trade case.
```

Expected:

- The packet includes machine identity, evidence status, visible positives, visible concerns, limitations, field follow-up, route, review status, confidence, and recon scenario placeholders.
- It should not provide final trade value or final recon dollars yet.
- It should escalate to technician inspection only for actual visible mechanical, structural, leak, smoke, warning-code, or safety risk.

## CLI Replay From Local Machine

After generating an Azure SSH config for the VM, run:

```bash
ssh -F /tmp/stotz-sales-ssh/config prod-sales-agent-stotz-sales-agent-prod-vmss_015271c9 \
  'sudo -u openclaw -H bash -lc "cd /home/openclaw/openclaw-workspace/trade-in-agent && ./scripts/smoke-test.sh"'
```

Run the full realistic replay:

```bash
ssh -F /tmp/stotz-sales-ssh/config prod-sales-agent-stotz-sales-agent-prod-vmss_015271c9 \
  'sudo -u openclaw -H bash -lc "set -a; source /home/openclaw/openclaw-workspace/trade-in-agent/.env; set +a; cd /home/openclaw/openclaw-workspace/trade-in-agent/app && npm run qa:user-flow"'
```

Inspect the latest output:

```bash
ssh -F /tmp/stotz-sales-ssh/config prod-sales-agent-stotz-sales-agent-prod-vmss_015271c9 \
  'sudo -u openclaw -H bash -lc "ls -td /home/openclaw/openclaw-workspace/qa-output/* | head -1"'
```
