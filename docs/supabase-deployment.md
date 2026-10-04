# Hosted Supabase deployment

Project: `errekzawktgvkqdkrfcq` (Market Research, us-east-1, PostgreSQL 17).
API origin: `https://errekzawktgvkqdkrfcq.supabase.co`.
Deployment and catalog verification: 2026-10-04.

## Applied and verified

- Five migrations: initial research, read paths, settings integrity, hosted processing schedule, and hosted privilege hardening. Local filenames match the hosted migration versions so later CLI deployments do not replay them.
- Seventeen public application tables and three private operational tables have RLS enabled. Browser grants are explicitly narrowed after Supabase's broad default grants: authenticated users can read under owner policies and update only supported preference columns. Anonymous users cannot read application tables or execute privileged RPCs.
- `research-api`, `quotes`, and `process-jobs` Edge Functions are ACTIVE. Gateway JWT validation is intentionally disabled because these functions enforce custom bot, owner-session, and worker authorization. `quotes` still returns unavailable production prices until a provider is configured.
- Reports, alerts, watchlist entries, and desk runs are registered with Supabase Realtime.
- `market-research-derivation` runs each minute. Hosted Cron history shows successful executions, and a bounded processing call returns zero failures with the empty queue.
- Hosted security advisors report only informational RLS-without-policy findings on the three intentionally server-only private tables. There are no error/warning findings. [Supabase's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Performance advisors report unused indexes on this newly empty database; these are retained for the designed queries.
- Production frontend configuration is saved in ignored `.env.production.local` using only the public project URL and publishable key. No server secret is embedded in the frontend. The public CORS origin defaults to the private Sites demo origin; `APP_ORIGIN` can override it when the production origin changes.

## Owner and connected frontend update

The user created a confirmed Supabase Auth login. Its verified UUID is now the sole `app_owner`, with default America/New_York settings initialized. Owner authorization and a different user were exercised under actual hosted authenticated-role policies: only the owner could read the owner row, settings, and canonical instruments. No user-editable metadata was used for authorization. Public/anonymous signup settings and allowed Auth origins still need confirmation through the dashboard; those settings cannot grant application data access by themselves.

The existing private Sites URL now serves the connected production build with demo mode disabled. Publication succeeded for source commit `ead1d91f41c88881d9b986e52c960c1f2e56b112`, saved version `appgprj_6ac2742ca1548191a1f1c9298ade2336~appgver_994687e6954c819196121b26c630259c`, and deployment `appgdep_6ac27c5427d48191bd2cee580f5b1ae0`. Fresh-browser login rendering was checked at 390 and 1440 pixels without JavaScript errors or horizontal overflow. The user's actual password/session was not accessed or tested; the first successful live browser login remains to be confirmed.

No reports, bot tokens, fabricated research, or holdings were inserted during deployment. The separate worker endpoint stays unauthorized until a worker token is configured; hosted SQL Cron already handles derivation without that token.

## Verification limits

Thirty contract/database/Markdown tests pass with a harness that now reproduces hosted Supabase's broad default public-table grants. Application build and independent Edge Function type checks pass.

The managed workspace's outbound proxy denies direct access to this project's HTTPS API and the Supabase changelog URL. Native Supabase tools confirm deployment and database behavior, but function HTTP invocation, live Auth/Realtime, browser-to-backend access, and Grok submissions remain unverified. Current API-key and Cron documentation was read through Supabase's documentation connector. No network-policy bypass was attempted.

Backups/restore, real price coverage, and unattended Grok routines remain release gates.
