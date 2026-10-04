import {
  useEffect,
  useLayoutEffect,
  useState,
  lazy,
  Suspense,
  type ReactNode,
  Component,
} from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  Compass,
  ExternalLink,
  Globe2,
  Layers,
  LayoutDashboard,
  LogOut,
  Pin,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
const SafeMarkdown = lazy(() => import("./components/Markdown"));
import {
  desks,
  deskNames,
  reportTypes,
  safeUrl,
  type Report,
} from "../shared/report";
import { quoteState, type Instrument, type Quote } from "../shared/quotes";
import * as data from "./lib/data";
import { useAuth } from "./lib/auth";

const deskClass = (s: string) => `desk-${s}`;
const label = (s: string) => s.replaceAll("_", " ");
const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: data.settings });
function useTime() {
  const { data: s } = useSettings();
  return (v: string, kind: "short" | "full" = "short") =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: s?.timezone ?? "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...(kind === "full"
        ? { year: "numeric", timeZoneName: "short" as const }
        : {}),
    }).format(new Date(v));
}
function Tag({
  children,
  kind = "muted",
}: {
  children: ReactNode;
  kind?: string;
}) {
  return <span className={`tag ${kind}`}>{children}</span>;
}
function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Compass size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function LoadState({
  query,
  children,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  children: ReactNode;
}) {
  if (query.isPending)
    return (
      <div className="skeleton" aria-label="Loading" role="status">
        <span />
        <span />
        <span />
      </div>
    );
  if (query.isError)
    return (
      <div className="empty error" role="alert">
        <h3>We couldn’t load this section</h3>
        <p>Check your connection and try again.</p>
        <button onClick={() => query.refetch()}>Try again</button>
      </div>
    );
  return children;
}
function MutationError({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="error">
      Your change wasn’t saved. Please try again.
    </p>
  ) : null;
}
function DeskMark({ slug }: { slug: string }) {
  return (
    <span className={`desk-mark ${deskClass(slug)}`}>
      {slug === "chief_of_staff" ? (
        <Sparkles size={16} />
      ) : slug === "macro" ? (
        <Globe2 size={16} />
      ) : slug === "commodities" ? (
        <Layers size={16} />
      ) : slug === "equities" ? (
        <Activity size={16} />
      ) : (
        <span>₿</span>
      )}
    </span>
  );
}
function QuoteValue({ q, compact = false }: { q?: Quote; compact?: boolean }) {
  const format = useTime();
  const state = q ? quoteState(q) : "unavailable";
  const price =
    q?.price === null || q?.price === undefined
      ? "Unavailable"
      : new Intl.NumberFormat("en-US", {
          maximumFractionDigits: q.price < 10 ? 4 : 2,
          minimumFractionDigits: 2,
        }).format(q.price);
  return (
    <div className={`quote ${compact ? "compact" : ""}`}>
      <div className="quote-price">
        {price}
        {!compact && q?.currency && q.price !== null && (
          <small>{q.currency}</small>
        )}
      </div>
      {q?.change_percent !== null && q?.change_percent !== undefined && (
        <span className={q.change_percent >= 0 ? "up" : "down"}>
          {q.change_percent >= 0 ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )}{" "}
          {Math.abs(q.change_percent).toFixed(2)}%
        </span>
      )}
      <small className="quote-status">
        {q?.is_demo ? "Demo · " : ""}
        {state}
        {!compact && q?.quote_time ? ` · ${format(q.quote_time)}` : ""}
      </small>
      {!compact && q?.change_basis && <small>{label(q.change_basis)}</small>}
      {!compact && q?.provider && (
        <small>
          {q.provider}
          {q.provider_venue ? ` · ${q.provider_venue}` : ""}
        </small>
      )}
      {!compact && q?.coverage_note && <small>{q.coverage_note}</small>}
      {!compact && q?.unavailable_reason && (
        <small>{q.unavailable_reason}</small>
      )}
    </div>
  );
}
function useAssets() {
  return useQuery({ queryKey: ["assets"], queryFn: data.assets });
}
function useQuotes(instruments: Instrument[]) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["quotes", instruments.map((a) => a.id)],
    queryFn: async () => {
      const result = await data.quoteSnapshot(instruments.map((a) => a.id));
      qc.setQueryData(["quote-health"], result.health);
      return result;
    },
    enabled: instruments.length > 0,
    staleTime: 600000,
    // A concurrent screen can arrive during the first shared cache fill.
    // Retry that unavailable result soon; server reservations still cap API use.
    refetchInterval: (query) =>
      query.state.data?.quotes.some(
        (q) =>
          q.unavailable_reason ===
          "Refresh pending or provider request limit reached",
      )
        ? 15000
        : 600000,
    refetchIntervalInBackground: false,
  });
  return { ...query, data: query.data?.quotes };
}
function useQuoteHealth() {
  return useQuery({
    queryKey: ["quote-health"],
    queryFn: async () => (await data.quoteSnapshot([])).health,
    staleTime: 600000,
    refetchInterval: 600000,
    refetchIntervalInBackground: false,
  });
}
function Ticker() {
  const a = useAssets();
  const q = useQuotes(a.data ?? []);
  return (
    <div className="ticker" aria-label="Market price ticker">
      {a.data?.map((asset) => (
        <Link to={`/assets/${asset.id}`} key={asset.id}>
          <span className="ticker-symbol">{asset.symbol}</span>
          <QuoteValue
            compact
            q={q.data?.find((x) => x.asset_id === asset.id)}
          />
        </Link>
      ))}
      {a.isError && <span>Instrument list unavailable</span>}
      {q.isError && <span className="error">Quote connection unavailable</span>}
    </div>
  );
}
function ReportCard({
  report: r,
  small = false,
}: {
  report: Report;
  small?: boolean;
}) {
  const fmt = useTime();
  return (
    <article className={`report-card ${small ? "small" : ""}`}>
      <div className="report-meta">
        <DeskMark slug={r.desk_slug} />
        <span>{deskNames[r.desk_slug]}</span>
        <span className="spacer" />
        {r.importance !== "normal" && (
          <Tag kind={r.importance}>{r.importance}</Tag>
        )}
        {!r.is_current && <Tag>Superseded</Tag>}
        {r.retracted && <Tag kind="urgent">Retracted</Tag>}
      </div>
      <Link className="report-title" to={`/research/${r.id}`}>
        <h3>{r.title}</h3>
      </Link>
      <p className="report-summary">{r.summary}</p>
      <div className="report-foot">
        <span>Researched {fmt(r.researched_at)}</span>
        {r.assets.slice(0, 3).map((a) => (
          <Link
            to={`/research?asset=${encodeURIComponent(a.asset_key)}`}
            className="asset-tag"
            key={a.asset_key}
          >
            {a.asset_key.split(":").at(-1)}
          </Link>
        ))}
        <Link
          aria-label={`Read ${r.title}`}
          to={`/research/${r.id}`}
          className="read-arrow"
        >
          <ArrowRight size={17} />
        </Link>
      </div>
      {r.is_demo && (
        <span className="demo-caption">Synthetic research example</span>
      )}
    </article>
  );
}
function DeskHealth() {
  const s = useQuery({ queryKey: ["desks"], queryFn: data.deskStatus });
  const fmt = useTime();
  return (
    <div className="desk-health">
      <SectionHeading
        title="Desk coverage"
        action={
          <Link to="/settings" className="text-link">
            Manage <ArrowRight size={14} />
          </Link>
        }
      />
      <LoadState query={s}>
        <div className="desk-grid">
          {s.data?.map((d) => (
            <div key={d.slug}>
              <DeskMark slug={d.slug} />
              <div>
                <strong>{deskNames[d.slug]}</strong>
                <small>
                  {d.latest
                    ? `Received ${fmt(d.latest)}`
                    : "No research received"}
                </small>
                <span
                  className={`coverage-status ${d.run?.status === "failed" ? "error" : ""}`}
                >
                  {data.isDemo
                    ? "Demo coverage"
                    : d.run?.status === "failed"
                      ? "Run failed"
                      : d.run?.status === "started"
                        ? "Run started"
                        : d.expected_cadence === "Unconfigured"
                          ? "Schedule unconfigured"
                          : d.latest &&
                              Date.now() - Date.parse(d.latest) > 86400000
                            ? "Coverage stale"
                            : "Received"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </LoadState>
    </div>
  );
}
function Catalysts({ reports }: { reports: Report[] }) {
  const fmt = useTime();
  const all = reports
    .filter((r) => r.is_current)
    .flatMap((r) => r.catalysts.map((c, i) => ({ ...c, report: r, index: i })))
    .filter(
      (c) =>
        !c.expected_at ||
        new Date(c.expected_at).getTime() >= Date.now() - 86400000,
    );
  return (
    <section className="catalysts">
      <SectionHeading title="Upcoming catalysts" />
      {all.length ? (
        all.slice(0, 8).map((c) => (
          <Link
            to={`/research/${c.report.id}`}
            key={c.report.id + c.index}
            className="catalyst"
          >
            <div className="catalyst-date">
              {c.timing_precision === "date"
                ? c.expected_at
                : c.expected_at
                  ? fmt(c.expected_at)
                  : "Timing unknown"}
              <small>
                {c.timing_precision === "date"
                  ? "Date only"
                  : label(c.timing_precision)}
              </small>
            </div>
            <div>
              <strong>{c.title}</strong>
              <small>
                {deskNames[c.report.desk_slug]}
                {c.report.is_demo ? " · Synthetic" : ""}
              </small>
            </div>
            <ArrowRight size={15} />
          </Link>
        ))
      ) : (
        <p className="muted">No upcoming catalysts in recent research.</p>
      )}
    </section>
  );
}
function Overview() {
  const q = useQuery({
    queryKey: ["overview"],
    queryFn: () => data.reports({}, null, 30),
  });
  const briefs = useQuery({
    queryKey: ["brief"],
    queryFn: () => data.reports({ desk: "chief_of_staff" }, null, 1),
  });
  const fmt = useTime();
  const brief = briefs.data?.[0];
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">Your research, in perspective</p>
        <h1>
          The morning perspective<span className="accent">.</span>
        </h1>
        <p>
          Independent desks. Connected evidence. A clearer view of what matters.
        </p>
      </div>
      <LoadState query={briefs}>
        {brief ? (
          <section className="brief-card">
            <div className="brief-top">
              <span className="chief-label">
                <Sparkles size={17} /> CHIEF OF STAFF
              </span>
              <Tag kind="accent-tag">Morning brief</Tag>
            </div>
            <Link to={`/research/${brief.id}`}>
              <h2>{brief.title}</h2>
            </Link>
            <p>{brief.summary}</p>
            <div className="brief-coverage">
              {desks
                .filter((d) => d !== "chief_of_staff")
                .map((d) => (
                  <span
                    key={d}
                    className={brief.missing_desks.includes(d) ? "missing" : ""}
                  >
                    {brief.missing_desks.includes(d) ? (
                      <X size={13} />
                    ) : (
                      <Check size={13} />
                    )}{" "}
                    {d === "macro"
                      ? "Macro"
                      : d === "commodities"
                        ? "Commodities"
                        : d === "equities"
                          ? "Equities"
                          : "Crypto"}
                    {brief.missing_desks.includes(d) ? " · absent" : ""}
                  </span>
                ))}
            </div>
            <div className="brief-footer">
              <span>
                {fmt(brief.received_at)} · {brief.related_report_ids.length}{" "}
                linked reports{brief.is_demo ? " · Synthetic brief" : ""}
              </span>
              <Link to={`/research/${brief.id}`} className="text-link">
                Read the brief <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        ) : (
          <Empty title="Your first brief starts here">
            The Chief of Staff brief will appear after it is submitted.
          </Empty>
        )}
      </LoadState>
      <SectionHeading
        eyebrow="Across the desks"
        title="Material developments"
        action={
          <Link className="text-link" to="/research">
            All research <ArrowRight size={16} />
          </Link>
        }
      />
      <LoadState query={q}>
        {q.data?.length ? (
          <div className="developments">
            {q.data
              .filter((r) => r.desk_slug !== "chief_of_staff" && r.is_current)
              .slice(0, 4)
              .map((r) => (
                <ReportCard key={r.id} report={r} small />
              ))}
          </div>
        ) : (
          <Empty title="Research will appear here">
            Connect a desk and submit its first report to begin the archive.
          </Empty>
        )}
      </LoadState>
      <Catalysts reports={q.data ?? []} />
      <DeskHealth />
    </>
  );
}
function useArrivals(
  head: Report | undefined,
  filters: data.Filter,
  ready: boolean,
) {
  const [pending, setPending] = useState(false);
  const qc = useQueryClient();
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setPending(false);
    if (!ready || data.isDemo || !data.db) return;
    let alive = true;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      data
        .reports(filters, null, 1)
        .then((rs) => {
          if (
            alive &&
            rs[0] &&
            (!head ||
              rs[0].received_at > head.received_at ||
              (rs[0].received_at === head.received_at && rs[0].id > head.id))
          )
            setPending(true);
        })
        .catch(() => {});
    };
    const channel = data.db
      .channel("research-arrivals")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reports" },
        () => {
          check();
          qc.invalidateQueries({ queryKey: ["desks"] });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") check();
      });
    const timer = window.setInterval(check, 30000);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
      void data.db!.removeChannel(channel);
    };
  }, [head?.id, filterKey, ready, qc]);
  return { pending, clear: () => setPending(false) };
}
function Research() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(
    [...params].filter(
      ([k, v]) =>
        ["q", "desk", "asset", "type", "importance", "from", "to"].includes(
          k,
        ) && v,
    ),
  );
  const [draft, setDraft] = useState(params.get("q") ?? "");
  const [advanced, setAdvanced] = useState(
    Boolean(
      params.get("type") ||
      params.get("importance") ||
      params.get("from") ||
      params.get("to"),
    ),
  );
  const a = useAssets();
  const q = useInfiniteQuery({
    queryKey: ["feed", filters],
    initialPageParam: null as data.Cursor | null,
    queryFn: ({ pageParam }) => data.reports(filters, pageParam, 30),
    getNextPageParam: (last) =>
      last.length === 30
        ? { id: last.at(-1)!.id, received_at: last.at(-1)!.received_at }
        : undefined,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const arrivals = useArrivals(q.data?.pages[0]?.[0], filters, q.isSuccess);
  const qc = useQueryClient();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p);
  };
  useEffect(() => setDraft(params.get("q") ?? ""), [params]);
  const all = data.uniqueReports(q.data?.pages.flat() ?? []);
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">The permanent record</p>
        <h1>Research</h1>
        <p>Explore the evidence. Follow a thesis through time.</p>
      </div>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          set("q", draft);
        }}
      >
        <Search size={19} />
        <input
          aria-label="Search research"
          placeholder="Search the research archive…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
        />
        <button type="submit">Search</button>
      </form>
      <div className="filter-row">
        <label>
          <span>Desk</span>
          <select
            aria-label="Desk"
            value={params.get("desk") ?? ""}
            onChange={(e) => set("desk", e.target.value)}
          >
            <option value="">All desks</option>
            {desks.map((d) => (
              <option key={d} value={d}>
                {deskNames[d]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Asset</span>
          <select
            aria-label="Asset"
            value={params.get("asset") ?? ""}
            onChange={(e) => set("asset", e.target.value)}
          >
            <option value="">All assets</option>
            {a.data?.map((a) => (
              <option key={a.id} value={a.asset_key}>
                {a.symbol}
              </option>
            ))}
          </select>
        </label>
        <button
          className="subtle"
          onClick={() => setAdvanced(!advanced)}
          aria-expanded={advanced}
        >
          <SlidersHorizontal size={16} /> Filters
        </button>
        {params.size > 0 && (
          <button className="text-link" onClick={() => setParams({})}>
            Clear
          </button>
        )}
      </div>
      {advanced && (
        <div className="advanced-filters">
          <label>
            Report type
            <select
              value={params.get("type") ?? ""}
              onChange={(e) => set("type", e.target.value)}
            >
              <option value="">All types</option>
              {reportTypes.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Importance
            <select
              value={params.get("importance") ?? ""}
              onChange={(e) => set("importance", e.target.value)}
            >
              <option value="">All levels</option>
              {["normal", "elevated", "urgent"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={params.get("from") ?? ""}
              onChange={(e) => set("from", e.target.value)}
            />
          </label>
          <label>
            Through
            <input
              type="date"
              value={params.get("to") ?? ""}
              onChange={(e) => set("to", e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="feed-caption">
        <span>Latest received first · all revisions included</span>
        <span>{all.length} loaded</span>
      </div>
      {arrivals.pending && (
        <button
          className="new-updates"
          onClick={async () => {
            await qc.resetQueries({ queryKey: ["feed", filters] });
            arrivals.clear();
          }}
        >
          <ArrowUp size={16} /> New updates · refresh feed
        </button>
      )}
      <LoadState query={q}>
        {all.length ? (
          <div className="feed">
            {all.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        ) : (
          <Empty title="No matching research">
            Try another search or clear the filters.
          </Empty>
        )}
      </LoadState>
      {q.hasNextPage && (
        <button
          className="load-more"
          disabled={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
        >
          {q.isFetchingNextPage ? "Loading…" : "Load earlier research"}
        </button>
      )}
    </>
  );
}
function Reader() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ["report", id],
    queryFn: () => data.getReport(id!),
  });
  const h = useQuery({
    queryKey: ["history", id],
    queryFn: () => data.history(id!),
  });
  const fmt = useTime();
  const r = q.data;
  return (
    <>
      <Link
        to="/research"
        onClick={(e) => {
          if (window.history.state?.idx > 0) {
            e.preventDefault();
            window.history.back();
          }
        }}
        className="back-link"
      >
        <ArrowLeft size={16} /> Back to research
      </Link>
      <LoadState query={q}>
        {r ? (
          <article className="reader">
            <div className="report-meta">
              <DeskMark slug={r.desk_slug} />
              {deskNames[r.desk_slug]}
              <Tag kind={r.importance}>{r.importance}</Tag>
              {!r.is_current && <Tag>Superseded</Tag>}
              {r.retracted && <Tag kind="urgent">Retracted</Tag>}
            </div>
            <h1>{r.title}</h1>
            <p className="reader-summary">{r.summary}</p>
            <div className="reader-times">
              <span>Researched {fmt(r.researched_at, "full")}</span>
              <span>Received {fmt(r.received_at, "full")}</span>
              <span>Horizon · {label(r.time_horizon)}</span>
            </div>
            {r.is_demo && (
              <div className="notice">
                Synthetic report. This content is for demonstration, not a
                market recommendation.
              </div>
            )}
            {r.retracted && (
              <div className="notice">
                Retracted:{" "}
                {r.retraction_reason ?? "Reason recorded in report history"}
              </div>
            )}
            <section className="changed">
              <p className="eyebrow">What changed</p>
              <p>{r.what_changed}</p>
              <small>{r.importance_reason}</small>
            </section>
            <Suspense fallback={<p role="status">Loading report text…</p>}>
              <SafeMarkdown>{r.body_markdown}</SafeMarkdown>
            </Suspense>
            {r.thesis && (
              <section>
                <h2>The thesis</h2>
                <p>{r.thesis}</p>
                {r.invalidation && (
                  <div className="invalidation">
                    <strong>What would invalidate it</strong>
                    <p>{r.invalidation}</p>
                  </div>
                )}
              </section>
            )}
            <section>
              <h2>Risks & limitations</h2>
              <ul>
                {r.risks.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              {r.evidence_gap && (
                <div className="notice">Evidence gap: {r.evidence_gap}</div>
              )}
            </section>
            <section>
              <h2>Claims & evidence</h2>
              {r.claims.map((c, i) => (
                <div className="claim" key={i}>
                  <Tag>{label(c.kind)}</Tag>
                  <p>{c.text}</p>
                  <small>
                    {c.source_keys
                      .map(
                        (k) => r.sources.find((s) => s.source_key === k)?.title,
                      )
                      .join(" · ") || "No linked source"}
                  </small>
                </div>
              ))}
            </section>
            <section>
              <h2>Sources</h2>
              {r.sources.map((s) => (
                <div key={s.source_key} className="source">
                  <a
                    href={safeUrl.safeParse(s.url).success ? s.url : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.title}
                    <ExternalLink size={14} />
                  </a>
                  <small>
                    {s.published_at
                      ? `Published ${fmt(s.published_at)}`
                      : "Publication date unknown"}{" "}
                    · Accessed {fmt(s.accessed_at)}
                  </small>
                </div>
              ))}
              {!r.sources.length && (
                <p className="muted">
                  Evidence is recorded through linked reports or the stated gap.
                </p>
              )}
            </section>
            {r.related_report_ids.length > 0 && (
              <section>
                <h2>Underlying research</h2>
                {r.related_report_ids.map((id) => (
                  <EvidenceLink key={id} id={id} />
                ))}
              </section>
            )}
            {r.disagreements.length > 0 && (
              <section>
                <h2>Desk disagreements</h2>
                {r.disagreements.map((d, i) => (
                  <div key={i}>
                    <p>{d.explanation}</p>
                    {d.report_ids.map((id) => (
                      <EvidenceLink id={id} key={id} />
                    ))}
                  </div>
                ))}
              </section>
            )}
            {r.missing_desks.length > 0 && (
              <div className="notice">
                Coverage absent at synthesis cutoff:{" "}
                {r.missing_desks.map((d) => deskNames[d]).join(", ")}.
              </div>
            )}
            <section>
              <h2>Revision history</h2>
              <LoadState query={h}>
                {h.data?.map((x) => (
                  <Link
                    to={`/research/${x.id}`}
                    className="history-item"
                    key={x.id}
                  >
                    {x.title}
                    <Tag>{x.is_current ? "Current" : "Superseded"}</Tag>
                  </Link>
                ))}
              </LoadState>
            </section>
            <Catalysts reports={[r]} />
          </article>
        ) : (
          <Empty title="Report unavailable">
            This report may not exist or your account may not have access.
          </Empty>
        )}
      </LoadState>
    </>
  );
}
function EvidenceLink({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["report", id],
    queryFn: () => data.getReport(id),
  });
  return (
    <Link className="evidence-link" to={`/research/${id}`}>
      <span>
        {q.data?.title ??
          (q.isError
            ? "Report could not be loaded"
            : q.isPending
              ? "Loading report…"
              : "Report unavailable")}
      </span>
      <ArrowRight size={14} />
    </Link>
  );
}
function WatchEvidence({ id, assetKey }: { id: string; assetKey?: string }) {
  const q = useQuery({
    queryKey: ["report", id],
    queryFn: () => data.getReport(id),
  });
  const fmt = useTime();
  return (
    <>
      <EvidenceLink id={id} />
      {q.data?.is_current &&
        !q.data.retracted &&
        q.data.catalysts
          .filter(
            (c) =>
              c.asset_key === assetKey &&
              (!c.expected_at ||
                Date.parse(c.expected_at) >= Date.now() - 86400000),
          )
          .map((c, i) => (
            <p className="watch-catalyst" key={i}>
              {c.title} ·{" "}
              {c.timing_precision === "date"
                ? c.expected_at
                : c.expected_at
                  ? fmt(c.expected_at)
                  : "Timing unknown"}
            </p>
          ))}
    </>
  );
}
function Watchlist({ panel = false }: { panel?: boolean }) {
  const q = useQuery({ queryKey: ["watchlist"], queryFn: data.watchlist });
  const a = useAssets();
  const prices = useQuotes(a.data ?? []);
  const qc = useQueryClient();
  const [showDismissed, setShowDismissed] = useState(false);
  const m = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { pinned?: boolean; dismissed?: boolean };
    }) => data.changeWatch(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  const visible = q.data?.filter((e) =>
    showDismissed
      ? e.dismissed
      : !e.dismissed && (e.pinned || Date.parse(e.expires_at) > Date.now()),
  );
  return (
    <>
      {panel ? (
        <SectionHeading
          eyebrow="Research-driven"
          title="On your radar"
          action={
            <Link
              aria-label="Open watchlist"
              className="text-link"
              to="/watchlist"
            >
              <ArrowRight size={16} />
            </Link>
          }
        />
      ) : (
        <>
          <div className="page-intro">
            <p className="eyebrow">Evidence before conviction</p>
            <h1>Watchlist</h1>
            <p>
              Ideas supported by research, with room for your own priorities.
            </p>
          </div>
          <div className="tabs">
            <button
              className={!showDismissed ? "active" : ""}
              onClick={() => setShowDismissed(false)}
            >
              Active
            </button>
            <button
              className={showDismissed ? "active" : ""}
              onClick={() => setShowDismissed(true)}
            >
              Dismissed
            </button>
          </div>
        </>
      )}
      <MutationError error={m.error} />
      <LoadState query={q}>
        {visible?.length ? (
          <div className={`watch-list ${panel ? "panel-list" : ""}`}>
            {visible.slice(0, panel ? 5 : 100).map((e) => {
              const asset = a.data?.find((a) => a.id === e.asset_id);
              return (
                <article key={e.id} className="watch-item">
                  <div className="watch-top">
                    <div>
                      <Link
                        className="watch-symbol"
                        to={`/assets/${e.asset_id}`}
                      >
                        {asset?.symbol ?? "Asset"}
                        {e.pinned && <Pin size={13} />}
                      </Link>
                      <small>{asset?.name}</small>
                    </div>
                    <QuoteValue
                      q={prices.data?.find((p) => p.asset_id === e.asset_id)}
                      compact={panel}
                    />
                  </div>
                  <div className="watch-reason">
                    <Tag kind={e.pinned ? "accent-tag" : "muted"}>
                      {e.pinned ? "User pinned" : "Research suggestion"}
                    </Tag>
                    <p>{e.evidence[0]?.reason ?? "No qualifying evidence"}</p>
                    <small>
                      {[
                        ...new Set(
                          e.evidence
                            .map((x) => x.desk_slug)
                            .filter((d) => d !== "chief_of_staff"),
                        ),
                      ]
                        .map((d) => deskNames[d])
                        .join(" · ")}
                    </small>
                  </div>
                  {!panel && (
                    <div className="watch-evidence">
                      {e.evidence.map((ev) => (
                        <WatchEvidence
                          id={ev.report_id}
                          assetKey={asset?.asset_key}
                          key={ev.report_id}
                        />
                      ))}
                    </div>
                  )}
                  <div className="watch-actions">
                    <button
                      disabled={m.isPending}
                      className="text-link"
                      onClick={() =>
                        m.mutate({ id: e.id, patch: { pinned: !e.pinned } })
                      }
                    >
                      <Pin size={13} />
                      {e.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      disabled={m.isPending}
                      className="text-link muted"
                      onClick={() =>
                        m.mutate({
                          id: e.id,
                          patch: { dismissed: !e.dismissed },
                        })
                      }
                    >
                      {e.dismissed ? "Restore" : "Dismiss"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title={
              showDismissed ? "Nothing dismissed" : "No active suggestions"
            }
          >
            {showDismissed
              ? "Dismissed assets can be restored here."
              : "Substantive research suggestions will appear here."}
          </Empty>
        )}
      </LoadState>
      {prices.isError && (
        <p role="alert" className="error">
          Quote connection unavailable.
        </p>
      )}
      {panel && (
        <Link className="panel-footer text-link" to="/watchlist">
          Open watchlist <ArrowRight size={15} />
        </Link>
      )}
      {data.isDemo && (
        <p className="demo-caption">
          Synthetic watchlist · does not create production suggestions.
        </p>
      )}
    </>
  );
}
function AssetDetail() {
  const { id } = useParams();
  const a = useAssets();
  const asset = a.data?.find((x) => x.id === id);
  const quotes = useQuotes(asset ? [asset] : []);
  const q = useInfiniteQuery({
    queryKey: ["asset-research", asset?.asset_key],
    initialPageParam: null as data.Cursor | null,
    queryFn: ({ pageParam }) =>
      data.reports({ asset: asset!.asset_key }, pageParam, 30),
    getNextPageParam: (last) =>
      last.length === 30
        ? { id: last.at(-1)!.id, received_at: last.at(-1)!.received_at }
        : undefined,
    enabled: Boolean(asset),
  });
  const timeline = data.uniqueReports(q.data?.pages.flat() ?? []);
  const theses = useQuery({
    queryKey: ["asset-theses", asset?.asset_key],
    queryFn: () => data.assetTheses(asset!.asset_key),
    enabled: Boolean(asset),
  });
  const current = theses.data;
  return (
    <>
      <Link to="/watchlist" className="back-link">
        <ArrowLeft size={16} /> Watchlist
      </Link>
      <LoadState query={a}>
        {asset ? (
          <>
            <div className="asset-intro">
              <div>
                <p className="eyebrow">{label(asset.asset_class)}</p>
                <h1>{asset.symbol}</h1>
                <p>{asset.name}</p>
                <code>{asset.asset_key}</code>
                <p className="muted">
                  Venue: {asset.venue ?? "Not specified"} · Currency:{" "}
                  {asset.currency ?? "Not applicable"}
                  {asset.expiry ? ` · Expiry: ${asset.expiry}` : ""}
                </p>
              </div>
              <QuoteValue q={quotes.data?.[0]} />
            </div>
            <p className="notice">
              Historical prices are not configured. A chart will appear only
              when permitted provider data is available.
            </p>
            <SectionHeading title="Current desk theses" />
            <LoadState query={theses}>
              {current?.length ? (
                current.map((r) => (
                  <section className="thesis-card" key={r.id}>
                    <div className="report-meta">
                      <DeskMark slug={r.desk_slug} />
                      {deskNames[r.desk_slug]}
                    </div>
                    <p>{r.thesis}</p>
                    {r.invalidation && (
                      <small>Invalidation: {r.invalidation}</small>
                    )}
                    <EvidenceLink id={r.id} />
                  </section>
                ))
              ) : (
                <p className="muted">
                  No explicit thesis is available. Desk views remain
                  individually attributed.
                </p>
              )}
            </LoadState>
            <SectionHeading title="Research timeline" />
            <LoadState query={q}>
              {timeline.length ? (
                timeline.map((r) => <ReportCard key={r.id} report={r} />)
              ) : (
                <Empty title="No research for this instrument">
                  Reports will appear when they reference this exact asset.
                </Empty>
              )}
            </LoadState>
            {q.hasNextPage && (
              <button
                className="load-more"
                disabled={q.isFetchingNextPage}
                onClick={() => q.fetchNextPage()}
              >
                Load earlier research
              </button>
            )}
            <Catalysts reports={timeline} />
          </>
        ) : (
          <Empty title="Instrument not mapped">
            Unknown instruments cannot receive a substituted price.
          </Empty>
        )}
      </LoadState>
    </>
  );
}
function Alerts() {
  const q = useQuery({
    queryKey: ["alerts"],
    queryFn: data.alerts,
    refetchInterval: 30000,
  });
  const [unread, setUnread] = useState(false);
  const qc = useQueryClient();
  const fmt = useTime();
  const m = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      data.readAlert(id, read),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const list = q.data?.filter((a) => !unread || !a.read_at);
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">Material changes, with context</p>
        <h1>Alerts</h1>
        <p>
          A focused inbox of research developments and their supporting
          evidence.
        </p>
      </div>
      <div className="tabs">
        <button
          className={!unread ? "active" : ""}
          onClick={() => setUnread(false)}
        >
          All developments
        </button>
        <button
          className={unread ? "active" : ""}
          onClick={() => setUnread(true)}
        >
          Unread · {q.data?.filter((x) => !x.read_at).length ?? 0}
        </button>
      </div>
      <MutationError error={m.error} />
      <LoadState query={q}>
        {list?.length ? (
          list.map((a) => (
            <article
              className={`alert-card ${!a.read_at ? "unread" : ""}`}
              key={a.id}
            >
              <div className="report-meta">
                <Bell size={16} />
                <Tag kind={a.severity}>{a.severity}</Tag>
                <span className="spacer" />
                <button
                  className="text-link"
                  disabled={m.isPending}
                  onClick={() => m.mutate({ id: a.id, read: !a.read_at })}
                >
                  {a.read_at ? "Mark unread" : "Mark read"}
                </button>
              </div>
              <h3>{a.title}</h3>
              <p className="muted">
                Event {fmt(a.event_at)} · Updated {fmt(a.updated_at)}
              </p>
              {a.report_ids.map((id) => (
                <EvidenceLink id={id} key={id} />
              ))}
              {data.isDemo && (
                <small className="demo-caption">
                  Synthetic alert preview · external delivery disabled
                </small>
              )}
            </article>
          ))
        ) : (
          <Empty title="You’re caught up">
            New material research developments will appear here.
          </Empty>
        )}
      </LoadState>
    </>
  );
}
function Settings() {
  const q = useSettings();
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">Your private workspace</p>
        <h1>Settings</h1>
      </div>
      <LoadState query={q}>
        {q.data && <SettingsForm initial={q.data} />}
      </LoadState>
      <DeskHealth />
    </>
  );
}
function SettingsForm({ initial }: { initial: data.Settings }) {
  const quoteHealth = useQuoteHealth();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const qc = useQueryClient();
  const auth = useAuth();
  const [authError, setAuthError] = useState(false);
  const m = useMutation({
    mutationFn: () => data.updateSettings(value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
    },
  });
  const change = (patch: Partial<data.Settings>) => {
    setValue((v) => ({ ...v, ...patch }));
    setSaved(false);
  };
  return (
    <>
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <section>
          <h2>Display & preferences</h2>
          <label>
            Display timezone
            <select
              value={value.timezone}
              onChange={(e) => change({ timezone: e.target.value })}
            >
              {[
                "America/New_York",
                "America/Chicago",
                "America/Los_Angeles",
                "Europe/London",
                "Europe/Berlin",
                "Asia/Tokyo",
                "UTC",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Suggestion expiry window (days)
            <input
              type="number"
              min={1}
              max={90}
              required
              value={value.suggestion_days}
              onChange={(e) =>
                change({ suggestion_days: Number(e.target.value) })
              }
            />
          </label>
          <p className="muted">
            Pins stay active. Dismissed assets stay suppressed until restored.
          </p>
        </section>
        <section>
          <h2>Desk schedules</h2>
          <p className="muted">
            These are planning preferences. Saving a time does not install a
            Grok routine. All routines are currently unverified.
          </p>
          {desks.map((d) => (
            <div className="schedule-row" key={d}>
              <strong>{deskNames[d]}</strong>
              <label>
                Morning
                <input
                  type="time"
                  value={value.schedules[d]?.morning ?? ""}
                  onChange={(e) =>
                    change({
                      schedules: {
                        ...value.schedules,
                        [d]: {
                          ...value.schedules[d],
                          morning: e.target.value,
                          evening: value.schedules[d]?.evening ?? "",
                          weekends: value.schedules[d]?.weekends ?? false,
                        },
                      },
                    })
                  }
                />
              </label>
              {d !== "chief_of_staff" && (
                <label>
                  Evening
                  <input
                    type="time"
                    value={value.schedules[d]?.evening ?? ""}
                    onChange={(e) =>
                      change({
                        schedules: {
                          ...value.schedules,
                          [d]: {
                            ...value.schedules[d],
                            morning: value.schedules[d]?.morning ?? "",
                            evening: e.target.value,
                            weekends: value.schedules[d]?.weekends ?? false,
                          },
                        },
                      })
                    }
                  />
                </label>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={value.schedules[d]?.weekends ?? false}
                  onChange={(e) =>
                    change({
                      schedules: {
                        ...value.schedules,
                        [d]: {
                          ...value.schedules[d],
                          morning: value.schedules[d]?.morning ?? "",
                          evening: value.schedules[d]?.evening ?? "",
                          weekends: e.target.checked,
                        },
                      },
                    })
                  }
                />
                Weekends
              </label>
              <Tag>Not installed</Tag>
            </div>
          ))}
        </section>
        <MutationError error={m.error} />
        <div className="save-row">
          <button type="submit" disabled={m.isPending}>
            {m.isPending ? "Saving…" : "Save preferences"}
          </button>
          {saved && (
            <span className="accent" role="status">
              <Check size={16} /> Saved
            </span>
          )}
        </div>
      </form>
      <section className="connection-settings">
        <h2>Connections</h2>
        <div>
          <span>Research environment</span>
          <Tag>{data.isDemo ? "Demo only" : "Supabase connected"}</Tag>
        </div>
        <div>
          <span>Grok routines</span>
          <Tag>Unverified</Tag>
        </div>
        <div>
          <span>Market prices</span>
          <Tag>
            {quoteHealth.isError
              ? "Connection unavailable"
              : (quoteHealth.data?.provider ??
                (data.isDemo ? "Synthetic preview" : "Checking connection…"))}
          </Tag>
        </div>
        <p className="muted">{quoteHealth.data?.message}</p>
        <div>
          <span>External notifications</span>
          <Tag>Disabled</Tag>
        </div>
        <p className="muted">
          Research remains in your permanent archive. This app does not execute
          orders or track holdings.
        </p>
      </section>
      <section className="account-settings">
        <h2>Account</h2>
        <p>{auth.session?.user.email ?? "Local demo workspace"}</p>
        {!data.isDemo && (
          <button
            className="subtle"
            onClick={() => auth.signOut().catch(() => setAuthError(true))}
          >
            <LogOut size={16} /> Sign out
          </button>
        )}
        {authError && (
          <p className="error" role="alert">
            Sign-out failed. Please try again.
          </p>
        )}
      </section>
    </>
  );
}
function Gate() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <main className="gate">
      <div className="brand-mark">M</div>
      <p className="eyebrow">Market Research</p>
      <h1>
        {auth.state === "loading"
          ? "Opening your workspace"
          : auth.state === "setup"
            ? "Connect your research workspace"
            : auth.state === "denied"
              ? "This workspace is private"
              : auth.state === "error"
                ? "Connection unavailable"
                : "A clearer view starts here."}
      </h1>
      {auth.state === "login" ? (
        <>
          <p>Sign in with the authorized owner account.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              setError("");
              const { error } = await data.db!.auth.signInWithPassword({
                email,
                password,
              });
              setLoading(false);
              if (error)
                setError(
                  "Unable to sign in. Check your credentials and connection.",
                );
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>
        </>
      ) : (
        <p>
          {auth.state === "setup"
            ? "Add the Supabase URL and publishable key to the local configuration. For a synthetic preview, run npm run dev:demo."
            : auth.state === "denied"
              ? "Your account is not the configured owner. Private research has not been loaded."
              : auth.state === "loading"
                ? "Verifying owner access…"
                : "Check your connection and reload to try again."}
        </p>
      )}
      {(auth.state === "denied" || auth.state === "error") && (
        <button
          onClick={() =>
            auth
              .signOut()
              .catch(() => setError("Sign-out failed. Please retry."))
          }
        >
          Sign out
        </button>
      )}
    </main>
  );
}
const scrollPositions = new Map<string, number>();
function ScrollMemory() {
  const loc = useLocation();
  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";
    const frame = requestAnimationFrame(() =>
      window.scrollTo(0, scrollPositions.get(loc.key) ?? 0),
    );
    return () => {
      cancelAnimationFrame(frame);
      scrollPositions.set(loc.key, window.scrollY);
    };
  }, [loc.key]);
  return null;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <Empty title="Something went wrong">
        <button onClick={() => location.reload()}>Reload workspace</button>
      </Empty>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const auth = useAuth();
  return auth.state === "owner" ? (
    <ErrorBoundary>
      <Workspace />
    </ErrorBoundary>
  ) : (
    <Gate />
  );
}
function Workspace() {
  const quoteHealth = useQuoteHealth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [panel, setPanel] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [signoutError, setSignoutError] = useState(false);
  const auth = useAuth();
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: data.alerts });
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  const nav = [
    { path: "/", label: "Overview", icon: LayoutDashboard },
    { path: "/research", label: "Research", icon: Layers },
    { path: "/watchlist", label: "Watchlist", icon: Compass },
    { path: "/alerts", label: "Alerts", icon: Bell },
  ];
  const auxiliary =
    panel && (loc.pathname === "/" || loc.pathname === "/research");
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <ScrollMemory />
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark">M</span>
          <span>
            Market
            <br />
            <strong>Research</strong>
          </span>
        </Link>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <NavLink end={n.path === "/"} key={n.path} to={n.path}>
              <n.icon size={19} />
              {n.label}
              {n.path === "/alerts" && (
                <span className="nav-count">
                  {alerts.data?.filter((x) => !x.read_at).length ?? 0}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-label">
            <ShieldCheck size={16} />
            <span>
              Private workspace<small>One account. Your perspective.</small>
            </span>
          </div>
          <NavLink to="/settings">
            <SettingsIcon size={18} /> Settings
          </NavLink>
          <small>Evidence. Interpretation. Perspective.</small>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span className="workspace-label">
            RESEARCH WORKSPACE <span>/</span>{" "}
            {loc.pathname.startsWith("/research")
              ? "Research"
              : loc.pathname.startsWith("/assets")
                ? "Asset detail"
                : loc.pathname.slice(1) || "Overview"}
          </span>
          <div className="header-actions">
            {data.isDemo ? (
              <Tag kind="demo-tag">Demo · synthetic data</Tag>
            ) : (
              <Tag kind="accent-tag">
                <ShieldCheck size={12} /> Owner only
              </Tag>
            )}
            <button
              aria-label="Search archive"
              className="icon-button"
              onClick={() => navigate("/research")}
            >
              <Search size={18} />
            </button>
            <Dropdown.Root>
              <Dropdown.Trigger
                className="account-button"
                aria-label="Account menu"
              >
                MR <ChevronDown size={12} />
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content className="dropdown" sideOffset={8}>
                  <Dropdown.Item onSelect={() => navigate("/settings")}>
                    Settings
                  </Dropdown.Item>
                  {!data.isDemo && (
                    <Dropdown.Item
                      onSelect={() =>
                        auth.signOut().catch(() => setSignoutError(true))
                      }
                    >
                      Sign out
                    </Dropdown.Item>
                  )}
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </header>
        {data.isDemo && (
          <div className="demo-banner">
            <span className="demo-dot" />
            Preview workspace · research and prices are synthetic. Live
            integrations are not connected.
          </div>
        )}
        {!online && (
          <div className="offline-banner" role="status">
            Offline · reconnect to retrieve the latest research.
          </div>
        )}
        {signoutError && (
          <p className="error" role="alert">
            Sign-out failed. Please try again.
          </p>
        )}
        <Ticker />
        <div className={`workspace-grid ${auxiliary ? "with-panel" : ""}`}>
          <main id="main-content" className="main-content">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/research" element={<Research />} />
              <Route path="/research/:id" element={<Reader />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/assets/:id" element={<AssetDetail />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/settings" element={<Settings />} />
              <Route
                path="*"
                element={
                  <Empty title="Page not found">
                    <Link to="/">Return to overview</Link>
                  </Empty>
                }
              />
            </Routes>
          </main>
          {auxiliary && (
            <aside className="context-panel">
              <button
                className="panel-close icon-button"
                aria-label="Hide context panel"
                onClick={() => setPanel(false)}
              >
                <X size={15} />
              </button>
              <Watchlist panel />
              <div className="research-principle">
                <Compass size={21} />
                <p>
                  Follow the evidence,
                  <br />
                  keep the perspective.
                </p>
                <small>
                  Research ideas are not holdings or instructions to trade.
                </small>
              </div>
            </aside>
          )}
          {!panel && (loc.pathname === "/" || loc.pathname === "/research") && (
            <button
              className="show-panel subtle"
              onClick={() => setPanel(true)}
            >
              Show watchlist
            </button>
          )}
        </div>
        <footer className="app-footer">
          <ShieldCheck size={13} /> Private research archive
          <span>
            Market data:{" "}
            {data.isDemo
              ? "synthetic preview"
              : quoteHealth.isError
                ? "connection unavailable"
                : (quoteHealth.data?.message ?? "checking connection…")}
          </span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map((n) => (
          <NavLink end={n.path === "/"} to={n.path} key={n.path}>
            <n.icon size={20} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
