# Realistic Combine Media Sources

Date verified: 2026-05-06

These sources support repeatable QA for realistic combine walkaround evidence without needing a live customer machine.

## Primary Combine Listing

MachineFinder:

<https://www.machinefinder.com/ww/en-US/machines/2020-john-deere-s780-combine-11033496>

Listing facts used for QA:

- 2020 John Deere S780
- Dealer: Stotz Equipment
- Location: Twin Falls, Idaho
- Price shown on source: `$399,999 US`
- Hours shown on source: `1039`
- Serial/PIN: `1H0S780SLLT810207`
- Stock: `Consignment DB6`
- Options include PRWD, duals, Yield Monitor, Active Yield, Harvest Mobile, Advisor Package, Powercast Tailboard, Power Folding Bin Extension, and no header.

## Walkaround Photo Set

TractorZoom mirror:

<https://tractorzoom.com/equipment/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092>

This page exposes a 44-photo walkaround for the same Stotz/MachineFinder machine facts used by the QA runner.

Representative slots used by `app/scripts/user-flow-qa.js`:

| Checklist slot | Source photo mapping |
|---|---|
| `front_45` | TractorZoom image 1 |
| `left_side` | TractorZoom image 2 |
| `rear_45` | TractorZoom image 4 |
| `right_side` | TractorZoom image 6 |
| `model_badging` | TractorZoom image 8 |
| `feeder_house` | TractorZoom image 11 |
| `front_tires_tracks` | TractorZoom image 14 |
| `rear_tires_tracks` | TractorZoom image 20 |
| `damage_leaks_welds` | TractorZoom image 26 |
| `engine_compartment` | TractorZoom image 28 |
| `cab_display_hours` | TractorZoom image 31 |
| `serial_plate` | TractorZoom image 44 |
| `grain_tank` | TractorZoom image 25 |
| `cab_overview` | TractorZoom image 33 |

## Stotz Comparable Listing

Stotz Equipment current used-equipment page:

<https://www.stotzequipment.com/used-equipment/harvesting/john-deere-s780-e898505/>

This page is useful as a live Stotz site reference for another 2020 S780, but it is a different machine than the MachineFinder/TractorZoom QA machine.

The QA runner keeps it as a comparable Stotz source, not as the primary source of the image URLs.

## Startup Video Source

Startup/harvest-start video sample:

<https://www.youtube.com/watch?v=P6W7T40A1OA>

Current limitation:

- The sidecar can analyze photos and sampled video frames.
- The QA runner passes a public YouTube thumbnail/sample frame as `sampledFrames`.
- That is intentionally weak evidence for a startup-video slot because it cannot verify audio, true cold start, idle smoothness, smoke timing, warning tones, or warning lights over time.

Expected behavior:

- The agent should not mark startup video fully accepted from one sampled frame.
- It should ask for a short startup video that captures cold start, idle, exhaust, warning lights, and abnormal sound if safe.

## QA Script

The reusable runner lives at:

```text
app/scripts/user-flow-qa.js
```

Run both scenarios:

```bash
cd app
npm run qa:user-flow
```

Run one scenario:

```bash
QA_SCENARIO=partial-field-walkaround npm run qa:user-flow
QA_SCENARIO=full-walkaround-with-startup-video npm run qa:user-flow
```

The runner writes JSON and Markdown artifacts to `qa-output/<run-id>/`.
