import { json } from "../../_auth";
import { nowIso, toBoolInt } from "../../_products";
import { requireAdminRequest } from "../_helpers";

export const onRequestPut: PagesFunction = async ({ params, request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params.id || "").trim();
  if (!id) return json({ error: "Missing variant id" }, 400);

  const body = await request.json<any>();
  const label = String(body?.label || "").trim();
  const priceCents = Number(body?.price_cents);
  if (!label) return json({ error: "label is required" }, 400);
  if (!Number.isFinite(priceCents) || priceCents < 0) return json({ error: "price_cents must be >= 0" }, 400);

  const db = env.DB as D1Database;
  await db
    .prepare(
      `UPDATE product_variants
       SET label = ?, price_cents = ?, low_stock_threshold = ?, is_active = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      label,
      Math.round(priceCents),
      body?.low_stock_threshold === undefined || body?.low_stock_threshold === null || body.low_stock_threshold === "" ? null : Math.max(0, Number(body.low_stock_threshold) || 0),
      toBoolInt(body?.is_active, 1),
      Number(body?.sort_order || 0) || 0,
      nowIso(),
      id
    )
    .run();

  const variant = await db.prepare("SELECT * FROM product_variants WHERE id = ?").bind(id).first<any>();
  if (!variant) return json({ error: "Variant not found" }, 404);
  return json({ ok: true, variant });
};

export const onRequestDelete: PagesFunction = async ({ params, request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params.id || "").trim();
  if (!id) return json({ error: "Missing variant id" }, 400);

  const db = env.DB as D1Database;
  await db.prepare("UPDATE product_variants SET is_active = 0, updated_at = ? WHERE id = ?").bind(nowIso(), id).run();

  return json({ ok: true });
};
