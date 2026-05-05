# Trade-In Agent Tool Contract

The trade-in sidecar runs beside OpenClaw on the local VM.

Base URL:

```text
http://127.0.0.1:8788
```

## Field Conversation Rules

- Treat trade-in evaluation as a first-class route. If the user asks to start, continue, evaluate, appraise, or build a recon budget for an equipment trade, use this sidecar before giving a generic intake answer.
- On successful create or resume, include both `caseNumber` and `id` in the reply so the user can tell they are in the durable workflow.
- Keep replies short enough for a sales rep standing near a machine.
- Separate visible observations from uncertainty.
- Never present visual inference as a full mechanical inspection.
- Ask for the smallest useful next set of photos/video.
- Use the sidecar as durable state; do not rely on chat memory alone.

See `TRADE-IN-EVALUATION-ROUTE.md` for trigger phrases and the required start/resume behavior.

## Core Flow

1. Create or resume a trade case.
2. Register Teams attachments as evidence.
3. Analyze each photo or sampled video frame through the sidecar.
4. Fetch guidance.
5. Tell the rep what was accepted, what needs retake, and what is still missing.
6. Generate a draft packet when the evidence package is ready for review.

## Useful Endpoints

- `POST /trade-cases`
- `GET /trade-cases/active?sourceConversationId=<id>`
- `POST /trade-cases/:id/evidence/batch`
- `POST /trade-cases/:id/evidence/:evidenceId/analyze`
- `GET /trade-cases/:id/checklist`
- `POST /trade-cases/:id/routing`
- `POST /trade-cases/:id/guidance`
- `POST /trade-cases/:id/packet`

## Visual Inference

After registering a media item, call:

```text
POST /trade-cases/:id/evidence/:evidenceId/analyze
```

The sidecar sends photos or sampled video frames to the OpenAI API when `OPENAI_API_KEY` is configured. In local fixture mode it returns deterministic analysis for QA.

Default model policy:

- routine field evidence analysis uses `OPENAI_VISION_MODEL`, defaulting to `gpt-5.4-mini`
- high-risk or reviewer-grade analysis uses `OPENAI_VISION_REVIEW_MODEL`, defaulting to `gpt-5.4`

To request the review model, set one of:

- `"analysisMode": "high_risk"`
- `"analysisMode": "review_grade"`
- `"escalate": true`
- `"useReviewModel": true`

For video, pass representative frame image URIs in `sampledFrames`:

```json
{
  "analysisMode": "field_evidence_quality",
  "checklistSlot": "startup_video",
  "sampledFrames": [
    {
      "storageUri": "/path/to/frame-001.jpg",
      "contentType": "image/jpeg"
    }
  ]
}
```

Use the returned fields:

- `qualityStatus`
- `visibleConditionFindings`
- `evidenceQualityFindings`
- `retakeReason`
- `nextEvidenceNeeded`

When speaking to the user:

- "I can see..." only for visible findings.
- "I cannot verify..." for limitations.
- "Please retake..." for `needs_retake`.
- "Still needed..." for missing checklist slots.

## Routing And Review Status

After analysis, call guidance or routing before replying:

```text
POST /trade-cases/:id/guidance
```

Guidance includes `route`, `reviewStatus`, `confidence`, `riskFlags`, `nextEvidenceRequests`, and `targetedFollowUpQuestions`.

Route meanings:

- `needs_more_evidence`: keep the rep in field collection and ask for the next smallest useful evidence set.
- `fast_path_candidate`: evidence is complete and clean enough for fast centralized review.
- `standard_review`: evidence is complete, but hours, visible wear, or concern-level notes need normal reviewer handling.
- `escalation_required`: reviewer handoff is allowed, but identity or hour confirmation blocks valuation approval.
- `technician_inspection_required`: visible high-risk condition findings require licensed technician or equivalent mechanical review before final approval.

When speaking to the user, include the case number and the current route/confidence in plain language. If the route is `technician_inspection_required`, do not suggest a trade value or recon budget approval; explain that the case needs mechanical review first.
