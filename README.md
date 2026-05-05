# Trade-In Agent

Starter workspace for a John Deere dealership trade-in evaluation assistant for Stotz and Premier Equipment.

## Goal

Build an agent-assisted workflow that helps sales reps capture field evidence for ag equipment trade-ins, then produces a structured condition packet, reconditioning budget scenarios, and a preliminary trade value recommendation with clear confidence, assumptions, and human-review flags.

Trade-in pricing is one of the largest profitability risks and inventory liquidity drivers for the John Deere dealerships we own. Bad trade values and weak reconditioning estimates can create margin losses, aging inventory, delayed remarketing, and avoidable operational churn.

This app is intended to become an entry point into the broader trade, reconditioning, remarketing, and inventory systems around used equipment.

## Business Context

The project exists to unify two very different operating models:

- **Stotz today:** trade evaluation can be haphazard. Sometimes reps inspect carefully, sometimes they ask a mechanic for help, and sometimes the machine receives only a light look.
- **Premier today:** combines and large tractors often receive full field-mechanic inspections, which can cost roughly $3,000 per unit. This is much more controlled, but cost prohibitive in a down market.

The target is a workflow that is:

- more risk-effective than the current Stotz process
- more cost-effective than defaulting to Premier-style full inspections
- explicit about when a full licensed-technician inspection is still required
- useful for both valuation and reconditioning/remarketing readiness

The strongest starting point from the existing Stotz Sales deployment is an adaptive MVP:

1. Quick field intake for combines and high-horsepower tractors.
2. Photo/video quality and completeness checks.
3. Condition extraction by machine section.
4. Fast path, standard path, or escalation path.
5. Human-reviewed valuation and reconditioning scenario output.

## Intended Users

Field users will often be:

- sales reps
- sales support teammates
- transportation/support staff
- customer experience or training teammates helping collect evidence

Both Stotz and Premier have centralized used evaluation teams. The workflow should generate packets those teams can review, approve, and redistribute back to sales reps.

## Valuation Inputs

Future trade-in value recommendations should be calibrated from multiple sources, including:

- company sales history
- internal inventory and trade history
- competitive analysis from TractorHouse and other dealership websites
- general industry data
- machine condition and evidence quality
- expected reconditioning cost and remarketing readiness

The MVP should structure the packet and confidence model before pretending that all valuation inputs are fully automated.

## Remote Context

See [docs/remote-stotz-sales-review.md](docs/remote-stotz-sales-review.md) for what was found on the Stotz Sales OpenClaw deployment, including SSH tooling, session history, SharePoint research artifacts, and the related fleet MVP app.

Supporting docs:

- [docs/implementation-plan.md](docs/implementation-plan.md) describes the north star and MVP build sequence.
- [docs/manual-qa.md](docs/manual-qa.md) gives manual QA steps for the current sidecar.
- [docs/milestone-one-local-dev-bootstrap.md](docs/milestone-one-local-dev-bootstrap.md) specifies the local development bootstrap plan.
- [docs/milestone-two-teams-evidence-loop.md](docs/milestone-two-teams-evidence-loop.md) specifies the Teams evidence loop milestone.
- [docs/session-log-summary.md](docs/session-log-summary.md) summarizes the key remote Teams/session history.

## Likely First Build

The first local prototype should be a lightweight intake and review app, not a final pricing engine. It should collect the required baseline evidence, ask targeted follow-up questions, and create a valuation packet that separates confirmed facts from assumptions.

## Local OpenClaw Bootstrap

For local OpenClaw + sidecar QA, use the OpenClaw Azure day-two operations repo:

```bash
./scripts/bootstrap-openclaw-multipass.sh
```

By default this uses `~/.openclaw/workspaces/openclaw-on-azure/repo` and `deployments/stotz-corp-sales.json`, then installs the trade-in sidecar onto the same Multipass VM.

The OpenClaw local QA path runs smoke tests and then a stricter reconciler validation. For local sidecar work, the bootstrap continues if that post-smoke validation returns nonzero but the gateway service is active. Set `OPENCLAW_STRICT_QA=1` when the OpenClaw validation itself should be the release gate.
