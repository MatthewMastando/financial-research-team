import { z } from "zod";
import { positioningSchema, tradeSetupSchema } from "./guidance.ts";

export const desks = [
  "macro",
  "commodities",
  "equities",
  "crypto",
  "chief_of_staff",
] as const;
export const deskNames: Record<string, string> = {
  macro: "Macro & Geopolitics",
  commodities: "Commodities & Futures",
  equities: "Equities & Trends",
  crypto: "Crypto",
  chief_of_staff: "Chief of Staff",
};
export const reportTypes = [
  "morning_scan",
  "evening_wrap",
  "breaking_update",
  "thesis_revision",
  "morning_brief",
] as const;
const short = z.string().trim().min(1).max(1000);
const timestamp = z.iso.datetime({ offset: true });
export const safeUrl = z
  .url()
  .refine(
    (v) => ["https:", "http:"].includes(new URL(v).protocol),
    "Only HTTP and HTTPS links are allowed",
  );
const assetKey = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[a-z][a-z_]*:[A-Za-z0-9._:/-]+$/);
export const reportSchema = z
  .object({
    schema_version: z.literal(1),
    submission_id: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[\w.-]+$/),
    desk_slug: z.enum(desks),
    report_type: z.enum(reportTypes),
    researched_at: timestamp,
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(600),
    body_markdown: z.string().min(1).max(50000),
    what_changed: short,
    importance: z.enum(["normal", "elevated", "urgent"]),
    importance_reason: short,
    time_horizon: z.enum([
      "intraday",
      "days",
      "weeks",
      "months",
      "structural",
      "unspecified",
    ]),
    thesis: short.nullable(),
    invalidation: short.nullable(),
    risks: z.array(short).max(50),
    evidence_gap: short.nullable().default(null),
    assets: z
      .array(
        z
          .object({
            asset_key: assetKey,
            relationship: z.enum(["subject", "exposure", "context"]),
            watchlist_action: z.enum(["suggest", "none"]),
            reason: short,
            positioning: positioningSchema.nullable().optional(),
            trade_setup: tradeSetupSchema.nullable().optional(),
          })
          .strict(),
      )
      .max(50),
    sources: z
      .array(
        z
          .object({
            source_key: z.string().min(1).max(80),
            url: safeUrl,
            title: short,
            published_at: timestamp.nullable(),
            accessed_at: timestamp,
          })
          .strict(),
      )
      .max(50),
    claims: z
      .array(
        z
          .object({
            text: short,
            kind: z.enum(["sourced_fact", "interpretation", "scenario"]),
            source_keys: z.array(z.string().min(1).max(80)).max(50),
          })
          .strict(),
      )
      .max(100),
    catalysts: z
      .array(
        z
          .object({
            title: short,
            asset_key: assetKey.nullable(),
            expected_at: z.string().nullable(),
            timing_precision: z.enum(["exact", "date", "unknown"]),
            source_key: z.string().min(1).max(80),
            description: short,
          })
          .strict(),
      )
      .max(50),
    supersedes_report_id: z.uuid().nullable(),
    related_report_ids: z.array(z.uuid()).max(50),
    event_key: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[\w:.-]+$/)
      .nullable(),
    is_demo: z.boolean(),
    disagreements: z
      .array(
        z
          .object({
            report_ids: z.array(z.uuid()).min(2).max(10),
            explanation: short,
          })
          .strict(),
      )
      .max(10)
      .default([]),
    missing_desks: z.array(z.enum(desks)).max(4).default([]),
  })
  .strict()
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (
      !r.is_demo &&
      !r.sources.length &&
      !r.evidence_gap &&
      !(r.report_type === "morning_brief" && r.related_report_ids.length)
    )
      issue(
        ["sources"],
        "Production reports require sources, an evidence gap, or brief report references",
      );
    if (
      (r.report_type === "morning_brief") !==
      (r.desk_slug === "chief_of_staff")
    )
      issue(["report_type"], "Morning briefs belong to Chief of Staff");
    if (r.report_type === "thesis_revision" && !r.supersedes_report_id)
      issue(["supersedes_report_id"], "A revision needs the prior report");
    if (new Set(r.sources.map((s) => s.source_key)).size !== r.sources.length)
      issue(["sources"], "Source keys must be unique");
    if (new Set(r.assets.map((a) => a.asset_key)).size !== r.assets.length)
      issue(["assets"], "Asset keys must be unique");
    if (new Set(r.related_report_ids).size !== r.related_report_ids.length)
      issue(["related_report_ids"], "Report references must be unique");
    const keys = new Set(r.sources.map((s) => s.source_key));
    r.assets.forEach((a, i) => {
      if (a.relationship === "context" && (a.positioning || a.trade_setup))
        issue(
          ["assets", i],
          "Context mentions cannot carry positioning or trade setups",
        );
      if (
        a.trade_setup?.valid_until &&
        a.trade_setup.status === "ready" &&
        Date.parse(a.trade_setup.valid_until) <= Date.parse(r.researched_at)
      )
        issue(
          ["assets", i, "trade_setup", "valid_until"],
          "A ready setup cannot already have expired at research time",
        );
    });
    r.claims.forEach((c, i) => {
      if (
        c.source_keys.some((k) => !keys.has(k)) ||
        (c.kind === "sourced_fact" && !c.source_keys.length)
      )
        issue(["claims", i], "Facts require valid source references");
    });
    r.catalysts.forEach((c, i) => {
      if (!keys.has(c.source_key))
        issue(["catalysts", i, "source_key"], "Unknown source");
      if (
        c.timing_precision === "exact" &&
        !timestamp.safeParse(c.expected_at).success
      )
        issue(["catalysts", i], "Exact catalyst needs an ISO timestamp");
      if (
        c.timing_precision === "date" &&
        !(
          c.expected_at &&
          /^\d{4}-\d{2}-\d{2}$/.test(c.expected_at) &&
          Number.isFinite(Date.parse(c.expected_at)) &&
          new Date(c.expected_at).toISOString().slice(0, 10) === c.expected_at
        )
      )
        issue(["catalysts", i], "Date catalyst needs a valid YYYY-MM-DD date");
      if (c.timing_precision === "unknown" && c.expected_at !== null)
        issue(["catalysts", i], "Unknown timing must stay null");
    });
    if (r.disagreements.length && r.desk_slug !== "chief_of_staff")
      issue(
        ["disagreements"],
        "Only a Chief of Staff brief can identify disagreements",
      );
    r.disagreements.forEach((d, i) => {
      if (d.report_ids.some((id) => !r.related_report_ids.includes(id)))
        issue(["disagreements", i], "Disagreements must cite related reports");
    });
  });
export type ReportInput = z.infer<typeof reportSchema>;
export type Report = ReportInput & {
  id: string;
  received_at: string;
  is_current: boolean;
  processing_status?: string;
  retracted?: boolean;
  retraction_reason?: string | null;
};
export const runSchema = z
  .object({
    external_run_id: z.string().min(1).max(160),
    status: z.enum(["started", "succeeded", "failed"]),
    started_at: timestamp,
    completed_at: timestamp.nullable(),
    error_code: z
      .enum([
        "approval_required",
        "authentication_failed",
        "network_failed",
        "source_unavailable",
        "submission_failed",
      ])
      .nullable(),
  })
  .strict();
