# Review UI Entra Auth Runbook

This runbook replaces the temporary Caddy Basic Auth gate with Microsoft Entra OIDC for the review UI.

The Stotz and Premier deployments stay single-tenant and separate. For this first slice, reviewer authorization is an email allow list copied from the Microsoft Teams DM allow lists in the OpenClaw on Azure deployment plans.

## Production Callbacks

Register these web redirect URIs on the tenant-local app registration used by each deployment:

| Deployment | Callback URL | Status |
| --- | --- | --- |
| Stotz corporate sales | `https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com/auth/callback` | Verified present on the Stotz Sales Agent app registration. |
| Premier sales | `https://premier-sales-prod-wus2-9acc309a.westus2.cloudapp.azure.com/auth/callback` | Verified present on the Premier Sales Agent app registration. |
| Local sidecar QA | `http://localhost:8788/auth/callback` | Verified present on both the Stotz Sales Agent and Premier Sales Agent app registrations. |

Use `/trade-review/` as the post-logout landing path.

## App Registration

Reuse the existing Teams app registration for each deployment unless a tenant admin asks for a dedicated review UI app. Required settings:

- Supported account type: single tenant.
- Redirect URI: the deployment callback above.
- Delegated scopes: `openid`, `profile`, `email`.
- Client secret: keep in the VM/deployment secret mechanism, not in git.

To add a redirect URI without printing secrets:

```bash
repo="$HOME/.openclaw/workspaces/openclaw-on-azure/repo"
plan="deployments/premier-sales-team"
callback="https://premier-sales-prod-wus2-9acc309a.westus2.cloudapp.azure.com/auth/callback"

app_id="$(jq -r '.MSTEAMS_APP_ID // empty' "$repo/$plan/secrets.json")"
redirect_uris="$(az ad app show --id "$app_id" --query 'web.redirectUris || `[]`' -o json \
  | jq -r --arg callback "$callback" '. + [$callback, "http://localhost:8788/auth/callback"] | unique[]')"
az ad app update --id "$app_id" --web-redirect-uris $redirect_uris --only-show-errors --output none
```

Then verify:

```bash
az ad app show --id "$app_id" \
  --query "contains(web.redirectUris, '$callback')" \
  -o tsv
```

## Sidecar Env

Generate a new `ENTRA_AUTH_SESSION_SECRET` per VM:

```bash
openssl rand -base64 48
```

Stotz production:

```dotenv
ENTRA_AUTH_ENABLED=true
ENTRA_AUTH_DEPLOYMENT=stotz
ENTRA_AUTH_TENANT_LABEL=Stotz
ENTRA_AUTH_TENANT_ID=<Stotz Entra tenant id>
ENTRA_AUTH_CLIENT_ID=<Stotz Teams app client id>
ENTRA_AUTH_CLIENT_SECRET=<Stotz Teams app client secret>
ENTRA_AUTH_PUBLIC_ORIGIN=https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com
ENTRA_AUTH_ALLOWED_USERS=jbehrend@stotzeq.com,lrichins@stotzeq.com,joeyr@stotzeq.com,cleiter@stotzeq.com,robr@stotzeq.com,ascriver@stotzeq.com,sscriver@stotzeq.com
ENTRA_AUTH_MANAGER_USERS=
ENTRA_AUTH_ADMIN_USERS=
ENTRA_AUTH_SESSION_SECRET=<generated secret>
CORS_ALLOW_ORIGIN=https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com
```

Premier production:

```dotenv
ENTRA_AUTH_ENABLED=true
ENTRA_AUTH_DEPLOYMENT=premier
ENTRA_AUTH_TENANT_LABEL=Premier
ENTRA_AUTH_TENANT_ID=<Premier Entra tenant id>
ENTRA_AUTH_CLIENT_ID=<Premier Teams app client id>
ENTRA_AUTH_CLIENT_SECRET=<Premier Teams app client secret>
ENTRA_AUTH_PUBLIC_ORIGIN=https://premier-sales-prod-wus2-9acc309a.westus2.cloudapp.azure.com
ENTRA_AUTH_ALLOWED_USERS=joey.rosztoczy@premierequipment.ca,omar.freeman@premierequipment.ca,phil.harris@premierequipment.ca,jeremy.murray@premierequipment.ca,colin.montroy@premierequipment.ca
ENTRA_AUTH_MANAGER_USERS=
ENTRA_AUTH_ADMIN_USERS=
ENTRA_AUTH_SESSION_SECRET=<generated secret>
CORS_ALLOW_ORIGIN=https://premier-sales-prod-wus2-9acc309a.westus2.cloudapp.azure.com
```

