import { z } from "zod";

const note = z.string().trim().min(1).max(1000);
export const positioningSchema = z
  .object({
    stance: z.enum([
      "long_bias",
      "short_bias",
      "neutral",
      "avoid",
      "watch_only",
    ]),
    action: z.enum(["initiate", "add", "reduce", "exit", "hold", "wait"]),
    rationale: note,
  })
  .strict();
export const setupStatuses = [
  "idea",
  "conditional",
  "ready",
  "invalidated",
  "closed",
] as const;
export const tradeSetupSchema = z
  .object({
    direction: z.enum(["long", "short"]).nullable(),
    status: z.enum(setupStatuses),
    timeframe: note.nullable(),
    entry_condition: note.nullable(),
    entry_zone: note.nullable(),
    stop_loss: note.nullable(),
    targets: z.array(note).max(20),
    sizing_guidance: note.nullable(),
    invalidation: note.nullable(),
    instructions: z.string().trim().min(1).max(8000).nullable(),
    valid_until: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.status !== "ready") return;
    for (const key of [
      "direction",
      "entry_condition",
      "stop_loss",
      "sizing_guidance",
      "invalidation",
      "instructions",
    ] as const)
      if (!s[key])
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Ready setups require this field",
        });
    if (!s.targets.length)
      ctx.addIssue({
        code: "custom",
        path: ["targets"],
        message: "Ready setups require a target",
      });
  });
export type Positioning = z.infer<typeof positioningSchema>;
export type TradeSetup = z.infer<typeof tradeSetupSchema>;
export type AssetGuidance = {
  asset_id: string;
  asset_key: string;
  report_id: string;
  report_title: string;
  desk_slug: string;
  researched_at: string;
  received_at: string;
  time_horizon: string;
  positioning: Positioning | null;
  trade_setup: TradeSetup | null;
  reason: string;
  thesis: string | null;
  invalidation: string | null;
};
export type PersonalPlan = {
  asset_id: string;
  revision: number;
  plan: TradeSetup;
  created_at: string;
};
export const stanceLabels: Record<Positioning["stance"], string> = {
  long_bias: "Long bias",
  short_bias: "Short bias",
  neutral: "Neutral",
  avoid: "Avoid",
  watch_only: "Watch only",
};
export const actionLabels: Record<Positioning["action"], string> = {
  initiate: "Initiate",
  add: "Add",
  reduce: "Reduce",
  exit: "Exit",
  hold: "Hold",
  wait: "Wait for trigger",
};
export function conflictingViews(rows: AssetGuidance[]) {
  const stances = new Set(rows.map((g) => g.positioning?.stance));
  return stances.has("long_bias") && stances.has("short_bias");
}
export function setupExpired(setup: TradeSetup, now = Date.now()) {
  return Boolean(
    setup.status !== "closed" &&
    setup.status !== "invalidated" &&
    setup.valid_until &&
    Date.parse(setup.valid_until) <= now,
  );
}
export const emptySetup: TradeSetup = {
  direction: null,
  status: "idea",
  timeframe: null,
  entry_condition: null,
  entry_zone: null,
  stop_loss: null,
  targets: [],
  sizing_guidance: null,
  invalidation: null,
  instructions: null,
  valid_until: null,
};
