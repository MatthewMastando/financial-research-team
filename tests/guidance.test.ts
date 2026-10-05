import { describe, expect, it } from "vitest";
import { emptySetup, setupExpired, tradeSetupSchema } from "../shared/guidance";
import { reportSchema } from "../shared/report";
import { demoReports } from "../src/lib/demo";
const { id, received_at, is_current, ...base } = demoReports[1];
const legacy = {
  ...base,
  assets: base.assets.map(({ positioning, trade_setup, ...a }) => a),
};
describe("explicit research guidance", () => {
  it("preserves old report bytes and absent optional fields for retries", () => {
    const parsed = reportSchema.parse(legacy);
    expect(parsed).toEqual(legacy);
    expect(Object.hasOwn(parsed.assets[0], "positioning")).toBe(false);
    expect(Object.hasOwn(parsed.assets[0], "trade_setup")).toBe(false);
  });
  it("rejects incomplete ready setups but retains conditional and invalidated ideas", () => {
    expect(
      tradeSetupSchema.safeParse({ ...emptySetup, status: "ready" }).success,
    ).toBe(false);
    expect(
      tradeSetupSchema.safeParse({ ...emptySetup, status: "conditional" })
        .success,
    ).toBe(true);
    expect(
      tradeSetupSchema.safeParse({ ...emptySetup, status: "invalidated" })
        .success,
    ).toBe(true);
  });
  it("does not turn background mentions into actionable guidance", () => {
    expect(
      reportSchema.safeParse({
        ...base,
        assets: [{ ...base.assets[0], relationship: "context" }],
      }).success,
    ).toBe(false);
  });
  it("allows tactical direction to differ from the broader bias without merging them", () => {
    expect(
      reportSchema.safeParse({
        ...base,
        assets: [
          {
            ...base.assets[0],
            trade_setup: { ...base.assets[0].trade_setup!, direction: "short" },
          },
        ],
      }).success,
    ).toBe(true);
  });
  it("checks ready expiry against the research time using actual instants", () => {
    const ready = {
      ...emptySetup,
      status: "ready",
      direction: "long",
      entry_condition: "Confirm",
      stop_loss: "Limit",
      targets: ["Target"],
      sizing_guidance: "Risk budget",
      invalidation: "Failure",
      instructions: "Wait for confirmation",
      valid_until: "2026-10-04T09:00:00+02:00",
    };
    expect(
      reportSchema.safeParse({
        ...base,
        researched_at: "2026-10-04T08:00:00Z",
        assets: [{ ...base.assets[0], trade_setup: ready }],
      }).success,
    ).toBe(false);
    expect(
      setupExpired(
        { ...emptySetup, valid_until: "2026-10-04T09:00:00+02:00" },
        Date.parse("2026-10-04T08:00:00Z"),
      ),
    ).toBe(true);
  });
});
