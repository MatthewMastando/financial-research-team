import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deskNames } from "../../shared/report";
import {
  actionLabels,
  stanceLabels,
  conflictingViews,
  emptySetup,
  setupExpired,
  setupStatuses,
  tradeSetupSchema,
  type AssetGuidance,
  type PersonalPlan,
  type TradeSetup,
} from "../../shared/guidance";
import type { Instrument } from "../../shared/quotes";
import * as data from "../lib/data";

export function useGuidance(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["guidance", sorted],
    queryFn: () => data.assetGuidance(sorted),
    enabled: sorted.length > 0,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
}
export function usePersonalPlans(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["personal-plans", sorted],
    queryFn: () => data.personalTradePlans(sorted),
    enabled: sorted.length > 0,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
}
function useTime() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: data.settings });
  return (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: settings.data?.timezone ?? "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(value));
}
export function SetupDetails({ setup }: { setup: TradeSetup }) {
  const fmt = useTime();
  return (
    <div className="setup-details">
      <div className="guidance-badges">
        <span
          className={`tag ${setup.direction === "long" ? "position-long" : setup.direction === "short" ? "position-short" : "muted"}`}
        >
          {setup.direction
            ? setup.direction === "long"
              ? "Long setup"
              : "Short setup"
            : "Direction not specified"}
        </span>
        <span className="tag">
          {setupExpired(setup) ? "Expired" : setup.status}
        </span>
      </div>
      <dl className="setup-grid">
        {(
          [
            ["Timeframe", setup.timeframe],
            ["Entry trigger", setup.entry_condition],
            ["Entry zone", setup.entry_zone],
            ["Stop / risk limit", setup.stop_loss],
            ["Targets", setup.targets.join("\n") || null],
            ["Sizing guidance", setup.sizing_guidance],
            ["Invalidation", setup.invalidation],
            ["Valid until", setup.valid_until ? fmt(setup.valid_until) : null],
          ] as const
        ).map(([title, value]) => (
          <div key={title}>
            <dt>{title}</dt>
            <dd className={value ? "" : "muted"}>{value ?? "Not specified"}</dd>
          </div>
        ))}
      </dl>
      <div className="setup-instructions">
        <h4>Trade setup instructions</h4>
        <p className={setup.instructions ? "" : "muted"}>
          {setup.instructions ?? "No explicit instructions submitted."}
        </p>
      </div>
      {setup.status === "ready" && (
        <small className="muted">
          Ready is the author’s assessment at the stated time. Entry conditions
          are not checked against live prices.
        </small>
      )}
    </div>
  );
}
export function GuidanceList({
  rows,
  compact = false,
  historical = false,
}: {
  rows: AssetGuidance[];
  compact?: boolean;
  historical?: boolean;
}) {
  const fmt = useTime();
  return (
    <div className={`guidance-list ${compact ? "guidance-compact" : ""}`}>
      {conflictingViews(rows) && (
        <p className="guidance-conflict">
          <strong>Opposing desk views</strong> · review each desk’s conditions.
        </p>
      )}
      {!rows.length && (
        <p className="guidance-missing">
          Positioning not specified
          <span>No current desk guidance for this asset.</span>
        </p>
      )}
      {rows.map((g) => (
        <section className="desk-guidance" key={g.report_id + g.asset_id}>
          <div className="guidance-source">
            <strong>{deskNames[g.desk_slug] ?? g.desk_slug}</strong>
            <span>
              {g.time_horizon.replaceAll("_", " ")} · {fmt(g.researched_at)}
            </span>
          </div>
          <div className="guidance-badges">
            <span
              className={`tag ${g.positioning ? "position-" + g.positioning.stance : "muted"}`}
            >
              {g.positioning
                ? stanceLabels[g.positioning.stance]
                : "Positioning not specified"}
            </span>
            {g.positioning && (
              <span className="tag position-action">
                {actionLabels[g.positioning.action]}
              </span>
            )}
            {g.trade_setup?.direction && (
              <span className={`tag position-${g.trade_setup.direction}`}>
                {g.trade_setup.direction === "long"
                  ? "Long setup"
                  : "Short setup"}
              </span>
            )}
            {g.trade_setup && (
              <span className="tag">
                {setupExpired(g.trade_setup)
                  ? "Expired setup"
                  : g.trade_setup.status + " setup"}
              </span>
            )}
            {historical && <span className="tag">Historical guidance</span>}
          </div>
          {g.positioning && <p>{g.positioning.rationale}</p>}
          {!compact &&
            (g.trade_setup ? (
              <details className="setup-disclosure">
                <summary>Trade setup instructions</summary>
                <SetupDetails setup={g.trade_setup} />
              </details>
            ) : (
              <p className="guidance-missing">
                Trade setup not specified
                <span>
                  Entry, risk limits and targets were not submitted as a
                  structured setup.
                </span>
              </p>
            ))}
          <Link
            to={`/research/${g.report_id}`}
            className="guidance-report"
            title={g.report_title}
          >
            Read source report →
          </Link>
        </section>
      ))}
    </div>
  );
}
export function PersonalPlanSummary({
  plan,
  assetId,
}: {
  plan?: PersonalPlan;
  assetId: string;
}) {
  return (
    <Link to={`/assets/${assetId}#your-plan`} className="personal-plan-link">
      {plan
        ? `Your plan · ${plan.plan.direction ?? "direction unspecified"} · ${setupExpired(plan.plan) ? "expired" : plan.plan.status}`
        : "Add your trade plan"}{" "}
      →
    </Link>
  );
}
const textFields = [
  ["timeframe", "Timeframe"],
  ["entry_condition", "Entry trigger"],
  ["entry_zone", "Entry zone"],
  ["stop_loss", "Stop / risk limit"],
  ["sizing_guidance", "Sizing guidance"],
  ["invalidation", "Invalidation"],
  ["instructions", "Trade setup instructions"],
] as const;
function PlanForm({
  assetId,
  previous,
  onClose,
}: {
  assetId: string;
  previous?: PersonalPlan;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<TradeSetup>(
    previous?.plan ?? { ...emptySetup },
  );
  const [expectedRevision] = useState(previous?.revision ?? 0);
  const [targets, setTargets] = useState(plan.targets.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (next: TradeSetup) =>
      data.savePersonalPlan(assetId, expectedRevision, next),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["personal-plans"] });
      onClose();
    },
    onError: (err: any) => {
      setError(
        err?.code === "40001" || err?.code === "23505"
          ? "A newer plan was saved. Cancel and reopen the editor to load it; your changes have not been saved."
          : "Your plan wasn’t saved. Check your connection and try again.",
      );
      qc.invalidateQueries({ queryKey: ["personal-plans"] });
    },
  });
  return (
    <form
      className="plan-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const result = tradeSetupSchema.safeParse({
          ...plan,
          targets: targets
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean),
        });
        if (!result.success) {
          setError(
            result.error.issues
              .map(
                (i) => `${i.path.join(" ").replaceAll("_", " ")}: ${i.message}`,
              )
              .join(". "),
          );
          return;
        }
        if (result.data.status === "ready" && setupExpired(result.data)) {
          setError("A ready plan cannot already have expired.");
          return;
        }
        save.mutate(result.data);
      }}
    >
      <p className="muted">
        Editing from revision {expectedRevision}. A newer saved revision will
        require reloading the editor.
      </p>
      <div className="setup-grid">
        <label>
          Direction
          <select
            value={plan.direction ?? ""}
            onChange={(e) =>
              setPlan({
                ...plan,
                direction: (e.target.value || null) as TradeSetup["direction"],
              })
            }
          >
            <option value="">Not specified</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <label>
          Setup status
          <select
            value={plan.status}
            onChange={(e) =>
              setPlan({
                ...plan,
                status: e.target.value as TradeSetup["status"],
              })
            }
          >
            {setupStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {textFields.map(([key, title]) => (
          <label
            className={key === "instructions" ? "full-field" : ""}
            key={key}
          >
            {title}
            <textarea
              rows={key === "instructions" ? 5 : 2}
              maxLength={key === "instructions" ? 8000 : 1000}
              value={plan[key] ?? ""}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  [key]: e.target.value.trim() ? e.target.value : null,
                })
              }
            />
          </label>
        ))}
        <label>
          Targets (one per line)
          <textarea
            rows={3}
            maxLength={20020}
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
          />
        </label>
        <label>
          Valid until (ISO date and time)
          <input
            placeholder="2026-10-09T20:00:00Z"
            value={plan.valid_until ?? ""}
            maxLength={40}
            onChange={(e) =>
              setPlan({ ...plan, valid_until: e.target.value || null })
            }
          />
        </label>
      </div>
      <p className="muted">
        Use Idea or Conditional while details are incomplete. Ready requires a
        direction, entry trigger, stop, targets, sizing, invalidation and
        instructions.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="watch-actions">
        <button type="submit" disabled={save.isPending}>
          Save your plan
        </button>
        <button
          type="button"
          className="subtle"
          disabled={save.isPending}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
