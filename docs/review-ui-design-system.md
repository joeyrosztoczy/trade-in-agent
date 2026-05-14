# Milestone 6: Review UI Foundation And Design System

## Goal

Turn the `concept-1-field-office.html` direction into a durable internal review UI foundation for centralized used-equipment evaluators.

Milestone 6 starts with a migration-friendly design system scaffold under `review-ui/`, then connects that UI to the sidecar case/review data so reviewers can work real trade cases instead of reading generated packets in isolation.

The first implementation should remain lightweight, but it should establish the review product shape:

- a case queue for used-team reviewers
- a case detail view that exposes evidence, risk, route, valuation, and recon posture
- review actions for hold, more evidence, escalation, and approval
- packet preview/export for handoff back to sales reps
- design tokens and component primitives that can move into the future app framework without rework

## North Star

The review UI is for centralized used-equipment evaluators. It should help them move quickly from field evidence to a high-confidence decision:

- Which cases need review now?
- What is the proposed trade allowance and recon budget?
- What evidence is accepted, missing, or needs retake?
- What risks should hold value, trigger more evidence, or escalate to a technician?
- What packet can be approved and sent back to the sales rep?

The design should feel like a trade desk: dense, readable, operational, and calm. It should not feel like a marketing page.

## Product Slice

> A used-equipment reviewer opens the internal review UI, sees active trade cases from the sidecar, selects a case, reviews evidence completeness, visible condition findings, route/risk status, demo valuation/recon posture, and packet preview, then records the next review decision.

The reviewer should be able to answer:

- Is this case ready for review?
- What is missing or weak?
- What is the current route: fast path, standard review, more field evidence, or technician escalation?
- What trade value and recon range is being presented as demo/non-approved guidance?
- What should go back to the field rep?
- What action did the used team take?

## Design Source

The source concept is "Field Office":

- dark John Deere-inspired header with yellow signal rule
- warm paper workspace
- serif display numbers and headings
- monospace operational labels
- dense queue table paired with a right-side reviewer detail panel
- risk and evidence states surfaced as small, consistent badges

The scaffold keeps that direction, but separates the reusable system from the demo composition.

## Implemented Scaffold

- `review-ui/src/styles/tokens.css` - design tokens
- `review-ui/src/styles/base.css` - reset, body, focus, responsive base
- `review-ui/src/styles/components.css` - reusable primitives
- `review-ui/src/styles/demo.css` - disposable demo layout
- `review-ui/src/demo-data.js` - view-model-shaped mock data
- `review-ui/src/demo.js` - vanilla renderer with sidecar-first data loading and static fallback
- `review-ui/scripts/smoke.mjs` - static scaffold smoke check
- `review-ui/index.html` - local preview shell

## Implemented Live Review Queue Slice

The current M6 demo now reads live sidecar review data before falling back to static mock data:

- `GET /review/cases` returns queue summaries, source URLs, evidence status, risk/route state, demo valuation/recon posture, packet preview state, and latest review action.
- `GET /review/cases/:id` returns the detailed ticket view model used by the right-side reviewer panel.
- `POST /review/cases/:id/actions` persists reviewer decisions to `review_actions`.
- `app/data/online-combine-examples.json` provides a 12-listing public combine dataset for repeatable end-to-end QA.
- `npm run qa:review-queue` seeds those examples, runs async evidence processing, generates packets, and produces review tickets.

See [docs/qa/review-queue-e2e.md](qa/review-queue-e2e.md) for the latest source list, QA command path, and known gaps.

## Component Primitives

Current primitives:

- `ti-topbar`
- `ti-brand`
- `ti-nav`
- `ti-pagehead`
- `ti-kpis` / `ti-kpi`
- `ti-button`
- `ti-badge`
- `ti-risk`
- `ti-panel`
- `ti-field`
- `ti-meter`

Demo-only compositions:

- `review-main`
- `case-row`
- `detail-panel`
- `evidence-strip`
- `review-lane`

## Recommended Implementation

### 1. Formalize The Design System

Keep the design system small and explicit:

- `tokens.css` remains the source of truth for color, type, spacing, radius, shadow, density, and layout values.
- `components.css` owns portable primitives.
- `demo.css` stays disposable and should not become a dumping ground for product behavior.
- New UI work should start by adding primitives or view-model fields, not by copying one-off card styles.

Add design-system QA checks for:

- no negative letter spacing
- no viewport-width font sizing
- no hidden horizontal overflow at mobile/tablet/desktop widths
- all action buttons remain tappable at mobile widths
- selected/active/focus states are visible

### 2. Connect The UI To Sidecar Data

Replace `src/demo-data.js` with a thin data adapter that calls sidecar endpoints.

Initial API needs:

