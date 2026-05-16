# Milestone 2.5: Live Teams Attachment Bridge

## Goal

Close the gap between the Phase Two evidence loop and real Microsoft Teams uploads in the Stotz corporate sales deployment.

By the end of this milestone, a sales rep should be able to upload a photo or supported file in the Stotz Sales Agent Teams chat, and the trade-in workflow should resolve that upload through OpenClaw, register it on the active trade case, send analyzable images to the OpenAI API, and reply with accepted, weak, retake, or missing-evidence guidance while the rep is still in the field.

This is a bridge milestone. It does not add final valuation, final reconditioning dollars, Machine Finder Pro sync, or JDDO/Dynamics sync. It makes the live evidence path trustworthy enough for those later milestones.

## Research Findings

### Stotz Teams Deployment Is File Capable

The OpenClaw on Azure deployment plan for Stotz corporate sales is:

```text
/Users/josephrosztoczy/.openclaw/workspaces/openclaw-on-azure/repo/deployments/stotz-corp-sales.json
```

Relevant deployment facts:

- Teams is enabled for Stotz corporate sales.
- The plan includes a `teams.sharePointSiteId`.
- The generated Teams app manifest for `Stotz Sales Agent` includes `supportsFiles: true`.
- The manifest includes personal, team, and group chat scopes.
- The OpenClaw on Azure repo provisions Graph application permissions used for Teams file fallback and SharePoint access.

Current live VM config observed on May 5, 2026:

- `channels.msteams.enabled=true`
- `channels.msteams.dmPolicy=allowlist`
- `channels.msteams.groupPolicy=disabled`
- `channels.msteams.sharePointSiteId` is configured
- OpenClaw media root is `/home/openclaw/.openclaw/media`

The runtime is therefore ready for allowlisted direct-message testing today. Group and channel attachment testing should wait until `groupPolicy` is intentionally opened and the Teams app installation/permissions are verified in that surface.

### OpenClaw Teams Docs Confirm The Expected Surface

The installed OpenClaw Teams docs at:

```text
/opt/homebrew/lib/node_modules/openclaw/docs/channels/msteams.md
```

say:

- DM images and file attachments are supported.
- Channel/group attachments live in M365 storage and require Graph permissions to download.
- The Teams app manifest needs `bots[].supportsFiles: true` for personal-scope file handling.
- OpenClaw uses `sharePointSiteId` plus Graph permissions for group/channel file sends.
- By default, OpenClaw restricts inbound media downloads to Microsoft/Teams hosts.

### OpenClaw Normalizes Attachments Into Managed Media

The installed OpenClaw runtime code shows this path:

- Attachment payloads are parsed by `parseMessageWithAttachments`.
- Larger or non-inline attachments are saved with `saveMediaBuffer(..., "inbound", ...)`.
- Saved inbound media gets a claim-check URI shaped like:

  ```text
  media://inbound/<media-id>
  ```

- Image messages can include a marker shaped like:

  ```text
  [media attached: media://inbound/<media-id>]
  ```

- Saved references include physical paths, MIME type, label, and byte size.
- The agent runner knows how to hydrate `media://inbound/<media-id>` into local image input for models that support images.
- The media store root resolves under the OpenClaw config directory, which is `/home/openclaw/.openclaw/media` on the Stotz VM.

The live Stotz VM already has inbound media artifacts under:

```text
/home/openclaw/.openclaw/media/inbound
```

Observed file types include images and Office files, which confirms that the managed inbound media folder is being used in this deployment.

### Current Trade-In Sidecar Gap

The Phase Two sidecar can analyze:

- `http://` and `https://` image URLs
- `data:image/...` URLs
- local file paths
- fixture paths

It explicitly ignores `teams://...` placeholders and does not yet resolve:

- `media://inbound/<media-id>`
- OpenClaw `MediaPath` / `MediaPaths` transcript fields
- Teams/OpenClaw attachment payloads that only arrive as local managed-media paths
- video files from OpenClaw inbound media

That means live Teams uploads may reach OpenClaw correctly but still fail to become analyzable evidence inside the trade-in sidecar.

### Live QA Trace: May 5, 2026

After creating this milestone, Codex used the local Microsoft Teams desktop app to send a harmless generated PNG to the Stotz Sales Agent direct chat.

