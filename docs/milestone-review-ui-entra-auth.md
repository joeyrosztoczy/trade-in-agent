# Milestone 7: Review UI Microsoft Entra Authentication

## Goal

Replace the temporary Caddy Basic Auth gate on the review UI with Microsoft Entra OAuth/OIDC authentication and reviewer authorization.

Basic Auth is acceptable for a short controlled QA window because it is simple, easy to rotate, and protects the public route while the product shape is still moving. It should not become the long-term access model for used-equipment review, valuation, or reconditioning decisions.

## North Star

A centralized used-equipment reviewer opens the review UI, signs in with their company Microsoft account, and sees only the trade-review workflows they are allowed to access. Every review action is attributed to the signed-in user, and the sidecar rejects unauthenticated or unauthorized browser calls.

## Product Slice

> A Stotz or Premier used-team reviewer visits the review UI, completes Microsoft Entra sign-in, lands back in the queue, and records a review decision that persists their identity, tenant, and group-derived role.

## Recommended Architecture

Use Caddy only for TLS and reverse proxying. Put authentication in a small app auth layer so the sidecar and UI can share a clear contract.

```text
Browser
  |
  v
Caddy HTTPS
  |
  +-- static review UI
  |
  +-- auth/session routes
  |
  v
Review app auth layer
  |
  +-- Microsoft Entra OIDC
  +-- signed secure cookie
  +-- CSRF protection
  +-- user/group role mapping
  |
  v
Trade-In sidecar /review endpoints
```

## Deliverables

### 1. Entra App Registration

Create or reuse an Entra app registration for the review UI.

Required settings:

- redirect URI: `https://<review-ui-host>/auth/callback`
- logout redirect URI: `https://<review-ui-host>/trade-review/`
- supported account type: single tenant unless cross-company Premier/Stotz access requires multi-tenant
- delegated scopes: `openid`, `profile`, `email`
- group claims or Microsoft Graph group lookup for reviewer roles

Store app secrets in the deployment secret mechanism, not in git.

### 2. Review App Auth Layer

Add a small server-side auth layer beside the sidecar.

Responsibilities:

- `/auth/login`
- `/auth/callback`
- `/auth/logout`
- `/auth/me`
- signed, `HttpOnly`, `Secure`, `SameSite=Lax` session cookie
- CSRF token for mutating review actions
- session expiration and refresh behavior
- mapping Entra user/group claims to product roles

Roles:

- `reviewer`: view queue and record normal review decisions
- `manager`: approve packet and override route
- `admin`: manage auth config and access mapping

### 3. Sidecar Authorization

Protect sidecar review endpoints:

- `GET /review/cases`
- `GET /review/cases/:id`
- `POST /review/cases/:id/actions`

The sidecar should accept only trusted identity headers from the local auth layer or a signed internal token. It should not trust arbitrary browser-provided user fields.

Persist review actions with authenticated identity:

- Entra object id
- display name
- email / UPN
- role at time of action
- tenant id

### 4. UI Integration

The review UI should:

- call `/auth/me` on load
- redirect to `/auth/login` when unauthenticated
- show signed-in reviewer identity
- disable actions the user cannot perform
- include CSRF token on `POST /review/cases/:id/actions`
- show an access-denied state for unauthorized users

### 5. Deployment Updates

Update the Stotz deployment runbook and OpenClaw-on-Azure Caddy config so:

- Caddy no longer uses Basic Auth for `/trade-review/`
- Caddy routes `/auth/*` to the auth app
- Caddy routes `/review/*` only to the protected auth/sidecar path
- secrets are sourced from deployment secrets or Key Vault
- CORS is same-origin only

### 6. QA

Automated tests:

- unauthenticated browser request redirects to login
- authenticated reviewer can list queue
- reviewer can request evidence
- reviewer cannot perform manager-only approval when not in the manager group
- manager can approve packet
- review action stores authenticated identity, not a user-supplied reviewer string

Manual QA:

- sign in with a permitted Stotz account
- sign out and confirm queue is inaccessible
- test a non-allowed account if available
- verify Caddy logs do not print tokens
- verify sidecar logs do not print access tokens or cookies

## Acceptance Criteria

Milestone 7 is complete when:

1. Basic Auth is removed from the production review UI route.
2. Microsoft Entra sign-in is required for `/trade-review/`.
3. `/review/*` browser calls are rejected without a valid authenticated session.
4. Reviewer actions persist the actual Entra user identity.
5. Role-based actions are enforced on the server side.
6. Deployment secrets are outside git.
7. The Stotz production runbook includes setup, rotation, QA, and rollback steps.

## Closeout Status

Closed out on May 18, 2026 on branch `codex/entra-auth`.

Production verification:

- Stotz production deployed and callback-tested with `joeyr@stotzeq.com`.
- Premier production deployed and callback-tested with `joey.rosztoczy@premierequipment.ca`.
- Both production hosts redirect unauthenticated `/trade-review/` requests to Microsoft Entra login.
- Both production hosts reject unauthenticated `/review/*` API calls with `401`.
- Both production sidecar and worker services are active; the old Basic Auth era app service is disabled.
- Review UI static assets are cache-busted and show deployment-specific branding.
- Reviewer-only users can view/record normal review actions; manager/admin approval remains disabled until those allow lists are populated.

Detailed closeout evidence is recorded in [qa/m7-entra-auth-closeout-2026-05-18.md](qa/m7-entra-auth-closeout-2026-05-18.md).

## Out Of Scope

- Dynamics/JDDO authorization model
- Machine Finder Pro user provisioning
- final cross-company multi-tenant governance
- row-level data partitioning by dealership beyond the first Stotz/Premier review groups
