# Remote Stotz Sales Review

Reviewed on 2026-05-04 from local repo:

`/Users/josephrosztoczy/.openclaw/workspaces/openclaw-on-azure/repo`

Target deployment:

- Plan: `deployments/stotz-corp-sales.json`
- Resource group: `prod-sales-agent`
- VM: `stotz-sales-agent-prod-vmss_015271c9`
- Remote workspace: `/home/openclaw/openclaw-workspace`

## Access Notes

The repo tooling is centered on `scripts/ssh-to-instance.sh`.

Useful command:

```bash
./scripts/ssh-to-instance.sh --plan deployments/stotz-corp-sales.json --list --entra
```

The deployment resolved as a single VM. Azure `run-command` was not available for this account, but Entra SSH worked:

```bash
az ssh vm -g prod-sales-agent -n stotz-sales-agent-prod-vmss_015271c9 --resource-type Microsoft.Compute/virtualMachines
```

## Existing Agent Mission

The Stotz Corporate Sales agent is already framed around:

- trade evaluation
- reconditioning quality
- asset visibility
- deal support
- practical internal tooling

Relevant source in OpenClaw Azure repo:

`agent-workspaces/stotz/projects/corp-sales/PROJECT.md`

## Trade-In Evaluation Session

The core trade-in discussion happened in Teams on 2026-04-28 in session:

`/home/openclaw/.openclaw/agents/main/sessions/7aaba91b-f65d-4919-9789-320aec93b7c6.jsonl`

User ask:

- Build a process for trade-in valuations and recon budget scenarios for sales reps.
- Start with ag units, specifically combines and large horsepower tractors.
- Reps would take photos, and the agent would guide them through evidence quality before analysis.

Recommended MVP from that session:

- Guided intake plus condition assessment plus human-reviewed valuation workflow.
- Do not start with the AI giving the final number.
- Use adaptive intake:
  - fast path when baseline evidence is strong
  - standard path when evidence is incomplete or condition is mixed
  - escalation path when the agent sees warning lights, smoke, leaks, heavy wear, structural damage, or other risk signals

Baseline combine evidence discussed:

- front/rear 45-degree views
- both sides
- serial plate and model identifiers
- cab/display with engine and separator hours
- startup video
- feeder house opening
- engine compartment
- tires/tracks
- obvious damage, leaks, rust, welds, or missing guards

Video evidence discussed:

- startup behavior
- warning lights or codes
- engine sound, smoke, vibration, or rough idle
- cab display and hours
- hydraulics/header/feeder/auger motion where safe
- leaks or abnormal behavior under operation

SharePoint artifacts created from that session:

- `/shared/trade-valuation-mvp/combine-trade-photo-video-mvp-recommendation.rtf`
- `/shared/research/trade-valuation-mvp/2026-04-28-combine-trade-valuation-mvp-research.md`

The markdown SharePoint URL recorded in the session:

`https://stotzeq.sharepoint.com/sites/AgentSandbox-Sales/Shared%20Documents/shared/research/trade-valuation-mvp/2026-04-28-combine-trade-valuation-mvp-research.md`

## Related Fleet MVP App

A separate but useful app was created on 2026-05-04:

`/home/openclaw/openclaw-workspace/fleet-mvp-app`

What it does:

- Extracts 633 rows from Cody's Excel workbook.
- Uses tabs from workbook categories: `AGTRAC`, `COMB`, `SPRAY`, `PLANT`, `TILL`, `MISC`, `UTTRAC`, `HAY`.
- Shows available fleet inventory by category.
- Adds yellow editable note fields:
  - Pricing Review
  - Quality Review
  - Notes
- Persists notes by stock number to local JSON and CSV.

Important files:

- `fleet-mvp-app/README.md`
- `fleet-mvp-app/server.js`
- `fleet-mvp-app/public/app.js`
- `fleet-mvp-app/scripts/extract_excel_inventory.py`
- `fleet-mvp-app/public/inventory-data.json`

The app ran on the VM at:

`http://stotz-sal0D7EFD:8787`

The session noted that this was not yet a durable internal URL. Publishing to stable Azure/SharePoint-backed hosting remains a next step.

## Other Remote Work Worth Reusing

`projects/fo-data-validation` contains useful Fabric/Lakehouse patterns:

- SQL and script access to equipment data.
- Subcategory validation reports.
- Scheduled weekday updates.
- Excel/CSV handoff generation.

This is not the trade-in agent itself, but it is useful for:

- inventory data access patterns
- stock number conventions
- Fabric query scripting
- review/export workflow shape

## Recommended Next Steps

1. Define the first supported unit type, likely combines first, then high-horsepower tractors.
2. Turn the April 28 research into a structured intake schema.
3. Build a local MVP with:
   - unit identity fields
   - required photo/video checklist
   - evidence quality status
   - fast/standard/escalation routing
   - recon scenario notes
   - human review status
4. Reuse the fleet app's stock-number note persistence pattern for early prototyping.
5. Defer automated final valuation until internal pricing sources, approval boundaries, and review workflow are explicit.