Message:

```text
Live QA from Codex desktop: attaching a harmless generated PNG to trace Teams -> OpenClaw inbound media for Milestone 2.5. Please do not treat this as a real machine photo.
```

Observed OpenClaw inbound media:

```text
/home/openclaw/.openclaw/media/inbound/9a09d4d9-cdf7-4491-a032-264ddafb4a32.png
```

Observed sidecar evidence row:

```text
evidenceId: da371565-ae71-4220-9401-5eaeade18881
storageUri: /home/openclaw/.openclaw/media/inbound/9a09d4d9-cdf7-4491-a032-264ddafb4a32.png
contentType: image/png
originalFileName: 9a09d4d9-cdf7-4491-a032-264ddafb4a32.png
```

Observed inference:

```text
provider: openai
model: gpt-5.4-mini
mode: live
qualityStatus: rejected
analysisStatus: complete
```

Useful result:

- The Teams desktop upload did reach OpenClaw.
- OpenClaw saved the upload to the managed inbound media folder.
- The trade-in sidecar/plugin path registered the physical media path and successfully sent it to the OpenAI API.
- OpenAI correctly rejected the generated test graphic as non-machine evidence.

Important blocker:

- The embedded OpenClaw agent also tried to hydrate the uploaded image as a native prompt image and logged:

  ```text
  Native image: failed to load /home/openclaw/.openclaw/media/inbound/9a09d4d9-cdf7-4491-a032-264ddafb4a32.png: Failed to optimize image: Optional dependency sharp is required for image attachment processing
  ```

- The same run reported `promptImages=0`.

Implication:

- The sidecar path can work with physical OpenClaw media paths today.
- Native OpenClaw image prompt hydration on the Stotz VM needs a `sharp` dependency check/fix before we can rely on the base agent seeing Teams images directly.
- Milestone 2.5 should keep the sidecar bridge explicit and add a deployment QA check for OpenClaw image hydration dependencies.

## Product Slice

> A sales rep starts or resumes a trade case in the Stotz Sales Agent Teams DM, uploads field photos from an iPhone, and the agent uses the sidecar to inspect those exact images through the OpenAI API before asking for the next best evidence.

The user-facing response should always include the durable case number so the rep knows the workflow is active:

```text
Trade case TIA-1234ABCD is open.

Accepted: front 45 photo.
Visible notes: photo is clear enough for exterior panel review; no obvious panel damage visible.
Still needed: rear 45, serial plate, cab display/hours.
Next: please send the rear 45 and serial plate photos.
```

## Deliverables

1. Live attachment trace documented against Stotz corporate sales.
2. Sidecar media resolver for OpenClaw managed media references.
3. Evidence registration shape that captures OpenClaw and Teams attachment metadata.
4. OpenAI image inference using resolved Teams-uploaded photos.
5. Safe local media root configuration for the sidecar.
6. Optional video handling path that either samples frames or returns a clear unsupported-video guidance state.
7. Agent route update so attachments are registered and analyzed before checklist guidance.
8. Regression tests for OpenClaw media references and denied unsafe paths.
9. Manual QA path for iPhone Teams uploads.
10. Deployment/runbook updates for the Stotz VM.
11. Deployment QA check for OpenClaw native image hydration dependencies, especially `sharp`.

## Sidecar Media Resolver

Add a resolver module that accepts these storage URI forms:

| Input | Behavior |
|---|---|
| `media://inbound/<media-id>` | Resolve under `OPENCLAW_MEDIA_ROOT/inbound/<media-id>`. |
| `/home/openclaw/.openclaw/media/inbound/<file>` | Accept only if under an allowlisted media root. |
| `file:///home/openclaw/.openclaw/media/inbound/<file>` | Convert to a safe local path and apply the same root guard. |
| `data:image/...` | Pass through unchanged. |
| `https://...` | Pass through existing remote-image path. |
| `teams://...` | Keep as metadata only unless a resolved OpenClaw media ref/path is also provided. |

Recommended environment variables:

```text
OPENCLAW_MEDIA_ROOT=/home/openclaw/.openclaw/media
TRADE_IN_MEDIA_CACHE_ROOT=/home/openclaw/openclaw-workspace/trade-in-agent/media-cache
```

