# Milestone 3.5: API Contract And OpenClaw Boundary Hardening

## Goal

Make the boundary between `trade-in-agent` and `openclaw-on-azure` explicit, testable, and boring.

After this milestone, day-to-day product work should happen in this repo. The OpenClaw Azure repo should only be touched for deployment topology, runtime configuration, secrets, Graph/SharePoint/Fabric permissions, VM shape, or fleet rollout.

## Mental Model

```text
openclaw-on-azure = where the agent lives
trade-in-agent = what the product does
OpenClaw plugin + API contract = the boundary between them
```

The product repo owns:

- sidecar API
- database schema and migrations
- evidence and routing business logic
- visual inference prompts and response normalization
- packets and reviewer outputs
- contract schemas
- contract tests
- OpenClaw tool adapter/plugin package
- local developer workflow for sidecar plus OpenClaw integration

The OpenClaw Azure repo owns:

- Azure resource groups, VMSS/VM, networking, backup, and systemd rollout shape
- OpenClaw runtime version
- Teams bot/app configuration
- deployment secrets and environment variable injection
- Graph/SharePoint/Fabric permissions
- deployment plan flags such as enabling the trade-in plugin and setting its base URL

## Current State

The boundary exists but is still too document-driven.

Today we have:

- stable sidecar HTTP endpoints
- Markdown agent instructions in `agent/`
- runbooks that copy those instructions into the OpenClaw workspace
- Stotz VM deployment docs
- smoke tests and realistic QA flows
- a deployment-plan flag in OpenClaw for the trade-in sidecar base URL

The gap:

- no executable API contract
- no OpenAPI file generated from schemas
- no runtime request/response validation
- no contract tests that prove the docs and sidecar still agree
- no versioned OpenClaw plugin/tool adapter package owned by this repo
- no single local developer command that starts the sidecar and makes the OpenClaw integration contract obvious

## Recommended Implementation

Use a Zod-first contract with generated OpenAPI.

Why Zod-first:

- the sidecar is Node
- schemas can validate real runtime requests and responses
- tests can use the same schemas as the server
- OpenAPI can be generated for humans and future clients
- the OpenClaw plugin can import the same response types or generated client surface later

If TypeScript is not introduced yet, start with JavaScript modules using Zod and JSDoc. Do not block this milestone on a repo-wide TypeScript conversion.

## Deliverables

### 1. Contract Schemas

Add a contract module under:

```text
app/src/contracts/
```

Recommended files:

```text
app/src/contracts/enums.js
app/src/contracts/machine.js
app/src/contracts/tradeCase.js
app/src/contracts/evidence.js
app/src/contracts/analysis.js
app/src/contracts/routing.js
app/src/contracts/packet.js
app/src/contracts/index.js
```

The contract should define schemas for every request and response that OpenClaw or another client can call.

Minimum schemas:

- `HealthResponse`
- `CreateTradeCaseRequest`
- `TradeCaseResponse`
- `ListTradeCasesResponse`
- `ActiveTradeCaseResponse`
- `UpdateTradeCaseRequest`
- `EvidenceCreateRequest`
- `EvidenceBatchCreateRequest`
- `EvidenceResponse`
- `AnalyzeEvidenceRequest`
- `AnalyzeEvidenceResponse`
- `ChecklistResponse`
- `GuidanceResponse`
- `RoutingResponse`
- `PacketResponse`
- `ErrorResponse`

Shared enums:

- `UnitType`
- `MediaType`
- `QualityStatus`
- `AnalysisStatus`
- `Route`
- `RouteCategory`
- `ReviewStatus`
- `RiskSeverity`
- `FindingType`

### 2. Runtime Validation

Add a small validation layer to `app/src/server.js` or a nearby helper:

```text
app/src/http/validation.js
```

Required behavior:

- validate request bodies for write endpoints
- return a consistent `400` shape for invalid requests
- validate response bodies in test mode or behind `CONTRACT_VALIDATE_RESPONSES=1`
- keep production response validation optional to avoid accidental latency or availability surprises

Standard error shape:

```json
{
  "error": "Request body did not match contract",
  "code": "contract_validation_failed",
  "issues": [],
  "requestId": "..."
}
```

### 3. Generated OpenAPI

Generate:

```text
app/openapi.json
```

and optionally:

