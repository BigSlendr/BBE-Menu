import { json } from "../../_auth";
import { sanitizeFilename } from "../../_products";
import { requireAdminRequest } from "../_helpers";

const resolveBucket = (env: Env): R2Bucket | undefined => env.BBE_IMAGES as R2Bucket | undefined;

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const bucket = resolveBucket(env as Env);
  if (!bucket) {
    return json({ ok: false, error: "no_r2_configured", hint: "Bind R2 bucket as BBE_IMAGES in Pages settings" }, 400);
  }

  const form = await request.formData();
  const fileEntry = form.get("file");
  const productId = String(form.get("product_id") || form.get("productId") || "").trim();

  if (!productId) return json({ ok: false, error: "missing_product_id" }, 400);
  if (!(fileEntry instanceof File)) return json({ ok: false, error: "missing_file" }, 400);
  if (!fileEntry.type.startsWith("image/")) return json({ ok: false, error: "invalid_type" }, 400);
  if (fileEntry.size > 5 * 1024 * 1024) return json({ ok: false, error: "file_too_large" }, 400);

  const cleanedName = sanitizeFilename(fileEntry.name || "upload");
  const key = `products/${productId}/${Date.now()}-${cleanedName}`;

  await bucket.put(key, await fileEntry.arrayBuffer(), {
    httpMetadata: { contentType: fileEntry.type },
  });

  const publicBase = String((env as any).PUBLIC_IMAGE_BASE_URL || "").trim().replace(/\/+$/, "");
  const url = publicBase ? `${publicBase}/${key}` : `/api/images/${encodeURIComponent(key)}`;
  return json({ ok: true, key, url });
};
