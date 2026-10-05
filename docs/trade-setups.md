# Positioning and trade setups

Version 1 reports now accept **optional**, per-asset `positioning` and `trade_setup` fields. Existing submissions stay byte-compatible and archived content is unchanged. Install the updated [desk skills](bots/) in Grok before expecting bots to send structured guidance. Older prose remains readable; the app does not extract actionable advice or invent levels from it.

A substantive asset reference can look like this (illustrative only):

```json
{
  "asset_key": "equity:XNAS:AAPL",
  "relationship": "subject",
  "watchlist_action": "suggest",
  "reason": "Illustrative evidence checkpoint",
  "positioning": {
    "stance": "long_bias",
    "action": "wait",
    "rationale": "Illustrative long bias, conditional on independent confirmation."
  },
  "trade_setup": {
    "direction": "long",
    "status": "conditional",
    "timeframe": "Days after the catalyst",
    "entry_condition": "Wait for confirmation and a successful retest.",
    "entry_zone": null,
    "stop_loss": "Below the confirmation low; verify the exact level before entry.",
    "targets": ["Reassess at the prior range boundary"],
    "sizing_guidance": "Set a risk budget before entry; account size is unknown.",
    "invalidation": "The confirmation fails or the premise is contradicted.",
    "instructions": "1. Confirm the instrument and catalyst.\n2. Wait for the trigger.\n3. Establish risk and size before entry.",
    "valid_until": null
  }
}
```

Stances: `long_bias`, `short_bias`, `neutral`, `avoid`, `watch_only`. Actions: `initiate`, `add`, `reduce`, `exit`, `hold`, `wait`. Both and a rationale are required inside a positioning object. Horizon comes from the report; setup timeframe can be more specific. Bias and setup direction remain separate (for example, a tactical hedge against a long-term bias).

Setup direction is `long`, `short` or null. Status is `idea`, `conditional`, `ready`, `invalidated` or `closed`; it describes the author's research/setup assessment and does not assert an actual position. Every setup field is required inside the object, with unknown text/direction/expiry represented as null and unknown targets as `[]`. Text is bounded to 1,000 characters per field/target, instructions to 8,000, and targets to 20. `valid_until` is an ISO timestamp with timezone. Ready requires a direction, entry condition, stop, at least one target, sizing, invalidation and instructions. A ready setup cannot be expired at research time. The frontend displays expired setups explicitly without deleting their instructions. Prices never automatically switch a setup to ready, entered, stopped or filled.

Context references cannot carry either object. Unknown/unpriced instruments can carry both objects, get watchlist suggestions and have personal plans. No price provider mapping or instrument identity is invented.

`asset_guidance(p_asset_ids uuid[])` returns the latest nonsynthetic, nonsuperseded report head per asset and desk, with source report ID, research time, horizon and nullable guidance. It considers substantive references only and filters a selected retracted head without falling back to earlier advice. An omitted object in a newer report yields null. An explicit revision which drops an asset withdraws its superseded guidance. Opposing long/short biases are displayed as opposing desk views, with each desk's instructions preserved. Independent historical report chains can still be read in the archive. Owner RLS applies through security-invoker RPCs; calls are bounded to 50 IDs and the frontend batches larger catalogues.

**Your plan** is separate, owner-authored content in `trade_plan_revisions`. Every save appends the next revision for the exact asset, with server timestamps and owner-only SELECT/INSERT policies; updates and deletes are forbidden. The editor supplies its expected next revision, with a per-owner/asset advisory lock and revision guard rejecting stale/concurrent saves. On conflict, the editor retains the draft and asks the owner to cancel/reopen with the latest revision. `personal_trade_plans(p_asset_ids uuid[])` returns current owner plans. The browser can insert only asset ID, revision and validated plan; it cannot supply a different owner or timestamp. The latest plan appears in Trade setups and on asset detail, and the watchlist links to it. Demo plans use isolated browser storage and never write production records.

To update old research, have the original bot submit a fresh report or intentional revision with explicit structured fields. Do not edit archived payloads or submit reports under another bot's identity.
