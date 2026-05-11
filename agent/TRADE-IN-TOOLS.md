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
- Do not block the Teams reply while every uploaded photo is analyzed. Register uploads with async processing, acknowledge the case number, then use processing status/guidance for follow-up replies.

See `TRADE-IN-EVALUATION-ROUTE.md` for trigger phrases and the required start/resume behavior.

## Core Flow

1. Create or resume a trade case.
2. Register Teams attachments as evidence with `processingMode: "async"` whenever the user uploads photos/video.
3. Reply immediately with the sidecar acknowledgement: case number, number of items registered, and next best field evidence.
4. Use `GET /trade-cases/:id/processing-status` when the user asks what is done so far or whether the photos worked.
5. Fetch guidance after processing completes or when the rep asks for current next steps.
6. Tell the rep what was accepted, what needs retake, what is still processing, and what is still missing.
7. Generate a draft packet when the evidence package is ready for review.

## Demo Valuation And Recon Estimate

When the user asks for trade value, valuation, appraisal, or reconditioning budget, generate a packet with:

```text
POST /trade-cases/:id/packet
```

The sidecar may include `packet.demoValuation` when demo valuation is enabled. This is a controlled QA/demo estimate, not an approved offer.

Use these fields when present:

- `demoValuation.researchMode`
- `demoValuation.valuation.estimatedTradeValueRange`
- `demoValuation.reconBudget.estimatedRange`
- `demoValuation.comparableSales`
- `demoValuation.webResearch`
- `demoValuation.assumptions`
- `demoValuation.riskAdjustments`
- `demoValuation.reviewerQuestions`

When speaking to the user:

- Say "demo trade value range" and "demo recon budget".
- Say it is not an approved offer or final shop estimate.
- Explain whether the approval posture is reviewable, held for more evidence, held for central review, or held for technician inspection.
- If `researchMode` is `web_search`, mention that public comparable listings were researched and that used-team review still needs internal sales history and business-system context.
- If the route is `technician_inspection_required`, do not imply the demo range can be approved; explain that technician review comes first.

## Useful Endpoints

- `POST /trade-cases`
- `GET /trade-cases/active?sourceConversationId=<id>`
- `POST /trade-cases/:id/evidence/batch`
- `POST /trade-cases/:id/evidence/:evidenceId/analyze`
- `GET /trade-cases/:id/processing-status`
- `GET /trade-cases/:id/checklist`
- `POST /trade-cases/:id/routing`
- `POST /trade-cases/:id/guidance`
- `POST /trade-cases/:id/packet`

## Visual Inference

For normal Teams uploads, prefer async batch registration:

```json
{
  "processingMode": "async",
  "items": [
    {
      "mediaType": "photo",
      "storageUri": "/home/openclaw/.openclaw/media/inbound/example.jpg",
      "contentType": "image/jpeg",
      "checklistSlot": "front_45",
      "sourceMessageId": "teams-message-id",
      "sourceAttachmentId": "teams-attachment-id"
    }
  ]
}
```

The response includes `caseNumber`, `registeredCount`, `queuedCount`, `processingSummary`, `nextEvidenceRequests`, and `message`. Use `message` as the basis for the immediate Teams reply.

After registering a media item, call:

```text
POST /trade-cases/:id/evidence/:evidenceId/analyze
```

Use synchronous analyze only when a tool flow explicitly needs to wait for one evidence item. To queue one item without blocking:

```json
{
  "async": true,
  "analysisMode": "field_evidence_quality",
  "checklistSlot": "front_45"
}
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
- "I am processing..." when status is queued or processing. Do not imply evidence is accepted until analysis is complete.

## Async Processing Status

Use:

```text
GET /trade-cases/:id/processing-status
```

Use this endpoint when the user asks:

- "what do you have so far?"
- "are the photos done?"
- "did those pictures work?"
- "what else do you need?"

The response includes:

- `summary.registered`
- `summary.queued`
- `summary.processing`
- `summary.complete`
- `summary.failed`
- `evidence[].analysisStatus`
- `evidence[].job.status`
- `latestGuidance`
- `message`

For field replies, lead with the case number and a compact status count. If analysis is still pending, give the next useful field ask while the queue runs.

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
