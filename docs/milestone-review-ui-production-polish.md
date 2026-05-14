# Milestone 6.1: Review UI Production Polish

## Goal

Turn the Milestone 6 review UI from a live demo queue into a practical reviewer workbench for controlled field QA.

## Product Slice

A used-equipment reviewer can open the production review UI, find the right trade ticket quickly, inspect the evidence and packet, record a decision, and export the packet for follow-up without leaving the page.

## Implemented Surface

- Queue search across case, unit, customer/source, serial, location, route, and source URL.
- Queue filters for ready reviews, field-evidence cases, technician holds, high-risk cases, valued cases, and media gaps.
- Queue sorting by recent update, highest risk, highest value, and best evidence coverage.
- Evidence processing summary in the queue row.
- Case workflow strip for field collection, used review, technician hold, and approval.
- Evidence preview panel with remote image thumbnails when previewable image URLs are available.
- Evidence ledger for local media, failed downloads, unsupported files, or non-previewable evidence.
- Packet panel with generate, copy, and Markdown download actions.
- Reviewer note capture for hold, request-more-evidence, and approve actions.
- Reviewer action history with timestamps, reviewer, action type, and note.
- Toast feedback for reviewer actions, packet generation, copy, and download.

## Acceptance Criteria

Milestone 6.1 is complete when:

1. A reviewer can search, filter, and sort the live queue.
2. A reviewer can inspect evidence status and preview available remote image evidence.
3. A reviewer can generate, copy, and download a packet from the selected ticket.
4. A reviewer can record a note with approval, evidence request, or technician hold actions.
5. The detail view shows prior reviewer actions.
6. The UI remains usable on desktop, tablet, and phone widths.
7. Static smoke checks cover the production-polish controls.
8. The Stotz Sales production static UI is updated after QA passes.

## Non-Goals

- Microsoft Entra OAuth, which remains Milestone 7.
- Final approved valuation or final recon quote workflows.
- Machine Finder Pro, JDDO, or Dynamics sync.
- Full durable media storage or image proxying.
- PDF rendering.

## Follow-Ups

- Add authenticated user identity once Milestone 7 replaces Basic Auth.
- Add a sidecar media proxy for local OpenClaw inbound media thumbnails after durable media storage is selected.
- Add Teams notifications for reviewer decisions.
- Add PDF packet rendering after the packet format stabilizes with used-team feedback.
