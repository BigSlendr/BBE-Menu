import { json } from "../../_auth";
import { nowIso, parseEffects, slugify, toBoolInt } from "../../_products";
import { requireAdminRequest } from "../_helpers";

export const onRequestGet: PagesFunction = async ({ params, request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params.id || "").trim();
  if (!id) return json({ error: "Missing id" }, 400);

  const db = env.DB as D1Database;
  const product = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<any>();
  if (!product) return json({ error: "Not found" }, 404);

  const variants = await db
    .prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order ASC, price_cents ASC")
    .bind(id)
    .all<any>();

  return json({ ok: true, product: { ...product, effects: parseEffects(product.effects_json) }, variants: variants.results || [] });
};

export const onRequestPut: PagesFunction = async ({ params, request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params.id || "").trim();
  if (!id) return json({ error: "Missing id" }, 400);

  const db = env.DB as D1Database;
  const body = await request.json<any>();

  const name = String(body?.name || "").trim();
  const slug = String(body?.slug || "").trim();
  const brand = String(body?.brand || "").trim();
  const category = String(body?.category || "").trim();
  if (!name || !slug || !brand || !category) return json({ error: "name, slug, brand, and category are required" }, 400);

  const existingSlug = await db
    .prepare("SELECT id FROM products WHERE slug = ? AND id != ?")
    .bind(slugify(slug), id)
    .first();
  if (existingSlug) return json({ error: "Slug already in use" }, 409);

  const updatedAt = nowIso();
  const effects = Array.isArray(body?.effects) ? body.effects.map((v: unknown) => String(v)).filter(Boolean) : [];

  await db
    .prepare(
      `UPDATE products
       SET slug = ?, name = ?, brand = ?, category = ?, subcategory = ?, description = ?, effects_json = ?, image_path = ?,
           is_published = ?, is_featured = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      slugify(slug),
      name,
      brand,
      category,
      body?.subcategory ? String(body.subcategory).trim() : null,
      body?.description ? String(body.description).trim() : null,
      JSON.stringify(effects),
      body?.image_path ? String(body.image_path).trim() : null,
      toBoolInt(body?.is_published, 1),
      toBoolInt(body?.is_featured, 0),
      updatedAt,
      id
    )
    .run();

  const product = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<any>();
  if (!product) return json({ error: "Not found" }, 404);

  return json({ ok: true, product: { ...product, effects: parseEffects(product.effects_json) } });
};
