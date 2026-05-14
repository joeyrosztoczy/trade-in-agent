# Review Queue End-To-End QA

Captured: 2026-05-14

Branch: `codex/goal-review-queue-e2e`

## Purpose

This QA path proves the Milestone 6 review queue can use real sidecar data instead of static demo rows. It starts with public combine listings, registers listing photos as field evidence, processes that evidence through the async worker path, generates demo valuation/recon packets, and renders reviewer tickets through the M6 review UI.

The public listings are intentionally incomplete compared with an ideal field intake. That is useful for QA because the system should ask for more evidence instead of pretending dealer listing photos are enough for an approved trade offer.

## Fixture Dataset

Fixture file:

```text
app/data/online-combine-examples.json
```

The dataset includes 12 public combine examples across John Deere, Case IH, New Holland, CLAAS, and Gleaner. Source facts are captured for controlled product QA only. Asking prices are listing prices, not approved trade values.

| Fixture | Unit | Dealer | Location | Asking price | Hours | Evidence items | Source |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| `stotz-11512615` | 2024 John Deere S780 | Stotz Equipment | Burley, ID | USD 589,000 | 262 engine / 218 separator | 6 | https://stotzeq.com/used-equipment/11512615 |
| `stotz-10036066` | 2022 John Deere S780 | Stotz Equipment | Twin Falls, ID | USD 449,000 | 762 engine / 486 separator | 4 | https://stotzeq.com/used-equipment/10036066 |
| `stotz-11033496` | 2020 John Deere S780 | Stotz Equipment | Twin Falls, ID | USD 399,999 | 1039 engine / 683 separator | 4 | https://stotzeq.com/used-equipment/11033496 |
| `stotz-9613450` | 2018 John Deere S780 | Stotz Equipment | Tremonton, UT | USD 249,900 | 1739 engine / 1171 separator | 4 | https://stotzeq.com/used-equipment/9613450 |
| `stotz-11477295` | 1998 Case IH 2388 | Stotz Equipment | Tremonton, UT | USD 15,000 | 3689 engine / 3005 separator | 4 | https://stotzeq.com/used-equipment/11477295 |
| `agdealer-1286008` | 2023 John Deere X9 1100 | Brandt Agriculture | Watrous, Saskatchewan | CAD 897,000 | 762 engine | 4 | https://www.agdealer.com/detail/1286008/used-2023-john-deere-x9-1100-combine |
| `agdealer-1350197` | 2023 New Holland CR9.90 | Redhead Equipment | Kinistino, Saskatchewan | CAD 619,000 | Unknown | 4 | https://www.agdealer.com/detail/1350197/new-holland-cr990 |
| `agdealer-1422703` | 2021 CLAAS LEXION 8700 | Foster's Agri-World | Beaverlodge, Alberta | CAD 535,000 | 1230 engine / 975 separator | 4 | https://www.agdealer.com/detail/1422703/2021-claas-lexion-8700 |
| `agdealer-1409936` | 2021 CLAAS LEXION 8700TT | True North Equipment | Grand Forks, ND | USD 312,031 | 1761 engine | 4 | https://www.agdealer.com/detail/1409936/2021-claas-lexion-8700tt |
| `agdealer-1350422` | 1995 Gleaner R62 | Yurke Sales & Service Ltd. | Comber, Ontario | CAD 25,000 | 4196 engine / 2945 separator | 4 | https://www.agdealer.com/detail/1350422/1995-gleaner-r62 |
| `agdealer-1410032` | 1993 Gleaner R62 | Southpoint Equipment | Chatham, Ontario | CAD 37,900 | 4196 engine / 2789 separator | 4 | https://www.agdealer.com/detail/1410032/1993-gleaner-r62 |
| `agdealer-1335820` | 2023 Case IH 8250 | Equipment Ontario Ltd. | Elmira, Ontario | CAD 672,880 | 885 engine / 647 separator | 5 | https://www.agdealer.com/detail/1335820/2023-case-ih-8250 |

