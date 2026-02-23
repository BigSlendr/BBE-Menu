import { json } from "../_auth";
import { requireAdminRequest } from "./_helpers";

type RangeKey = "7d" | "30d" | "90d" | "today" | "custom";

type RangeResult = {
  ok: true;
  range: { start: string; end: string };
  rangeLabel: RangeKey;
} | {
  ok: false;
  status: number;
  error: string;
  step: string;
  detail?: string;
};

const isDebug = (url: URL) => url.searchParams.get("debug") === "1";

function toJsonError(
  message: string,
  status: number,
  step: string,
  debugMode: boolean,
  detail?: string,
  extra?: Record<string, unknown>,
) {
  return json(
    {
      ok: false,
      error: message,
      step,
      ...(debugMode && detail ? { detail } : {}),
      ...(debugMode && extra ? extra : {}),
    },
    status,
  );
}

function parseMaybeDate(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  // ISO datetime or date-only.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const parsed = new Date(dateOnly ? `${raw}T00:00:00.000Z` : raw);
  if (isNaN(parsed.getTime())) return null;

  if (dateOnly && endOfDay) {
    // [start,end) window: convert date end to next midnight.
    parsed.setUTCDate(parsed.getUTCDate() + 1);
  }
  return parsed;
}

function resolveRange(url: URL): RangeResult {
  const now = new Date();
  const rangeParam = (url.searchParams.get("range") || "7d").toLowerCase();
  const allowedRanges = ["7d", "30d", "90d", "today", "custom"];
  const range = (allowedRanges.indexOf(rangeParam) >= 0
    ? rangeParam
    : "7d") as RangeKey;

  if (range === "custom") {
    const startRaw = url.searchParams.get("start");
    const endRaw = url.searchParams.get("end");
    const startDate = parseMaybeDate(startRaw, false);
    const endDate = parseMaybeDate(endRaw, true);

    if (!startDate || !endDate) {
      return { ok: false, status: 400, error: "invalid_custom_range", step: "parse_range" };
    }
    if (startDate.getTime() >= endDate.getTime()) {
      return { ok: false, status: 400, error: "invalid_custom_range_order", step: "parse_range" };
    }

    return {
      ok: true,
      range: { start: startDate.toISOString(), end: endDate.toISOString() },
      rangeLabel: "custom",
    };
  }

  if (range === "today") {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return { ok: true, range: { start: start.toISOString(), end: now.toISOString() }, rangeLabel: "today" };
  }

  const days = range === "30d" ? 30 : range === "90d" ? 90 : 7;
  const start = new Date(now.getTime() - days * 86_400_000);
  return {
    ok: true,
    range: { start: start.toISOString(), end: now.toISOString() },
    rangeLabel: range,
  };
}

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  const debugMode = isDebug(url);

  let detectedColumns: string[] = [];

  try {
    const auth = await requireAdminRequest(request, env);
    if (!auth.ok) return auth.response;

    const rangeResult = resolveRange(url);
    if (!rangeResult.ok) {
      const err = rangeResult;
      return toJsonError(err.error, err.status, err.step, debugMode);
    }

    const db = env.DB as D1Database;
    const tableInfo = await db.prepare("PRAGMA table_info(orders)").all<any>();
    const columns = (tableInfo?.results || []).map((r: any) => String(r?.name || ""));
    detectedColumns = columns;

    const has = (col: string) => columns.includes(col);

    const createdCol = has("created_at") ? "created_at" : has("placed_at") ? "placed_at" : null;
    if (!createdCol) {
      return toJsonError(
        "orders_created_column_missing",
        500,
        "detect_schema",
        debugMode,
        "Expected one of: created_at, placed_at",
        { columns: detectedColumns },
      );
    }

    const statusExpr = has("status") ? "LOWER(COALESCE(status, 'pending'))" : "'placed'";

    const totalExpr = has("total_cents")
      ? "COALESCE(total_cents, 0)"
      : `COALESCE(${has("subtotal_cents") ? "subtotal_cents" : "0"}, 0) + COALESCE(${has("tax_cents") ? "tax_cents" : "0"}, 0)`;

    const sql = `
      SELECT
        COALESCE(SUM(CASE WHEN ${statusExpr} = 'completed' THEN (${totalExpr}) ELSE 0 END), 0) AS revenue_completed_cents,
        COALESCE(SUM(CASE WHEN ${statusExpr} != 'completed' AND ${statusExpr} NOT IN ('cancelled', 'canceled') THEN (${totalExpr}) ELSE 0 END), 0) AS pending_cents,
        COALESCE(SUM(CASE WHEN ${statusExpr} IN ('cancelled', 'canceled') THEN (${totalExpr}) ELSE 0 END), 0) AS cancelled_cents,
        COALESCE(SUM(CASE WHEN ${statusExpr} = 'completed' THEN 1 ELSE 0 END), 0) AS orders_completed_count,
        COALESCE(SUM(CASE WHEN ${statusExpr} != 'completed' AND ${statusExpr} NOT IN ('cancelled', 'canceled') THEN 1 ELSE 0 END), 0) AS orders_pending_count,
        COALESCE(SUM(CASE WHEN ${statusExpr} IN ('cancelled', 'canceled') THEN 1 ELSE 0 END), 0) AS orders_cancelled_count
      FROM orders
      WHERE ${createdCol} >= ? AND ${createdCol} < ?
    `;

    const row = await db.prepare(sql).bind(rangeResult.range.start, rangeResult.range.end).first<any>();

    const revenueCompleted = Number(row?.revenue_completed_cents || 0);
    const pendingCents = Number(row?.pending_cents || 0);
    const cancelledCents = Number(row?.cancelled_cents || 0);
    const completedCount = Number(row?.orders_completed_count || 0);
    const pendingCount = Number(row?.orders_pending_count || 0);
    const cancelledCount = Number(row?.orders_cancelled_count || 0);

    return json({
      ok: true,
      range: rangeResult.range,
      rangeLabel: rangeResult.rangeLabel,
      metrics: {
        revenue_completed_cents: revenueCompleted,
        pending_cents: pendingCents,
        cancelled_cents: cancelledCents,
        aov_completed_cents: completedCount > 0 ? Math.floor(revenueCompleted / completedCount) : 0,
        orders_completed_count: completedCount,
        orders_pending_count: pendingCount,
        orders_cancelled_count: cancelledCount,
      },
    });
  } catch (err: any) {
    return toJsonError(
      "dashboard_failed",
      500,
      "unhandled",
      debugMode,
      err?.message ? String(err.message) : "unknown_error",
      { columns: detectedColumns },
    );
  }
};
