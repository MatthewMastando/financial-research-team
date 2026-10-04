import { describe, it, expect, vi } from "vitest";
import { TwelveDataQuoteService, type QuoteCache } from "../shared/twelve-data";
import { quoteState, type Quote } from "../shared/quotes";
import { demoAssets } from "../src/lib/demo";

const now = Date.parse("2026-10-02T15:00:00Z");
const apple = demoAssets.find((a) => a.symbol === "AAPL")!;
const fx = demoAssets.find((a) => a.symbol === "EUR/USD")!;
const bitcoin = demoAssets.find((a) => a.symbol === "BTC")!;
const sample = {
  symbol: "AAPL",
  currency: "USD",
  exchange: "NASDAQ",
  mic_code: "XNAS",
  close: "200.5",
  previous_close: "200",
  last_quote_at: now / 1000,
  timestamp: now / 1000 - 10000,
  is_market_open: true,
};
function fixture(raw: unknown = sample, status = 200) {
  let stored: Quote | null = null;
  let pending = false;
  const cache: QuoteCache = {
    claim: vi.fn(async () =>
      stored || pending
        ? { quote: stored }
        : ((pending = true), { lease: "lease" }),
    ),
    complete: vi.fn(async (_key, _lease, quote) => {
      stored = quote;
    }),
  };
  const request = vi.fn<typeof fetch>(async () =>
    Response.json(raw, { status }),
  );
  return {
    cache,
    request,
    service: new TwelveDataQuoteService(
      "test-secret-key",
      true,
      cache,
      request,
      () => now,
    ),
  };
}
describe("Twelve Data adapter", () => {
  it("checks identity, uses last quote time and attributes limited US coverage", async () => {
    const { service, request } = fixture();
    const [q] = await service.current([apple]);
    expect(q).toMatchObject({
      price: 200.5,
      change_absolute: 0.5,
      change_percent: 0.25,
      quote_time: new Date(now).toISOString(),
      provider: "Twelve Data",
      provider_venue: "NASDAQ",
      is_demo: false,
    });
    expect(q.coverage_note).toContain("5%");
    expect(quoteState(q, now)).toBe("live");
    expect(quoteState(q, now + 901000)).toBe("stale");
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toContain("https://api.twelvedata.com/quote?");
    expect(String(url)).toContain("mic_code=XNAS");
    expect(new URL(String(url)).searchParams.get("type")).toBe("Common Stock");
    expect(String(url)).not.toContain("test-secret-key");
    expect(init).toMatchObject({
      headers: { Authorization: "apikey test-secret-key" },
      redirect: "error",
    });
  });
  it.each([
    { symbol: "MSFT" },
    { currency: "EUR" },
    { mic_code: "XNYS" },
    { type: "ETF" },
    { last_quote_at: undefined },
    { last_quote_at: now / 1000 + 61 },
    { close: "NaN" },
    { close: "0" },
    { close: "" },
  ])("rejects mismatched or malformed payload %j", async (patch) => {
    const { service } = fixture({ ...sample, ...patch });
    expect((await service.current([apple]))[0].price).toBeNull();
  });
  it("never substitutes a gold theme or future with a spot quote", async () => {
    const { service, request } = fixture();
    const gold = demoAssets.find((a) => a.asset_class === "commodity_theme")!;
    const output = await service.current([
      gold,
      { ...fx, expiry: "2026-12" },
      { ...apple, venue: "XNYS" },
    ]);
    expect(output.every((q) => q.price === null)).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("preserves exact FX and crypto pair identities and closed state", async () => {
    for (const [asset, symbol, type] of [
      [fx, "EUR/USD", "Physical Currency"],
      [bitcoin, "BTC/USD", "Digital Currency"],
    ] as const) {
      const { service } = fixture({
        ...sample,
        symbol,
        type,
        mic_code: undefined,
        currency: undefined,
        is_market_open: false,
      });
      const [q] = await service.current([asset]);
      expect(q).toMatchObject({
        provider_symbol: symbol,
        currency: "USD",
        price: 200.5,
      });
      expect(quoteState(q, now + 10000000)).toBe("closed");
    }
  });
  it("coalesces concurrent calls and reuses cache across adapter instances", async () => {
    const { service, cache, request } = fixture();
    await Promise.all([service.current([apple]), service.current([apple])]);
    const another = new TwelveDataQuoteService(
      "test-secret-key",
      true,
      cache,
      request,
      () => now,
    );
    expect((await another.current([apple]))[0].price).toBe(200.5);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("fails closed when cache reservations fail or no credits are available", async () => {
    for (const cache of [
      {
        claim: async () => {
          throw new Error("database down");
        },
        complete: async () => {},
      },
      { claim: async () => ({}), complete: async () => {} },
    ]) {
      const request = vi.fn<typeof fetch>();
      const service = new TwelveDataQuoteService(
        "test-secret-key",
        true,
        cache,
        request,
        () => now,
      );
      expect((await service.current([apple]))[0].price).toBeNull();
      expect(request).not.toHaveBeenCalled();
    }
  });
  it("does not read cached prices or call the provider without key/display permission", async () => {
    const { request, cache } = fixture();
    for (const [key, allowed] of [
      [undefined, true],
      ["test-secret-key", false],
    ] as const) {
      const service = new TwelveDataQuoteService(
        key,
        allowed,
        cache,
        request,
        () => now,
      );
      expect((await service.current([apple]))[0].price).toBeNull();
      expect((await service.health()).display_enabled).toBe(false);
    }
    expect(cache.claim).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it("redacts provider errors and backs off authentication failures", async () => {
    const { service, cache } = fixture(
      { status: "error", message: "test-secret-key" },
      401,
    );
    const quotes = await service.current([apple]);
    expect(JSON.stringify(quotes)).not.toContain("test-secret-key");
    expect(quotes[0].price).toBeNull();
    expect(cache.complete).toHaveBeenCalledWith(
      expect.any(String),
      "lease",
      null,
      600,
    );
  });
});
