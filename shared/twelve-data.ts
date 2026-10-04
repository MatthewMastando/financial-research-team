import {
  UnconfiguredQuoteService,
  type Instrument,
  type Quote,
  type QuoteService,
} from "./quotes.ts";

export type QuoteClaim = {
  quote?: Quote | null;
  lease?: string;
  retry_after_seconds?: number;
};
// The database reserves credits and fences writes across separate Edge isolates.
export interface QuoteCache {
  claim(key: string): Promise<QuoteClaim>;
  complete(
    key: string,
    lease: string,
    quote: Quote | null,
    retrySeconds: number,
  ): Promise<void>;
}
type Mapping = { symbol: string; mic?: string; type: string };
function mapping(a: Instrument): Mapping | null {
  if (a.identity_verified === false || a.expiry || a.currency !== "USD")
    return null;
  const alias = a.quote_aliases?.find((x) => x.provider === "twelve_data");
  if (!alias) return null;
  const symbol = alias.provider_symbol;
  if (
    (a.asset_class === "equity" || a.asset_class === "etf") &&
    ["XNAS", "XNYS", "ARCX"].includes(a.venue ?? "") &&
    a.asset_key === `equity:${a.venue}:${a.symbol}` &&
    symbol === a.symbol &&
    /^[A-Z0-9.]{1,20}$/.test(symbol)
  )
    return {
      symbol,
      mic: a.venue!,
      type: a.asset_class === "etf" ? "ETF" : "Common Stock",
    };
  if (
    a.asset_class === "crypto" &&
    !a.venue &&
    a.asset_key === `crypto:${a.symbol}` &&
    symbol === `${a.symbol}/${a.currency}` &&
    /^[A-Z0-9]{1,20}\/USD$/.test(symbol)
  )
    return { symbol, type: "Digital Currency" };
  if (
    a.asset_class === "fx" &&
    !a.venue &&
    a.asset_key === `fx:${a.symbol.replace("/", "")}` &&
    symbol === a.symbol &&
    /^[A-Z]{3}\/USD$/.test(symbol)
  )
    return { symbol, type: "Physical Currency" };
  return null;
}
export function quoteRefreshSeconds(mappedCount: number) {
  // Round up in ten-minute steps to stay below 720/day during continuous use.
  return Math.max(600, Math.ceil((mappedCount * 86400) / 720 / 600) * 600);
}
function number(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export class TwelveDataQuoteService implements QuoteService {
  constructor(
    private readonly key: string | undefined,
    private readonly displayAllowed: boolean,
    private readonly cache: QuoteCache,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly catalogSize: () => Promise<number> = async () => 3,
  ) {}
  async resolve(asset: Instrument) {
    return mapping(asset)?.symbol ?? null;
  }
  async health() {
    const mapped = await this.catalogSize();
    const refresh = quoteRefreshSeconds(mapped);
    return {
      configured: Boolean(this.key),
      provider: "Twelve Data",
      display_enabled: Boolean(this.key) && this.displayAllowed,
      refresh_after_seconds: refresh,
      mapped_assets: mapped,
      message: !this.key
        ? "API key not configured"
        : !this.displayAllowed
          ? "Key saved · display permission required"
          : `Quotes enabled · refresh every ${refresh / 60} minutes`,
    };
  }
  async current(assets: Instrument[]): Promise<Quote[]> {
    const empty = (await new UnconfiguredQuoteService().current(assets)).map(
      (q, i) => ({
        ...q,
        pricing_state: mapping(assets[i])
          ? ("unavailable" as const)
          : ("research_only" as const),
      }),
    );
    // Licensing is enforced server-side, even if a previous cached price exists.
    if (!this.key || !this.displayAllowed)
      return empty.map((q) => ({
        ...q,
        provider: "Twelve Data",
        unavailable_reason: !this.key
          ? "API key not configured"
          : "Display permission required",
      }));
    const refresh = quoteRefreshSeconds(await this.catalogSize());
    return Promise.all(
      assets.map(async (asset, i) => {
        const m = mapping(asset);
        const unavailable = {
          ...empty[i],
          provider: "Twelve Data",
          provider_symbol: m?.symbol ?? null,
          pricing_state: "unavailable" as const,
        };
        if (!m)
          return {
            ...unavailable,
            pricing_state: "research_only" as const,
            unavailable_reason:
              asset.asset_class === "commodity_theme"
                ? "Research only · no exact quoted instrument"
                : "Research only · provider mapping unconfirmed",
          };
        // Include the immutable asset ID and all identity fields in the cache key.
        const cacheKey = JSON.stringify([
          asset.id,
          asset.asset_key,
          asset.symbol,
          asset.asset_class,
          asset.venue,
          asset.currency,
          asset.expiry,
        ]);
        try {
          const claim = await this.cache.claim(cacheKey);
          if (!claim.lease)
            return (
              claim.quote ?? {
                ...unavailable,
                unavailable_reason:
                  "Refresh pending or provider request limit reached",
              }
            );
          let quote: Quote | null = null;
          let retry = refresh;
          let reason = "Provider request failed";
          try {
            const url = new URL("https://api.twelvedata.com/quote");
            url.searchParams.set("symbol", m.symbol);
            url.searchParams.set("type", m.type);
            url.searchParams.set("interval", "1day");
            if (m.mic) url.searchParams.set("mic_code", m.mic);
            const response = await this.request(url, {
              headers: { Authorization: `apikey ${this.key}` },
              signal: AbortSignal.timeout(5000),
              redirect: "error",
            });
            if (response.ok) {
              const raw: unknown = await response.json();
              if (raw && typeof raw === "object" && !Array.isArray(raw)) {
                const body = raw as Record<string, unknown>;
                reason =
                  this.rejection(body, asset, m) ??
                  "Provider returned an invalid quote";
                quote = this.parse(body, asset, m, refresh);
              }
            }
            if (!response.ok)
              reason = `Provider rejected quote request (HTTP ${response.status})`;
            if (response.status === 401 || response.status === 403)
              retry = Math.max(600, refresh);
            if (response.status === 429) {
              const after = Number(response.headers.get("Retry-After"));
              retry = Math.min(
                86400,
                Math.max(60, Number.isFinite(after) ? after : 60),
              );
            }
          } catch {
            /* Errors can contain credentials; never return or log them. */
          }
          await this.cache.complete(
            cacheKey,
            claim.lease,
            quote ?? {
              ...(claim.quote?.price != null ? claim.quote : unavailable),
              unavailable_reason: reason,
            },
            quote ? refresh : retry,
          );
          return (
            quote ??
            claim.quote ?? {
              ...unavailable,
              unavailable_reason: reason,
            }
          );
        } catch {
          // If cache/budget enforcement fails, fail closed without a provider call.
          return {
            ...unavailable,
            unavailable_reason: "Quote cache unavailable",
          };
        }
      }),
    );
  }
  private rejection(
    raw: Record<string, unknown>,
    a: Instrument,
    m: Mapping,
  ): string | null {
    if (raw.status === "error") {
      const code = number(raw.code);
      return code === 401
        ? "Provider rejected API key"
        : code === 403
          ? "Provider denied instrument access"
          : code === 429
            ? "Provider account request limit reached"
            : "Provider did not return this instrument";
    }
    if (raw.symbol !== m.symbol) return "Provider symbol mismatch";
    if (raw.type !== undefined && raw.type !== m.type)
      return "Provider instrument type mismatch";
    if (m.mic && raw.mic_code !== m.mic) return "Provider venue mismatch";
    if (
      (m.mic && raw.currency !== a.currency) ||
      (raw.currency !== undefined && raw.currency !== a.currency)
    )
      return "Provider currency mismatch";
    const price = number(raw.close),
      time = number(raw.last_quote_at);
    if (price === null || price <= 0)
      return "Provider returned an invalid price";
    if (
      time === null ||
      time <= 0 ||
      !Number.isInteger(time) ||
      time * 1000 > this.now() + 60000
    )
      return "Provider returned an invalid quote time";
    return null;
  }
  private parse(
    raw: Record<string, unknown>,
    a: Instrument,
    m: Mapping,
    refresh: number,
  ): Quote | null {
    if (this.rejection(raw, a, m)) return null;
    const price = number(raw.close)!,
      seconds = number(raw.last_quote_at)!;
    const previous = number(raw.previous_close);
    const change = previous !== null && previous > 0 ? price - previous : null;
    const exchange =
      typeof raw.exchange === "string" && raw.exchange.trim()
        ? raw.exchange
        : null;
    return {
      asset_id: a.id,
      pricing_state: "available",
      provider: "Twelve Data",
      provider_symbol: m.symbol,
      provider_venue: exchange,
      price,
      currency: a.currency,
      quote_time: new Date(seconds * 1000).toISOString(),
      received_at: new Date(this.now()).toISOString(),
      market_state:
        typeof raw.is_market_open === "boolean"
          ? raw.is_market_open
            ? "open"
            : "closed"
          : "unknown",
      entitlement: "live",
      delay_seconds: 0,
      change_absolute: change,
      change_percent:
        change !== null && previous !== null ? (change / previous) * 100 : null,
      change_basis:
        a.asset_class === "crypto"
          ? "previous_daily_close_provider_timezone"
          : "previous_daily_close",
      is_demo: false,
      stale_after_seconds: Math.max(900, refresh + 300),
      coverage_note: m.mic
        ? "Default US feed · approximately 5% of market volume; not consolidated"
        : a.asset_class === "crypto"
          ? "Provider default crypto feed"
          : "Provider indicative FX feed",
    };
  }
}
