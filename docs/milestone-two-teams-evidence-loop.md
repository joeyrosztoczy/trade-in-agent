# Milestone 2: Teams Evidence Loop

## Goal

Create the first usable Teams-driven trade-in evidence workflow.

By the end of this milestone, an OpenClaw agent running in the Stotz corporate sales deployment shape should be able to:

- start a trade case from a Teams-style conversation
- capture required machine identity fields
- register photo/video evidence against checklist slots
- send photos and sampled video frames to the OpenAI API for visual inference
- extract field-useful machine quality and condition observations from media
- tell the user what evidence was accepted, weak, missing, duplicated, or needs a retake
- generate a draft packet from stored case state

The app service remains the system of record. Teams and OpenClaw are the user interaction layer.

The specific Phase Two north star is that the agent can look at submitted photos or video evidence, identify whether the media is good enough to support the trade evaluation, call out visible condition issues, and tell the sales rep while they are still in the field whether more evidence is needed.

## Product Slice

The first useful Phase Two slice is:

> A sales rep starts a combine or high-horsepower tractor trade case, uploads field evidence through the agent conversation, receives targeted missing-evidence guidance, and ends with a draft trade/reconditioning packet ready for centralized review.

This is not yet the final valuation engine. It is the field evidence and visual inference loop that makes later valuation, reconditioning, review, and downstream integration credible.

## Milestone 2 Deliverables

1. Agent-facing tool contract for case creation, evidence registration, checklist review, and packet generation.
2. Conversation flow spec for starting and continuing a trade case from Teams.
3. Evidence intake API improvements for Teams/OpenClaw media metadata.
4. OpenAI visual inference adapter for photos and sampled video frames.
5. Persisted media analysis findings for machine condition, visible quality issues, and evidence usability.
6. Checklist response format that is easy for the agent to turn into field guidance.
7. Retake, missing-evidence, duplicate, and accepted-evidence state handling.
8. Draft packet generated from structured case, evidence state, and visual findings.
9. Agent prompt/tool instructions for the Stotz Sales OpenClaw workspace.
10. Manual QA path using `agent-tui` before live Teams testing.
11. Tests for the sidecar evidence loop, visual inference contract, and agent contract.

## Phase Two Coverage Map

Milestone 2 intentionally covers every step from the Phase 2 Teams Evidence Loop section of the implementation plan.

| Phase 2 step | Milestone 2 coverage |
|---|---|
| Let agent create trade cases from Teams | Add an agent tool contract and prompt instructions for creating a case from conversation state. |
| Register uploaded media against a case | Extend evidence registration to include Teams/OpenClaw attachment metadata and checklist slot hints. |
| Track checklist completeness | Return accepted, missing, weak, retake, and duplicate evidence state from checklist endpoints. |
| Let agent respond with accepted/missing/retake guidance | Add OpenAI visual inference, response schemas, and prompt rules that convert checklist plus image/video findings into concise field instructions. |
| Generate a draft packet from structured state | Ensure packet output summarizes evidence completeness, visible condition findings, assumptions, missing evidence, and next-step route. |

## Non-Goals

Milestone 2 should not try to solve:

- final trade value calculation
- automated reconditioning dollar estimates
- real Machine Finder Pro sync
- real JDDO/Dynamics sync
- production Teams app deployment changes unless required for local QA
- final automated computer vision condition scoring
- reviewer web UI

The milestone should perform real visual inference with the OpenAI API, but it should not pretend that visible media analysis is the same as a full mechanical inspection. Findings should be framed as visible observations, confidence, limitations, and follow-up needs.

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
5. Ask the sidecar to analyze the image or sampled video frames through the OpenAI API.
6. Store visible condition findings, evidence quality findings, and inference confidence.
7. Mark the item as `accepted`, `weak`, `needs_retake`, or `duplicate` based on media analysis, metadata, and user description.
8. Fetch checklist state.
9. Reply with a short accepted/missing/retake summary.

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
Visible notes: front tires show moderate stubble wear; no obvious panel damage in the front 45 photo.
Retake: engine compartment is too dark to judge leaks or belt condition.
Still needed: rear 45, feeder house opening, startup video.
Next: please send a rear 45 photo and a 15-30 second startup video.
```

## App Service Contract

The agent should call the sidecar over local HTTP:

```text
http://127.0.0.1:8788
```

### Required Endpoints

Milestone 1 already provides the baseline endpoints:

- `POST /trade-cases`
- `GET /trade-cases/:id`
- `PATCH /trade-cases/:id`
- `POST /trade-cases/:id/evidence`
- `GET /trade-cases/:id/checklist`
- `POST /trade-cases/:id/packet`

Milestone 2 should add or refine:

- `GET /trade-cases/active?sourceConversationId=...`
- `POST /trade-cases/:id/evidence/batch`
- `PATCH /trade-cases/:id/evidence/:evidenceId`
- `POST /trade-cases/:id/evidence/:evidenceId/analyze`
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
  "analysisStatus": "pending",
  "notes": "User described this as front left view."
}
```

### Visual Inference Request

