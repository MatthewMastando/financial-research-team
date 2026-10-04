import { createClient } from "@supabase/supabase-js";
import { adminClient, origin } from "../_shared/client.ts";
import {
  TwelveDataQuoteService,
  type QuoteClaim,
} from "../../../shared/twelve-data.ts";
import { twelveDataTrialDisplayAllowed } from "../_shared/deployment.ts";
import { quoteHandler } from "../../../shared/quote-http.ts";
import { ApiError } from "../../../shared/http.ts";
const cacheDb = adminClient();
const provider = new TwelveDataQuoteService(
  Deno.env.get("MARKET_DATA_API_KEY"),
  Deno.env.get("TWELVE_DATA_DISPLAY_ALLOWED") === undefined
    ? twelveDataTrialDisplayAllowed
    : Deno.env.get("TWELVE_DATA_DISPLAY_ALLOWED") === "true",
  {
    async claim(key) {
      const { data, error } = await cacheDb.rpc("claim_twelve_data_quote", {
        p_key: key,
      });
      if (error) throw new Error("Quote cache unavailable");
      return data as QuoteClaim;
    },
    async complete(key, lease, quote, retrySeconds) {
      const { error } = await cacheDb.rpc("complete_twelve_data_quote", {
        p_key: key,
        p_lease: lease,
        p_quote: quote,
        p_retry_seconds: retrySeconds,
      });
      if (error) throw new Error("Quote cache unavailable");
    },
  },
);
Deno.serve(
  quoteHandler(
    async (token) => {
      const key =
        JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ??
        Deno.env.get("SUPABASE_ANON_KEY");
      const userDb = createClient(Deno.env.get("SUPABASE_URL")!, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      });
      const {
        data: { user },
        error,
      } = await userDb.auth.getUser(token);
      if (error || !user) throw new ApiError(401, "unauthorized");
      const { data: owner, error: ownerError } = await userDb
        .from("app_owner")
        .select("owner_id")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (ownerError) throw new ApiError(503, "authorization_unavailable");
      if (!owner) return null;
      return async (ids) => {
        const { data: assets, error: e } = await userDb
          .from("assets")
          .select("*")
          .in("id", ids);
        if (e) throw new ApiError(503, "assets_unavailable");
        return assets ?? [];
      };
    },
    provider,
    origin(),
  ),
);
