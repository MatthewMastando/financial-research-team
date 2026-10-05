---
name: market-research-chief-of-staff
description: Retrieve newly received desk research and publish a referenced morning synthesis.
---

# Chief of Staff

Desk slug `chief_of_staff`; report type `morning_brief`. Use after the user's selected morning desk cutoff. Requires separately granted `research:read`, `reports:write` (morning_brief only), and optional reliable `runs:write` scope. No xAI API key or custom agents are needed.

1. Load the last **successful brief** watermark from the Bot's durable workspace. Retrieve reports since that receipt with `research_client.py context --since <UTC-watermark> --limit 50`; follow `next_cursor` until complete. Use relevant exact-asset queries for active theses. First run uses a deliberate bounded lookback. Do not scan the entire permanent archive each morning.
2. Inspect original sources and supersession state. Exclude superseded/retracted premises from current conclusions while retaining their history. Treat copied or repeated updates as one evidence stream. A synthesis is not an additional independent desk.
3. Write a short morning perspective: material changes, attributed desk agreement, explicit disagreements, next catalysts and invalidation conditions. Link persisted underlying report IDs using `related_report_ids`; references must already exist for this owner. Record absent desk slugs in `missing_desks` and explain stale coverage in the body. Publish with that notice when a desk misses cutoff; do not invent its view.
4. A disagreement must explicitly reference at least two underlying reports in the optional `disagreements` list and explain the sourced difference. Do not automatically infer contradiction from arbitrary prose. Stable event keys should refer to the actual shared event, not merely a ticker.
5. Save schema_version 1 JSON with a stable submission ID, evidence, UTC timestamps, appropriate importance/reason and `is_demo=false`. Briefs can cite underlying persisted reports rather than duplicate sources. Preserve date-only catalyst precision. Keep sources HTTP(S).
6. Submit using `python3 research_client.py submit <saved-brief.json>`. Keep identical bytes for transport retries. After the receipt commits, store the successful retrieval watermark (receipt/ID tuple and consumed cursor as appropriate). Never advance it after an unsuccessful submission; missed runs must catch up on the next run.
7. Report approval/auth/network/usage failures in available Grok run history and emit sanitized run signals only when reliable. A stored brief does not confirm external notification delivery.

Do not add extra paid LLM calls, silently start undocumented Bot routines, purchase feeds, trade, publish publicly or message external recipients. Configure actual local run times/timezone/weekends through the account routine UI, then verify an unattended receipt. App schedule preferences are not installed routines.

## Positioning and explicit trade setups

For each substantive `report.assets[]` reference, submit optional `positioning` and `trade_setup` objects using [the guidance contract](../../trade-setups.md). Positioning states `stance` (`long_bias`, `short_bias`, `neutral`, `avoid`, `watch_only`), `action` (`initiate`, `add`, `reduce`, `exit`, `hold`, `wait`) and an explicit `rationale`. An outlook and a tactical setup can have different directions; explain the distinction. Keep context references free of positioning and setups. Use null or omit either object when there is no explicit guidance; never manufacture entry levels or infer a position from an asset mention.

`trade_setup` records direction, lifecycle status, timeframe, entry trigger and zone, stop/risk limit, targets, sizing guidance, invalidation, multiline instructions and optional expiry. Provide every field within the object, using null or an empty targets array for unknown details. Use `idea` or `conditional` while incomplete. `ready` requires a direction, entry trigger, stop, targets, sizing, invalidation and instructions; it is your assessment at research time, not a verified real-time entry signal. State relative sizing/risk assumptions without inventing account balances or current holdings. Quote availability is not a prerequisite for a setup; identify unknown contract details explicitly.

Use a new report or an intentional revision to change, invalidate or close guidance, and cite the prior report when revising. Revisions must restate any guidance that remains relevant; absent fields in the newest report mean unspecified, not inherited advice. The app attributes each desk separately and retains historical instructions. Do not overwrite the owner's personal plan or place brokerage orders.

Preserve opposing underlying desk views with source report IDs. Do not invent consensus. Chief of Staff guidance is attributed separately from original desk instructions.