```json
{
  "analysisMode": "field_evidence_quality",
  "media": [
    {
      "mediaType": "photo",
      "storageUri": "teams://attachment/id-or-local-placeholder",
      "contentType": "image/jpeg"
    }
  ],
  "machineContext": {
    "unitType": "combine",
    "make": "John Deere",
    "model": "S780",
    "modelYear": 2021
  },
  "checklistSlot": "front_45"
}
```

### Visual Inference Response

The sidecar should persist the raw model response metadata and return a normalized response:

```json
{
  "evidenceId": "uuid",
  "analysisStatus": "complete",
  "qualityStatus": "accepted",
  "checklistSlotConfidence": 0.86,
  "visibleConditionFindings": [
    {
      "section": "front_tires_tracks",
      "finding": "Visible tread/stubble wear appears moderate.",
      "severity": "watch",
      "confidence": 0.63,
      "needsFollowUp": false
    }
  ],
  "evidenceQualityFindings": [
    {
      "issue": "Image is clear enough for exterior panel condition but not enough for leak inspection.",
      "recommendation": "Ask for engine compartment and underbody photos."
    }
  ],
  "retakeReason": null,
  "nextEvidenceNeeded": [
    "engine_compartment",
    "rear_45"
  ]
}
```

The inference prompt should ask the model to separate:

- evidence quality: framing, blur, lighting, duplicate angle, missing target section
- visible machine condition: damage, leaks, tire/track wear, rust, welds, missing guards, display/hour visibility
- uncertainty: what cannot be determined from the media
- field guidance: what the rep should capture next while still near the machine

For videos, Milestone 2 should sample frames first and send representative frames to the OpenAI API. Full video understanding can come later if needed.

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
- visible condition summary
- retake requests
- missing evidence requests
- uncertainty and limitation summary
- suggested next message text
- packet readiness flag

## Evidence State Model

Milestone 2 should support these evidence states:

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
- how and when to trigger visual inference
- how to ask for missing evidence
- how to avoid overclaiming analysis
- when to recommend escalation to centralized review or technician inspection

The agent should speak plainly and briefly in the field. It should not expose internal checklist jargon unless useful. It should distinguish between "I can see" observations and "I cannot verify from this photo/video" limitations.

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
- sidecar analyzes the registered media, using fixture images in local QA when real Teams attachments are unavailable
- checklist shows accepted evidence, visible findings, and missing evidence
- agent asks for the next most important missing items

### 5. Sidecar API Verification

```bash
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent && ./scripts/smoke-test.sh'
```

Milestone 2 should add a second smoke path that exercises:

- create case with `sourceConversationId`
- batch evidence registration
- OpenAI visual inference against at least one image fixture
- checklist guidance response
- packet generation

## Acceptance Criteria

Milestone 2 is complete when:

- a local OpenClaw agent can create a case through the sidecar from a Teams-style prompt
- evidence can be registered with Teams/OpenClaw attachment metadata
- at least one photo is sent to the OpenAI API for visual inference during QA
- sampled video frames can be prepared for inference or passed through a fixture-backed test path
- visual findings are persisted as evidence quality findings and visible machine condition findings
- checklist state distinguishes accepted, weak, retake, duplicate, and missing evidence
- the agent can produce concise missing/retake guidance from sidecar state and visual findings
- packet generation includes evidence completeness, visible condition findings, confidence, and limitations
- tests cover the evidence loop contract
- manual QA documents the TUI path and sidecar API path

## Implementation Sequence

1. Update database schema for source conversation and media metadata fields.
2. Add active-case lookup by conversation id.
3. Add evidence batch registration.
4. Add evidence status update endpoint.
5. Add media fixture handling and video frame sampling for local QA.
6. Add OpenAI visual inference adapter and prompts.
7. Persist normalized visual findings and raw response metadata.
8. Expand checklist output to include state buckets and visual finding summaries.
9. Add deterministic guidance endpoint that incorporates inference results.
10. Add agent tool/prompt instructions.
11. Add host and VM tests for the evidence loop.
12. Update manual QA with the Phase Two workflow.

## Risks And Design Notes

- Teams file URLs may require Graph access or token-aware download later. For Milestone 2, store durable metadata and placeholder storage URIs rather than blocking on final media sync.
- The agent may be tempted to infer too much from filenames, user descriptions, or visual model output. Prompt rules should require uncertainty to be stated clearly.
- Visual inference can identify visible condition concerns, but it cannot replace mechanical inspection. The packet should keep visible findings separate from technician-level conclusions.
- OpenAI API calls need a fixture-backed test path so local tests do not depend on live API availability.
- Field users need short replies. Long checklist dumps should be avoided.
- The same conversation may have multiple active trade cases. The agent should confirm before switching active case context.
- Retake guidance should be practical and safety-aware.

## Open Questions

- Should a Teams conversation allow multiple simultaneous open trade cases, or should the agent force explicit case switching?
- What exact Teams attachment identifiers are available from the OpenClaw Teams plugin in local and deployed modes?
- Should weak evidence count toward a `fast_path_possible` route, or only toward standard review?
- What minimum identity fields should block packet generation versus appear as packet assumptions?
- Which OpenAI model should be the default for image inference in the deployed sidecar?
- How many video frames should be sampled by default for startup/walkaround videos?
