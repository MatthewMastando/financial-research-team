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
  if (a.expiry || a.currency !== "USD") return null;
  if (
    a.asset_key === "fx:EURUSD" &&
    a.symbol === "EUR/USD" &&
    a.asset_class === "fx" &&
    !a.venue
  )
    return { symbol: "EUR/USD", type: "Physical Currency" };
  if (
    a.asset_key === "equity:XNAS:AAPL" &&
    a.symbol === "AAPL" &&
    a.asset_class === "equity" &&
    a.venue === "XNAS"
  )
    return { symbol: "AAPL", mic: "XNAS", type: "Common Stock" };
  if (
    a.asset_key === "crypto:BTC" &&
    a.symbol === "BTC" &&
    a.asset_class === "crypto" &&
    !a.venue
  )
    return { symbol: "BTC/USD", type: "Digital Currency" };
  return null;
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
  ) {}
  async resolve(asset: Instrument) {
    return mapping(asset)?.symbol ?? null;
  }
  async health() {
    return {
      configured: Boolean(this.key),
      provider: "Twelve Data",
      display_enabled: Boolean(this.key) && this.displayAllowed,
      refresh_after_seconds: 600,
      message: !this.key
        ? "API key not configured"
        : !this.displayAllowed
          ? "Key saved · display permission required"
          : "Quotes enabled · refresh every 10 minutes",
    };
  }
  async current(assets: Instrument[]): Promise<Quote[]> {
    const empty = await new UnconfiguredQuoteService().current(assets);
    // Licensing is enforced server-side, even if a previous cached price exists.
    if (!this.key || !this.displayAllowed)
      return empty.map((q) => ({
        ...q,
        provider: "Twelve Data",
        unavailable_reason: !this.key
          ? "API key not configured"
          : "Display permission required",
      }));
    return Promise.all(
      assets.map(async (asset, i) => {
        const m = mapping(asset);
        const unavailable = {
          ...empty[i],
          provider: "Twelve Data",
          provider_symbol: m?.symbol ?? null,
        };
        if (!m)
          return {
            ...unavailable,
            unavailable_reason: "Instrument not covered by the test mapping",
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
          let retry = 60;
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
              if (raw && typeof raw === "object" && !Array.isArray(raw))
                quote = this.parse(raw as Record<string, unknown>, asset, m);
            }
            if (response.status === 401 || response.status === 403) retry = 600;
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
            quote,
            quote ? 600 : retry,
          );
          return (
            quote ??
            claim.quote ?? {
              ...unavailable,
              unavailable_reason: "Provider quote unavailable",
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
  private parse(
    raw: Record<string, unknown>,
    a: Instrument,
    m: Mapping,
  ): Quote | null {
    if (
      raw.status === "error" ||
      raw.symbol !== m.symbol ||
      (raw.type !== undefined && raw.type !== m.type)
    )
      return null;
    if (m.mic && (raw.mic_code !== m.mic || raw.currency !== a.currency))
      return null;
    if (raw.currency !== undefined && raw.currency !== a.currency) return null;
    const price = number(raw.close),
      seconds = number(raw.last_quote_at);
    // timestamp/datetime are the daily candle's OPEN, not the last quote time.
    if (
      price === null ||
      price <= 0 ||
      seconds === null ||
      seconds <= 0 ||
      !Number.isInteger(seconds) ||
      seconds * 1000 > this.now() + 60000
    )
      return null;
    const previous = number(raw.previous_close);
    const change = previous !== null && previous > 0 ? price - previous : null;
    const exchange =
      typeof raw.exchange === "string" && raw.exchange.trim()
        ? raw.exchange
        : null;
    return {
      asset_id: a.id,
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
      stale_after_seconds: 900,
      coverage_note: m.mic
        ? "Default US feed · approximately 5% of market volume; not consolidated"
        : a.asset_class === "crypto"
          ? "Provider default crypto feed"
          : "Provider indicative FX feed",
    };
  }
}
