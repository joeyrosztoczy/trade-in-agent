# Initial User QA Summary

Date: 2026-05-06

Branch: `codex/goal-initial-user-qa`

## Purpose

Exercise the trade-in sidecar as if a sales rep were standing beside a combine and sending evidence through Teams, then inspect the output as if a centralized used-equipment evaluator were deciding whether the case is ready for review.

The QA focus was not final valuation. The focus was intake smoothness, photo/video evidence quality, next-evidence asks, reviewer packet clarity, and whether the app avoids false confidence when the evidence is incomplete.

## Reference Media

The reusable media set is documented in [realistic-combine-media-sources.md](realistic-combine-media-sources.md).

Primary machine context:

- MachineFinder listing: <https://www.machinefinder.com/ww/en-US/machines/2020-john-deere-s780-combine-11033496>
- TractorZoom photo walkaround mirror: <https://tractorzoom.com/equipment/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092>
- Startup video source used for current sampled-frame limitation testing: <https://www.youtube.com/watch?v=P6W7T40A1OA>

## Final QA Run

Environment:

- VM: `trade-in-agent-openclaw-dev`
- Sidecar URL inside VM: `http://127.0.0.1:8788`
- OpenAI visual inference: live sidecar mode using the VM deployment environment
- Test command: `npm test`
- User-flow command: `npm run qa:user-flow`

Final run id:

```text
2026-05-06T00-26-41-748Z
```

Generated artifacts inside the VM:

```text
/home/ubuntu/qa-output/2026-05-06T00-26-41-748Z/summary.json
/home/ubuntu/qa-output/2026-05-06T00-26-41-748Z/partial-field-walkaround.md
/home/ubuntu/qa-output/2026-05-06T00-26-41-748Z/full-walkaround-with-startup-video.md
```

## Scenarios

### Partial Field Walkaround

Input:

- Front 45-degree photo
- Left side photo
- Rear 45-degree photo
- Front tire photo

Outcome:

- Case: `TIA-9A3E4116`
- Route: `needs_more_evidence`
- Review status: `field_collection`
- Confidence: `5%`
- Missing required baseline slots: `9`
- The agent guidance included the case number, accepted evidence, first three next asks, visible notes, limitations, and no raw checklist slot ids.

Rep-facing next asks:

- Full right side
- Serial plate / PIN
- Model badging

Used-team readout:

- Correctly treated the case as early field collection.
- Preserved useful visible positives while keeping limitations explicit.
- Did not pretend a reviewer could value the machine from a few overview photos.

### Full Walkaround With Startup-Video Proxy

Input:

- Broad walkaround photos for exterior, serial, badge, feeder house, engine compartment, tires, visible damage/leak/weld area
- Startup-video evidence represented by a sampled online frame
- Optional grain tank and cab overview context

Outcome:

- Case: `TIA-4D29F49B`
- Route: `needs_more_evidence`
- Review status: `field_collection`
- Confidence: `18%`
- Missing required baseline slots: `0`
- Weak required evidence slots: `4`
- The agent guidance included the case number, accepted evidence, weak-evidence language, next action, reviewer limitations, and no raw checklist slot ids.

Rep-facing next asks:

- Clearer rear 45-degree view
- Clearer cab display with engine and separator hours
- Short startup video that captures cold start, idle, exhaust, warning lights, and abnormal sound if safe

Used-team readout:

- Correctly avoided marking the case ready just because every required slot had something attached.
- Treated sampled startup evidence as weak rather than accepted.
- Included useful reviewer structure: machine identity, evidence status, visible positives, visible risks, limitations, field follow-up, and recon scenario placeholders.

## Fixes Made From QA

- Added friendly presentation helpers for route labels, checklist-slot labels, field guidance, reviewer briefs, and packet Markdown.
- Replaced raw slot ids such as `front_45` with user-facing names such as `Front 45-degree view`.
- Added case number visibility checks to the realistic QA runner.
- Added `Need better evidence` language for weak evidence so reps are not told an already-uploaded slot is simply "missing."
- Added startup-video-specific guidance asking for cold start, idle, exhaust, warning lights, and abnormal sound when only weak sampled-frame evidence is available.
- Updated the vision prompt so the model does not claim audio, true cold start, idle smoothness, warning tones, or smoke timing from sampled frames alone.
- Fixed confidence scoring so evidence-quality warnings do not double-count as visible condition severity.
- Fixed uncertainty normalization so object-shaped model uncertainty entries do not render as `[object Object]`.
- Added regression coverage for friendly guidance, reviewer packet Markdown, startup-video follow-up, and evidence-quality scoring.

## Current Product Judgment

The sales-rep flow is now clear enough for phase QA:

- Every response anchors to a case number.
- The next ask is short and actionable.
- Weak evidence is handled as "send a clearer version" rather than a silent failure.
- Startup video is treated honestly as a higher-standard evidence slot.

The used-team packet is useful for early review, but not final valuation:

- It provides evidence completeness, visible positives, visible risks, limitations, routing, confidence, and follow-up questions.
- It still needs downstream valuation inputs, sales history, competitive listing data, and approved recon-budget logic before it should recommend dollars.

## Known Limitations

- The current sidecar analyzes photos and sampled video frames. It does not yet process full video streams or audio directly.
- Live model quality decisions vary by run because the source photos have indoor lighting, backlighting, and some close-up ambiguity.
- The QA runner uses public listing photos and a public startup-video sample rather than a true Teams upload from the sales rep's phone.
- Remote Stotz Teams deployment should be re-run after this branch is deployed if the next QA goal is phone-in-the-field validation.

## Manual Replay

On the local OpenClaw + sidecar VM:

```bash
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'sudo systemctl restart trade-in-agent-sidecar'
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent/app && npm test'
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent/app && npm run qa:user-flow'
```

Run one scenario at a time:

```bash
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent/app && QA_SCENARIO=partial-field-walkaround npm run qa:user-flow'
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent/app && QA_SCENARIO=full-walkaround-with-startup-video npm run qa:user-flow'
```

Inspect the newest output:

```bash
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'ls -td /home/ubuntu/qa-output/* | head -1'
```

Then open the scenario Markdown files in that directory.
