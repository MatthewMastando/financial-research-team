# Market Research

Private financial research workspace for one authorized owner. React/TypeScript/Vite frontend; Supabase Auth, Postgres, Realtime and Edge Functions. Four Grok desks submit research; a Chief of Staff bot submits a synthesis. No xAI agent replacement, trading integration, invented holdings or external notifications.

[Open the private Market Research app](https://market-research-demo-matthew.matthew-mastando.chatgpt.site). The published build is connected to Supabase with demo mode disabled and a provisioned owner login. Every structured bot reference is registered in the asset catalog. Missing or unconfirmed prices show Research only and do not block suggestions. Twelve Data candidate mappings cover the existing equity, ETF, FX and crypto report keys; Settings shows actual quote availability. The Sites source checkout is `/workspace/sites/market-research-demo`, with its existing project identity in `.openai/hosting.json`. Local synthetic previews remain available through the demo commands below.

The watchlist shows explicit, desk-attributed positioning and actions. **Trade setups** provides entry triggers/zones, risk limits, targets, sizing, invalidation and instructions, with owner-authored plans stored separately as revisions. Missing guidance remains unspecified; unpriced assets support the same research and planning flows. See [the guidance contract and bot rollout instructions](docs/trade-setups.md).

## Run locally

Requires Node 24+ and npm. Dependencies are pinned; `package-lock.json` is authoritative.

```sh
npm ci
npm run dev:demo
```

Open `http://localhost:5173`. Demo research, watchlist, alert previews and quotes are **synthetic**, labeled throughout, and never written to Supabase. Demo preferences use a separate browser storage namespace. Production mode does not default to demo when configuration is absent.

Keep the command running while using the browser preview. To preview a compiled demo, run `npm run preview:demo` and open `http://localhost:4173`. This builds into a separate `dist-demo` directory. For a production build, run `npm run build` followed by `npm run preview`. Serve these builds over HTTP; opening `index.html` directly does not run the app.

In a cloud workspace, these localhost URLs belong to the cloud machine. Access requires a browser preview that forwards the server port, or run the commands in a checkout on your own computer. Codex's file viewer opens source files and images; opening `public/icon.svg` shows only the app icon, not the application.

For production integration, copy `.env.example` to `.env.local`, set only the browser Supabase URL and publishable key, leave `VITE_DEMO_MODE` unset, and follow [setup](docs/setup.md). Never prefix server keys or bot credentials with `VITE_`.

```sh
npm run dev
npm run typecheck
npm run check:edge
npm test
npm run build
npm run test:browser
```

`npm test` runs the SQL migrations and API handler against isolated PGlite PostgreSQL with an Auth UID/role harness. For real PostgreSQL concurrency tests, set `TEST_DATABASE_URL` to a **disposable local test cluster**. The harness creates and drops a new database and creates Supabase-like roles. Do not point it at production. Browser tests use an installed Chromium or Playwright Chromium (`npx playwright install chromium`). They start demo and unconfigured production Vite servers automatically.

## Delivered

- Overview, archive search/filter/pagination, full report reader, revision history, asset detail, watchlist preferences, grouped alerts, timezone and schedule preferences.
- Owner authorization independent of user metadata; immutable research and normalized evidence; RLS; scoped hashed bot tokens; rate limits; atomic idempotent ingestion; revision conflict protection; durable retryable derivation jobs.
- Authenticated context retrieval and run-status recording, reusable Python submission client and [five desk skills](docs/bots/README.md).
- Protected Twelve Data quote adapter with shared caching, Basic-plan credit reservations, database-backed candidate mappings, timestamps, feed attribution and Research only fallback. Demo quotes remain isolated fixtures.
- Responsive manifest-based web shell. No service worker caches private responses. Private TanStack Query state clears on sign-out.

## Status

The connected app is published privately on Sites. The supplied Supabase project has the application schema, access controls, three Edge Functions, Realtime publication, a verified recurring processing job, and its confirmed owner login provisioned in the application. See the [hosted deployment record](docs/supabase-deployment.md). Successful browser sign-in, live function invocation, real Grok submissions, live prices, and backup restoration remain unverified. This is **not a completed production release**. External notifications stay disabled.

Read the [verification report](docs/verification.md), [API contract](docs/api.md), [deployment/setup guide](docs/setup.md) and [operations runbook](docs/operations.md) before connecting live accounts. The six milestone gates and their evidence are recorded in the verification report.
