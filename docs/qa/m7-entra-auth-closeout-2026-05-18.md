# M7 Entra Auth Closeout QA - 2026-05-18

## Scope

Close out Milestone 7 for the production review UI deployments:

- Stotz: `https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com`
- Premier: `https://premier-sales-prod-wus2-9acc309a.westus2.cloudapp.azure.com`

This closeout covers the Entra OAuth/OIDC production gate, tenant-specific callbacks, allow-list enforcement, reviewer identity, and the production UI branding/sign-out follow-up found during QA.

## Deployment State

Both production VMs are running the full `trade-in-agent` app sidecar and worker from branch `codex/entra-auth`.

Verified service state on both hosts:

- `trade-in-agent-sidecar.service`: active
- `trade-in-agent-worker.service`: active
- old `trade-in-agent.service`: disabled
- local `/health`: `ok: true`, `service: trade-in-agent-sidecar`, `apiVersion: trade-in-sidecar/v1`

The previous Caddy Basic Auth gate has been replaced with:

- `/auth/*` reverse-proxied to the sidecar auth routes
- `/trade-review/*` protected through `/auth/verify` forward auth before serving static review UI assets
- `/review/*` reverse-proxied to the authenticated sidecar review API

## Callback URLs

Production callback URLs verified in the tenant app registrations:

- Stotz: `https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com/auth/callback`
- Premier: `https://premier-sales-prod-wus2-9acc309a.westus2.cloudapp.azure.com/auth/callback`

Local QA callback retained for both app registrations:

- `http://localhost:8788/auth/callback`

## Unauthenticated Checks

For both production hosts:

- `GET /trade-review/` returns `302` to `/auth/login?returnTo=%2Ftrade-review%2F`
- `GET /review/cases?limit=1` returns `401` with JSON auth failure and a login URL
- no `WWW-Authenticate` Basic Auth challenge is returned

## Tenant Login Checks

Stotz login URL:

- Microsoft host: `login.microsoftonline.com`
- tenant: `fdd5d95a-8e91-40f6-9097-a62f0b2f1f4b`
- redirect URI: `https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com/auth/callback`

Premier login URL:

- Microsoft host: `login.microsoftonline.com`
- tenant: `d7513d04-2f3f-4985-9ef7-f3d0f678ef2b`
- redirect URI: `https://premier-sales-prod-wus2-9acc309a.westus2.cloudapp.azure.com/auth/callback`

## Authenticated Browser Checks

Stotz:

- account: `joeyr@stotzeq.com`
- callback completed after Authenticator approval
- landed on `/trade-review/`
- `/auth/me` returned:
  - `authenticated: true`
  - `deployment: stotz`
  - `tenantLabel: Stotz`
  - `email/upn: joeyr@stotzeq.com`
  - `roles: reviewer`
  - CSRF token present

Premier:

- account: `joey.rosztoczy@premierequipment.ca`
- callback completed
- landed on `/trade-review/`
- queue rendered with authenticated reviewer context

## UI Closeout Checks

Production static UI assets were patched and republished after QA found two issues:

- the mobile sign-out button rendered as a blank white square
- the header used a mixed `Premier / Stotz Used Equipment` label

Fixes deployed:

- deployment-specific brand name from `/auth/me`, session deployment, or host fallback
- `Stotz Used Equipment` on Stotz production
- `Premier Used Equipment` on Premier production
- visible icon sign-out button with an accessible `aria-label="Sign out"`
- cache-busted CSS/JS query string: `2026-05-18-mobile-brand`
- smoke guard fails if the mixed Premier/Stotz brand string returns

Production browser DOM verification:

- Stotz brand: `Stotz Used Equipment`
- Stotz footer: `Live sidecar / Stotz Trade Desk v0.4.1`
- Premier brand: `Premier Used Equipment`
- Premier footer: `Live sidecar / Premier Trade Desk v0.4.1`
- sign-out button present on both with `aria-label="Sign out"`

Note: a user-observed mobile phone rendering issue drove the fix. This closeout verified the patched production DOM and CSS, but it did not use device-farm automation or a second physical-phone capture from this environment.

## Role Policy

For closeout, the deployment keeps the MS Teams-derived reviewer allow lists behind Entra.

Manager/admin lists remain empty until tenant owners identify approvers. This is intentional:

- reviewer users can view the queue and record normal review decisions
- packet approval remains disabled in the UI for reviewer-only users
- server-side authorization rejects manager-only approval without a manager/admin role

## Automated Checks

Local checks run from branch `codex/entra-auth`:

- `npm test` in `app`
- `npm run contracts:check` in `app`
- `npm run smoke` in `review-ui`
- `git diff --check`

Earlier implementation QA also covered the local review queue flow, packet generation route, and reviewer action path.

## Residual Follow-Ups

- Populate manager/admin Entra groups or allow lists when the tenant owners identify approvers.
- Decide whether role assignment should stay config-driven or move to Graph group lookup.
- Run another real phone-in-the-field Teams QA pass for each tenant after M7 merges.
- Add durable media proxy/storage so production evidence thumbnails do not depend on transient Teams/OpenClaw media references.