Security requirements:

- Reject path traversal and null bytes.
- Reject absolute paths outside allowlisted media roots.
- Reject symlinks for inbound evidence reads.
- Do not log Graph tokens, signed Teams URLs, raw Authorization headers, or OpenAI API keys.
- Compute and store `mediaSha256` when copying or caching media.

Durability recommendation:

- Treat `media://inbound/...` as an immediate processing reference, not final durable storage.
- Copy accepted media into a trade-in-controlled cache or SharePoint evidence folder before relying on it for packet generation.
- Keep the future durable media destination aligned with the existing implementation plan: SharePoint sandbox preferred for visibility, local cache acceptable for processing.

## API Shape

The simplest implementation can extend the existing batch evidence registration payload:

```json
{
  "uploadedBy": "teams:user-or-openclaw-id",
  "mediaType": "photo",
  "storageUri": "media://inbound/photo---uuid.jpg",
  "originalFileName": "IMG_1234.jpeg",
  "contentType": "image/jpeg",
  "sourceMessageId": "teams-message-id",
  "sourceAttachmentId": "teams-attachment-id",
  "checklistSlot": "front_45",
  "metadata": {
    "openclawMediaRef": "media://inbound/photo---uuid.jpg",
    "openclawMediaPath": "/home/openclaw/.openclaw/media/inbound/photo---uuid.jpg",
    "openclawMediaRoot": "/home/openclaw/.openclaw/media",
    "teamsConversationId": "teams-conversation-id",
    "teamsSurface": "direct"
  }
}
```

If the agent cannot confidently map one attachment to one checklist slot, it should register the evidence with `checklistSlot=null`, analyze the image, and ask a targeted clarification only when needed.

## Data Model Notes

The existing evidence schema can hold most Teams/OpenClaw attachment fields today:

- `storageUri`
- `originalFileName`
- `contentType`
- `sourceMessageId`
- `sourceAttachmentId`
- `metadata_json`

Only add a migration if implementation needs queryable fields for media resolution or deduplication. Good candidates are:

- `resolvedStorageUri`
- `openclawMediaRef`
- `mediaSha256`
- `mediaSizeBytes`
- `mediaResolutionStatus`

## Agent Route Behavior

When a Teams message includes attachments or OpenClaw media markers, the agent should:

1. Check or create the active trade case through the sidecar.
2. Include the case number in the reply.
3. Extract OpenClaw media references from any of:
   - `[media attached: media://inbound/<id>]`
   - `MediaPath`
   - `MediaPaths`
   - attachment metadata supplied by the channel/runtime
4. Register the media with the sidecar.
5. Call visual inference for image evidence.
6. Fetch guidance.
7. Reply with accepted/retake/missing evidence and the next best ask.

The agent should not tell the user the photo was reviewed unless the sidecar successfully analyzed the resolved media or explicitly returned a fixture/unsupported mode.

## Video Handling

Implemented behavior for this milestone:

- Supported video references are resolved through the same guarded OpenClaw media resolver as photos.
- The sidecar samples representative frames with `ffmpeg` and sends those frame images to the OpenAI API.
- If `ffmpeg` is missing, the media path cannot be resolved, or frame sampling produces no frames, the evidence item is marked `analysisStatus=unsupported` with weak quality status instead of being retried indefinitely.
- Field guidance reports unsupported evidence and asks the rep for still photos of the highest-priority missing sections.

The fallback reply should be plain and field-useful:

```text
I received the video, but this workflow is not sampling video frames yet. Please send still photos of the front 45, serial plate, and cab display so I can review them now.
```

## Acceptance Criteria

Milestone 2.5 is complete when:

- A Teams DM photo uploaded from iPhone to Stotz Sales Agent is available to the sidecar as a real image input.
- The sidecar can resolve `media://inbound/<id>` references under `/home/openclaw/.openclaw/media/inbound`.
- Unsafe paths outside the configured media roots are rejected in tests.
- `media://inbound/...` traversal escapes are rejected; only files inside the inbound media root are accepted for that URI scheme.
- The sidecar sends at least one Teams-uploaded image to the OpenAI API in live mode.
- The evidence row stores original Teams/OpenClaw metadata and the normalized storage reference.
- The agent reply includes the case number and a concise accepted/retake/missing summary.
- Supported video files are sampled with `ffmpeg`; unsupported video files produce a clear next-step response rather than a silent failure or endless retry loop.
- OpenClaw gateway logs do not show native image hydration failures such as missing `sharp`, or the sidecar bridge explicitly bypasses that path and documents the bypass.
- No secrets, tokens, signed media URLs, or raw Authorization headers are written to docs, commits, or logs.

