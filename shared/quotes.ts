export type Instrument = {
  id: string;
  asset_key: string;
  name: string;
  symbol: string;
  asset_class: string;
  venue: string | null;
  currency: string | null;
  expiry: string | null;
};
export type Quote = {
  asset_id: string;
  provider_symbol: string | null;
  provider: string | null;
  price: number | null;
  currency: string | null;
  quote_time: string | null;
  received_at: string;
  market_state: "open" | "closed" | "unknown";
  entitlement: "live" | "delayed" | "unavailable";
  delay_seconds: number | null;
  change_absolute: number | null;
  change_percent: number | null;
  change_basis: string | null;
  is_demo: boolean;
  stale_after_seconds: number | null;
};
export interface QuoteService {
  resolve(asset: Instrument): Promise<string | null>;
  current(assets: Instrument[]): Promise<Quote[]>;
  health(): Promise<{
    configured: boolean;
    provider: string | null;
    message: string;
  }>;
}
export function quoteState(
  q: Quote,
  now = Date.now(),
): "live" | "delayed" | "stale" | "closed" | "unavailable" {
  if (q.price === null || q.entitlement === "unavailable" || !q.quote_time)
    return "unavailable";
  if (q.market_state === "closed") return "closed";
  if (
    q.stale_after_seconds !== null &&
    now - Date.parse(q.quote_time) >
      (q.stale_after_seconds + (q.delay_seconds ?? 0)) * 1000
  )
    return "stale";
  return q.entitlement;
}
export class UnconfiguredQuoteService implements QuoteService {
  async resolve() {
    return null;
  }
  async current(assets: Instrument[]): Promise<Quote[]> {
    return assets.map((a) => ({
      asset_id: a.id,
      provider_symbol: null,
      provider: null,
      price: null,
      currency: a.currency,
      quote_time: null,
      received_at: new Date().toISOString(),
      market_state: "unknown",
      entitlement: "unavailable",
      delay_seconds: null,
      change_absolute: null,
      change_percent: null,
      change_basis: null,
      is_demo: false,
      stale_after_seconds: null,
    }));
  }
  async health() {
    return {
      configured: false,
      provider: null,
      message: "No entitled provider configured",
    };
  }
}
