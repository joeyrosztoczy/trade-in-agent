# Milestone 3: Analysis And Routing

## Goal

Turn the Teams evidence loop into a decision-support workflow.

By the end of this milestone, the sidecar should look at accepted, weak, missing, and rejected evidence plus visible condition findings, then classify the trade case into a route that a field rep and centralized used evaluation team can act on.

Milestone 3 does not automate final trade value or final reconditioning dollars. It creates the risk-control layer that determines whether the case is ready for fast review, standard review, more field evidence, or licensed-technician escalation.

## Route Model

The sidecar computes and persists:

- `route`
- `routeCategory`
- `reviewStatus`
- `confidence`
- `routeReason`
- `riskFlags`
- `nextEvidenceRequests`
- `targetedFollowUpQuestions`

Current route values:

| Route | Category | Meaning |
|---|---|---|
| `needs_more_evidence` | collection | Required photos/video are missing, weak, or need retake. |
| `fast_path_candidate` | fast | Baseline evidence is complete and no major visible risk flags were found. |
| `standard_review` | standard | Evidence is complete, but hours, visible wear, or concern-level notes call for normal centralized review. |
| `escalation_required` | escalation | Evidence is otherwise complete, but identity or hour confirmation is missing. |
| `technician_inspection_required` | escalation | Visible condition findings indicate mechanical, leak, structural, warning-code, safety, or other high-risk issues that should not be cleared through photos alone. |

## Review Status

Current review status values:

| Review Status | Meaning |
|---|---|
| `field_collection` | Sales rep should keep collecting evidence. |
| `ready_for_fast_review` | Centralized evaluation can consider fast review. |
| `ready_for_standard_review` | Centralized evaluation should review normally. |
| `central_review_hold` | Reviewer handoff is allowed, but valuation should hold pending identity/hour follow-up. |
| `technician_inspection_required` | Licensed technician or equivalent mechanical review should be required before final approval. |

## Sidecar API

Existing guidance and packet endpoints now include routing fields:

```text
POST /trade-cases/:id/guidance
POST /trade-cases/:id/packet
```

Milestone 3 also adds an explicit routing endpoint:

```text
POST /trade-cases/:id/routing
```

The endpoint recomputes and persists the route from the latest case state.

## Persistence

Migration `003_analysis_routing.sql` adds these columns to `trade_cases`:

- `review_status`
- `review_notes`
- `review_updated_at`
- `route_reason`
- `risk_flags_json`
- `routing_decision_json`

The service updates these whenever guidance, routing, or packet generation runs.

## Routing Heuristics

The first MVP rules intentionally favor risk control over automation:

- Missing, weak, or retake-required baseline evidence stays in `needs_more_evidence`.
- Clean complete baseline evidence can become `fast_path_candidate`.
- High-hour machines or non-critical visible wear move to `standard_review`.
- Visible leak, structural, warning-code, smoke, hard-start, abnormal-noise, vibration, engine, transmission, final-drive, emissions, safety, or missing-guard risk moves to `technician_inspection_required`.
- Complete evidence with missing serial/PIN or required hour confirmation moves to `escalation_required`.

## QA Requirements

Automated:

```bash
cd app
npm test
```

Service smoke:

```bash
./scripts/smoke-test.sh
```

The smoke test should now confirm:

- sidecar health
- visual evidence analysis
- checklist status
- `needs_more_evidence` route for an incomplete smoke case
- targeted next evidence requests
- review status
- packet risk/review fields

Manual Teams QA:

1. Start a trade case from the Stotz Sales Agent Teams DM.
2. Upload one or more machine photos.
3. Ask what is accepted, what needs a retake, and what is still needed.
4. Confirm the reply includes case number, route, confidence, accepted evidence, risk/limitation language, and next evidence ask.
5. Generate a packet and confirm it includes route, review status, confidence, risk flags, and reviewer follow-up questions.

## Non-Goals

- No final numeric trade value.
- No final numeric recon budget.
- No reviewer web UI.
- No Machine Finder Pro sync.
- No JDDO/Dynamics sync.