- `GET /review/cases`
- `GET /review/cases/:id`
- `GET /trade-cases/:id/processing-status`
- `POST /trade-cases/:id/guidance`
- `POST /trade-cases/:id/packet`
- review action endpoint for hold, request evidence, technician escalation, and approval

If the existing trade-case endpoints already provide enough data, the review API can be a thin view-model adapter over them. Prefer a reviewer-optimized response shape over making the browser reconstruct packet state from many raw endpoints.

### 3. Add Reviewer Workflow Controls

The first live reviewer controls should be:

- **Hold**: keep the case from moving forward and record why.
- **Request evidence**: generate or store a field-friendly ask for the sales rep.
- **Escalate technician inspection**: mark the case as requiring licensed technician review.
- **Approve packet**: record used-team approval of the packet/recommendation state.

Every review action should persist:

- reviewer identity when available
- timestamp
- action type
- short note/reason
- case route at the time of decision
- packet/demo valuation version when applicable

### 4. Add Packet Preview And Export

The review UI should show packet output without making reviewers jump back into Teams or raw API responses.

MVP packet surface:

- reviewer-oriented Markdown preview
- structured recommendation block
- demo valuation/recon block when enabled
- missing/retake evidence list
- technician escalation rationale when applicable
- copy/download/export action

For M6, export can be a local Markdown download or clipboard copy. PDF, SharePoint publishing, Machine Finder Pro sync, and Dynamics sync belong to later milestones.

### 5. Preserve Future Migration Path

The current scaffold is vanilla HTML/CSS/JS on purpose. When we migrate:

- keep token names stable
- move component primitives one at a time
- keep the view-model shape close to sidecar responses
- discard the demo renderer after the real app shell exists
- avoid tying product logic to the static demo

## Migration Contract

Keep the mock data shape close to the future API view model:

```js
{
  id,
  caseNumber,
  unit,
  modelYear,
  serial,
  hours,
  customer,
  stage,
  route,
  risk,
  proposedTrade,
  lowValue,
  highValue,
  reconBudget,
  riskFactors,
  evidence,
  reviewLines,
  summary
}
```

When the real app arrives, replace `src/demo-data.js` with sidecar data and move the CSS tokens/components into the app package. The demo renderer can be discarded.

Recommended review queue view model:

```js
{
  summary: {
    openReviews,
    avgDaysToClose,
    pipelineValue,
    avgRiskScore,
    lastSync
  },
  cases: [
    {
      id,
      caseNumber,
      unit,
      modelYear,
      customer,
      stage,
      route,
      risk,
      reviewStatus,
      proposedTrade,
      reconBudget,
      evidenceSummary,
      age
    }
  ]
}
```

Recommended review detail view model:

```js
{
  case,
  specs,
  evidence,
  processingStatus,
  checklist,
  routing,
  riskFactors,
  visibleConditionFindings,
  demoValuation,
  packetPreview,
  reviewHistory,
  availableActions
}
```

## Sidecar Data Requirements

M6 should either add or adapt endpoints so the UI can read:

- active/open review cases
- case identity, unit facts, customer/source conversation metadata
- evidence item status and quality
- async processing status
- checklist completeness and missing slots
- route, confidence, risk flags, and route reasons
- visible condition findings
- demo valuation/recon estimate when enabled
- packet preview
- review decision history

M6 should avoid duplicating business rules in browser code. The sidecar remains the source of truth for checklist, route, risk, packet, and review-state calculations.

## Out Of Scope

- Final approved valuation engine
- Final approved recon quote
- Machine Finder Pro media sync
- JDDO/Dynamics writeback
- full auth/role model beyond a simple internal reviewer assumption
- polished PDF/export workflow
- replacing the Teams field experience

Those should build on the review foundation, not block it.

## Acceptance Criteria

Milestone 6 is complete when:

1. The design system scaffold is committed and listed as M6 in the roadmap.
2. The review UI can run locally from `review-ui/`.
3. The review UI can render real sidecar case data or a documented fixture fallback.
4. The queue shows case number, unit, customer, route/stage, risk, valuation/recon posture, evidence status, and age.
5. The detail view shows evidence completeness, visible condition findings, route/risk rationale, demo valuation/recon output when present, and packet preview.
6. Reviewer actions persist to the sidecar or a clearly documented temporary review-state store.
7. Packet preview can be copied or downloaded.
8. Mobile/tablet/desktop visual QA passes with no horizontal overflow or unreadable controls.
9. A manual QA path exists for reviewing one realistic combine case end to end.

## Local QA

```bash
cd review-ui
npm run smoke
npm run start
```

Preview at:

```text
http://127.0.0.1:5177
```

Visual QA should cover:

- desktop review queue and detail layout
- tablet single-column detail layout
- mobile stacked queue/detail layout
- selecting cases
- filtering queue
- long customer names, serial numbers, route labels, and evidence names
- at least one high-risk escalation case and one fast-path candidate