## Local E2E Command

Start the sidecar in fixture mode:

```bash
cd app
OPENAI_VISION_MODE=fixture DEMO_VALUATION_ENABLED=true DEMO_VALUATION_MODE=fixture PORT=8788 npm run dev
```

In another terminal, seed and process the review queue:

```bash
cd app
npm run qa:review-queue
```

What the script does:

- verifies `/health`
- creates or resumes one trade case per fixture
- registers evidence with `processingMode: async`
- drains the worker queue with concurrent async processing
- runs routing
- generates a packet with demo valuation/recon enabled
- fetches `/review/cases`
- writes a run summary under `qa-output/review-queue-e2e/`

Latest local result:

```text
examplesProcessed: 12
worker batches: 24 complete, 24 complete, 4 complete, 0 remaining
worker failures: 0
seeded case numbers:
TIA-8B4FCB3A, TIA-3F958B41, TIA-511A2BED, TIA-E067B9E1,
TIA-F68289C4, TIA-37B7CAC5, TIA-FAF062E5, TIA-25161435,
TIA-4EF0718F, TIA-620C3361, TIA-72F9E194, TIA-472A58E6
```

Example detail verification for `TIA-8B4FCB3A`:

```text
Field evidence: 6 accepted / 0 retakes / 7 missing
Async processing: 6 done / 0 active
Recon posture: $32,000-$59,500 demo
Next decision: Request field evidence
Source: https://stotzeq.com/used-equipment/11512615
```

## Review UI QA

Run the review UI preview:

```bash
cd review-ui
npm run start
```

Open:

```text
http://127.0.0.1:5177/
```

Expected:

- top-right status shows `Live sidecar`
- queue rows come from `/review/cases`, not `src/demo-data.js`
- queue summary shows open reviews, field evidence count, pipeline demo value, and average risk
- selecting a case loads `/review/cases/:id`
- detail panel shows source listing, evidence tiles, async processing status, demo value/recon posture, packet preview, and reviewer actions

Reviewer action smoke path:

```bash
curl -fsS "http://127.0.0.1:8788/review/cases/$CASE_ID/actions" \
  -H 'Content-Type: application/json' \
  -d '{
    "actionType": "request_more_evidence",
    "reviewer": "manual-qa",
    "note": "Need missing rear, model badge, startup, and risk close-up evidence."
  }'
```

Also verify:

- `hold_for_technician` moves the case to `technician_inspection_required`
- `approve_packet` records approval history and removes the case from open-review count
- after each action, reloading the UI keeps the latest action visible because state is persisted in `review_actions`

Local action QA on 2026-05-14:

```text
TIA-8B4FCB3A: request_more_evidence -> field_collection
TIA-F68289C4: hold_for_technician -> technician_inspection_required
TIA-37B7CAC5: approve_packet -> approved
```

## Automated Checks

Run:

```bash
cd app
npm test
npm run contracts:check
npm run smoke
npm run smoke:async

cd ../review-ui
npm run smoke
```

Latest local result:

```text
app npm test: 29 passed, 0 failed
app contracts:check: app/openapi.json is current
app smoke: passed
app smoke:async: passed
review-ui smoke: passed
```

The review queue test specifically verifies that async worker jobs complete visual analysis and mark fixture evidence as accepted before the queue renders reviewer tiles.

## Known Gaps

- Fixture mode does not perform live image or video inference. Use `OPENAI_VISION_MODE=live` with `OPENAI_API_KEY` for real model analysis.
- Dealer listing photos are not a full field inspection. Most tickets should remain in field collection until the sales rep provides the required baseline evidence and startup video.
- CAD examples include fixture USD approximations for demo posture only.
- Review actions are persisted in the sidecar database, but they do not yet send Teams notifications, sync Machine Finder Pro media, or write JDDO/Dynamics.
- The static M6 UI has a packet preview, but copy/download/export is still a follow-up item for the production review app shell.
