import { adminClient } from "../_shared/client.ts";
import { hashToken } from "../../../shared/http.ts";
Deno.serve(async (req) => {
  const expected = Deno.env.get("JOB_WORKER_TOKEN");
  const actual = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (
    !expected ||
    !actual ||
    (await hashToken(actual)) !== (await hashToken(expected))
  )
    return Response.json({ error: "unauthorized" }, { status: 401 });
  if (req.method !== "POST")
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const { data, error } = await adminClient().rpc("process_research_jobs", {
    p_limit: 20,
  });
  return Response.json(error ? { error: "processing_unavailable" } : data, {
    status: error ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
});
