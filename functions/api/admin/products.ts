import { json } from "../_auth";
import { createId, getTableColumns, nowIso, parseEffects, slugify, toBoolInt, uniqueSlug } from "../_products";
import { requireAdminRequest } from "./_helpers";

const productRow = (row: any) => ({
  ...row,
  effects: parseEffects(row.effects_json),
  is_published: Number(row.is_published || 0),
  is_featured: Number(row.is_featured || 0),
});

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;
  const db = env.DB as D1Database;
  const url = new URL(request.url);

  const columns = await getTableColumns(db, "products");
  const hasFeatured = columns.has("is_featured");

  const query = (url.searchParams.get("query") || url.searchParams.get("q") || "").trim();
  const category = (url.searchParams.get("category") || "").trim();
  const subcategory = (url.searchParams.get("subcategory") || "").trim();
  const featured = (url.searchParams.get("featured") || "").trim();
  const published = (url.searchParams.get("published") || "").trim();

  const where: string[] = [];
  const binds: unknown[] = [];
  if (query) {
    const like = `%${query}%`;
    where.push("(p.name LIKE ? COLLATE NOCASE OR p.slug LIKE ? COLLATE NOCASE OR COALESCE(p.brand, '') LIKE ? COLLATE NOCASE)");
    binds.push(like, like, like);
  }
  if (category) {
    where.push("LOWER(COALESCE(p.category, '')) = LOWER(?)");
    binds.push(category);
  }
  if (subcategory) {
    where.push("LOWER(COALESCE(p.subcategory, '')) = LOWER(?)");
    binds.push(subcategory);
  }
  if ((featured === "0" || featured === "1") && hasFeatured) {
    where.push("COALESCE(p.is_featured, 0) = ?");
    binds.push(Number(featured));
  }
  if (published === "0" || published === "1") {
    where.push("COALESCE(p.is_published, 1) = ?");
    binds.push(Number(published));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { results } = await db
    .prepare(
      `SELECT p.*, COUNT(v.id) AS variant_count, MIN(CASE WHEN v.is_active=1 THEN v.price_cents END) AS from_price_cents
       FROM products p LEFT JOIN product_variants v ON v.product_id = p.id ${whereSql}
       GROUP BY p.id ORDER BY p.updated_at DESC`
    )
    .bind(...binds)
    .all<any>();

  return json({ ok: true, products: (results || []).map(productRow) });
};

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;
  const db = env.DB as D1Database;
  const body = await request.json<any>();
  const columns = await getTableColumns(db, "products");

  const name = String(body?.name || body?.title || "").trim();
  const category = String(body?.category || "").trim();
  if (!name || !category) return json({ error: "name and category are required" }, 400);

  const id = createId("prd");
  const slug = await uniqueSlug(db, String(body?.slug || name));
  const now = nowIso();
  const effects = Array.isArray(body?.effects)
    ? body.effects.map((x: unknown) => String(x).trim()).filter(Boolean)
    : String(body?.effects || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

  const values: Record<string, unknown> = {
    id,
    slug: slugify(slug),
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
    created_at: now,
    updated_at: now,
  };

  const insertColumns = Object.keys(values).filter((column) => columns.has(column));
  const sql = `INSERT INTO products (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`;
  await db.prepare(sql).bind(...insertColumns.map((column) => values[column])).run();

  const variants = Array.isArray(body?.variants) ? body.variants : [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i] || {};
    if (!v.label) continue;
    await db
      .prepare(
        `INSERT INTO product_variants (id, product_id, label, price_cents, sort_order, is_active, inventory_qty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .bind(createId("var"), id, String(v.label).trim(), Math.round(Number(v.price_cents || 0) || 0), Number(v.sort_order ?? i), toBoolInt(v.is_active, 1), now, now)
      .run();
  }

  const product = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<any>();
  return json({ ok: true, product: productRow(product) }, 201);
};
