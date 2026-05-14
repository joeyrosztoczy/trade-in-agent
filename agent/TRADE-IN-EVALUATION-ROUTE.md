# Trade-In Evaluation Route

This is a first-class workflow route for the Stotz corporate sales agent.

Contract version: `trade-in-sidecar/v1`.

When native tools are available, prefer the stable `trade_case_*` tools from `@premier/trade-in-agent-openclaw-plugin`. Existing Stotz deployments may also expose `trade_in_*` aliases; those are compatible with the same sidecar API.

## Trigger

Use this route before giving a generic intake response when the user says or implies any of:

- start a trade-in evaluation
- evaluate a trade
- trade evaluation
- trade appraisal
- combine trade
- tractor trade
- used equipment evaluation
- reconditioning budget for a trade
- recon budget for a machine
- check whether these photos are enough for a trade

## Required Behavior

1. Check or create durable sidecar state before replying.
2. Use `trade_case_start` or the deployment alias `trade_in_start_or_resume` before replying.
3. Use the local sidecar at `http://127.0.0.1:8788` only when no first-class tool is available.
4. If the conversation has a Teams conversation id and you are using HTTP fallback, first call:

   ```text
   GET /trade-cases/active?sourceConversationId=<teams conversation id>
   ```

5. If no active case exists, create one:

   ```text
   POST /trade-cases
   ```

6. Include the `caseNumber` and `id` in the user-facing reply whenever a case is created or resumed.
7. Ask for the next evidence from sidecar checklist or guidance. Do not rely only on chat memory.
8. When photos/videos are available, use `trade_case_register_field_uploads` when visible. It forces async processing and returns the immediate acknowledgement. If only lower-level tools are visible, use `trade_case_add_evidence` or `POST /trade-cases/:id/evidence/batch` with async processing and reply with the sidecar acknowledgement instead of waiting for every image to finish.
9. When the user asks what is done so far, use `trade_case_processing_status` or `GET /trade-cases/:id/processing-status` and report queued, processing, complete, failed, retake, and missing evidence clearly.
10. Use the guidance route and review status when answering. Do not invent a route from chat memory.
11. Use the sidecar packet endpoint for reviewer handoff after required evidence analysis is complete or limitations are clearly stated.

## Start-Case Payload Shape

```json
{
  "createdBy": "teams:user-or-openclaw-id",
  "sourceConversationId": "teams-conversation-id",
  "machine": {
    "unitType": "combine",
    "make": "John Deere",
    "model": "S780",
    "modelYear": 2021,
    "serialOrPin": null,
    "engineHours": 1200,
    "separatorHours": 850,
    "location": null
  }
}
```

## Successful Start Reply

The reply should lead with the durable workflow id:

```text
Trade case TIA-1234ABCD is open. Internal id: <uuid>.

Next, please send front 45, rear 45, and cab display/hours photos.
```

## Demo Valuation Limits

- Demo trade value and reconditioning dollar ranges may be produced by the sidecar packet when demo valuation is enabled.
- The demo valuation is not an approved offer, confirmed sale price, or final shop estimate.
- Live demo valuation may use GPT-5.5 web research for public comparable listings when configured.
- The route still produces evidence completeness, visible condition findings, limitations, risk flags, approval posture, and draft packet structure.
- Never present visual inference as a licensed mechanical inspection.
- Escalate when evidence is weak or the equipment risk is too high for photo/video review alone.
- If the packet says the case is held for more evidence, central review, or technician inspection, explain that hold instead of treating the demo range as approval-ready.

## Routing Output

Milestone 3 routes are computed by the sidecar:

- `needs_more_evidence`
- `fast_path_candidate`
- `standard_review`
- `escalation_required`
- `technician_inspection_required`

Always prefer `POST /trade-cases/:id/guidance` for field replies because it includes the route, confidence, risk flags, next evidence requests, and targeted follow-up questions in one response.

For newly uploaded media, prefer `trade_case_register_field_uploads` first, then use `GET /trade-cases/:id/processing-status` for progress replies. Do not call `trade_case_analyze_evidence` in the same Teams turn after upload registration.
