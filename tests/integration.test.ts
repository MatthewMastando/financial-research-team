import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase, OWNER, OTHER } from "./database";
import { apiHandler, hashToken, decodeCursor } from "../shared/http";
import { reportSchema, type ReportInput } from "../shared/report";
import { demoReports } from "../src/lib/demo";
let h: Awaited<ReturnType<typeof testDatabase>>;
let handler: (req: Request) => Promise<Response>;
const TOKEN = "m".repeat(43),
  READ = "r".repeat(43),
  REVOKED = "v".repeat(43);
const CID = randomUUID(),
  BOT = randomUUID(),
  READID = randomUUID(),
  REVOKEDID = randomUUID();
const base = (() => {
  const { id, received_at, is_current, ...rest } = demoReports[1];
  return reportSchema.parse({
    ...rest,
    desk_slug: "macro",
    report_type: "morning_scan",
    is_demo: false,
    researched_at: new Date().toISOString(),
    event_key: null,
    supersedes_report_id: null,
  });
})();
const payload = (patch: Partial<ReportInput> = {}) => ({
  ...base,
  submission_id: randomUUID(),
  ...patch,
});
const post = (input: unknown, token = TOKEN) =>
  handler(
    new Request("https://test/functions/v1/research-api/v1/reports", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );
const ingest = async (input: ReportInput) => {
  const response = await post(input);
  expect(response.status).toBe(201);
  return response.json();
};
beforeAll(async () => {
  h = await testDatabase();
  handler = apiHandler(h.rpc, "https://app.test");
  for (const [id, token, scopes, desk, bot, revoked] of [
    [CID, TOKEN, ["reports:write", "runs:write"], "macro", BOT, false],
    [READID, READ, ["research:read"], "chief_of_staff", randomUUID(), false],
    [REVOKEDID, REVOKED, ["reports:write"], "macro", randomUUID(), true],
  ] as const)
    await h.db.query(
      "insert into private.bot_credentials(id,owner_id,bot_id,desk_slug,token_hash,scopes,report_types,revoked_at) values($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        OWNER,
        bot,
        desk,
        await hashToken(token),
        scopes,
        ["morning_scan", "thesis_revision"],
        revoked ? new Date() : null,
      ],
    );
});
afterAll(async () => {
  await h?.close();
});
describe("authenticated durable ingestion", () => {
  it("authenticates before parsing even malformed expensive input", async () => {
    const response = await handler(
      new Request("https://test/v1/reports", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(response.status).toBe(401);
  });
  it("rejects revoked tokens, desk impersonation, and read without scope", async () => {
    expect((await post(payload(), REVOKED)).status).toBe(401);
    expect((await post(payload({ desk_slug: "crypto" }))).status).toBe(403);
    expect(
      (
        await handler(
          new Request("https://test/v1/research-context", {
            headers: { Authorization: `Bearer ${TOKEN}` },
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("rejects large streaming bodies and validation failures", async () => {
    expect((await post({ x: "x".repeat(262145) })).status).toBe(413);
    expect((await post(payload({ summary: "x".repeat(601) }))).status).toBe(
      422,
    );
  });
  it("deduplicates retry receipts across token rotation and rejects changed content", async () => {
    const input = payload();
    const first = await ingest(input);
    const replay = await post(input);
    expect(replay.status).toBe(200);
    expect((await replay.json()).report_id).toBe(first.report_id);
    expect((await post({ ...input, title: "Conflicting title" })).status).toBe(
      409,
    );
    const rotated = "s".repeat(43);
    await h.db.query(
      "update private.bot_credentials set revoked_at=now() where id=$1",
      [CID],
    );
    const newid = randomUUID();
    await h.db.query(
      "insert into private.bot_credentials(id,owner_id,bot_id,desk_slug,token_hash,scopes,report_types) values($1,$2,$3,$4,$5,$6,$7)",
      [
        newid,
        OWNER,
        BOT,
        "macro",
        await hashToken(rotated),
        ["reports:write"],
        ["morning_scan", "thesis_revision"],
      ],
    );
    const rotatedReplay = await post(input, rotated);
    expect(rotatedReplay.status).toBe(200);
    expect((await rotatedReplay.json()).report_id).toBe(first.report_id);
    await h.db.query(
      "update private.bot_credentials set revoked_at=null where id=$1",
      [CID],
    );
  });
  it("rolls back all children and the job if ingestion fails midway", async () => {
    const input = payload();
    const bad = { ...input, sources: [input.sources[0], input.sources[0]] };
    const result = await h.rpc.rpc("ingest_report", {
      p_credential: CID,
      p_payload: bad,
    });
    expect(result.error).not.toBeNull();
    expect(
      (
        await h.db.query("select id from reports where submission_id=$1", [
          input.submission_id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("stores a job transactionally and preserves prior reports through revisions", async () => {
    const old = await ingest(payload());
    const revision = await ingest(
      payload({
        report_type: "thesis_revision",
        supersedes_report_id: old.report_id,
      }),
    );
    expect(
      (
        await h.db.query(
          "select id from private.processing_jobs where report_id=$1",
          [revision.report_id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await h.db.query("select id from reports where id=$1", [old.report_id]))
        .rows,
    ).toHaveLength(1);
    const rows = await h.asUser(OWNER, (s) =>
      s.query("select public.report_history($1) as r", [old.report_id]),
    );
    expect(rows.rows.map((x) => x.r.is_current)).toEqual([false, true]);
    expect(
      (
        await post(
          payload({
            report_type: "thesis_revision",
            supersedes_report_id: old.report_id,
          }),
        )
      ).status,
    ).toBe(409);
  });
  it("safely resolves simultaneous idempotent submissions and concurrent revisions", async () => {
    const input = payload();
    const concurrent = await Promise.all([post(input), post(input)]);
    expect(concurrent.map((x) => x.status).sort()).toEqual([200, 201]);
    const original = (await concurrent[0].json()).report_id;
    const revisions = await Promise.all([
      post(
        payload({
          report_type: "thesis_revision",
          supersedes_report_id: original,
        }),
      ),
      post(
        payload({
          report_type: "thesis_revision",
          supersedes_report_id: original,
        }),
      ),
    ]);
    expect(revisions.map((x) => x.status).sort()).toEqual([201, 409]);
  });
  it("leaves unknown futures explicitly unresolved", async () => {
    const receipt = await ingest(
      payload({
        assets: [
          {
            asset_key: "future:CME:M6E:UNRESOLVED",
            relationship: "subject",
            watchlist_action: "suggest",
            reason: "Expiry not verified",
          },
        ],
      }),
    );
    const r = await h.db.query(
      "select asset_id,asset_key from report_assets where report_id=$1",
      [receipt.report_id],
    );
    expect(r.rows[0].asset_id).toBeNull();
    expect(r.rows[0].asset_key).toBe("future:CME:M6E:UNRESOLVED");
  });
});
describe("owner boundary and archive queries", () => {
  it("denies anonymous access and returns no research or quotes instruments to a second authenticated account", async () => {
    await expect(
      h.asUser(null, (s) => s.query("select * from reports")),
    ).rejects.toThrow(/permission denied/);
    const r = await h.asUser(OTHER, (s) => s.query("select * from reports"));
    expect(r.rows).toHaveLength(0);
    expect(
      (await h.asUser(OTHER, (s) => s.query("select * from assets"))).rows,
    ).toHaveLength(0);
    expect(
      (await h.asUser(OTHER, (s) => s.query("select public.search_reports()")))
        .rows,
    ).toHaveLength(0);
  });
  it("never permits a browser to mutate research, credentials, jobs, or preference authority", async () => {
    await expect(
      h.asUser(OWNER, (s) => s.query("update reports set payload='{}'")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.asUser(OWNER, (s) => s.query("select * from private.bot_credentials")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.asUser(OWNER, (s) => s.query("select * from private.processing_jobs")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.asUser(OWNER, (s) => s.query("select public.process_research_jobs()")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.asUser(OWNER, (s) =>
        s.query("update watchlist_entries set expires_at=now()"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("keeps late arrivals visible using receipt ordering and stable pagination", async () => {
    const r = await ingest(
      payload({
        researched_at: "2020-01-01T00:00:00Z",
        title: "Archived unique search needle",
      }),
    );
    const search = await h.asUser(OWNER, (s) =>
      s.query("select public.search_reports($1,null,1) as r", [
        { q: "unique search needle" },
      ]),
    );
    expect(search.rows[0].r.id).toBe(r.report_id);
    expect(search.rows[0].r.researched_at).not.toBe(
      search.rows[0].r.received_at,
    );
    const page = await h.asUser(OWNER, (s) =>
      s.query("select public.search_reports($1,null,2) as r", [{}]),
    );
    const last = page.rows.at(-1)!.r;
    const next = await h.asUser(OWNER, (s) =>
      s.query("select public.search_reports($1,$2,2) as r", [
        {},
        { id: last.id, received_at: last.received_at },
      ]),
    );
    expect(
      next.rows.every((x) => !page.rows.some((p) => p.r.id === x.r.id)),
    ).toBe(true);
  });
  it("preserves retractions as events and labels the archive", async () => {
    const r = await ingest(payload());
    await h.db.query(
      "insert into report_events(owner_id,report_id,kind,reason) values($1,$2,$3,$4)",
      [OWNER, r.report_id, "retraction", "Source corrected"],
    );
    const row = await h.asUser(OWNER, (s) =>
      s.query("select public.report_history($1) as r", [r.report_id]),
    );
    expect(row.rows[0].r.retraction_reason).toBe("Source corrected");
    await expect(
      h.db.query("delete from reports where id=$1", [r.report_id]),
    ).rejects.toThrow("append-only");
  });
  it("returns bounded ascending context with existing references and explicit gaps", async () => {
    const response = await handler(
      new Request("https://test/v1/research-context?limit=2", {
        headers: { Authorization: `Bearer ${READ}` },
      }),
    );
    expect(response.status).toBe(200);
    const r = await response.json();
    expect(r.reports).toHaveLength(2);
    expect(decodeCursor(r.next_cursor)?.id).toBe(r.reports[1].id);
    expect(
      (
        await handler(
          new Request("https://test/v1/research-context?limit=101", {
            headers: { Authorization: `Bearer ${READ}` },
          }),
        )
      ).status,
    ).toBe(422);
  });
});
describe("repeatable watchlist and alerts", () => {
  it("ignores demo data and incidental mentions", async () => {
    await h.rpc.rpc("process_research_jobs", { p_limit: 50 });
    const before = (
      await h.db.query("select count(*)::int n from watchlist_evidence")
    ).rows[0].n;
    const context = await ingest(
      payload({
        importance: "normal",
        assets: [
          {
            asset_key: "crypto:BTC",
            relationship: "context",
            watchlist_action: "none",
            reason: "Incidental",
          },
        ],
        catalysts: [],
      }),
    );
    const demo = await ingest(
      payload({
        is_demo: true,
        importance: "urgent",
        assets: [
          {
            asset_key: "crypto:BTC",
            relationship: "subject",
            watchlist_action: "suggest",
            reason: "Demo",
          },
        ],
      }),
    );
    await h.rpc.rpc("process_research_jobs", { p_limit: 50 });
    expect(
      (await h.db.query("select count(*)::int n from watchlist_evidence"))
        .rows[0].n,
    ).toBe(before);
    expect(
      (
        await h.db.query(
          "select * from alert_reports where report_id=any($1::uuid[])",
          [[context.report_id, demo.report_id]],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("groups material followups and keeps preferences on retries or concurrent processing", async () => {
    const r = await ingest(
      payload({ importance: "elevated", event_key: "verified-test-event" }),
    );
    await h.rpc.rpc("process_research_jobs", { p_limit: 50 });
    const a = (
      await h.db.query("select * from alerts where event_key=$1", [
        "verified-test-event",
      ])
    ).rows[0];
    const entry = (await h.db.query("select * from watchlist_entries limit 1"))
      .rows[0];
    await h.asUser(OWNER, (s) =>
      s.query("update alerts set read_at=now() where id=$1", [a.id]),
    );
    await h.asUser(OWNER, (s) =>
      s.query(
        "update watchlist_entries set pinned=true,dismissed=true where id=$1",
        [entry.id],
      ),
    );
    await h.db.query(
      "update private.processing_jobs set completed_at=null where report_id=$1",
      [r.report_id],
    );
    await Promise.all([
      h.rpc.rpc("process_research_jobs", { p_limit: 50 }),
      h.rpc.rpc("process_research_jobs", { p_limit: 50 }),
    ]);
    expect(
      (await h.db.query("select * from alerts where id=$1", [a.id])).rows[0]
        .read_at,
    ).not.toBeNull();
    expect(
      (
        await h.db.query("select * from watchlist_entries where id=$1", [
          entry.id,
        ])
      ).rows[0],
    ).toMatchObject({ pinned: true, dismissed: true });
    expect(
      (
        await h.db.query("select * from alert_reports where alert_id=$1", [
          a.id,
        ])
      ).rows,
    ).toHaveLength(1);
    await ingest(
      payload({
        importance: "urgent",
        event_key: "verified-test-event",
        what_changed: "Material sourced follow-up",
      }),
    );
    await h.rpc.rpc("process_research_jobs", { p_limit: 50 });
    expect(
      (await h.db.query("select * from alerts where id=$1", [a.id])).rows[0]
        .read_at,
    ).toBeNull();
    expect(
      (
        await h.db.query("select * from alert_reports where alert_id=$1", [
          a.id,
        ])
      ).rows,
    ).toHaveLength(2);
  });
  it("retains accepted research after a failed job and succeeds on retry", async () => {
    await h.db.exec(
      "create function private.fail_test_evidence() returns trigger language plpgsql as $$ begin if new.reason='force_retry_test' then raise exception 'fixture'; end if;return new;end $$;create trigger fail_test_evidence before insert on watchlist_evidence for each row execute function private.fail_test_evidence();",
    );
    const r = await ingest(
      payload({
        assets: [
          {
            asset_key: "fx:EURUSD",
            relationship: "subject",
            watchlist_action: "suggest",
            reason: "force_retry_test",
          },
        ],
      }),
    );
    await h.rpc.rpc("process_research_jobs", { p_limit: 50 });
    expect(
      (
        await h.db.query(
          "select * from private.processing_jobs where report_id=$1",
          [r.report_id],
        )
      ).rows[0].last_error,
    ).toBe("derivation_failed");
    expect(
      (await h.db.query("select id from reports where id=$1", [r.report_id]))
        .rows,
    ).toHaveLength(1);
    await h.db.exec("drop trigger fail_test_evidence on watchlist_evidence");
    await h.db.query(
      "update private.processing_jobs set available_at=now() where report_id=$1",
      [r.report_id],
    );
    await h.rpc.rpc("process_research_jobs", { p_limit: 50 });
    expect(
      (
        await h.db.query(
          "select * from private.processing_jobs where report_id=$1",
          [r.report_id],
        )
      ).rows[0].completed_at,
    ).not.toBeNull();
  });
  it("rate limits authenticated callers with a retry hint", async () => {
    await h.db.query(
      "insert into private.rate_buckets values($1,date_trunc('minute',now()),60) on conflict(credential_id,bucket) do update set requests=60",
      [READID],
    );
    const response = await handler(
      new Request("https://test/v1/research-context", {
        headers: { Authorization: `Bearer ${READ}` },
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});

describe("protected quote endpoint", () => {
  it("coalesces quote leases, fences late writers, and restricts cache RPCs to service role", async () => {
    const key = "lease-test";
    const claim = async () =>
      (await h.db.query("select claim_twelve_data_quote($1) as value", [key]))
        .rows[0].value;
    const first = await claim();
    expect(first.lease).toBeTruthy();
    expect((await claim()).lease).toBeUndefined();
    await h.db.query(
      "update private.quote_cache set lease_until = now() - interval '1 second' where cache_key = $1",
      [key],
    );
    const second = await claim();
    expect(second.lease).not.toBe(first.lease);
    await h.db.query("select complete_twelve_data_quote($1, $2, $3, 600)", [
      key,
      first.lease,
      JSON.stringify({ price: 999 }),
    ]);
    expect(
      (
        await h.db.query(
          "select quote from private.quote_cache where cache_key = $1",
          [key],
        )
      ).rows[0].quote,
    ).toBeNull();
    await h.db.query("select complete_twelve_data_quote($1, $2, $3, 600)", [
      key,
      second.lease,
      JSON.stringify({ price: 100 }),
    ]);
    expect(await claim()).toMatchObject({ quote: { price: 100 } });
    for (const owner of [null, OWNER, OTHER]) {
      await expect(
        h.asUser(owner, (s) =>
          s.query("select claim_twelve_data_quote('denied')"),
        ),
      ).rejects.toThrow();
      await expect(
        h.asUser(owner, (s) => s.query("select * from private.quote_cache")),
      ).rejects.toThrow();
      await expect(
        h.asUser(owner, (s) =>
          s.query("select complete_twelve_data_quote('denied', $1, null, 60)", [
            randomUUID(),
          ]),
        ),
      ).rejects.toThrow();
    }
  });
  it("reserves credits across keys, enforces rolling-minute and UTC daily caps", async () => {
    await h.db.exec(
      "update private.quote_budget set daily_used = 0, day = (now() at time zone 'UTC')::date, request_times = '{}'",
    );
    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        h.db.query("select claim_twelve_data_quote($1) as value", [
          "minute-" + i,
        ]),
      ),
    );
    expect(claims.filter((r) => r.rows[0].value.lease)).toHaveLength(8);
    await h.db.exec(
      "update private.quote_budget set daily_used = 749, request_times = '{}'",
    );
    expect(
      (await h.db.query("select claim_twelve_data_quote('day-last') as value"))
        .rows[0].value.lease,
    ).toBeTruthy();
    expect(
      (
        await h.db.query(
          "select claim_twelve_data_quote('day-blocked') as value",
        )
      ).rows[0].value.lease,
    ).toBeUndefined();
    await h.db.exec(
      "update private.quote_budget set day = (now() at time zone 'UTC')::date - 1",
    );
    expect(
      (await h.db.query("select claim_twelve_data_quote('day-reset') as value"))
        .rows[0].value.lease,
    ).toBeTruthy();
    expect(
      (await h.db.query("select daily_used from private.quote_budget")).rows[0]
        .daily_used,
    ).toBe(1);
  });
  it("authenticates first and refuses a second user under owner RLS", async () => {
    const { quoteHandler } = await import("../shared/quote-http");
    const { UnconfiguredQuoteService } = await import("../shared/quotes");
    let lookups = 0;
    const endpoint = quoteHandler(
      async (token) => {
        const user = token === "owner-session" ? OWNER : OTHER;
        const rows = await h.asUser(user, (s) =>
          s.query("select * from app_owner"),
        );
        if (!rows.rows.length) return null;
        return async (ids) => {
          lookups++;
          return (
            await h.asUser(user, (s) =>
              s.query("select * from assets where id=any($1::uuid[])", [ids]),
            )
          ).rows;
        };
      },
      new UnconfiguredQuoteService(),
      "https://app.test",
    );
    expect(
      (await endpoint(new Request("https://test/quotes?ids=invalid"))).status,
    ).toBe(401);
    expect(
      (
        await endpoint(
          new Request("https://test/quotes", {
            headers: { Authorization: "Bearer second-session" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(lookups).toBe(0);
    const asset = (await h.db.query("select id from assets limit 1")).rows[0]
      .id;
    const response = await endpoint(
      new Request("https://test/quotes?ids=" + asset, {
        headers: { Authorization: "Bearer owner-session" },
      }),
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.quotes[0]).toMatchObject({
      asset_id: asset,
      price: null,
      entitlement: "unavailable",
      is_demo: false,
    });
    expect(result.health.configured).toBe(false);
  });
});

describe("database security catalog", () => {
  it("enables RLS on every app table and denies browser execution of privileged server wrappers", async () => {
    const missing = await h.db.query(
      "select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity",
    );
    expect(missing.rows).toHaveLength(0);
    const exposed = await h.db.query(
      "select p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))",
    );
    expect(exposed.rows).toHaveLength(0);
    const unsafe = await h.db.query(
      "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and p.proconfig is null",
    );
    expect(unsafe.rows).toHaveLength(0);
  });
  it("rejects invalid display timezones at the database boundary", async () => {
    await expect(
      h.asUser(OWNER, (s) =>
        s.query("update user_settings set timezone='invalid/zone'"),
      ),
    ).rejects.toThrow(/valid_display_timezone/);
  });
});
