import { createClient } from "@supabase/supabase-js";
import { deploymentOrigin } from "./deployment.ts";
export function adminClient() {
  const key =
    Deno.env.get("MARKET_SUPABASE_SECRET_KEY") ??
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Server key missing");
  return createClient(Deno.env.get("SUPABASE_URL")!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function origin() {
  return Deno.env.get("APP_ORIGIN") ?? deploymentOrigin;
}
