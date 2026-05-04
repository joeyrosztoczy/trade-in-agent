# Trade-In Agent

Starter workspace for a Stotz tractor/combine trade-in evaluation assistant.

## Goal

Build an agent-assisted workflow that helps sales reps capture field evidence for ag equipment trade-ins, then produces a structured condition packet, reconditioning budget scenarios, and a preliminary trade value recommendation with clear confidence and human-review flags.

The strongest starting point from the existing Stotz Sales deployment is an adaptive MVP:

1. Quick field intake for combines and high-horsepower tractors.
2. Photo/video quality and completeness checks.
3. Condition extraction by machine section.
4. Fast path, standard path, or escalation path.
5. Human-reviewed valuation and recon scenario output.

## Remote Context

See [docs/remote-stotz-sales-review.md](docs/remote-stotz-sales-review.md) for what was found on the Stotz Sales OpenClaw deployment, including SSH tooling, session history, SharePoint research artifacts, and the related fleet MVP app.

Supporting docs:

- [docs/implementation-plan.md](docs/implementation-plan.md) describes the north star and MVP build sequence.
- [docs/session-log-summary.md](docs/session-log-summary.md) summarizes the key remote Teams/session history.

## Likely First Build

The first local prototype should be a lightweight intake and review app, not a final pricing engine. It should collect the required baseline evidence, ask targeted follow-up questions, and create a valuation packet that separates confirmed facts from assumptions.
