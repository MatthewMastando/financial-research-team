import { createClient } from "@supabase/supabase-js";
import type { Report } from "../../shared/report";
import type { Instrument, Quote } from "../../shared/quotes";
import { demoAssets, demoQuotes, demoReports } from "./demo";
export const isDemo = import.meta.env.VITE_DEMO_MODE === "true";
export const db =
  !isDemo &&
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      )
    : null;
export type Filter = Record<string, string>;
export type Cursor = { id: string; received_at: string };
export type WatchEntry = {
  id: string;
  asset_id: string;
  pinned: boolean;
  dismissed: boolean;
  expires_at: string;
  last_evidence_at: string;
  evidence: { report_id: string; reason: string; desk_slug: string }[];
};
export type AlertItem = {
  id: string;
  title: string;
  severity: string;
  event_at: string;
  updated_at: string;
  read_at: string | null;
  report_ids: string[];
};
export type Settings = {
  owner_id?: string;
  timezone: string;
  suggestion_days: number;
  schedules: Record<
    string,
    { morning: string; evening: string; weekends: boolean }
  >;
};
const saved = <T>(key: string, fallback: T): T => {
  try {
    return (
      JSON.parse(localStorage.getItem("market-demo-" + key) ?? "null") ??
      fallback
    );
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) =>
  localStorage.setItem("market-demo-" + key, JSON.stringify(value));
export function uniqueReports(reports: Report[]) {
  return [...new Map(reports.map((r) => [r.id, r])).values()];
}
export async function reports(
  filters: Filter = {},
  cursor: Cursor | null = null,
  limit = 30,
): Promise<Report[]> {
  if (isDemo) {
    return demoReports
      .filter(
        (r) =>
          (!filters.q ||
            `${r.title} ${r.summary} ${r.body_markdown}`
              .toLowerCase()
              .includes(filters.q.toLowerCase())) &&
          (!filters.desk || r.desk_slug === filters.desk) &&
          (!filters.type || r.report_type === filters.type) &&
          (!filters.importance || r.importance === filters.importance) &&
          (!filters.asset ||
            r.assets.some((a) => a.asset_key === filters.asset)) &&
          (!filters.from || r.researched_at >= filters.from) &&
          (!filters.to || r.researched_at < filters.to + "T23:59:59Z") &&
          (!cursor ||
            r.received_at < cursor.received_at ||
            (r.received_at === cursor.received_at && r.id < cursor.id)),
      )
      .sort(
        (a, b) =>
          b.received_at.localeCompare(a.received_at) ||
          b.id.localeCompare(a.id),
      )
      .slice(0, limit);
  }
  const { data, error } = await db!.rpc("search_reports", {
    p_filters: filters,
    p_cursor: cursor,
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}
export async function getReport(id: string): Promise<Report | null> {
  if (isDemo) return demoReports.find((r) => r.id === id) ?? null;
  const rows = await history(id);
  return rows.find((r) => r.id === id) ?? null;
}
export async function history(id: string): Promise<Report[]> {
  if (isDemo) {
    const r = demoReports.find((x) => x.id === id);
    return demoReports.filter(
      (x) =>
        x.id === id ||
        x.id === r?.supersedes_report_id ||
        x.supersedes_report_id === id,
    );
  }
  const { data, error } = await db!.rpc("report_history", { p_id: id });
  if (error) throw error;
  return data ?? [];
}
export async function assets(): Promise<Instrument[]> {
  if (isDemo) return demoAssets;
  const { data, error } = await db!.from("assets").select("*").order("symbol");
  if (error) throw error;
  return data ?? [];
}
export async function quotes(ids: string[]): Promise<Quote[]> {
  if (isDemo) return demoQuotes.filter((q) => ids.includes(q.asset_id));
  if (!ids.length) return [];
  const {
    data: { session },
  } = await db!.auth.getSession();
  if (!session) throw new Error("Session expired. Sign in again.");
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quotes?ids=${encodeURIComponent(ids.slice(0, 50).join(","))}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    },
  );
  if (!response.ok) throw new Error("Quote connection unavailable");
  return (await response.json()).quotes;
}
export async function watchlist(): Promise<WatchEntry[]> {
  if (isDemo)
    return saved(
      "watch",
      demoAssets.map((a, i) => ({
        id: "watch-" + i,
        asset_id: a.id,
        pinned: i === 0,
        dismissed: false,
        expires_at: "2099-01-01T00:00:00Z",
        last_evidence_at: "2026-10-04T12:00:00Z",
        evidence: demoReports
          .filter(
            (r) =>
              r.assets.some((x) => x.asset_key === a.asset_key) && r.is_current,
          )
          .map((r) => ({
            report_id: r.id,
            reason: r.assets[0].reason,
            desk_slug: r.desk_slug,
          })),
      })),
    );
  const { data, error } = await db!
    .from("watchlist_entries")
    .select("*,watchlist_evidence(report_id,reason,reports(desk_slug))")
    .order("last_evidence_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    evidence: r.watchlist_evidence.map((e: any) => ({
      report_id: e.report_id,
      reason: e.reason,
      desk_slug: e.reports.desk_slug,
    })),
  }));
}
export async function changeWatch(
  id: string,
  patch: { pinned?: boolean; dismissed?: boolean },
) {
  if (isDemo) {
    save(
      "watch",
      (await watchlist()).map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
    return;
  }
  const { error } = await db!
    .from("watchlist_entries")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
}
export async function alerts(): Promise<AlertItem[]> {
  if (isDemo)
    return saved(
      "alerts",
      demoReports
        .filter((r) => r.importance === "elevated" && r.is_current)
        .map((r) => ({
          id: "alert-" + r.id,
          title: r.title,
          severity: r.importance,
          event_at: r.researched_at,
          updated_at: r.received_at,
          read_at: null,
          report_ids: [r.id],
        })),
    );
  const { data, error } = await db!
    .from("alerts")
    .select("*,alert_reports(report_id)")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    report_ids: r.alert_reports.map((x: any) => x.report_id),
  }));
}
export async function readAlert(id: string, read: boolean) {
  const read_at = read ? new Date().toISOString() : null;
  if (isDemo) {
    save(
      "alerts",
      (await alerts()).map((a) => (a.id === id ? { ...a, read_at } : a)),
    );
    return;
  }
  const { error } = await db!
    .from("alerts")
    .update({ read_at })
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
}
export async function settings(): Promise<Settings> {
  if (isDemo)
    return saved("settings", {
      timezone: "America/New_York",
      suggestion_days: 14,
      schedules: {},
    });
  const { data, error } = await db!.from("user_settings").select("*").single();
  if (error) throw error;
  return data;
}
export async function updateSettings(s: Settings) {
  if (isDemo) {
    save("settings", s);
    return;
  }
  const { error } = await db!
    .from("user_settings")
    .update({
      timezone: s.timezone,
      suggestion_days: s.suggestion_days,
      schedules: s.schedules,
    })
    .eq("owner_id", s.owner_id!)
    .select("owner_id")
    .single();
  if (error) throw error;
}
export async function deskStatus() {
  const slugs = [
    "macro",
    "commodities",
    "equities",
    "crypto",
    "chief_of_staff",
  ];
  if (isDemo)
    return slugs.map((slug) => ({
      slug,
      latest:
        demoReports.find((r) => r.desk_slug === slug)?.received_at ?? null,
      run: null as any,
      expected_cadence: "Unconfigured",
    }));
  const { data: desks, error } = await db!.from("desks").select("*");
  if (error) throw error;
  return await Promise.all(
    (desks ?? []).map(async (d) => {
      const [r, run] = await Promise.all([
        db!
          .from("reports")
          .select("received_at")
          .eq("desk_slug", d.slug)
          .eq("is_demo", false)
          .order("received_at", { ascending: false })
          .limit(1),
        db!
          .from("desk_runs")
          .select("*")
          .eq("desk_slug", d.slug)
          .order("started_at", { ascending: false })
          .limit(1),
      ]);
      if (r.error || run.error) throw r.error ?? run.error;
      return {
        slug: d.slug,
        latest: r.data?.[0]?.received_at ?? null,
        run: run.data?.[0],
        expected_cadence: d.expected_cadence,
      };
    }),
  );
}

export async function assetTheses(asset: string): Promise<Report[]> {
  if (isDemo)
    return demoReports.filter(
      (r) =>
        r.is_current &&
        r.thesis &&
        r.desk_slug !== "chief_of_staff" &&
        r.assets.some(
          (a) => a.asset_key === asset && a.relationship === "subject",
        ),
    );
  const { data: rows, error } = await db!.rpc("asset_theses", {
    p_asset: asset,
  });
  if (error) throw error;
  return rows ?? [];
}
