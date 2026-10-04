import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import type { RpcClient } from "../shared/http";
export const OWNER = "30000000-0000-4000-8000-000000000001";
export const OTHER = "30000000-0000-4000-8000-000000000002";
export type Sql = {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
  exec(sql: string): Promise<unknown>;
};
export async function testDatabase() {
  let databaseUrl: string | undefined;
  let db: Sql;
  let close: () => Promise<void>;
  let tx: <T>(fn: (conn: Sql) => Promise<T>) => Promise<T>;
  if (process.env.TEST_DATABASE_URL) {
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const name = "market_test_" + Date.now();
    await admin.query(`create database ${name}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.pathname = "/" + name;
    databaseUrl = url.href;
    const pool = new Pool({ connectionString: url.href });
    db = { query: (s, p) => pool.query(s, p), exec: (s) => pool.query(s) };
    tx = async (fn) => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const result = await fn({
          query: (s, p) => c.query(s, p),
          exec: (s) => c.query(s),
        });
        await c.query("commit");
        return result;
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        c.release();
      }
    };
    close = async () => {
      await pool.end();
      await admin.query(`drop database ${name}`);
      await admin.end();
    };
  } else {
    const pg = new PGlite();
    db = pg;
    tx = (fn) => pg.transaction((t) => fn(t));
    close = () => pg.close();
  }
  await db.exec(
    `do $$ begin create role anon;exception when duplicate_object then null;end $$;do $$ begin create role authenticated;exception when duplicate_object then null;end $$;do $$ begin create role service_role bypassrls;exception when duplicate_object then null;end $$;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`,
  );
  // Match hosted Supabase's broad default table grants, then verify migrations narrow them.
  await db.exec(
    "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;",
  );
  for (const f of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.query("insert into auth.users values($1),($2)", [OWNER, OTHER]);
  await db.query("insert into app_owner(owner_id) values($1)", [OWNER]);
  await db.query("insert into user_settings(owner_id) values($1)", [OWNER]);
  const asUser = <T>(owner: string | null, fn: (s: Sql) => Promise<T>) =>
    tx(async (s) => {
      await s.exec(`set local role ${owner ? "authenticated" : "anon"}`);
      await s.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner ?? "",
      ]);
      return fn(s);
    });
  const rpc: RpcClient = {
    rpc: async (name, args = {}) => {
      const names = [
        "authenticate_bot",
        "ingest_report",
        "record_desk_run",
        "bot_research_context",
        "process_research_jobs",
      ];
      if (!names.includes(name)) throw new Error("Unsupported RPC");
      try {
        const entries = Object.entries(args);
        const r = await tx(async (s) => {
          await s.exec("set local role service_role");
          return s.query(
            `select public.${name}(${entries.map(([k], i) => `${k} => $${i + 1}`).join(",")}) as value`,
            entries.map(([, v]) => v),
          );
        });
        return { data: r.rows[0].value, error: null };
      } catch (e: any) {
        return { data: null, error: { code: e.code, message: e.message } };
      }
    },
  };
  return { db, close, tx, asUser, rpc, databaseUrl };
}
