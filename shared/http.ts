import { z } from "zod";
import { reportSchema, runSchema, desks, reportTypes } from "./report.ts";
export interface RpcClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    data: any;
    error: { code?: string; message: string } | null;
  }>;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export const MAX_BODY = 256 * 1024;
export async function hashToken(token: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function encodeCursor(c: { id: string; received_at: string }) {
  return btoa(JSON.stringify(c))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function decodeCursor(value?: string | null) {
  if (!value) return null;
  if (value.length > 512) throw new ApiError(400, "invalid_cursor");
  try {
    return z
      .object({ id: z.uuid(), received_at: z.iso.datetime({ offset: true }) })
      .strict()
      .parse(JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/"))));
  } catch {
    throw new ApiError(400, "invalid_cursor");
  }
}
export async function boundedJson(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) throw new ApiError(413, "request_too_large");
  if (!req.body) throw new ApiError(400, "missing_body");
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) {
      await reader.cancel();
      throw new ApiError(413, "request_too_large");
    }
    parts.push(value);
  }
  const data = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    data.set(p, at);
    at += p.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}
export function apiHandler(db: RpcClient, origin: string) {
  return async (req: Request): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    if (req.headers.get("origin") === origin)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization,content-type,apikey",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    try {
      if (req.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      const path = new URL(req.url).pathname;
      const route = path.endsWith("/v1/reports")
        ? "reports"
        : path.endsWith("/v1/research-context")
          ? "context"
          : path.endsWith("/v1/desk-runs")
            ? "runs"
            : null;
      if (!route) throw new ApiError(404, "route_not_found");
      if (req.method !== (route === "context" ? "GET" : "POST"))
        throw new ApiError(405, "method_not_allowed");
      const token = req.headers
        .get("Authorization")
        ?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
      if (!token) throw new ApiError(401, "invalid_credential");
      const { data: credential, error: authError } = await db.rpc(
        "authenticate_bot",
        {
          p_hash: await hashToken(token),
          p_scope:
            route === "reports"
              ? "reports:write"
              : route === "context"
                ? "research:read"
                : "runs:write",
        },
      );
      if (authError)
        throw new ApiError(
          authError.code === "PT403"
            ? 403
            : authError.code === "PT401"
              ? 401
              : 503,
          authError.code === "PT403"
            ? "scope_denied"
            : authError.code === "PT401"
              ? "invalid_credential"
              : "authentication_unavailable",
        );
      if (credential?.rate_limited) {
        headers["Retry-After"] = "60";
        throw new ApiError(429, "rate_limited");
      }
      if (!credential) throw new ApiError(401, "invalid_credential");
      if (route === "context") {
        const params = new URL(req.url).searchParams;
        const filters = z
          .object({
            since: z.iso.datetime({ offset: true }).optional(),
            asset: z.string().max(120).optional(),
            desk: z.enum(desks).optional(),
            type: z.enum(reportTypes).optional(),
          })
          .parse(
            Object.fromEntries(
              ["since", "asset", "desk", "type"]
                .filter((k) => params.has(k))
                .map((k) => [k, params.get(k)]),
            ),
          );
        filters.since ??= new Date(Date.now() - 7 * 86400000).toISOString();
        const limit = z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .parse(params.get("limit") ?? undefined);
        const cursor = decodeCursor(params.get("cursor"));
        const { data, error } = await db.rpc("bot_research_context", {
          p_credential: credential.id,
          p_filters: filters,
          p_cursor: cursor,
          p_limit: limit,
        });
        if (error) throw dbError(error);
        const reports = data.reports;
        const last = reports.at(-1);
        return json({
          ...data,
          next_cursor:
            reports.length === limit && last
              ? encodeCursor({ id: last.id, received_at: last.received_at })
              : null,
        });
      }
      if (!req.headers.get("content-type")?.includes("application/json"))
        throw new ApiError(415, "json_required");
      const input = await boundedJson(req);
      if (route === "runs") {
        const run = runSchema.parse(input);
        if (
          (run.status === "started" && run.completed_at !== null) ||
          (run.status !== "started" &&
            (!run.completed_at ||
              Date.parse(run.completed_at) < Date.parse(run.started_at)))
        )
          throw new ApiError(422, "invalid_run_times");
        const { data, error } = await db.rpc("record_desk_run", {
          p_credential: credential.id,
          p_run: run,
        });
        if (error) throw dbError(error);
        return json({ run_id: data }, 200);
      }
      const report = reportSchema.parse(input);
      if (Date.parse(report.researched_at) > Date.now() + 300000)
        throw new ApiError(422, "future_research_time");
      if (
        report.desk_slug !== credential.desk_slug ||
        !credential.report_types.includes(report.report_type)
      )
        throw new ApiError(403, "desk_or_type_denied");
      const { data, error } = await db.rpc("ingest_report", {
        p_credential: credential.id,
        p_payload: report,
      });
      if (error) throw dbError(error);
      return json(data, data.duplicate ? 200 : 201);
    } catch (e) {
      if (e instanceof z.ZodError)
        return json(
          {
            error: "validation_failed",
            issues: e.issues.map((i) => ({ path: i.path, message: i.message })),
          },
          422,
        );
      if (e instanceof ApiError) return json({ error: e.code }, e.status);
      return json({ error: "temporarily_unavailable" }, 503);
    }
  };
}
function dbError(e: { code?: string; message: string }) {
  const status = Number(e.code?.replace("PT", ""));
  return new ApiError(
    [401, 403, 409, 422].includes(status) ? status : 503,
    status === 409
      ? "submission_or_revision_conflict"
      : status === 422
        ? "invalid_reference"
        : status === 401
          ? "invalid_credential"
          : status === 403
            ? "scope_denied"
            : "storage_unavailable",
  );
}
