# Milestone Two: Teams Evidence Loop

## Goal

Create the first usable Teams-driven trade-in evidence workflow.

By the end of this milestone, an OpenClaw agent running in the Stotz corporate sales deployment shape should be able to:

- start a trade case from a Teams-style conversation
- capture required machine identity fields
- register photo/video evidence against checklist slots
- tell the user what evidence was accepted, weak, missing, duplicated, or needs a retake
- generate a draft packet from stored case state

The app service remains the system of record. Teams and OpenClaw are the user interaction layer.

## Product Slice

The first useful Phase Two slice is:

> A sales rep starts a combine or high-horsepower tractor trade case, uploads field evidence through the agent conversation, receives targeted missing-evidence guidance, and ends with a draft trade/reconditioning packet ready for centralized review.

This is not yet the final valuation engine. It is the field evidence loop that makes later valuation, reconditioning, review, and downstream integration credible.

## Milestone Two Deliverables

1. Agent-facing tool contract for case creation, evidence registration, checklist review, and packet generation.
2. Conversation flow spec for starting and continuing a trade case from Teams.
3. Evidence intake API improvements for Teams/OpenClaw media metadata.
4. Checklist response format that is easy for the agent to turn into field guidance.
5. Retake, missing-evidence, duplicate, and accepted-evidence state handling.
6. Draft packet generated from structured case and evidence state.
7. Agent prompt/tool instructions for the Stotz Sales OpenClaw workspace.
8. Manual QA path using `agent-tui` before live Teams testing.
9. Tests for the sidecar evidence loop and agent contract.

## Phase Two Coverage Map

Milestone Two intentionally covers every step from the Phase 2 Teams Evidence Loop section of the implementation plan.

| Phase 2 step | Milestone Two coverage |
|---|---|
| Let agent create trade cases from Teams | Add an agent tool contract and prompt instructions for creating a case from conversation state. |
| Register uploaded media against a case | Extend evidence registration to include Teams/OpenClaw attachment metadata and checklist slot hints. |
| Track checklist completeness | Return accepted, missing, weak, retake, and duplicate evidence state from checklist endpoints. |
| Let agent respond with accepted/missing/retake guidance | Add response schemas and prompt rules that convert checklist state into concise field instructions. |
| Generate a draft packet from structured state | Ensure packet output summarizes evidence completeness, assumptions, missing evidence, and next-step route. |

## Non-Goals

Milestone Two should not try to solve:

- final trade value calculation
- automated reconditioning dollar estimates
- real Machine Finder Pro sync
- real JDDO/Dynamics sync
- production Teams app deployment changes unless required for local QA
- full computer vision condition scoring
- reviewer web UI

The milestone can include light quality heuristics and placeholder analysis fields, but it should not pretend that uploaded media has received deep mechanical analysis.

## Conversation Flow

### Start Case

Trigger examples:

- `Start trade evaluation`
- `Start a combine trade`
- `I need to evaluate a 2021 S780`

Agent behavior:

1. Determine whether the user wants a new trade case or is continuing an existing one.
2. Ask for the minimum machine identity fields if missing.
3. Create the trade case through the sidecar.
4. Return the case id and a compact baseline shot list.
5. Keep the next request focused on field collection, not long explanation.

Minimum identity fields:

- unit type
- make
- model
- model year, if known
- serial/PIN, if available
- hours, if available
- location

### Evidence Upload

When the user uploads media, the agent should:

1. Identify the active trade case.
2. Register each attachment as an evidence item.
3. Attach Teams/OpenClaw metadata to the evidence record.
4. Infer or ask for the checklist slot when uncertain.
5. Mark the item as `accepted`, `weak`, `needs_retake`, or `duplicate` based on available metadata and user description.
6. Fetch checklist state.
7. Reply with a short accepted/missing/retake summary.

### Follow-Up Guidance

The agent should prefer targeted next asks:

- Ask for the most important missing evidence first.
- Group nearby physical shots when useful.
- Avoid repeating already accepted shots.
- Escalate safety-sensitive asks with caution, especially underbody/leak evidence.
- Accept that some evidence may be unavailable in the field and mark the assumption.

Example response shape:

```text
Accepted: front 45, serial plate, cab hours.
Retake: engine compartment is too dark to use.
Still needed: rear 45, feeder house opening, startup video.
Next: please send a rear 45 photo and a 15-30 second startup video.
```

## App Service Contract

The agent should call the sidecar over local HTTP:

```text
http://127.0.0.1:8788
```

### Required Endpoints

Milestone One already provides the baseline endpoints:

- `POST /trade-cases`
- `GET /trade-cases/:id`
- `PATCH /trade-cases/:id`
- `POST /trade-cases/:id/evidence`
- `GET /trade-cases/:id/checklist`
- `POST /trade-cases/:id/packet`

Milestone Two should add or refine:

- `GET /trade-cases/active?sourceConversationId=...`
- `POST /trade-cases/:id/evidence/batch`
- `PATCH /trade-cases/:id/evidence/:evidenceId`
- `POST /trade-cases/:id/guidance`

The `guidance` endpoint can be deterministic at first. Its job is to convert stored checklist and evidence state into a compact agent-ready response.

### Trade Case Creation Payload