export function PersonalPlanEditor({ asset }: { asset: Instrument }) {
  const q = usePersonalPlans([asset.id]);
  const [editing, setEditing] = useState(false);
  const plan = q.data?.[0];
  const fmt = useTime();
  return (
    <section className="personal-plan" id="your-plan">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your instructions</p>
          <h2>Your trade plan</h2>
        </div>
        {!editing && !q.isPending && !q.isError && (
          <button
            className="subtle"
            onClick={() => {
              setEditing(true);
            }}
          >
            {plan ? "Edit your plan" : "Create your plan"}
          </button>
        )}
      </div>
      <p className="muted">
        Saved separately from the research bots. Plans are available even
        without a live price.
      </p>
      {editing ? (
        <PlanForm
          assetId={asset.id}
          previous={plan}
          onClose={() => setEditing(false)}
        />
      ) : q.isPending ? (
        <p role="status">Loading your plan…</p>
      ) : q.isError ? (
        <div role="alert">
          <p>Your plan could not be loaded.</p>
          <button onClick={() => q.refetch()}>Try again</button>
        </div>
      ) : plan ? (
        <>
          <small className="muted">
            Your plan · Revision {plan.revision} · Saved {fmt(plan.created_at)}
          </small>
          <SetupDetails setup={plan.plan} />
        </>
      ) : (
        <p className="guidance-missing">No personal plan saved.</p>
      )}
    </section>
  );
}
