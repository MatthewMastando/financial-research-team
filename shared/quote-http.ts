import { z } from "zod";
import { ApiError } from "./http.ts";
import type { Instrument, QuoteService } from "./quotes.ts";
export type QuoteAccess = (
  token: string,
) => Promise<((ids: string[]) => Promise<Instrument[]>) | null>;
export function quoteHandler(
  authorize: QuoteAccess,
  service: QuoteService,
  origin: string,
) {
  return async (req: Request) => {
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    if (req.headers.get("origin") === origin)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization,apikey,content-type",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      });
    const json = (x: unknown, status = 200) =>
      Response.json(x, { status, headers });
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const token = req.headers
      .get("Authorization")
      ?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return json({ error: "unauthorized" }, 401);
    try {
      const getAssets = await authorize(token);
      if (!getAssets) return json({ error: "owner_only" }, 403);
      const ids = z
        .array(z.uuid())
        .max(50)
        .parse(
          (new URL(req.url).searchParams.get("ids") ?? "")
            .split(",")
            .filter(Boolean),
        );
      const assets = ids.length ? await getAssets(ids) : [];
      return json({
        quotes: await service.current(assets),
        health: await service.health(),
      });
    } catch (e) {
      if (e instanceof z.ZodError)
        return json({ error: "invalid_assets" }, 400);
      if (e instanceof ApiError) return json({ error: e.code }, e.status);
      return json({ error: "quotes_unavailable" }, 503);
    }
  };
}
