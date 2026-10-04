import { createClient } from "@supabase/supabase-js";
import { origin } from "../_shared/client.ts";
import { UnconfiguredQuoteService } from "../../../shared/quotes.ts";
import { quoteHandler } from "../../../shared/quote-http.ts";
import { ApiError } from "../../../shared/http.ts";
// Configure a real provider only after coverage, entitlement and license verification.
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
    new UnconfiguredQuoteService(),
    origin(),
  ),
);
