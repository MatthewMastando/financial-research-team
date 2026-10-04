# Setup and deployment

The user's supplied project `errekzawktgvkqdkrfcq` now has the application migrations, functions, and processing schedule. Read the [hosted deployment record](supabase-deployment.md) before running setup commands; do not replay already applied migrations. Owner Auth setup and live integration verification remain open. For another deployment, select its intended project through the account's secure setup flow; do not run these commands against an unrelated project.

## Local Supabase / intended project

Use an already installed Supabase CLI 2.83.0+ or run `npm run cli:install`; the optional `npm run cli:install` helper installs checksum-verified v2.83.0 into `.tools/` for reproducibility. The installed latest CLI required a home-directory write unavailable in the managed environment; local verification used the official v2.83.0 binary. Check `supabase --help` and each subcommand's `--help` for your installed version. Local CLI configuration disables all public signup paths and has no research seed.

```sh
./.tools/supabase start
./.tools/supabase db reset
```

For a hosted project, authenticate securely, link the **selected intended project**, inspect pending migrations, and apply them with `supabase db push`. Keep default `public` API schema exposure; do not expose `private`. The migrations grant only required reads and preference writes to `authenticated`, turn on RLS everywhere, and register public tables with the existing Realtime publication. Do not change the Supabase `realtime` schema (current platform restrictions prohibit it).

Disable public email signup, anonymous signup, and unused identity providers in hosted Auth settings. The local config alone does not change hosted Auth. Configure the allowed application origin and password policy. Create/invite the single owner using the Auth dashboard secure flow. Add the resulting Auth user UUID using an administrator connection:

```sql
-- Bind the actual Auth UUID securely; do not use a user-editable metadata claim.
insert into public.app_owner(owner_id) values (:owner_uuid);
insert into public.user_settings(owner_id) values (:owner_uuid);
```

There can be only one `app_owner`. Browser authentication by another account confers no application data access. Do not change the owner to a second user to work around an access error. Check RLS and owner provisioning instead.

Configure the frontend's `.env.local` using names in `.env.example`: Supabase URL, publishable key; keep demo disabled. Configure function secrets through Supabase's secret management: `APP_ORIGIN` (exact HTTPS frontend origin), optional `MARKET_SUPABASE_SECRET_KEY` (a server-only secret API key), and high-entropy `JOB_WORKER_TOKEN` if using the worker endpoint. Functions otherwise read the platform's `SUPABASE_SECRET_KEYS` default, with a documented legacy local service-role fallback. The Supabase reserved runtime variables are supplied by the platform; do not set them manually or put a server key in frontend configuration.

Deploy `research-api`, `quotes`, and `process-jobs`. Each function has `verify_jwt=false` and implements its own narrow authentication. Keep each function's provided `deno.json` when deploying; the shared root map supports local development, while function-specific maps pin `zod` and `@supabase/supabase-js` for deployment. Browser requests send user JWTs, not API keys, in Authorization. API keys use the `apikey` header.

Enable Supabase Cron (`pg_cron`) using the dashboard. Install the small database-backed job schedule after confirming the processing function works:

```sql
select cron.schedule('market-research-derivation', '* * * * *',
  $$select public.process_research_jobs(50);$$);
```

This one-minute derivation cadence is independent of the research feed's committed-report visibility. Cron and worker installation remain unverified until deployed; do not show them as active merely because source/configuration exists. A periodic external scheduler can instead call the authenticated worker endpoint. No endless stream or research routine runs inside an Edge Function.

## Bot credentials

Generate at least 32 random bytes encoded base64url on the bot computer using its secret manager. Transfer the token only through secure credential setup, compute its SHA-256 hex hash locally, and insert **only the hash** via a trusted administrator connection. Use a stable UUID `bot_id` for each bot; credential rotation creates a new credential ID with the same `bot_id` and revokes the old row. Do not delete old credentials referenced by reports.

Populate `private.bot_credentials`: intended `owner_id`, stable `bot_id`, `desk_slug`, token hash, allowed `scopes`, explicit `report_types`, optional expiry. For desks, types are `morning_scan`, `evening_wrap`, `breaking_update`, `thesis_revision`; Chief of Staff uses `morning_brief`. Grant `research:read` separately to bots that need prior context; grant `runs:write` only when run signals are supported. All desks should receive bounded context read scope for meaningful revisions; credentials never give table or SQL access. Tokens shared on a Grok account's computer are not a security boundary between its bots.

## Live acceptance sequence

1. Submit the visibly synthetic fixture with the Python client and repeat it unchanged. Verify one persisted receipt and one transactional job. It will not create production suggestions or alerts.
2. Install the Macro skill on the actual Grok computer. Submit one real, current, source-backed Macro report with `is_demo=false`. Verify the owner app receives it and stores its source/evidence.
3. Re-submit unchanged, submit a legitimate revision, and verify archived content plus the new head.
4. Install one unattended routine and verify an actual receipt from its scheduled run. Check approval rules, cloud network access and usage limits. A manual fixture is not proof of unattended Grok access.
5. Roll out the other desk skills. Install the Chief of Staff after the selected desk cutoff and verify its persisted references and missing-coverage notice.
6. Exercise Supabase Realtime disconnect/reconnect and expired user sessions in the live deployment. Measure commit-to-foreground visibility over a documented sample; target ≤5 seconds under normal conditions.

