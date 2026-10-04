---
name: market-research-commodities
description: Produce and submit source-backed Commodities and Futures research to the private research archive.
---

# Commodities and Futures

Use for the configured morning scan, evening wrap, or authorized ad-hoc/breaking update. Desk slug is `commodities`. Research energy, metals, agriculture, inventories, curves, positioning and weather. State whether a note covers an underlying commodity theme or an exact contract. Preserve venue, expiry and quote currency; leave unknown mappings unresolved. Never price a theme using a neighboring futures contract.

## Inputs and access

Use current sources available in this Grok account and the deployed version 1 report contract. A separately scoped bot credential and HTTPS research endpoint must be configured through the secure environment. Do not display their values. Read prior context only with `research:read`; never use unrestricted SQL or an administrator key.

## Workflow

1. Gather current primary sources. Keep publication time nullable if unknown. Record UTC research/access timestamps and HTTP(S) links. Distinguish sourced facts, interpretations and scenarios; never invent data or treat repeated/copy-sourced claims as independent confirmation.
2. Retrieve bounded relevant context with `research_client.py context --desk commodities --limit 50` and an exact `--asset` when relevant. Follow `next_cursor` as needed. Read existing thesis and revision head before revising it.
3. Write one schema_version 1 JSON file. Use a stable submission ID tied to this run/report, desk_slug `commodities`, an explicitly permitted report type, <=600 character summary, <=50,000 character body, what changed, importance reason, thesis/invalidation when explicit, risks, claims and evidence. Set `is_demo=false` for real research. If sources fail, record an evidence_gap and distinguish the limited scenario from a fact.
4. Suggest an asset only when substantive research provides a reason. Context mentions use `watchlist_action=none`. Identify catalysts with exact/date/unknown precision; a date-only event must remain YYYY-MM-DD. Never change user pin/dismiss preferences.
5. For a material thesis revision, cite the current `supersedes_report_id`; preserve the original conditions and clearly state what changed. On a head conflict, retrieve the current head and produce a newly identified intentional revision, rather than replacing old content.
6. Submit the saved file with `python3 research_client.py submit <saved-file.json>`. Confirm the durable receipt and retain it. Retry transient failures with the same saved bytes and same submission ID. Do not retry validation/auth/scope conflicts indefinitely or regenerate different content under a used ID.
7. Record started/terminal run status only if signals can be reliably produced. Submit sanitized error codes, never raw exceptions, prompts or tokens. If an approval or authentication requirement blocks submission, record the failure in Grok's available run history.

## Output and boundaries

Return a concise research summary and accepted report receipt, or a clear failure notice. A receipt proves storage, not notifications. No brokerage actions, holdings assumptions, purchases, public sharing, external messages or undocumented Grok API triggers. Follow the user's actual account approval policy; use secure handoff when required. Do not claim live prices from research prose or calibrated confidence probabilities.
