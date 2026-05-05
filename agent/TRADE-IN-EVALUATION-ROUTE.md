# Trade-In Evaluation Route

This is a first-class workflow route for the Stotz corporate sales agent.

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
2. Use the local sidecar at `http://127.0.0.1:8788`.
3. If the conversation has a Teams conversation id, first call:

   ```text
   GET /trade-cases/active?sourceConversationId=<teams conversation id>
   ```

4. If no active case exists, create one:

   ```text
   POST /trade-cases
   ```

5. Include the `caseNumber` and `id` in the user-facing reply whenever a case is created or resumed.
6. Ask for the next evidence from sidecar checklist or guidance. Do not rely only on chat memory.
7. When photos/videos are available, register them as evidence, analyze them through the sidecar, then fetch guidance.
8. Use the sidecar packet endpoint for reviewer handoff.

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

## Current Limits

- Numeric trade value and reconditioning dollar estimates are not automated yet.
- The route can produce evidence completeness, visible condition findings, limitations, risk flags, and draft recon scenario structure.
- Never present visual inference as a licensed mechanical inspection.
- Escalate when evidence is weak or the equipment risk is too high for photo/video review alone.
