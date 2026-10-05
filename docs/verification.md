# Verification and release gates

Software verification: 2026-10-04. Source was implemented in `/workspace/financial-research-team`, an initially empty repository. No live Supabase project, Grok routine, price subscription, host or external recipient was modified.

Later deployment update: the private synthetic Sites demo is published, and the user's supplied Supabase project now has the schema/functions and a verified Cron schedule. The original evidence below describes pre-deployment testing; the [hosted deployment record](supabase-deployment.md) supersedes statements about hosting, project deployment, and advisors. Live owner login, function HTTP invocation, Grok submissions, price coverage, and backups remain open.

## Recorded evidence

- TypeScript application build and independent Edge Function type checking pass. Vite produces a static deployable build; the report Markdown reader loads separately. The current connected main compressed bundle is about 211 KiB (uncompressed >500 KiB warning remains); no production network/browser performance claim is inferred from build size.
- 30 contract/API/database/Markdown tests run against both PGlite PostgreSQL WASM and disposable PostgreSQL 17. The real PostgreSQL run uses separate connections for simultaneous idempotent submissions, conflicting head revisions and concurrent job processing. Auth UID/session roles in this harness are fixtures, not a live Supabase Auth server.
- Database cases cover unauthenticated/second-user denial, revoked/desk-scoped tokens, read scope, size/schema limits, replay across token rotation, conflicting content, atomic rollback, transactional jobs, preserved revisions/retractions, unresolved futures, receipt-based late arrivals, search and keyset pages, bounded context, demo/context-only exclusions, grouped alerts, preference preservation, retries, rate limiting, protected quote access, RLS and privileged function grants, and valid display timezones.
- Nine browser checks use Chromium: navigation/search/revision history, persistent dismiss/restore/read preferences, timezone save/reload, synthetic labeling, exact/unknown instrument identity, unconfigured production fail-closed behavior, keyboard skip navigation and automated WCAG A/AA overview checks. All primary screens and the reader are exercised at 320, 390, 768 and 1440 px, with document-overflow assertions; long headlines and offline notices have separate checks.
- Untrusted Markdown is rendered without executable HTML, unsafe links or remote images. HTTP(S) source links use `noopener noreferrer`; the server does not fetch arbitrary report URLs.
- Three Python client checks cover identical retry bytes and Retry-After, refusal to retry validation errors, sanitized failures, and HTTPS for remote transport.
- Production npm dependency audit returned zero known vulnerabilities at verification time. This is a point-in-time registry audit.
- [Search benchmark](verification/search-benchmark.json): 10,000 isolated synthetic reports, 30 queries, owner RLS and 30-row result bound, PostgreSQL 17; median 38.35 ms and p95 42.91 ms locally. This measures SQL and JSON query response only, excluding Supabase/network/browser rendering.
- [Desktop capture](verification/overview-1440.png) and [mobile capture](verification/overview-390.png) were inspected. They show synthetic previews, not live research or prices.

Supabase CLI advisors were attempted on the disposable PostgreSQL cluster. CLI v2.83 required TLS even with the supplied local connection's SSL-mode setting; the plain loopback test cluster refused it. Advisors have not passed. Catalog access/RLS checks and actual SQL behavior tests passed; run hosted Supabase advisors/security checks on the selected project before release. No home/environment network policy was changed to force access.

## Milestone gate status

