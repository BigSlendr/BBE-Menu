import { json, requireOwner } from "../../_auth";
import { createId, getTableColumns, nowIso, parseEffects, slugify, toBoolInt } from "../../_products";
import { requireAdminRequest } from "../_helpers";

const mapProduct = (p: any) => ({ ...p, effects: parseEffects(p.effects_json), is_featured: Number(p?.is_featured || 0) });

export const onRequestGet: PagesFunction = async ({ params, request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;
  const id = String(params.id || "").trim();
  const db = env.DB as D1Database;
  const product = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<any>();
  if (!product) return json({ error: "Not found" }, 404);
  const variants = await db.prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order ASC, price_cents ASC").bind(id).all<any>();
  return json({ ok: true, product: mapProduct(product), variants: variants.results || [] });
};

export const onRequestPut: PagesFunction = async ({ params, request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;
  const id = String(params.id || "").trim();
  const body = await request.json<any>();
  const db = env.DB as D1Database;
  const columns = await getTableColumns(db, "products");

  const slug = slugify(String(body?.slug || ""));
  const name = String(body?.name || "").trim();
  const category = String(body?.category || "").trim();
  if (!slug || !name || !category) return json({ error: "name, slug, category required" }, 400);

  const conflict = await db.prepare("SELECT id FROM products WHERE slug = ? AND id != ?").bind(slug, id).first();
  if (conflict) return json({ error: "Slug already in use" }, 409);

  const effects = Array.isArray(body?.effects)
    ? body.effects.map((x: unknown) => String(x).trim()).filter(Boolean)
    : String(body?.effects || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

  const updates: Record<string, unknown> = {
    slug,
    name,
    brand: String(body?.brand || "").trim() || null,
    category,
    subcategory: String(body?.subcategory || body?.type || "").trim() || null,
    description: String(body?.description || "").trim() || null,
    effects_json: JSON.stringify(effects),
    image_key: String(body?.image_key || "").trim() || null,
    image_url: String(body?.image_url || "").trim() || null,
    image_path: String(body?.image_path || "").trim() || null,
    is_published: toBoolInt(body?.is_published, 1),
    is_featured: toBoolInt(body?.is_featured, 0),
    updated_at: nowIso(),
  };

  const setColumns = Object.keys(updates).filter((column) => columns.has(column));
  await db.prepare(`UPDATE products SET ${setColumns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`).bind(...setColumns.map((column) => updates[column]), id).run();

  if (Array.isArray(body?.variants)) {
    await db.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(id).run();
    for (let i = 0; i < body.variants.length; i++) {
      const v = body.variants[i] || {};
      if (!v.label) continue;
      const now = nowIso();
      await db
        .prepare(
          `INSERT INTO product_variants (id, product_id, label, price_cents, sort_order, is_active, inventory_qty, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
        )
        .bind(createId("var"), id, String(v.label).trim(), Math.round(Number(v.price_cents || 0) || 0), Number(v.sort_order ?? i), toBoolInt(v.is_active, 1), now, now)
        .run();
    }
  }

  const product = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<any>();
  return json({ ok: true, product: mapProduct(product) });
};

export const onRequestDelete: PagesFunction = async ({ params, request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;
  const id = String(params.id || "").trim();
  const url = new URL(request.url);
  const hard = url.searchParams.get("hard") === "true" || url.searchParams.get("hard") === "1";
  const confirm = (url.searchParams.get("confirm") || "").toLowerCase();
  const db = env.DB as D1Database;

  if (!hard) {
    await db.prepare("UPDATE products SET is_published = 0, updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
    return json({ ok: true, mode: "unpublish" });
  }

  const owner = await requireOwner(request, env);
  if (owner instanceof Response) return owner;
  if (confirm !== "delete") return json({ ok: false, error: "owner_confirm_required", code: "OWNER_CONFIRM_REQUIRED" }, 400);

  await db.prepare("DELETE FROM inventory_movements WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = ?)").bind(id).run();
  await db.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(id).run();
  await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  return json({ ok: true, mode: "hard_delete" });
};

export const onRequestPatch = onRequestPut;
