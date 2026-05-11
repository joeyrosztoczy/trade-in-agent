# Milestone 1: Local Development Bootstrap

## Goal

Create a repeatable local development environment for the trade-in agent MVP with two cooperating parts:

- the OpenClaw agent runtime
- the trade intake app service sidecar

The milestone should let us build and test the app service quickly on the local machine, then validate the OpenClaw + sidecar integration in a VM that resembles the Stotz Sales deployment.

## Recommendation

Use a two-lane local development pattern.

### Lane 1: Fast Host Development

Run the app service, Postgres, tests, and local fixtures directly on this Mac.

Use this for:

- schema and API development
- packet generation
- checklist logic
- media metadata handling
- app service UI/API iteration
- unit and integration tests that do not require a full deployed OpenClaw runtime

This is the default inner loop because it is fast, debuggable, and does not require rebuilding a VM for every change.

### Lane 2: Multipass Deployment Replica

Use Multipass to run a local Ubuntu VM that installs or closely mirrors the Stotz Sales OpenClaw deployment shape.

Use this for:

- validating how the agent calls the sidecar
- testing process supervision
- testing VM-local networking and ports
- validating deployment scripts
- testing local media paths and SharePoint/Fabric stubs
- proving the app service can live beside OpenClaw before remote deployment

This is the confidence loop, not the fastest coding loop.

## Why Not Only Use The Host OpenClaw Install?

The local machine already has OpenClaw installed, and it is useful for exploration. It should not be the only development target because:

- it can drift from the Stotz Sales deployment configuration
- it may share local user state with unrelated workspaces
- it is harder to prove systemd, ports, service startup, and VM-local paths
- it does not exercise the same operational shape as the production VM

The host OpenClaw install can still be used for fast agent/sub-agent experimentation, prompt work, and manual tool testing.

## Why Not Only Use Multipass?

Multipass gives better deployment parity but is slower for day-to-day app-service iteration.

The app service should be designed so it can run both:

- directly on the host for development
- inside the Multipass VM for OpenClaw integration validation

## Milestone 1 Deliverables

1. Repo-local app service skeleton.
2. Postgres-backed development database.
3. Environment file templates.
4. Local bootstrap script for host development.
5. Multipass bootstrap script for VM integration development.
6. Health check and smoke test.
7. Seed data for one combine trade case.
8. Sidecar API contract for OpenClaw agent calls.
9. OpenClaw deployment bootstrap wrapper that uses the `openclaw-on-azure/repo` local QA tooling.
10. Milestone documentation for both local lanes.

## Phase One Coverage Map

Milestone 1 intentionally covers every step from the Phase 1 Local Foundations section of the implementation plan.

| Phase 1 step | Milestone 1 coverage |
|---|---|
| Initialize app service | Repo-local app service skeleton, host bootstrap, Multipass bootstrap, and dev script. |
| Add workflow DB schema | Postgres schema, migrations, and seed data. |
| Add checklist definitions for combines and high-horsepower tractors | Checklist definition files/tables for both initial unit types. |
| Add case CRUD endpoints | Trade-case create, read, list, update, and archive/delete endpoints. |
| Add packet generator | Draft packet generator endpoint and smoke-test assertion. |
| Add basic health endpoint | `GET /health` in host and Multipass smoke tests. |

## Target Repository Structure

```text
trade-in-agent/
  app/
    src/
    tests/
    package.json
  db/
    migrations/
    seeds/
  docs/
    implementation-plan.md
    milestone-one-local-dev-bootstrap.md
  scripts/
    bootstrap-host.sh
    bootstrap-multipass.sh
    bootstrap-openclaw-multipass.sh
    dev.sh
    smoke-test.sh
  infra/
    local/
      docker-compose.yml
      env.example
      systemd/
  agent/
    tools/
    prompts/
    fixtures/
```

This structure can evolve once the implementation framework is chosen.

## App Service Scope For Milestone 1

The app service should expose enough behavior to prove the architecture without solving valuation yet.

Required endpoints:

- `GET /health`
- `POST /trade-cases`
- `GET /trade-cases`
- `GET /trade-cases/:id`
- `PATCH /trade-cases/:id`
- `DELETE /trade-cases/:id` or `POST /trade-cases/:id/archive`
- `POST /trade-cases/:id/evidence`
- `GET /trade-cases/:id/checklist`
- `POST /trade-cases/:id/packet`

Required behavior:

- create a trade case
- list and fetch trade cases
- update trade case and machine identity fields
- archive or delete a draft trade case
- store machine identity fields
- register evidence metadata
- compute checklist completeness for combines and high-horsepower tractors
- generate a draft packet from stored data
- persist everything in Postgres

Out of scope for Milestone 1:

- numeric trade value calculation
- real Machine Finder Pro sync
- real JDDO/Dynamics sync
- production auth model
- automatic photo/video computer vision analysis

## Postgres Development Pattern

Use Postgres from the start.

Host development can use one of:

- local Postgres installed on the Mac
- Docker/Colima Postgres, if available
- Multipass-hosted Postgres exposed locally

The preferred first implementation is a repo-local `docker-compose.yml` for Postgres if the machine has a container runtime. If not, the scripts should support a normal `DATABASE_URL`.

Required databases:

- `trade_in_agent_dev`
- `trade_in_agent_test`

Required environment variable:

```bash
DATABASE_URL=postgres://trade_in_agent:trade_in_agent@localhost:5432/trade_in_agent_dev
```

## OpenClaw Integration Contract

