# Trade-In Agent MVP Implementation Plan

## North Star

Build a Teams-first trade evaluation workflow where a sales rep can start a trade case, upload photos and videos, and have the agent guide them toward a complete evidence package.

The agent should analyze evidence quality, ask for additional photos/video only when needed, classify the case into a fast, standard, or escalation path, and produce a structured trade/reconditioning packet for human review.

The app service should own durable state. The agent should own conversation, interpretation, and guidance.

The broader north star is to create a cost-effective but risk-effective entry point for used equipment trade evaluation, reconditioning planning, remarketing readiness, and downstream business-system workflows.

## Business Context

Trade-in pricing is one of the largest profitability risks and inventory liquidity drivers for the John Deere dealerships we own. A weak trade value or missed reconditioning issue can turn into margin loss, aging inventory, delayed remarketing, and avoidable operational churn.

The project is also about reconditioning discipline. Understanding what it will take to get a unit ready for remarketing is as important as the trade value itself.

Today there are two distinct operating models:

- **Stotz:** informal and inconsistent. Sometimes sales reps inspect thoroughly, sometimes they ask for mechanic input, and sometimes machines receive only a light look.
- **Premier:** much more formal for combines and large tractors, often sending field mechanics for full inspections that can cost roughly $3,000 per unit.

The desired workflow should land between these extremes:

- more controlled and risk-effective than Stotz's current process
- less expensive and more scalable than defaulting to Premier-style full inspections
- explicit about when the evidence is not enough and a licensed technician inspection is required

This app should eventually become an entry point for systems around trade valuation, reconditioning work, remarketing, photo/media handling, Machine Finder Pro, and JDDO/Microsoft Dynamics.

## Product Principles

- Teams is the primary user interface for sales reps.
- The workflow must be realistic in the field with a customer nearby.
- Start with evidence completeness and risk routing, not final autonomous valuation.
- Separate confirmed facts, agent observations, assumptions, and human judgment.
- Treat full mechanical inspections as an escalation tool, not a failure case.
- Optimize for dealership profitability, inventory liquidity, and risk control.
- Design downstream integrations from day one as queued jobs, even when the MVP uses manual/stub adapters.
- Keep photos, videos, and case state durable beyond any single chat session.

## Users And Review Model

Field users will often be:

- sales reps
- sales support teammates
- transportation/support staff
- training or customer experience teammates

Centralized used evaluation teams at Stotz and Premier should be the main review audience. The system should create packets that can be reviewed, approved, revised, and redistributed back to sales reps.

The MVP should assume:

- field users collect evidence
- the agent guides completeness and creates the draft packet
- centralized reviewers approve or request additional evidence
- licensed technicians are involved when the risk profile requires deeper mechanical inspection

## Initial Supported Scope

Start with:

- combines
- high-horsepower tractors

The first useful slice should be:

> A sales rep starts a combine trade case in Teams, uploads baseline photos/video, the agent identifies missing or weak evidence, and the system generates a draft trade/recon packet.

## Architecture

```text
Teams / OpenClaw Agent
        |
        v
Trade Intake App Service
        |
        +-- Workflow database
        +-- Media storage references
        +-- Evidence checklist engine
        +-- Agent analysis records
        +-- Trade/recon packet generator
        +-- Integration job queue
```

The app service is intended to run on the same VM as the Stotz Sales agent during the MVP.

## App Service Responsibilities

The app service should own:

- trade case creation and status
- machine identity fields
- evidence item records
- checklist definitions and slot matching
- analysis findings
- route decision: fast, standard, escalation
- draft packet generation
- human review state
- downstream integration jobs

The agent should call the app service rather than keeping workflow state only in chat memory.

## Core Data Model

### TradeCase

- id
- createdAt
- createdBy
- sourceConversationId
- status
- route
- confidence
- assignedReviewer
- customer/deal context fields, if available

### Machine

- tradeCaseId
- unitType
- make
- model
- modelYear
- serialOrPin
- engineHours
- separatorHours
- location
- attachmentsOrOptions

### EvidenceItem

