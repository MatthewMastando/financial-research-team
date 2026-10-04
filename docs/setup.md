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

## Quote integration gate

No vendor, budget, priority expiry list or entitlement was selected. The only enabled production adapter returns unavailable values. Select the actual instrument list, provider coverage, exchange/contract mappings, recurring cost, private-display/storage license, and live/delayed entitlement **before** buying service or configuring an adapter. `shared/quotes.ts` defines resolution, current quotes and health. Provider-specific aliases must be verified and use the exact instrument, currency, venue and futures expiry. A gold theme is not a gold futures contract; EURUSD is not an M6E expiry or continuous series.

For a provider that supports polling, coalesce/cache bounded requests at its permitted cadence and keep history only if licensed. The frontend currently polls once per minute while active; choose that cadence from the selected provider's rules. Set `stale_after_seconds` using provider cadence and delay; closed markets stay distinguishable. Streaming providers require a dedicated persistent worker only if necessary. External push/email stays disabled pending a channel and explicit opt-in/authorized test recipient.

## Frontend host and backups

`npm run build` creates a static `dist/`. Use the chosen HTTPS static host, rewrite route requests to `index.html`, and set a Content Security Policy allowing only that host, the intended Supabase HTTPS/WebSocket origins and required script/style assets. Test the selected host's CSP against Vite/Tailwind styles. Do not publicly cache API responses. The shell includes a manifest and icon; it does not cache protected research offline. Verify install behavior on actual desktop/iOS/Android targets before claiming PWA support across platforms.

Set frontend Auth redirects/origins to the HTTPS host; keep demo mode disabled. No hosting provider or domain was selected or purchased. Deploying frontend files does not replace owner authorization in Supabase.

Before treating the archive as durable: configure a backup policy matching the selected Supabase plan, document retention/recovery objectives, export schema and data securely, and restore to a separate disposable project. Verify report counts, revision chains, source children, jobs, owner RLS, credential revocation and preference state. Rotate/reapply appropriate server secrets after restore and never point restored test routines at production. Backups and restore must be observed, not inferred from a plan tier.