The agent should treat the app service as a local HTTP tool surface.

Initial local URL:

```text
http://127.0.0.1:8788
```

The app service should be reachable from:

- the local host during fast development
- the Multipass VM during integration validation
- the production Stotz Sales VM when deployed later

For Milestone 1, the agent can call the sidecar through simple local HTTP requests or a thin tool wrapper. The important part is the stable API contract and persisted state.

## Host Bootstrap Spec

Script:

`scripts/bootstrap-host.sh`

Responsibilities:

1. Verify required tools.
2. Create `.env` from `infra/local/env.example` if missing.
3. Start or validate Postgres.
4. Install app dependencies.
5. Run migrations.
6. Seed sample data.
7. Run smoke tests.

Expected result:

- app service can start locally
- `GET /health` returns OK
- a sample combine case can be created and packeted

## Multipass Bootstrap Spec

Script:

`scripts/bootstrap-multipass.sh`

Responsibilities:

1. Create or reuse a Multipass VM named `trade-in-agent-dev`.
2. Install system dependencies.
3. Install or mount the repo.
4. Install Postgres.
5. Install the app service dependencies.
6. Run migrations and seed data.
7. Configure the app service as a systemd service.
8. Optionally install or mirror the Stotz Sales OpenClaw workspace/deployment shape.
9. Run integration smoke tests from inside the VM.

Recommended VM shape:

```bash
multipass launch 24.04 --name trade-in-agent-dev --cpus 4 --memory 8G --disk 40G
```

Expected result:

- VM has OpenClaw-compatible workspace layout
- app service runs under systemd
- app service is reachable inside the VM at `http://127.0.0.1:8788`
- OpenClaw/tool tests can create a trade case through the sidecar

## OpenClaw Deployment Bootstrap Spec

Script:

`scripts/bootstrap-openclaw-multipass.sh`

Responsibilities:

1. Locate the OpenClaw Azure repo, defaulting to `~/.openclaw/workspaces/openclaw-on-azure/repo`.
2. Use `scripts/local/qa.sh` from that repo to bootstrap a local Multipass VM.
3. Use `deployments/stotz-corp-sales.json` by default so the VM mirrors the Stotz corporate sales deployment.
4. Keep the VM available after OpenClaw QA.
5. Continue past OpenClaw post-smoke validation failures for local sidecar work when the gateway service is active, unless `OPENCLAW_STRICT_QA=1` is set.
6. Run this project's `scripts/bootstrap-multipass.sh` against the same VM to install Postgres and the trade-in sidecar.
7. Leave both `openclaw-gateway` and `trade-in-agent-sidecar.service` running under systemd.

Default command:

```bash
./scripts/bootstrap-openclaw-multipass.sh
```

Configurable environment variables:

- `OPENCLAW_AZURE_REPO`
- `OPENCLAW_DEPLOYMENT_PLAN`
- `VM_NAME`
- `KEEP_VM`
- `PUBLIC_FQDN`
- `OPENCLAW_STRICT_QA`
- `TIMEOUT_SECS`

Expected result:

- OpenClaw Stotz corporate sales deployment is installed through the OpenClaw Azure day-two operations tooling.
- Trade-in sidecar is installed onto the same VM.
- Sidecar smoke tests pass against the same VM where OpenClaw is running.

## Stotz Sales Deployment Replica

Use the existing `openclaw-on-azure/repo` local QA tooling as the owner of OpenClaw deployment bootstrap.

The local VM does not need real Teams delivery, real JDDO credentials, or real Machine Finder Pro integration.

It should replicate:

- workspace layout
- service placement
- environment variables
- local app service port
- sidecar startup behavior
- basic OpenClaw-to-sidecar call path

It may stub:

- Teams attachments
- SharePoint upload
- Fabric access
- JDDO/Dynamics
- Machine Finder Pro

## Sample Combine Case Fixture

Milestone 1 should include one seed case:

- unit type: combine
- make: John Deere
- model: placeholder
- serial/PIN: placeholder
- engine hours: placeholder
- separator hours: placeholder
- location: placeholder
- route: draft

Seed evidence metadata should include:

- front 45-degree photo
- rear 45-degree photo
- serial plate photo
- cab/display photo
- startup video placeholder

The fixture can use placeholder local media paths until real sample assets are approved.

## Smoke Test Spec

Script:

`scripts/smoke-test.sh`

Checks:

1. `GET /health`
2. Create a trade case.
3. Add machine identity fields.
4. Register at least one evidence item.
5. Fetch checklist status.
6. Generate packet.
7. Verify packet includes:
   - machine identity
   - evidence completeness
   - missing evidence
   - route
   - next step

## Milestone 1 Acceptance Criteria

Milestone 1 is complete when:

- a developer can bootstrap the host development environment from a clean checkout
- a developer can bootstrap the Multipass VM environment from a clean checkout
- Postgres is used for workflow state in both lanes
- the app service has a health endpoint and basic trade-case API
- the smoke test passes on host development
- the smoke test passes inside the Multipass VM
- a documented OpenClaw call path can create or update a trade case through the sidecar
- the implementation clearly separates app-service state from agent chat memory

## Open Questions

- Should Multipass mount the local repo or clone/copy it into the VM?
- Should the VM install the full Stotz Sales deployment from `openclaw-on-azure`, or a minimal OpenClaw runtime with matching workspace files?
- Which local port should be reserved for the sidecar long term?
- Should media storage in Milestone 1 be local-only, SharePoint-stubbed, or SharePoint-backed?
- Which framework should the app service use?
