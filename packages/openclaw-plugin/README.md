# Trade-In Agent OpenClaw Plugin

Private package for exposing the Trade-In Agent sidecar to OpenClaw through stable tools.

API version: `trade-in-sidecar/v1`

Runtime configuration:

```bash
TRADE_IN_SIDECAR_URL=http://127.0.0.1:8788
TRADE_IN_TIMEOUT_MS=240000
```

Preferred stable tool names:

- `trade_case_health`
- `trade_case_start`
- `trade_case_active`
- `trade_case_get`
- `trade_case_update`
- `trade_case_register_field_uploads`
- `trade_case_add_evidence`
- `trade_case_analyze_evidence`
- `trade_case_checklist`
- `trade_case_processing_status`
- `trade_case_guidance`
- `trade_case_routing`
- `trade_case_packet`
- `trade_case_archive`

Legacy aliases remain registered for current deployments:

- `trade_in_health`
- `trade_in_start_or_resume`
- `trade_in_start_case`
- `trade_in_get_active_case`
- `trade_in_get_case`
- `trade_in_update_case`
- `trade_in_register_field_uploads`
- `trade_in_register_evidence`
- `trade_in_analyze_evidence`
- `trade_in_processing_status`
- `trade_in_get_checklist`
- `trade_in_get_guidance`
- `trade_in_generate_packet`
- `trade_in_archive_case`

The plugin should be treated as an adapter only. Business logic, request/response schemas, database state, visual inference, routing, packets, and integration job records live in the `trade-in-agent` sidecar.

For Teams photo/video uploads, use `trade_case_register_field_uploads`. It always queues analysis asynchronously and returns a field acknowledgement. `trade_case_analyze_evidence` is a reviewer/dev escape hatch; it queues by default and only runs synchronously when `allowSynchronousAnalysis` is true with `processingMode: "sync"`.
