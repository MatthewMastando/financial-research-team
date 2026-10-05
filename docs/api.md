# Research API v1

The Supabase function `research-api` exposes these actual URLs:

| Logical route            | Function URL suffix                              | Scope           |
| ------------------------ | ------------------------------------------------ | --------------- |
| POST /v1/reports         | `/functions/v1/research-api/v1/reports`          | `reports:write` |
| GET /v1/research-context | `/functions/v1/research-api/v1/research-context` | `research:read` |
| POST /v1/desk-runs       | `/functions/v1/research-api/v1/desk-runs`        | `runs:write`    |

Set `RESEARCH_API_URL` on the bot computer to the URL ending in `/functions/v1/research-api`, with no trailing logical route. Send the bot credential in `Authorization: Bearer …`. Bot tokens are opaque, high-entropy, revocable, and scoped by server metadata; they are not Supabase administrator keys or user JWTs. Gateway JWT verification is off on these functions because application code authenticates every protected operation. Quote requests use user JWTs validated by Auth and an owner lookup under RLS.

The authoritative validator is [shared/report.ts](../shared/report.ts); [report.schema.json](report.schema.json) documents the field shape. Cross-field checks (evidence, source references, brief attribution, date precision and revision requirements) additionally run in Zod. Optional per-asset `positioning` and `trade_setup` fields expose bias, action and explicit setup instructions; see [trade-setups.md](trade-setups.md) for readiness checks, attribution and lifecycle rules. The optional v1 `disagreements` field allows only Chief of Staff to identify sourced disagreements by existing related report IDs. `missing_desks` records the actual cutoff coverage, defaulting to an empty array.

Ingestion authenticates before reading the body, caps streamed input at 256 KiB, validates the schema and timestamp, checks desk and report-type scope, then calls one SQL transaction. Owner identity and stable bot identity always come from the credential. Related and superseded reports must have the same owner and demo/production status; only the target desk can revise a report. Every unknown asset key in a production report is registered and linked as a research-only asset (`identity_verified=false`). No exchange, currency or futures expiry is inferred. It can receive watchlist suggestions under the same evidence rules as priced assets. The normalized `asset_id` may be filled once from NULL to the exact matching catalog key; archived payloads and all other evidence fields remain immutable. Synthetic transport references do not create production catalog entries.

A canonical JSONB payload hash and `(owner_id, bot_id, submission_id)` protect retries across token rotation. Identical replays return the original receipt. Different content under that ID returns 409. Report/evidence/job insertion commits atomically. Revisions lock the prior head and retain all content; a concurrent loser gets 409. Published content and evidence cannot be updated or deleted, including by ordinary privileged SQL. Retractions append `report_events` with a reason.

### Receipt

```json
{
  "report_id": "00000000-0000-4000-8000-000000000001",
  "submission_id": "stable-desk-run-report-id",
  "received_at": "2026-10-04T12:00:00Z",
  "duplicate": false,
  "processing_status": "pending"
}
```

201 = newly committed, 200 = identical replay. `processing_status` acknowledges processing state, not external notification delivery. 400 = malformed JSON/cursor, 401 = invalid or revoked token, 403 = denied scope/desk/type, 409 = conflicting submission or revision head, 413 = oversized body, 415 = wrong content type, 422 = schema/reference validation, 429 = rate limit (60 authenticated requests/minute/credential; `Retry-After: 60`), 503 = temporary storage/authorization availability. Errors contain stable codes and schema paths, never credential values or raw database errors.

### Context retrieval

Query parameters: `since` (UTC receipt time, inclusive; defaults to the past seven days), `asset` (exact canonical key), `desk`, `type`, `cursor` (opaque), `limit` (1–100, default 50). Results arrive in ascending `(received_at,id)` order for catch-up. The response includes `reports`, up to 50 relevant current `active_theses`, and `next_cursor`. Follow pages until the cursor is null; a full final page may require an empty final request. Source links, original research/receipt times, and supersession state remain in the report data. Active theses exclude retracted/superseded reports. Retrieval excludes demo research. Advance the bot's successful synthesis watermark **only after its submitted brief receipt**; retain the last receipt tuple/cursor to avoid treating repeated evidence as independent.

### Run signals

Run JSON contains `external_run_id`, `status` (`started`, `succeeded`, `failed`), `started_at`, nullable `completed_at` and nullable `error_code`. Start has no completion time. Terminal signals require a valid completion time not before start. Error codes: `approval_required`, `authentication_failed`, `network_failed`, `source_unavailable`, `submission_failed`. Never submit a raw exception, prompt or token. A completed run cannot be reset to started by a late retry.

### Browser and job interfaces

Browser reads use owner-specific RLS and `search_reports`, `report_history`, `asset_theses`, `asset_guidance` and `personal_trade_plans`. Research filters include full-text query, asset, desk, type, importance and UTC research-date bounds. Archive results include superseded versions. Feed pagination orders by server receipt time/ID, deduplicates report IDs, and presents new arrivals through an explicit control. Realtime and foreground polling trigger checks; reconnect rechecks canonical storage. No Realtime event is treated as the permanent archive.

Personal trade plans allow owner-only append operations on `trade_plan_revisions(asset_id,revision,plan)`, with schema/readiness validation and stale-editor protection. Plans are separate from bot reports. Otherwise, only user preference columns are browser-writable: `pinned`, `dismissed`, `read_at`, timezone, recency window and schedule preferences. Administrative configuration, publication fields, evidence and jobs are not browser-writable.

`POST /functions/v1/process-jobs` requires a separate server-only `JOB_WORKER_TOKEN`; it processes a bounded batch of 20. SQL `process_research_jobs(50)` is server-only and suited to Supabase Cron. Jobs use transactional row locks with `SKIP LOCKED`, retry sanitized failures with exponential delay, stop after 10 failures for operator review, and preserve accepted research. All derivation is idempotent. The in-app inbox is implemented; external delivery has no configured channel. `shared/notifications.ts` supplies an explicitly disabled channel interface; a real channel requires a durable idempotent delivery outbox and authorized opt-in.

`GET /functions/v1/quotes?ids=<comma-separated UUIDs>` accepts at most 50 exact instrument IDs. Unauthenticated and non-owner users are denied. Production returns unavailable quotes through `UnconfiguredQuoteService`. It does not silently substitute instruments or invent a provider. No every-tick database persistence or streaming worker exists before a provider requires it.