```text
docs/api/openapi.md
```

Add scripts:

```json
{
  "contracts:openapi": "node scripts/generate-openapi.js",
  "contracts:check": "node scripts/check-openapi-current.js"
}
```

The OpenAPI file should include:

- endpoint paths
- request schemas
- response schemas
- route/review/quality enum descriptions
- examples for the core Teams workflow
- version metadata

Recommended initial API version:

```text
trade-in-sidecar/v1
```

### 4. Contract Tests

Add tests that prove every documented endpoint still honors the contract.

Recommended file:

```text
app/tests/contract.test.js
```

Each contract test should:

1. Create the necessary fixture state.
2. Call the real sidecar function or HTTP server.
3. Validate the response against the contract schema.
4. Assert important business invariants that the schema cannot express.

Minimum test coverage:

- health response validates
- create case response validates
- active case response validates
- evidence batch response validates
- analyze evidence response validates in fixture mode
- checklist response validates
- guidance response validates and includes `caseNumber`
- routing response validates and uses allowed route enums
- packet response validates and includes reviewer-facing packet sections
- invalid create-case payload returns the standard contract error

### 5. Agent Tool Contract Refresh

Regenerate or update:

```text
agent/TRADE-IN-TOOLS.md
agent/TRADE-IN-EVALUATION-ROUTE.md
```

from the same contract source where practical.

At minimum, the docs should explicitly list:

- API version
- stable tool names
- endpoint mapping
- request payload examples
- response fields the agent should use
- fields the agent must never invent
- known limits for video/audio and final valuation

### 6. Versioned OpenClaw Plugin Package

Create a package owned by this repo:

```text
packages/openclaw-plugin/
```

Working package name:

```text
@premier/trade-in-agent-openclaw-plugin
```

The package should expose stable OpenClaw tool names:

- `trade_case_start`
- `trade_case_active`
- `trade_case_add_evidence`
- `trade_case_analyze_evidence`
- `trade_case_guidance`
- `trade_case_routing`
- `trade_case_packet`

The plugin should:

- read `TRADE_IN_SIDECAR_URL`, defaulting to `http://127.0.0.1:8788`
- call the sidecar through the versioned API contract
- validate sidecar responses against the contract in development/test mode
- return concise tool results for the agent
- hide HTTP details from the model wherever OpenClaw supports native tools
- preserve durable case ids and case numbers in every relevant response

This package does not need to be publicly published in the first pass. It can be a private workspace package or tarball artifact consumed by deployments.

### 7. Local Developer Boundary Script

Add one command that makes the integration easy to run locally:

```text
scripts/dev-openclaw-boundary.sh
```

Recommended behavior:

1. Start or verify Postgres.
2. Run migrations.
3. Start the sidecar on `127.0.0.1:8788`.
4. Print the sidecar health URL.
5. Print the OpenAPI path.
6. Print the plugin package path.
7. Print the environment variables OpenClaw needs:

   ```text
   TRADE_IN_SIDECAR_URL=http://127.0.0.1:8788
   TRADE_IN_PLUGIN_PACKAGE=packages/openclaw-plugin
   ```

8. Optionally run the smoke test and contract tests.

The script should not require touching `openclaw-on-azure`.

### 8. OpenClaw Azure Touchpoint Reduction

Update deployment docs so `openclaw-on-azure` only needs to know:

```json
{
  "tools": {
    "tradeInAgent": {
      "enabled": true,
      "baseUrl": "http://127.0.0.1:8788",
      "pluginPackage": "@premier/trade-in-agent-openclaw-plugin",
      "apiVersion": "trade-in-sidecar/v1"
    }
  }
}
```

The deployment repo should not duplicate endpoint payload details, routing rules, packet fields, or business logic.

## Stable Tool Semantics

### `trade_case_start`

Creates or resumes a trade case for the current conversation.

Must return:

- `id`
- `caseNumber`
- `machine`
- `status`
- next guidance or first evidence requests

### `trade_case_add_evidence`

Registers one or more media attachments.

Must accept:

- Teams attachment ids
- OpenClaw managed media refs
- local media paths under approved media roots
- remote image URLs when explicitly allowed by sidecar config

Must return:

- evidence item ids
- normalized storage refs
- media type
- initial checklist slot hints

### `trade_case_analyze_evidence`

