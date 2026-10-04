# Grok desk setup

These are reusable written skills for the user's actual Grok Bots, not custom xAI API agents. Official Grok cloud-computer, skills/routines and approval docs were read on 2026-10-04; availability and permission settings must still be verified in the account.

1. Create or choose Macro & Geopolitics, Commodities & Futures, Equities & Trends, Crypto and Chief of Staff Bots in the Grok account.
2. Copy `scripts/research_client.py`, the report contract/example and the relevant `SKILL.md` to a durable project folder on the shared cloud computer. Ask Grok to save each written workflow as a skill using its supported skill UI. Enable the private skill for its Bot under Settings → Plugins → Yours if required. Do not assume filesystem copying automatically registers a skill.
3. Configure each desk's opaque bot token through the secure credential/environment flow. All Bots share a computer and command credentials; separate tokens provide attribution/revocation, not isolation between Bots. Keep `RESEARCH_BOT_TOKEN` and `RESEARCH_API_URL` out of prompts, JSON payloads and committed files. Never give a Bot an administrator key.
4. Run one synthetic transport test, then a real source-backed Macro submission. Do not declare the integration verified until the app shows the accepted report and the retry deduplicates.

```sh
python3 research_client.py submit synthetic-report.json
python3 research_client.py context --desk macro --limit 50
python3 research_client.py run saved-run-signal.json
```

The client uses Python's standard library and honors configured HTTP proxies/certificate trust. It retries transient failures using unchanged payload bytes. Server Zod validation remains authoritative. Save the JSON before submission, retain the receipt, and do not regenerate conflicting content under the same ID. 409 needs deliberate recovery; validation/scope errors are not blindly retried.

Once manual transport is proven, ask the owning Bot to create morning and evening routines using the installed skill, the chosen exact local times, IANA timezone and weekend rules. No exact run time or active routine has been selected in this implementation. Confirm the next run in Grok; test unattended cloud submission and inspect its run history. Approval/network/auth/usage failures can stop unattended writes. The app's schedule preferences do not install routines.

Chief of Staff runs after the chosen desk cutoff, follows context pagination since the last successful brief, and publishes even when a desk is absent (explicitly record the gap). It saves its watermark only after a committed brief receipt. Crypto weekend coverage is separately configurable. Named-zone schedules follow local DST; verify the Grok routine UI's actual timezone semantics. Immediate ad-hoc submission is supported; automatic discovery of unexpected breaking news is not implemented. Use only account-supported event triggers or a separately configured monitoring source.

Official references: [computer/apps](https://docs.x.ai/grok-bot/computer-and-apps), [skills/routines](https://docs.x.ai/grok-bot/skills-routines-and-automations), [approvals/privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy).
