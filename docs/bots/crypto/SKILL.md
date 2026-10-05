---
name: market-research-crypto
description: Produce and submit source-backed Crypto research to the private research archive.
---

# Crypto

Use for the configured morning scan, evening wrap, or authorized ad-hoc/breaking update. Desk slug is `crypto`. Research protocol activity, flows, positioning, unlocks and industry developments. Confirm each source dataset and license; do not assume all DefiLlama APIs or desired metrics are free or available. Identify the canonical asset/network and state stale or incomplete inputs.

## Inputs and access

Use current sources available in this Grok account and the deployed version 1 report contract. A separately scoped bot credential and HTTPS research endpoint must be configured through the secure environment. Do not display their values. Read prior context only with `research:read`; never use unrestricted SQL or an administrator key.

## Workflow

1. Gather current primary sources. Keep publication time nullable if unknown. Record UTC research/access timestamps and HTTP(S) links. Distinguish sourced facts, interpretations and scenarios; never invent data or treat repeated/copy-sourced claims as independent confirmation.
2. Retrieve bounded relevant context with `research_client.py context --desk crypto --limit 50` and an exact `--asset` when relevant. Follow `next_cursor` as needed. Read existing thesis and revision head before revising it.
3. Write one schema_version 1 JSON file. Use a stable submission ID tied to this run/report, desk_slug `crypto`, an explicitly permitted report type, <=600 character summary, <=50,000 character body, what changed, importance reason, thesis/invalidation when explicit, risks, claims and evidence. Set `is_demo=false` for real research. If sources fail, record an evidence_gap and distinguish the limited scenario from a fact.
4. Suggest an asset only when substantive research provides a reason. Context mentions use `watchlist_action=none`. Identify catalysts with exact/date/unknown precision; a date-only event must remain YYYY-MM-DD. Never change user pin/dismiss preferences.
5. For a material thesis revision, cite the current `supersedes_report_id`; preserve the original conditions and clearly state what changed. On a head conflict, retrieve the current head and produce a newly identified intentional revision, rather than replacing old content.
6. Submit the saved file with `python3 research_client.py submit <saved-file.json>`. Confirm the durable receipt and retain it. Retry transient failures with the same saved bytes and same submission ID. Do not retry validation/auth/scope conflicts indefinitely or regenerate different content under a used ID.
7. Record started/terminal run status only if signals can be reliably produced. Submit sanitized error codes, never raw exceptions, prompts or tokens. If an approval or authentication requirement blocks submission, record the failure in Grok's available run history.

## Positioning and explicit trade setups

For each substantive `report.assets[]` reference, submit optional `positioning` and `trade_setup` objects using [the guidance contract](../../trade-setups.md). Positioning states `stance` (`long_bias`, `short_bias`, `neutral`, `avoid`, `watch_only`), `action` (`initiate`, `add`, `reduce`, `exit`, `hold`, `wait`) and an explicit `rationale`. An outlook and a tactical setup can have different directions; explain the distinction. Keep context references free of positioning and setups. Use null or omit either object when there is no explicit guidance; never manufacture entry levels or infer a position from an asset mention.

`trade_setup` records direction, lifecycle status, timeframe, entry trigger and zone, stop/risk limit, targets, sizing guidance, invalidation, multiline instructions and optional expiry. Provide every field within the object, using null or an empty targets array for unknown details. Use `idea` or `conditional` while incomplete. `ready` requires a direction, entry trigger, stop, targets, sizing, invalidation and instructions; it is your assessment at research time, not a verified real-time entry signal. State relative sizing/risk assumptions without inventing account balances or current holdings. Quote availability is not a prerequisite for a setup; identify unknown contract details explicitly.

Use a new report or an intentional revision to change, invalidate or close guidance, and cite the prior report when revising. Revisions must restate any guidance that remains relevant; absent fields in the newest report mean unspecified, not inherited advice. The app attributes each desk separately and retains historical instructions. Do not overwrite the owner's personal plan or place brokerage orders.

## Output and boundaries

Return a concise research summary and accepted report receipt, or a clear failure notice. A receipt proves storage, not notifications. No brokerage actions, holdings assumptions, purchases, public sharing, external messages or undocumented Grok API triggers. Follow the user's actual account approval policy; use secure handoff when required. Do not claim live prices from research prose or calibrated confidence probabilities.
