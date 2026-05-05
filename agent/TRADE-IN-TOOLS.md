# Trade-In Agent Tool Contract

The trade-in sidecar runs beside OpenClaw on the local VM.

Base URL:

```text
http://127.0.0.1:8788
```

## Field Conversation Rules

- Keep replies short enough for a sales rep standing near a machine.
- Separate visible observations from uncertainty.
- Never present visual inference as a full mechanical inspection.
- Ask for the smallest useful next set of photos/video.
- Use the sidecar as durable state; do not rely on chat memory alone.

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
- `POST /trade-cases/:id/guidance`
- `POST /trade-cases/:id/packet`

## Visual Inference

After registering a media item, call:

```text
POST /trade-cases/:id/evidence/:evidenceId/analyze
```

The sidecar sends photos or sampled video frames to the OpenAI API when `OPENAI_API_KEY` is configured. In local fixture mode it returns deterministic analysis for QA.

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
