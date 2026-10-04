import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { testDatabase, OWNER } from "../tests/database";
import { demoReports } from "../src/lib/demo";
const h = await testDatabase();
try {
  const credential = randomUUID();
  const bot = randomUUID();
  await h.db.query(
    "insert into private.bot_credentials(id,owner_id,bot_id,desk_slug,token_hash,scopes,report_types) values($1,$2,$3,$4,$5,$6,$7)",
    [
      credential,
      OWNER,
      bot,
      "macro",
      "load-test-hash",
      ["reports:write"],
      ["morning_scan"],
    ],
  );
  const { id, received_at, is_current, ...payload } = demoReports[2];
  await h.db.query(
    `insert into reports(owner_id,bot_id,credential_id,desk_slug,submission_id,payload_hash,schema_version,researched_at,report_type,importance,is_demo,payload)
 select $1,$2,$3,'macro','load-'||i,'fixture-'||i,1,now()-make_interval(mins=>i),'morning_scan','normal',true,$4::jsonb||jsonb_build_object('title','Synthetic archival liquidity scenario '||i,'desk_slug','macro') from generate_series(1,10000) i`,
    [OWNER, bot, credential, payload],
  );
  await h.db.exec("analyze public.reports");
  const timings: number[] = [];
  let maxRows = 0;
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    const r = await h.asUser(OWNER, (s) =>
      s.query("select public.search_reports($1,null,30) as r", [
        { q: "liquidity scenario", desk: "macro" },
      ]),
    );
    timings.push(performance.now() - start);
    maxRows = Math.max(maxRows, r.rows.length);
  }
  timings.sort((a, b) => a - b);
  const result = {
    measured_at: new Date().toISOString(),
    engine: process.env.TEST_DATABASE_URL
      ? "Disposable PostgreSQL 17"
      : "PGlite PostgreSQL WASM",
    reports: 10000,
    samples: 30,
    result_page_limit: 30,
    max_rows_returned: maxRows,
    median_ms: +timings[15].toFixed(2),
    p95_ms: +timings[28].toFixed(2),
    note: "SQL + owner RLS + JSON response query timings. Excludes network, browser rendering and Supabase Realtime; not a production SLA.",
  };
  writeFileSync(
    "docs/verification/search-benchmark.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await h.close();
}