## Twelve Data private trial

The owner selected Twelve Data Basic for testing, saved `MARKET_DATA_API_KEY` in the project's **Edge Function Secrets**, and confirmed Twelve Data permits quote display for this private trial on 2026-10-04. The key never belongs in frontend environment variables, GitHub, or chat. Deploy `quotes` after applying the quote-cache migration. No paid resource is provisioned.

The deployed trial display setting is recorded in `supabase/functions/_shared/deployment.ts`. Set the server secret `TWELVE_DATA_DISPLAY_ALLOWED=false` to disable display immediately, including cached prices. Other deployments must start with this setting disabled until their own display permission is verified. Reconfirm permission before the trial expires, public sharing, or production use: the published [Basic pricing](https://twelvedata.com/pricing.md) describes internal non-display use; the owner's confirmation covers this private trial only.

Candidate mappings are stored in `asset_aliases` for the existing US equity/ETF, FX and crypto report keys, including MU, VST, ETH and SOL. `verified_at` remains NULL until the endpoint receives a validated quote with the saved key. The adapter checks a database mapping rather than a fixed ticker list. Returned symbols, equity MIC/currency, numeric prices and last-quote timestamps are checked. Commodity themes and unconfirmed references show Research only; no futures expiry or continuous contract is substituted. Provider coverage and actual successful quotes still need verification with the saved key.

The owner's authenticated endpoint reserves one credit per symbol, shares the latest quote across Edge instances, scales the refresh interval with the mapped catalog size (minimum ten minutes) to target at most 720 daily requests under continuous normal use, coalesces concurrent requests and fences obsolete cache writers. It caps app requests at **8 in any rolling minute and 750 per UTC day**; Basic's account limit is 800/day, leaving 50 for external testing. The current 20 candidate mappings use a forty-minute cadence, or at most about 720 requests/day under normal continuous use. Other API clients sharing the same key can still exhaust the account quota. Provider failures back off and preserve the previous timestamp; stale data never receives a new quote timestamp. Browser polling pauses in the background; pending cache fills or budget-limited empty results are retried after 15 seconds without bypassing server reservations.

Twelve Data's default US feed covers approximately 5% of market volume and is not consolidated. The detail view shows provider/venue, coverage, last quote time and previous-daily-close change basis; crypto uses the provider's daily boundary, not rolling 24-hour change. Quotes may be live at the source while this app polls at the configured catalog cadence. The cache retains only the latest validated snapshot for each asset identity, with no tick history, charts or price-triggered alerts. Research remains usable when quotes are unavailable.

References: [quote API](https://twelvedata.com/docs/llms/market-data/quote.md), [API authentication](https://twelvedata.com/auth.md), [credit limits](https://support.twelvedata.com/en/articles/5615854-credits), [US feed coverage](https://support.twelvedata.com/en/articles/9935903-us-equities-market-data). External push/email stays disabled.

## Frontend host and backups

`npm run build` creates a static `dist/`. Use the chosen HTTPS static host, rewrite route requests to `index.html`, and set a Content Security Policy allowing only that host, the intended Supabase HTTPS/WebSocket origins and required script/style assets. Test the selected host's CSP against Vite/Tailwind styles. Do not publicly cache API responses. The shell includes a manifest and icon; it does not cache protected research offline. Verify install behavior on actual desktop/iOS/Android targets before claiming PWA support across platforms.

Set frontend Auth redirects/origins to the HTTPS host; keep demo mode disabled. No hosting provider or domain was selected or purchased. Deploying frontend files does not replace owner authorization in Supabase.

Before treating the archive as durable: configure a backup policy matching the selected Supabase plan, document retention/recovery objectives, export schema and data securely, and restore to a separate disposable project. Verify report counts, revision chains, source children, jobs, owner RLS, credential revocation and preference state. Rotate/reapply appropriate server secrets after restore and never point restored test routines at production. Backups and restore must be observed, not inferred from a plan tier.

## Research-only asset registration

Ingestion registers every unknown structured production report asset automatically. The original canonical key is preserved; metadata stays unconfirmed, with no provider alias or invented contract details. Every such asset appears in the app and asset filters. Watchlist derivation depends on the report's suggestion/catalyst evidence, not price availability; incidental `context`/`none` references do not become recommendations. Adding or confirming a catalog entry also links old exact-key references and restores qualifying evidence/suggestions without changing pinned/dismissed choices or alert read states. Refreshing the open app retrieves new catalog and watchlist entries every thirty seconds.

Settings → Asset availability lists observed quote results and research-only instruments. A listing or proposed alias is not proof of account entitlement; only a successfully validated provider quote verifies access. Gold, WTI, Brent and other commodity themes are distinct from exchange-traded futures. An unresolved M6E reference remains a visible research-only asset until an exact identity and entitled provider mapping are confirmed.
