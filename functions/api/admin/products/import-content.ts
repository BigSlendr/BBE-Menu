import { json } from "../../_auth";
import { createId, nowIso } from "../../_products";
import { requireAdminRequest } from "../_helpers";

type ContentProduct = {
  id?: unknown;
  name?: unknown;
  brand?: unknown;
  category?: unknown;
  subcategory?: unknown;
  description?: unknown;
  effects?: unknown;
  image?: unknown;
  prices?: Record<string, unknown>;
};

const SIZE_ORDER = ["g3_5", "g7", "g14", "g28"];
const SIZE_LABELS: Record<string, string> = {
  g3_5: "3.5g",
  g7: "7g",
  g14: "14g",
  g28: "28g",
};

const asText = (value: unknown) => String(value || "").trim();

const normalizeImagePath = (image: unknown, slug: string) => {
  const raw = asText(image).replace(/\\/g, "/");
  if (raw) {
    const name = raw.split("/").filter(Boolean).pop() || "";
    if (name) return `/images/${name}`;
  }
  return `/images/${slug}.png`;
};

const variantLabel = (key: string) => SIZE_LABELS[key] || key.replace(/^g/, "") + "g";

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const db = env.DB as D1Database;
  const sourceUrl = new URL("/content/products.json", request.url).toString();

  let payload: any;
  try {
    const res = await fetch(sourceUrl, { headers: { accept: "application/json" } });
    if (!res.ok) return json({ error: `Failed to read content catalog (${res.status})` }, 500);
    payload = await res.json();
  } catch (error: any) {
    return json({ error: `Failed to parse content catalog: ${error?.message || "unknown error"}` }, 500);
  }

  const items = Array.isArray(payload?.items) ? (payload.items as ContentProduct[]) : [];
  const summary = {
    productsInserted: 0,
    productsUpdated: 0,
    variantsInserted: 0,
    variantsUpdated: 0,
    skipped: 0,
    errors: [] as Array<{ productId?: string; message: string }>,
  };

  for (const item of items) {
    const slug = asText(item?.id);
    if (!slug) {
      summary.skipped += 1;
      continue;
    }

    try {
      const now = nowIso();
      const name = asText(item?.name);
      const brand = asText(item?.brand) || "Bobby Black Exclusive";
      const category = asText(item?.category) || "Flower";
      const subcategory = asText(item?.subcategory) || null;
      const description = asText(item?.description) || null;
      const effects = Array.isArray(item?.effects) ? item.effects.map((v) => String(v)).filter(Boolean) : [];
      const imagePath = normalizeImagePath(item?.image, slug);

      if (!name) {
        summary.skipped += 1;
        continue;
      }

      const existingProduct = await db.prepare("SELECT id FROM products WHERE slug = ?").bind(slug).first<{ id: string }>();

      let productId = existingProduct?.id || "";
      if (existingProduct) {
        await db
          .prepare(
            `UPDATE products
             SET name = ?, brand = ?, category = ?, subcategory = ?, description = ?, effects_json = ?, image_path = ?, is_published = 1, updated_at = ?
             WHERE id = ?`
          )
          .bind(name, brand, category, subcategory, description, JSON.stringify(effects), imagePath, now, existingProduct.id)
          .run();
        summary.productsUpdated += 1;
        productId = existingProduct.id;
      } else {
        productId = createId("prd");
        await db
          .prepare(
            `INSERT INTO products (id, slug, name, brand, category, subcategory, description, effects_json, image_path, is_published, is_featured, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
          )
          .bind(productId, slug, name, brand, category, subcategory, description, JSON.stringify(effects), imagePath, now, now)
          .run();
        summary.productsInserted += 1;
      }

      const prices = item?.prices && typeof item.prices === "object" ? item.prices : {};
      const keys = Object.keys(prices);
      keys.sort((a, b) => {
        const ai = SIZE_ORDER.indexOf(a);
        const bi = SIZE_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
      });

      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const rawPrice = Number((prices as Record<string, unknown>)[key]);
        if (!Number.isFinite(rawPrice) || rawPrice < 0) {
          summary.skipped += 1;
          continue;
        }

        const label = variantLabel(key);
        const priceCents = Math.round(rawPrice * 100);
        const existingVariant = await db
          .prepare("SELECT id FROM product_variants WHERE product_id = ? AND label = ?")
          .bind(productId, label)
          .first<{ id: string }>();

        if (existingVariant) {
          await db
            .prepare(
              `UPDATE product_variants
               SET price_cents = ?, is_active = 1, sort_order = ?, updated_at = ?
               WHERE id = ?`
            )
            .bind(priceCents, index, now, existingVariant.id)
            .run();
          summary.variantsUpdated += 1;
        } else {
          await db
            .prepare(
              `INSERT INTO product_variants (id, product_id, label, price_cents, inventory_qty, low_stock_threshold, is_active, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?, ?)`
            )
            .bind(createId("var"), productId, label, priceCents, 0, index, now, now)
            .run();
          summary.variantsInserted += 1;
        }
      }
    } catch (error: any) {
      summary.errors.push({
        productId: slug,
        message: error?.message || "unknown error",
      });
    }
  }

  return json({ ok: true, source: "/content/products.json", ...summary });
};