| Gate                       | Software delivered                                                                                                         | Live/operational evidence still required                                                                                           | Next setup action                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Repository and contract | Source, pinned lockfile, schema/examples, SQL migrations, client and labeled demo; build and contract checks               | Live configuration is not part of this gate                                                                                        | Run `npm ci && npm run dev:demo` to inspect locally                              |
| 2. One desk end to end     | Owner Auth boundary, atomic API ingestion, archive reads/detail, notification/reconnect code, revisions                    | Real Macro report, Supabase Edge/Auth/Realtime runtime and unattended Grok receipt remain unverified                               | Select and securely configure the intended Supabase project, then connect Macro  |
| 3. Research experience     | Overview, filters/search/keyset pages, reader/history, exact asset identity/theses/timeline, responsive navigation         | Live expired-session handling and target-device installation not proven by demo browser tests                                      | Exercise the configured owner and a second live account on the chosen host       |
| 4. Watchlist/alerts        | Deterministic SQL derivation, transactional/retryable jobs, preserved preferences and event grouping                       | Hosted Cron/worker operation not installed                                                                                         | Enable/install the documented database processing schedule                       |
| 5. Desk rollout/synthesis  | Five reusable skills, context catch-up, run recording and brief coverage/references                                        | Actual routines and account-supported run signals are not installed or observed                                                    | Install/test the skills and selected times in the Grok account                   |
| 6. Quotes/release          | Provider-neutral contract, protected endpoint, accurate unavailability, demo isolation, build/deployment/runbook documents | Entitled provider adapter, correct real contract mappings, deployment, backup restore and live visibility measurements remain open | Select the instrument list and entitled vendor; choose hosting and backup policy |

## Explicit limits

The Twelve Data Basic private-trial adapter is implemented and deployed after the owner confirmed display permission. Provider fixtures, cross-instance cache reservations, obsolete-writer fencing, UTC daily reset, rolling-minute caps and browser access denial are tested. Live quotes with the saved key remain unverified. No price-history chart, threshold alert, public audience, notification delivery, trading connection or holdings feature is claimed. External delivery remains disabled. Fixtures cannot trigger production watchlist suggestions or alerts.

Realtime reconnect recovery and the 5-second target are implemented but have not been observed in a real Supabase deployment. Tests validate canonical pagination/deduplication and UI journeys; they do not prove packet-loss recovery in the user's account. Manual test transport does not prove unattended Grok writes. Source-backed production context and Chief of Staff references are enforced by code but still need an actual account run. A synthetic missing-desk brief is visible in the demo.

The manifest shell avoids protected service-worker caches. Desktop/mobile browser layouts were checked; installability on actual iOS/Android, text zoom and platform push behavior remain unverified. Source includes designed loading/error/empty states, while live session expiry and network errors must still be exercised on the configured deployment.

No production backup or restore was performed. The archive must not be represented as operationally durable until a configured backup and isolated restore exercise passes. Hosting/account/vendor choices remain open, and no paid resource was provisioned.

## Twelve Data verification update

2026-10-04: 48 contract/API/database/Markdown/provider checks passed in PGlite and PostgreSQL 17, plus nine browser journeys and three Python client checks. The app and Edge Function type checks/build passed. Actual quote retrieval with the owner's secret remains a live acceptance check; neither fixture tests nor an ACTIVE deployment proves provider delivery.

## Research-only registry update

Every structured production report asset now receives a catalog link. Unknown identities have an explicit Research only state; price availability is independent of watchlist eligibility. Local tests cover simultaneous registration, unknown futures without invented expiry, exact-key legacy backfill, preserved report payload/evidence and pinned/dismissed choices, and synthetic isolation. Provider tests cover MU/VST/ETH/ETF database mappings and refresh scaling. Settings reports observed account access through actual quotes, not presumed subscription coverage.

## Positioning and trade setups update

63 contract/API/database/provider/Markdown checks passed in both PGlite and PostgreSQL 17; the nine new cases cover backward-compatible payloads, ready-setup completeness and expiry, no actionable context mentions, separate tactical direction, unknown/unpriced assets, latest/retracted guidance, attributed opposing views, owner-only immutable plans and simultaneous/stale saves. All 12 Chromium journeys passed, with automated WCAG checks on overview and watchlist. Browser coverage adds explicit badges and expandable instructions, saving a plan without prices, ready-state validation, direction filtering and preserving a stale editor's draft through a background refresh and concurrent save. Updated synthetic captures remain separate from production research. Hosted verification is recorded in [the deployment record](supabase-deployment.md).