```json
{
  "createdBy": "teams:user-or-openclaw-id",
  "sourceConversationId": "teams-conversation-id",
  "machine": {
    "unitType": "combine",
    "make": "John Deere",
    "model": "S780",
    "modelYear": 2021,
    "serialOrPin": "1H0S780...",
    "engineHours": 1200,
    "separatorHours": 850,
    "location": "Customer farm near Buckeye, AZ"
  }
}
```

### Evidence Registration Payload

```json
{
  "uploadedBy": "teams:user-or-openclaw-id",
  "mediaType": "photo",
  "storageUri": "teams://attachment/id-or-local-placeholder",
  "originalFileName": "IMG_1234.jpeg",
  "contentType": "image/jpeg",
  "sourceMessageId": "teams-message-id",
  "sourceAttachmentId": "teams-attachment-id",
  "checklistSlot": "front_45",
  "qualityStatus": "accepted",
  "notes": "User described this as front left view."
}
```

### Checklist Response Requirements

The checklist response should expose:

- required count
- accepted count
- weak count
- retake count
- missing count
- accepted slots
- weak slots
- retake slots
- missing slots
- next recommended slots

The agent should not need to recalculate completeness from raw evidence.

### Guidance Response Requirements

The guidance response should expose:

- case id
- current route
- accepted evidence summary
- retake requests
- missing evidence requests
- suggested next message text
- packet readiness flag

## Evidence State Model

Milestone Two should support these evidence states:

- `accepted`: usable for the packet
- `weak`: partially useful, may need follow-up
- `needs_retake`: not usable enough
- `duplicate`: already represented by better evidence
- `rejected`: unrelated or unsafe to use

Only `accepted` evidence should count toward baseline completeness by default.

`weak` evidence can reduce urgency but should still be called out in the packet as an assumption or limitation.

## Agent Instructions

Add agent-facing instructions under `agent/` or the OpenClaw workspace artifact path that tell the agent:

- the sidecar base URL
- how to create and resume cases
- how to register Teams attachments
- how to ask for missing evidence
- how to avoid overclaiming analysis
- when to recommend escalation to centralized review or technician inspection

The agent should speak plainly and briefly in the field. It should not expose internal checklist jargon unless useful.

## Local QA Path

### 1. Start Integrated VM

```bash
VM_NAME=trade-in-agent-openclaw-dev KEEP_VM=1 ./scripts/bootstrap-openclaw-multipass.sh
```

### 2. Verify Services

```bash
multipass exec trade-in-agent-openclaw-dev -- sudo systemctl is-active openclaw-gateway
multipass exec trade-in-agent-openclaw-dev -- sudo systemctl is-active trade-in-agent-sidecar.service
```

### 3. Open Agent TUI

```bash
multipass shell trade-in-agent-openclaw-dev
agent-tui
```

If pairing is required:

```bash
sudo -u openclaw -H env HOME=/home/openclaw openclaw devices list
sudo -u openclaw -H env HOME=/home/openclaw openclaw devices approve <requestId>
agent-tui
```

### 4. Manual Conversation Test

Use `agent-tui` to simulate the Teams flow:

```text
Start a trade evaluation for a 2021 John Deere S780 combine near Buckeye. It has 1200 engine hours and 850 separator hours.
```

Expected:

- agent creates a trade case
- agent asks only for missing minimum fields, if any
- agent returns a compact baseline shot list

Then simulate uploaded evidence by asking the agent to register placeholder media:

```text
Register a front 45 photo, serial plate photo, and cab hours photo for this case.
```

Expected:

- sidecar has three evidence records
- checklist shows accepted evidence and missing evidence
- agent asks for the next most important missing items

### 5. Sidecar API Verification

```bash
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent && ./scripts/smoke-test.sh'
```

Milestone Two should add a second smoke path that exercises:

- create case with `sourceConversationId`
- batch evidence registration
- checklist guidance response
- packet generation

## Acceptance Criteria

Milestone Two is complete when:

- a local OpenClaw agent can create a case through the sidecar from a Teams-style prompt
- evidence can be registered with Teams/OpenClaw attachment metadata
- checklist state distinguishes accepted, weak, retake, duplicate, and missing evidence
- the agent can produce concise missing/retake guidance from sidecar state
- packet generation includes evidence completeness and limitations
- tests cover the evidence loop contract
- manual QA documents the TUI path and sidecar API path

## Implementation Sequence

1. Update database schema for source conversation and media metadata fields.
2. Add active-case lookup by conversation id.
3. Add evidence batch registration.
4. Add evidence status update endpoint.
5. Expand checklist output to include state buckets.
6. Add deterministic guidance endpoint.
7. Add agent tool/prompt instructions.
8. Add host and VM tests for the evidence loop.
9. Update manual QA with the Phase Two workflow.

## Risks And Design Notes

- Teams file URLs may require Graph access or token-aware download later. For Milestone Two, store durable metadata and placeholder storage URIs rather than blocking on final media sync.
- The agent may be tempted to infer too much from filenames or user descriptions. Prompt rules should require uncertainty to be stated clearly.
- Field users need short replies. Long checklist dumps should be avoided.
- The same conversation may have multiple active trade cases. The agent should confirm before switching active case context.
- Retake guidance should be practical and safety-aware.

## Open Questions

- Should a Teams conversation allow multiple simultaneous open trade cases, or should the agent force explicit case switching?
- What exact Teams attachment identifiers are available from the OpenClaw Teams plugin in local and deployed modes?
- Should weak evidence count toward a `fast_path_possible` route, or only toward standard review?
- What minimum identity fields should block packet generation versus appear as packet assumptions?
