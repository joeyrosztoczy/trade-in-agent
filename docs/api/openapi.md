# Trade-In Sidecar API

The checked-in OpenAPI contract lives at:

```text
app/openapi.json
```

Generate it with:

```bash
cd app
npm run contracts:openapi
```

Check drift with:

```bash
cd app
npm run contracts:check
```

API version: `trade-in-sidecar/v1`

Primary OpenClaw plugin package:

```text
packages/openclaw-plugin
@premier/trade-in-agent-openclaw-plugin
```

The OpenAPI file is the source of truth for HTTP request and response shapes. Agent docs should name the stable tool path and summarize behavior, but they should not duplicate business logic from the sidecar.

