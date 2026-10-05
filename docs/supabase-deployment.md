# Hosted Supabase deployment

Project: `errekzawktgvkqdkrfcq` (Market Research, us-east-1, PostgreSQL 17).
API origin: `https://errekzawktgvkqdkrfcq.supabase.co`.
Deployment and catalog verification: 2026-10-04.

## Applied and verified

- Six migrations: initial research, read paths, settings integrity, hosted processing schedule, hosted privilege hardening, and Twelve Data quote cache. Local filenames match the hosted migration versions so later CLI deployments do not replay them.
- Seventeen public application tables and five private operational tables have RLS enabled. Browser grants are explicitly narrowed after Supabase's broad default grants: authenticated users can read under owner policies and update only supported preference columns. Anonymous users cannot read application tables or execute privileged RPCs.
- `research-api`, `quotes`, and `process-jobs` Edge Functions are ACTIVE. Gateway JWT validation is intentionally disabled because these functions enforce custom bot, owner-session, and worker authorization. `quotes` version 3 includes the Twelve Data private-trial adapter.
- Reports, alerts, watchlist entries, and desk runs are registered with Supabase Realtime.
- `market-research-derivation` runs each minute. Hosted Cron history shows successful executions, and a bounded processing call returns zero failures with the empty queue.
- The initial advisor check found only informational RLS-without-policy findings. The latest check also reports disabled leaked-password protection in Auth; [enable it where supported by the project plan](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The five private tables intentionally have no browser policies. [Supabase's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Performance advisors report unused indexes on this newly empty database; these are retained for the designed queries.
- Production frontend configuration is saved in ignored `.env.production.local` using only the public project URL and publishable key. No server secret is embedded in the frontend. The public CORS origin defaults to the private Sites demo origin; `APP_ORIGIN` can override it when the production origin changes.

## Owner and connected frontend update

The user created a confirmed Supabase Auth login. Its verified UUID is now the sole `app_owner`, with default America/New_York settings initialized. Owner authorization and a different user were exercised under actual hosted authenticated-role policies: only the owner could read the owner row, settings, and canonical instruments. No user-editable metadata was used for authorization. Public/anonymous signup settings and allowed Auth origins still need confirmation through the dashboard; those settings cannot grant application data access by themselves.

The existing private Sites URL now serves the connected production build with demo mode disabled. Publication succeeded for source commit `ead1d91f41c88881d9b986e52c960c1f2e56b112`, saved version `appgprj_6ac2742ca1548191a1f1c9298ade2336~appgver_994687e6954c819196121b26c630259c`, and deployment `appgdep_6ac27c5427d48191bd2cee580f5b1ae0`. Fresh-browser login rendering was checked at 390 and 1440 pixels without JavaScript errors or horizontal overflow. The user's actual password/session was not accessed or tested; the first successful live browser login remains to be confirmed.

No reports, bot tokens, fabricated research, or holdings were inserted during deployment. The separate worker endpoint stays unauthorized until a worker token is configured; hosted SQL Cron already handles derivation without that token.

## Verification limits

Forty-eight contract/database/Markdown/provider tests pass with a harness that now reproduces hosted Supabase's broad default public-table grants. Application build and independent Edge Function type checks pass.

The managed workspace's outbound proxy denies direct access to this project's HTTPS API and the Supabase changelog URL. Native Supabase tools confirm deployment and database behavior, but function HTTP invocation, live Auth/Realtime, browser-to-backend access, and Grok submissions remain unverified. Current API-key and Cron documentation was read through Supabase's documentation connector. No network-policy bypass was attempted.

Backups/restore, real price coverage, and unattended Grok routines remain release gates.

## Twelve Data trial update

The owner reported saving `MARKET_DATA_API_KEY` in Edge Function Secrets and confirmed Twelve Data permits display for the private trial. The adapter reads this secret only at runtime; its value was never accessed by Codex. It maps EUR/USD, AAPL on XNAS, and default BTC/USD; Gold remains an uncovered theme. Shared cache/budget migration `20261004183751_twelve_data_quote_cache.sql` is applied. Hosted catalog checks confirm RLS, no anonymous/authenticated cache reads, and service-role-only cache RPC execution. The `quotes` deployment is ACTIVE at version 3.

Local verification passed 48 tests against both PGlite and PostgreSQL 17, nine Chromium journeys, three Python client checks, application build and independent Edge type checks. The provider contract fixtures match the documented quote response, including its absent optional instrument type and last-minute quote timestamp. These checks do not prove the saved key is valid, its actual exchange coverage, or successful live browser delivery. Workspace network policy still blocks direct Supabase/Twelve Data HTTP invocation.

The updated owner-private Site publication succeeded for source commit `3069777b394189cc1da42ac628609cc4cde3e155`, saved version `appgprj_6ac2742ca1548191a1f1c9298ade2336~appgver_8dc1a39f6dfc81918b2757dbe606cf34`, deployment `appgdep_6ac29e3dd15c819199581f0a3bcaec36`. The audience remains owner-only. Hosted function source was retrieved and matched the uploaded tested files exactly.

## Complete report-asset registry

Migration `20261004203030_expand_asset_catalog.sql` added the report-derived catalog and candidate provider aliases, automatically registered unknown production references as research-only, and backfilled exact-key links and qualifying suggestions. Hosted verification: 29 assets, zero unlinked production references, 20 provider candidates, seven watchlist entries/evidence rows. Browser roles cannot create assets, edit aliases or invoke registry helpers. The normalized foreign key can only be resolved once from NULL to a matching canonical key; original report payloads and all other evidence fields remain immutable.

`quotes` version 4 is ACTIVE and reads database aliases. Mapping verification timestamps are set only after real validated quotes; proposed aliases do not claim account entitlement. The configured free-plan cadence is now forty minutes for 20 candidates, with the existing rolling-minute and daily reservations. Provider errors are sanitized and observable in Settings → Asset availability. Unknown references never incur provider calls and do not lose watchlist eligibility.

Before this update, hosted cache observations confirmed successful EUR/USD and BTC/USD quotes received on 2026-10-04. AAPL had no validated quote. The new diagnostics distinguish provider rejection from identity/price/time validation failure. Actual access for remaining candidates must be observed through the owner app; Twelve Data catalog listings alone do not prove access. Security advisors still show the five intentional private-table INFO findings and the existing leaked-password-protection warning linked above.

Local verification passed 54 database/contract/provider/Markdown tests, including PostgreSQL 17 concurrency and legacy backfill, and ten Chromium journeys including Research only visibility. Build, Edge typing and formatting passed.

The owner-private Sites update succeeded for source commit `8ad757195796dd0990facb6a67f31993c7251a9f`, saved version `appgprj_6ac2742ca1548191a1f1c9298ade2336~appgver_1f59d1511b948191bbd7d807f01c18d1`, and deployment `appgdep_6ac2b8bfb8a08191bace4fb7ae31b62c`. Deployed quote-function source matches the tested upload exactly.

## Positioning and trade setups update

2026-10-04 (New York; 2026-10-05 UTC): migration `20261005004200_positioning_and_trade_plans` is applied. `research-api` version 3 is ACTIVE and all seven uploaded files match the tested source, including `shared/guidance.ts`. Optional per-asset positioning/setup objects preserve compatibility with old reports and retries. Owner-scoped, security-invoker reads return latest desk guidance and personal plans.

`trade_plan_revisions` has RLS with owner-only SELECT/INSERT, narrowed column grants, immutable revisions and a serialized stale-editor guard. Hosted catalog checks confirm anonymous SELECT, authenticated UPDATE and owner-ID insertion are denied, while plan insertion is permitted under owner RLS. A rolled-back owner-role insert exercised the actual save trigger without leaving a production plan. A second-UID read returned no plan records. The current production guidance read returned 15 per-asset/desk rows, all with unspecified positioning; no historical advice was inferred or backfilled. There were no saved personal plans at verification time. Security advisors added no findings; the existing Auth warning and intentional private-table INFO findings remain documented above.

The owner-private Sites frontend update succeeded from source commit `63f0feab385ade3d2923542ced860799aa3bebdf`, saved version `appgprj_6ac2742ca1548191a1f1c9298ade2336~appgver_d409316bcf688191803896babc52b410`, deployment `appgdep_6ac2f3f7ba08819191d2c919b38d6a5a`. Build, Edge typing, formatting, three Python checks and all 12 Chromium journeys passed. The current repository contains updated Grok skill copies and the guidance contract; installed Grok skills are not changed automatically by this deployment.