- id
- tradeCaseId
- uploadedAt
- uploadedBy
- mediaType
- storageUri
- checklistSlot
- qualityStatus
- analysisStatus
- notes

### ChecklistRequirement

- unitType
- slot
- requiredForBaseline
- requiredForStandard
- description
- examples

### AnalysisFinding

- tradeCaseId
- evidenceItemId
- section
- finding
- severity
- confidence
- needsFollowUp

### ReconScenario

- tradeCaseId
- scenarioType: light, standard, heavy
- assumptions
- includedWork
- excludedWork
- riskNotes

### ReviewDecision

- tradeCaseId
- reviewer
- status
- comments
- decidedAt

### IntegrationJob

- tradeCaseId
- jobType
- targetSystem
- status
- payload
- result
- createdAt
- updatedAt

## Teams Flow

1. Rep says: `Start trade evaluation`.
2. Agent creates a trade case through the app service.
3. Agent asks for minimum identity fields.
4. Agent gives a compact baseline shot list.
5. Rep uploads photos/videos in Teams.
6. Agent registers each upload as an evidence item.
7. Agent analyzes whether each item is useful, weak, duplicated, or missing.
8. Agent asks for targeted follow-up evidence.
9. App service computes route.
10. Agent produces draft packet and explains review status.

## Baseline Combine Evidence

Required first-pass evidence:

- front 45-degree view
- rear 45-degree view
- left side
- right side
- serial plate / PIN
- model badging
- cab/display with engine and separator hours
- startup video
- feeder house opening
- engine compartment
- front tires/tracks
- rear tires/tracks
- close-up of any visible damage, leaks, rust, welds, or missing guards

## Baseline High-Horsepower Tractor Evidence

Required first-pass evidence:

- front 45-degree view
- rear 45-degree view
- left side
- right side
- serial plate / PIN
- model badging
- cab/display with hours
- startup video
- tires/tracks close-ups
- drawbar / three-point / PTO
- hydraulic remotes
- engine compartment
- underbody/leak evidence when safe
- close-up of any visible damage, leaks, rust, welds, or missing guards

## Adaptive Routing

### Fast Path

Use when:

- baseline evidence is complete
- startup appears clean
- no obvious warning lights/codes
- no major smoke, leaks, vibration, or abnormal noise
- tires/tracks are acceptable
- machine presents clean and straight
- identity fields are confirmed

Output:

- preliminary trade/recon packet
- confidence score
- light or standard recon scenario
- human review recommendation

### Standard Path

Use when:

- evidence is incomplete
- some wear or damage is visible
- hours are high
- photos/video are usable but not decisive
- the unit looks average or mixed

Output:

- targeted follow-up checklist
- wider preliminary range or hold pending more evidence
- standard/heavy recon scenario notes

### Escalation Path

Use when:

- active warning lights/codes are visible
- hard start, rough idle, smoke, abnormal noise, or vibration appears
- leaks are visible
- major tire/track wear is visible
- structural damage, welds, missing guards, or neglect are visible
- serial/PIN or hours cannot be confirmed
- unit value/risk is high enough that weak evidence is unacceptable

Output:

- hold preliminary valuation or mark as high uncertainty
- require deeper evidence
- route to human mechanical/commercial review
- recommend a full licensed-technician inspection when the risk cannot be responsibly resolved through photos/video

## Trade Packet Output

The packet should include:

- machine identity
- evidence completeness
- accepted evidence list
- missing or weak evidence
- condition findings by section
- risk flags
- recon scenarios: light, standard, heavy
- valuation readiness
- preliminary trade value recommendation or reason no recommendation should be made yet
- confidence level
- assumptions
- questions for reviewer
- recommended next step
- full mechanical inspection recommendation, if needed

For the MVP, the packet can be Markdown and JSON. Later it can produce PDF/Word/SharePoint artifacts.

## Valuation Data Strategy

The MVP should establish the structure for calibrated valuations without requiring all data sources to be integrated on day one.

Future valuation inputs should include:

- company sales history
- internal trade and inventory history
- competitive listings and pricing from TractorHouse and other dealership websites
- general industry data
- equipment condition findings from the evidence package
- reconditioning budget scenarios
- inventory liquidity and remarketing readiness signals