Runs visual inference for one evidence item.

Must return:

- quality status
- accepted/weak/retake/rejected signal
- visible condition findings
- evidence quality findings
- limitations
- model/provider metadata

### `trade_case_guidance`

Returns the sales-rep-facing next message.

Must return:

- case number
- route
- review status
- confidence
- accepted evidence summary
- retake requests
- missing or weak evidence requests
- concise suggested next message

### `trade_case_packet`

Returns the used-team packet.

Must return:

- machine identity
- evidence completeness
- reviewer brief
- visible positives
- visible concerns and risks
- limitations
- field follow-up questions
- route/review/confidence
- recon scenario placeholders
- recommendation next step

## Contract Versioning Rules

Use semantic-ish API versions:

```text
trade-in-sidecar/v1
```

Allowed in `v1` without breaking:

- adding optional response fields
- adding new enum values only if clients treat unknown values safely
- adding optional request fields
- adding new endpoints

Breaking changes requiring `v2`:

- removing fields used by the plugin
- renaming fields
- changing required field types
- changing route/review/quality meanings
- changing success status codes
- changing packet structure in a way that breaks reviewer handoff

## QA Requirements

Automated:

```bash
cd app
npm test
npm run contracts:check
npm run smoke
```

Contract-focused:

```bash
cd app
npm run test:contract
```

OpenAPI freshness:

```bash
cd app
npm run contracts:openapi
git diff --exit-code app/openapi.json
```

Local integration:

```bash
./scripts/dev-openclaw-boundary.sh
```

VM integration:

```bash
multipass exec trade-in-agent-openclaw-dev -- bash -lc 'cd /home/ubuntu/trade-in-agent/app && npm test && npm run contracts:check && npm run smoke'
```

Remote Stotz verification after deployment:

- sidecar health OK
- OpenClaw gateway active
- sidecar tests pass
- contract tests pass
- smoke test passes in live mode
- realistic user-flow QA passes
- Teams phone replay still creates/resumes a case and returns a case number

## Acceptance Criteria

- All public sidecar endpoints have schemas.
- Request validation is active for write endpoints.
- Contract tests cover every endpoint listed in `agent/TRADE-IN-TOOLS.md`.
- `app/openapi.json` is generated and checked into the repo.
- Agent docs are updated to reference the API version and stable tool names.
- A private OpenClaw plugin package exists in this repo.
- Plugin tools call the sidecar through stable names rather than ad hoc curl-style HTTP reasoning.
- Local dev can run sidecar plus boundary checks without editing `openclaw-on-azure`.
- Deployment docs describe only the minimal OpenClaw Azure touchpoints.
- Stotz Sales VM deployment still passes smoke and realistic replay QA.

## Non-Goals

- No final trade valuation engine.
- No final recon-dollar engine.
- No rewrite of OpenClaw runtime.
- No repo-wide TypeScript migration unless separately approved.
- No requirement to publish the plugin to a public package registry.
- No Dynamics/JDDO or Machine Finder Pro integration implementation.

## Implementation Order

1. Add Zod schemas and shared enums.
2. Add contract tests for existing endpoint responses in fixture mode.
3. Add request validation for write endpoints.
4. Generate and commit OpenAPI.
5. Update agent docs from or against the contract.
6. Scaffold the OpenClaw plugin package with stable tool names.
7. Add plugin unit tests using mocked sidecar responses.
8. Add local boundary dev script.
9. Update deployment runbook to describe the smaller OpenClaw Azure touchpoint.
10. Re-run local VM and Stotz VM QA.

## Risks

- Adding runtime validation can expose payloads that current agent instructions send loosely.
- Generated OpenAPI can drift if not checked in CI or tests.
- Plugin packaging may depend on the exact OpenClaw extension mechanism available in the deployed runtime.
- The Teams attachment path still depends on how OpenClaw exposes managed media refs.

## Preferred Cut Line

The smallest valuable version of this milestone is:

1. Zod schemas for all current sidecar requests/responses.
2. Contract tests for all current endpoints.
3. Generated `app/openapi.json`.
4. Updated `agent/TRADE-IN-TOOLS.md` that names API version and stable future tool names.

That alone would make the boundary much sharper. The plugin package is the ideal completion step that turns the documented boundary into an active tool surface.
