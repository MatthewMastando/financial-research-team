import { describe, it, expect } from "vitest";
import { reportSchema } from "../shared/report";
import { demoReports } from "../src/lib/demo";
import { quoteState, UnconfiguredQuoteService } from "../shared/quotes";
import { demoQuotes, demoAssets } from "../src/lib/demo";
import { uniqueReports } from "../src/lib/data";
const { id, received_at, is_current, ...fixture } = demoReports[1];
describe("versioned evidence contract", () => {
  it("accepts the representative report and preserves date-only catalysts", () => {
    const r = reportSchema.parse(fixture);
    expect(r.catalysts[0].expected_at).toBe("2026-10-09");
  });
  it("requires production evidence, with explicit gaps allowed", () => {
    expect(
      reportSchema.safeParse({
        ...fixture,
        is_demo: false,
        sources: [],
        claims: [],
        catalysts: [],
      }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({
        ...fixture,
        is_demo: false,
        sources: [],
        claims: [],
        catalysts: [],
        evidence_gap: "Source unavailable; scenario only.",
      }).success,
    ).toBe(true);
  });
  it("rejects executable URLs, missing fact references, duplicate keys and excessive summaries", () => {
    for (const input of [
      {
        ...fixture,
        sources: [{ ...fixture.sources[0], url: "javascript:alert(1)" }],
      },
      {
        ...fixture,
        claims: [
          { text: "unsupported", kind: "sourced_fact", source_keys: [] },
        ],
      },
      { ...fixture, sources: [fixture.sources[0], fixture.sources[0]] },
      { ...fixture, summary: "x".repeat(601) },
    ])
      expect(reportSchema.safeParse(input).success).toBe(false);
  });
  it("rejects invalid dates and incorrect precision without throwing", () => {
    for (const expected_at of [
      "2026-02-30",
      "2026-99-99",
      "2026-10-09T12:00:00Z",
    ])
      expect(
        reportSchema.safeParse({
          ...fixture,
          catalysts: [{ ...fixture.catalysts[0], expected_at }],
        }).success,
      ).toBe(false);
  });
  it("requires revisions to reference a predecessor and briefs to use the chief desk", () => {
    expect(
      reportSchema.safeParse({
        ...fixture,
        report_type: "thesis_revision",
        supersedes_report_id: null,
      }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({ ...fixture, report_type: "morning_brief" })
        .success,
    ).toBe(false);
  });
  it("does not let a disagreement cite an unrelated report", () => {
    expect(
      reportSchema.safeParse({
        ...fixture,
        desk_slug: "chief_of_staff",
        report_type: "morning_brief",
        disagreements: [
          {
            report_ids: [id, demoReports[0].id],
            explanation: "Different views",
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("deduplicates canonical reports after reconnect recovery", () => {
    expect(
      uniqueReports([demoReports[0], demoReports[1], demoReports[0]]),
    ).toHaveLength(2);
  });
});
describe("quote provenance and availability", () => {
  it("distinguishes delayed, stale, closed and unavailable states", () => {
    const now = Date.parse(demoQuotes[0].quote_time!);
    expect(quoteState(demoQuotes[0], now)).toBe("delayed");
    expect(quoteState(demoQuotes[0], now + 2000000)).toBe("stale");
    expect(quoteState(demoQuotes[1], now + 20000000)).toBe("closed");
    expect(quoteState(demoQuotes[3], now)).toBe("unavailable");
    expect(quoteState({ ...demoQuotes[2], price: 0 }, now)).toBe("live");
  });
  it("never substitutes instruments or returns fake zeroes from an unconfigured provider", async () => {
    const s = new UnconfiguredQuoteService();
    expect(await s.resolve()).toBeNull();
    const rows = await s.current(demoAssets);
    expect(
      rows.every(
        (q) =>
          q.price === null && q.entitlement === "unavailable" && !q.is_demo,
      ),
    ).toBe(true);
  });
});