The app should keep source attribution clear:

- what data was used
- what was missing
- what was estimated
- what requires reviewer judgment

Automated valuation should be staged carefully. Early packets can include valuation readiness, comps needed, and reviewer questions before they include numeric recommendations.

## Storage Strategy

MVP storage choices:

- Workflow DB: Postgres from the start.
- Media: SharePoint sandbox preferred for durability and human visibility; local cache acceptable for processing.
- Generated packets: local plus SharePoint output folder.

Do not store photos/videos only in the Teams chat transcript.

## Downstream Integration Readiness

Build adapters as queued jobs from the beginning.

Initial stub job types:

- `machine_finder_photo_sync`
- `dynamics_jddo_trade_case_sync`
- `sharepoint_packet_publish`
- `fabric_trade_history_lookup`

MVP behavior can be manual/stubbed:

- create job rows
- produce payloads
- mark as `pending_manual`
- log missing credentials/API decisions

## Future Integrations

### Machine Finder Pro

Likely responsibilities:

- sync selected photos
- map photos to the correct asset/listing
- track sync status
- avoid duplicate upload
- preserve original evidence package
- support remarketing readiness once the unit is approved for listing

### JDDO / Microsoft Dynamics

Likely responsibilities:

- customer/deal lookup
- machine/unit lookup
- trade appraisal record creation
- recon estimate handoff
- approval status sync
- audit trail of agent-generated packet and reviewer decision
- business-system entry point for downstream used-equipment workflows

### Fabric / Lakehouse

Likely responsibilities:

- historical comparable trades
- inventory and stock data
- model/category normalization
- pricing/recon analytics
- exception reporting

## Implementation Phases

### Phase 1: Local Foundations

- Initialize app service.
- Add workflow DB schema.
- Add checklist definitions for combines and high-horsepower tractors.
- Add case CRUD endpoints.
- Add packet generator.
- Add basic health endpoint.

### Phase 2: Teams Evidence Loop

- Let agent create trade cases from Teams.
- Register uploaded media against a case.
- Send photos and sampled video frames to the OpenAI API for visual inference.
- Store visible machine condition findings and evidence quality findings.
- Track checklist completeness.
- Let agent respond with accepted/missing/retake guidance while the sales rep is still in the field.
- Generate a draft packet from structured state and visual findings.

Milestone 2.5, [Live Teams Attachment Bridge](milestone-two-live-teams-attachment-bridge.md), closes the live deployment gap between "Teams/OpenClaw received an upload" and "the sidecar resolved that exact upload as analyzable evidence."

### Phase 3: Analysis and Routing

- Add evidence quality analysis prompts.
- Store findings and confidence.
- Compute fast/standard/escalation route.
- Add targeted follow-up question generation.
- Add human review status.

### Phase 4: Review UI

- Build a small web UI on the VM for internal reviewers.
- Show case list, evidence status, findings, packet preview, and review decision controls.
- Add packet export/download.

### Phase 5: Integration Queue

- Add integration job table and API.
- Add stub adapters for Machine Finder Pro and JDDO/Dynamics.
- Produce payload examples from real MVP cases.
- Document required credentials, APIs, and approval boundaries.

### Phase 6: Hardening

- Run app service under systemd.
- Add logs and health checks.
- Add backup/restore procedure.
- Add permissions and access model.
- Add deployment docs for the Stotz Sales VM.

## Open Questions

- What is the preferred durable media store for MVP: SharePoint sandbox, Azure Blob, or both?
- Which user group should be allowed to create cases?
- Who is the first human reviewer group?
- What valuation data sources are approved for the first packet?
- What JDDO/Dynamics APIs or tables are available?
- What Machine Finder Pro upload/sync mechanism is available?
- Should the first web UI be internal-only on the VM, SharePoint-linked, or behind a managed Azure endpoint?

## First Build Recommendation

Build the app service and schema first, then wire Teams to it. The first demo should show one combine case moving from Teams upload to evidence checklist to draft packet.