## Manual QA Path

### 1. Confirm Stotz Runtime

From a generated Azure SSH config:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" 'sudo -u openclaw -H bash -lc "
  openclaw config get channels.msteams.enabled
  openclaw config get channels.msteams.dmPolicy
  openclaw config get channels.msteams.groupPolicy
  openclaw config get channels.msteams.sharePointSiteId
"'
```

Expected today:

- enabled: `true`
- DM policy: `allowlist`
- group policy: `disabled`
- SharePoint site id: present

### 2. Start A Case In Teams

In the Stotz Sales Agent direct chat:

```text
Start a trade-in evaluation for a 2021 John Deere S780 combine. This is a live attachment QA test.
```

Expected:

- Agent creates or resumes a durable case.
- Reply includes `caseNumber` and internal `id`.
- Reply asks for the first evidence slots.

### 3. Upload A Photo From iPhone

Upload one machine photo or a harmless test image if a machine photo is unavailable.

Expected:

- OpenClaw receives the message.
- Inbound media appears under `/home/openclaw/.openclaw/media/inbound` or is staged into the agent workspace.
- The sidecar registers the evidence and analyzes it if it is an image.

Trace without printing secrets:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  'sudo find /home/openclaw/.openclaw/media/inbound -maxdepth 1 -type f -printf "%TY-%Tm-%Td %TH:%TM %s %p\n" | sort | tail -20'
```

Check sidecar results:

```bash
ssh -F "$SSH_CONFIG" "$SSH_HOST" \
  "sudo -u postgres psql -d trade_in_agent_prod -c \"SELECT provider, model, mode, created_at FROM visual_inference_results ORDER BY created_at DESC LIMIT 5;\""
```

Expected:

- Provider is `openai`.
- Routine model is `gpt-5.4-mini`.
- Mode is `live`.

### 4. Ask For Guidance

In Teams:

```text
Use the photo I just uploaded for this trade case. What do you still need?
```

Expected:

- Reply includes the case number.
- Reply says whether the image was accepted, weak, rejected, or needs retake.
- Reply lists the next highest-value evidence request.

### 5. Negative QA

Upload a non-machine image or unsupported file.

Expected:

- Evidence is stored with metadata.
- Unsupported/non-machine evidence does not count toward checklist completeness.
- Agent asks for the right replacement photo without claiming condition findings.

## Open Questions

- In the live Stotz Teams DM path, does OpenClaw expose image uploads to the agent as inline image input, `media://inbound/...`, `MediaPath`, or a combination?
- Does OpenClaw retain inbound media long enough for sidecar processing under load, or should the sidecar immediately copy every referenced file?
- Do iPhone HEIC uploads arrive as HEIC, JPEG, or Teams-converted images?
- Is `ffmpeg` installed and healthy on each deployed VM after rollout?
- Should group/channel trade-in evaluation be enabled later, or should the MVP remain direct-message first?
- What SharePoint folder naming convention should become the durable evidence archive before Machine Finder Pro sync?

## Implementation Sequence

1. Add tests for OpenClaw media reference parsing and safe path resolution.
2. Add sidecar media resolver with `OPENCLAW_MEDIA_ROOT`.
3. Extend visual inference input resolution to support `media://inbound/...` and `file://` under allowlisted roots.
4. Extend evidence registration docs/examples to include OpenClaw media metadata.
5. Update agent route instructions to prioritize attachment extraction and sidecar analysis.
6. Add a deployment check/fix for OpenClaw native image hydration dependencies such as `sharp`.
7. Add live QA trace commands to the Stotz deployment runbook.
8. Deploy to Stotz and run the iPhone Teams direct-message test.
9. Verify `ffmpeg` is installed on the Stotz VM and run a live or synthetic video-frame sampling check.
