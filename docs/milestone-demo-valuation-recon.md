# Milestone 4: Demo Valuation And Recon Estimate

## Goal

Start the Phase 5 valuation/reconditioning path with a lightweight, field-QA-safe demo adapter.

The purpose is to make user testing feel end to end without pretending the system is ready to issue approved offers. The packet can now show a demo trade value range, demo reconditioning budget, comparable asking-price basis, risk adjustments, assumptions, and reviewer questions.

## Guardrails

- Demo only. Not an approved trade offer, sale price, or final recon quote.
- Feature flagged off by default.
- In live mode, GPT-5.5 uses OpenAI Responses API web search to research public comparable listings for the specific machine being evaluated.
- Local comparable data is fallback-only for fixture/offline QA and live-mode sanity checks.
- Holds approval posture when evidence is incomplete, identity/hours are missing, or technician inspection is required.
- Queues an integration job record so the future Machine Finder Pro and JDDO/Dynamics adapter shape starts now.

## Runtime Flags

```bash
DEMO_VALUATION_ENABLED=true
DEMO_VALUATION_MODE=live
DEMO_VALUATION_MODEL=gpt-5.5
```

Modes:

- `live`: sends the structured case context to the OpenAI Responses API with the hosted `web_search` tool required by default.
- `fixture`: deterministic demo math from fallback comps, route, checklist completeness, and visible findings.
- `off`: disables the adapter even if `DEMO_VALUATION_ENABLED=true`.

If `DEMO_VALUATION_MODE` is unset, the sidecar uses `live` when `OPENAI_API_KEY` is present and `fixture` otherwise.

Optional live research controls:

```bash
DEMO_VALUATION_WEB_SEARCH=true
DEMO_VALUATION_WEB_SEARCH_REQUIRED=true
DEMO_VALUATION_SEARCH_CONTEXT_SIZE=medium
DEMO_VALUATION_EXTERNAL_WEB_ACCESS=true
DEMO_VALUATION_SEARCH_DOMAINS=machinefinder.com,tractorhouse.com
```

Leave `DEMO_VALUATION_SEARCH_DOMAINS` unset for broader QA research. Set it only when you intentionally want to limit research to specific domains.

## Packet Contract

When enabled, `POST /trade-cases/:id/packet` adds:

- `packet.demoValuation`
- `packet.recommendation.preliminaryTradeValue`
- `packet.recommendation.demoReconBudget`
- a `Demo Valuation And Recon Estimate` Markdown section

The JSON shape includes:

- `approvalStatus`
- `researchMode`
- `valuation.comparableAskingRange`
- `valuation.estimatedTradeValueRange`
- `valuation.confidence`
- `reconBudget.estimatedRange`
- `reconBudget.lineItems`
- `comparableSales`
- `webResearch`
- `riskAdjustments`
- `assumptions`
- `reviewerQuestions`
- `sourceNotes`

## Integration Job Starter

Migration `004_integration_jobs.sql` creates `integration_jobs`.

For every generated demo valuation, the sidecar records:

- `job_type`: `demo_valuation_recon`
- `target_system`: `trade_in_phase_five_demo`
- `payload_json`: case, route, confidence, and prompt version
- `result_json`: demo valuation result

This is not yet a Machine Finder Pro or JDDO/Dynamics sync. It is the durable job-table shape those adapters should build on.

## Manual QA

On the VM or host where the sidecar DB is available:

```bash
cd /home/ubuntu/trade-in-agent/app
DEMO_VALUATION_ENABLED=true DEMO_VALUATION_MODE=fixture npm test
```

For the realistic field-flow runner, the sidecar process itself must have the demo flags. For a temporary QA sidecar on a second port:

```bash
cd /home/ubuntu/trade-in-agent/app
PORT=8799 DEMO_VALUATION_ENABLED=true DEMO_VALUATION_MODE=fixture OPENAI_VISION_MODE=fixture npm start
```

Then in another shell:

```bash
cd /home/ubuntu/trade-in-agent/app
SIDECAR_URL=http://127.0.0.1:8799 npm run qa:user-flow
```

Expected:

- packet JSON includes `demoValuation`
- packet Markdown includes `Demo Valuation And Recon Estimate`
- partial evidence scenarios show a hold posture
- full walkaround scenarios with weak startup-video evidence still show a hold posture
- complete clean evidence scenarios show a reviewable demo range unless routing requires technician inspection
- no language presents the value range as an approved offer

For live OpenAI mode:

```bash
PORT=8799 DEMO_VALUATION_ENABLED=true DEMO_VALUATION_MODE=live DEMO_VALUATION_MODEL=gpt-5.5 OPENAI_VISION_MODE=fixture npm start
```

Use live mode only where the Stotz corporate sales OpenAI key is already available through deployment secrets.

Expected live-mode additions:

- `packet.demoValuation.researchMode` equals `web_search`
- `packet.demoValuation.comparableSales` reflects model-researched public sources for the actual machine
- `packet.demoValuation.webResearch.usedWebSearch` is `true`
- packet Markdown includes source notes and web citations when returned by the model/tool call
