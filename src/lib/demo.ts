import { reportSchema, type Report } from "../../shared/report";
import type { Instrument, Quote } from "../../shared/quotes";
export const demoAssets: Instrument[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    asset_key: "fx:EURUSD",
    name: "Euro / US dollar spot",
    symbol: "EUR/USD",
    asset_class: "fx",
    venue: null,
    currency: "USD",
    expiry: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    asset_key: "equity:XNAS:AAPL",
    name: "Apple Inc.",
    symbol: "AAPL",
    asset_class: "equity",
    venue: "XNAS",
    currency: "USD",
    expiry: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    asset_key: "crypto:BTC",
    name: "Bitcoin",
    symbol: "BTC",
    asset_class: "crypto",
    venue: null,
    currency: "USD",
    expiry: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    asset_key: "theme:gold",
    name: "Gold market theme",
    symbol: "Gold",
    asset_class: "commodity_theme",
    venue: null,
    currency: null,
    expiry: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    asset_key: "future:CME:M6E:UNRESOLVED",
    name: "Reported M6E instrument",
    symbol: "M6E",
    asset_class: "research_only",
    venue: null,
    currency: null,
    expiry: null,
    identity_verified: false,
  },
];
const titles = [
  "Policy expectations and the dollar: a scenario to follow",
  "Gold: separating the macro thesis from the contract",
  "Apple: the questions that matter at the next earnings release",
  "Bitcoin: watch the quality of flows, not only the headline",
  "Earlier dollar thesis · preserved archive example",
];
const summaries = [
  "A synthetic scenario explores how changing rate expectations could affect dollar demand. The next release is a catalyst, not confirmation.",
  "Illustrative research separates a commodity theme from a tradable futures contract. No contract expiry or provider mapping is assumed.",
  "This fixture demonstrates an equity thesis with explicit risks, an earnings catalyst, and evidence links. It makes no claim about current company performance.",
  "An illustrative crypto desk update shows how to distinguish source-backed observations from interpretation and positioning scenarios.",
  "An earlier version of the synthetic macro thesis remains searchable after a revision.",
];
const fixtureOrder = [
  demoAssets[0],
  demoAssets[3],
  demoAssets[1],
  demoAssets[2],
  demoAssets[0],
];
const ids = Array.from(
  { length: 6 },
  (_, i) => `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
export const demoReports: Report[] = titles.map((title, i) => ({
  ...reportSchema.parse({
    schema_version: 1,
    submission_id: `demo-${i}`,
    desk_slug: ["macro", "commodities", "equities", "crypto", "macro"][i],
    report_type:
      i === 0
        ? "thesis_revision"
        : i === 3
          ? "breaking_update"
          : "morning_scan",
    researched_at: `2026-10-04T${["11:40", "11:20", "10:50", "12:30", "08:00"][i]}:00Z`,
    title,
    summary: summaries[i],
    body_markdown:
      "## Research note\n\nThis is **synthetic demonstration content**, not a current market assessment.\n\nThe research framework separates observed evidence from an interpretation and a possible scenario. The asset association is illustrative.\n\n### What to monitor\n\n- Whether the next release changes the original premise.\n- Whether independent evidence supports the interpretation.\n- Whether timing and instrument identity are clear.\n\nNo position, order, or investment decision is implied.",
    what_changed:
      i === 0
        ? "The example thesis now requires an additional confirming release. The earlier version is preserved."
        : "A new illustrative question has been added to the research record.",
    importance: i === 0 || i === 3 ? "elevated" : "normal",
    importance_reason: "Synthetic material-development example.",
    time_horizon: "weeks",
    thesis:
      "Wait for source-backed confirmation before treating this scenario as supported.",
    invalidation:
      "Evidence contradicting the stated premise would invalidate this illustrative thesis.",
    risks: [
      "The fixture contains no live market evidence.",
      "A broad market theme is not an exact tradable instrument.",
    ],
    sources: [
      {
        source_key: "fixture",
        url: "https://example.com/research-fixture",
        title: "Synthetic source · example.com",
        published_at: null,
        accessed_at: "2026-10-04T12:00:00Z",
      },
    ],
    claims: [
      {
        text: "This example is a scenario for testing the research workflow.",
        kind: "scenario",
        source_keys: ["fixture"],
      },
    ],
    assets: [
      {
        asset_key: fixtureOrder[i].asset_key,
        relationship: "subject",
        watchlist_action: "suggest",
        reason:
          "Explicit synthetic thesis with an upcoming evidence checkpoint.",
      },
    ],
    catalysts:
      i === 4
        ? []
        : [
            {
              title: [
                "Next policy evidence checkpoint",
                "Contract identification review",
                "Earnings research review",
                "Flow-quality review",
              ][i % 4],
              asset_key: fixtureOrder[i].asset_key,
              expected_at: "2026-10-09",
              timing_precision: "date",
              source_key: "fixture",
              description:
                "Synthetic date-only catalyst. No exact release time is assumed.",
            },
          ],
    supersedes_report_id: i === 0 ? ids[4] : null,
    related_report_ids: [],
    event_key: i === 4 ? "demo-dollar" : "demo-event-" + i,
    is_demo: true,
  }),
  id: ids[i],
  received_at: `2026-10-04T${["12:01", "11:31", "11:00", "12:45", "08:20"][i]}:00Z`,
  is_current: i !== 4,
}));
const {
  id: _id,
  received_at: _received,
  is_current: _current,
  ...briefBase
} = demoReports[1];
demoReports.unshift({
  ...reportSchema.parse({
    ...briefBase,
    submission_id: "demo-brief",
    researched_at: "2026-10-04T12:10:00Z",
    desk_slug: "chief_of_staff",
    report_type: "morning_brief",
    title: "Four desks. One considered perspective.",
    summary:
      "The synthetic morning brief connects the dollar scenario, commodity identity, and company catalysts. Crypto coverage is absent at this illustrative cutoff.",
    body_markdown:
      "## The morning perspective\n\n**Synthetic brief.** The common thread is the quality of the next piece of evidence. Macro and commodities share an illustrative sensitivity to policy expectations; equities retain an asset-specific catalyst.\n\n### Keep in focus\n\n1. Distinguish a market theme from the exact instrument.\n2. Preserve the conditions that would invalidate each thesis.\n3. Review original desk reports before drawing a conclusion.\n\nCrypto coverage was absent at this example cutoff. The later crypto update is available separately.",
    assets: [],
    catalysts: [],
    related_report_ids: ids.slice(0, 3),
    supersedes_report_id: null,
    missing_desks: ["crypto"],
  }),
  id: ids[5],
  received_at: "2026-10-04T12:20:00Z",
  is_current: true,
});
export const demoQuotes: Quote[] = demoAssets.map((a, i) => ({
  asset_id: a.id,
  provider_symbol: a.symbol,
  provider: "Synthetic fixture",
  price: [1.0942, 224.8, 64250, null, null][i],
  currency: a.currency,
  quote_time: "2026-10-04T12:00:00Z",
  received_at: "2026-10-04T12:00:01Z",
  market_state: i === 1 ? "closed" : "open",
  entitlement: i >= 3 ? "unavailable" : i === 0 ? "delayed" : "live",
  delay_seconds: i === 0 ? 900 : 0,
  change_absolute: [0.0012, -1.1, 640, null, null][i],
  change_percent: [0.11, -0.49, 1.01, null, null][i],
  change_basis: i === 1 ? "previous close" : "fixture daily reference",
  is_demo: true,
  stale_after_seconds: 60,
  pricing_state: i >= 3 ? "research_only" : "available",
}));