Keep manager/admin lists empty until the tenant owners identify those reviewers. With an empty manager list, normal reviewer actions work and packet approval remains server-blocked.

## Caddy

Remove Basic Auth and route auth/review traffic to the sidecar:

```caddyfile
redir /trade-review /trade-review/ 308

@auth path /auth/*
handle @auth {
  reverse_proxy 127.0.0.1:8788
}

@tradeReviewUi path /trade-review/*
handle @tradeReviewUi {
  route {
    forward_auth 127.0.0.1:8788 {
      uri /auth/verify
      header_up X-Forwarded-Uri {uri}
    }
    uri strip_prefix /trade-review
    root * /var/www/trade-in-review-ui
    header {
      X-Content-Type-Options nosniff
      Referrer-Policy same-origin
      X-Frame-Options DENY
    }
    file_server
  }
}

@tradeReviewApi path /review/*
handle @tradeReviewApi {
  reverse_proxy 127.0.0.1:8788
}
```

Reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl restart trade-in-agent-sidecar.service
```

## QA

Unauthenticated:

```bash
curl -I https://<host>/trade-review/
curl -sS https://<host>/review/cases?limit=1
```

Expected:

- `/trade-review/` returns `302` to `/auth/login`.
- `/review/cases` returns `401` with a login URL.

Authenticated browser QA:

1. Open `https://<host>/trade-review/`.
2. Sign in with an allowed account from the deployment allow list.
3. Confirm the queue loads and the top bar shows the signed-in Microsoft user.
4. Record `Request evidence` or `Hold` and confirm the action history stores the authenticated reviewer identity.
5. Sign out and confirm the queue is inaccessible.
6. Test a non-allow-listed account if one is available and confirm access is denied.

Security checks:

```bash
curl -i -X POST https://<host>/review/cases/<case-id>/actions \
  -H 'Content-Type: application/json' \
  --data '{"actionType":"request_more_evidence","reviewer":"spoofed"}'
```

Expected: `401` without a session or `403` without the CSRF token. The sidecar ignores browser-supplied `reviewer` values and writes the Entra identity from the signed session.

## Production Closeout Status

As of May 18, 2026, Stotz and Premier production are both running this Entra-authenticated review UI shape.

Verified production hosts:

- Stotz: `https://stotz-sales-prod-wus2-8b38e2ec.westus2.cloudapp.azure.com`
- Premier: `https://premier-sales-prod-wus2-9acc309a.westus2.cloudapp.azure.com`

Closeout checks completed:

- old Caddy Basic Auth gate removed from `/trade-review/*` and `/review/*`
- `/trade-review/` redirects unauthenticated users to `/auth/login?returnTo=%2Ftrade-review%2F`
- `/review/cases?limit=1` returns `401` without a signed session
- `/auth/login` redirects to the tenant-specific Microsoft login endpoint with the production callback URL
- Stotz browser callback completed with `joeyr@stotzeq.com`
- Premier browser callback completed with `joey.rosztoczy@premierequipment.ca`
- `/auth/me` returns the correct deployment, tenant label, reviewer identity, role, CSRF token, and logout URL
- production UI branding is deployment-specific: `Stotz Used Equipment` on Stotz and `Premier Used Equipment` on Premier
- mobile sign-out rendering fix is deployed with cache-busted static assets

Current role policy: reviewer allow lists are populated from the deployment Teams allow lists; manager/admin allow lists are intentionally empty until tenant owners identify approvers. Packet approval remains server-blocked for reviewer-only users.
