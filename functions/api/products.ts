import { json } from "./_auth";
import { parseEffects } from "./_products";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const db = env.DB as D1Database;
  const url = new URL(request.url);

  const category = (url.searchParams.get("category") || "").trim();
  const subcategory = (url.searchParams.get("subcategory") || "").trim();
  const brand = (url.searchParams.get("brand") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();

  const where = ["p.is_published = 1"];
  const binds: unknown[] = [];

  if (category) {
    where.push("p.category = ?");
    binds.push(category);
  }
  if (subcategory) {
    where.push("p.subcategory = ?");
    binds.push(subcategory);
  }
  if (brand) {
    where.push("p.brand = ?");
    binds.push(brand);
  }
  if (q) {
    where.push("(p.name LIKE ? COLLATE NOCASE OR p.brand LIKE ? COLLATE NOCASE OR p.description LIKE ? COLLATE NOCASE)");
    const like = `%${q}%`;
    binds.push(like, like, like);
  }

  const { results } = await db
    .prepare(
      `SELECT
        p.id,
        p.slug,
        p.name,
        p.brand,
        p.category,
        p.subcategory,
        p.image_path,
        p.effects_json,
        MIN(CASE WHEN v.is_active = 1 THEN v.price_cents END) AS from_price_cents
      FROM products p
      LEFT JOIN product_variants v ON v.product_id = p.id
      WHERE ${where.join(" AND ")}
      GROUP BY p.id
      ORDER BY p.is_featured DESC, p.updated_at DESC`
    )
    .bind(...binds)
    .all();

  const products = (results || []).map((row: any) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    image_path: row.image_path,
    effects: parseEffects(row.effects_json),
    from_price_cents: row.from_price_cents === null ? null : Number(row.from_price_cents),
  }));

  return json({ ok: true, products });
};
