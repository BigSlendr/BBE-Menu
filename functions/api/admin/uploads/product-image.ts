import { json } from "../../_auth";
import { sanitizeFilename } from "../../_products";
import { requireAdminRequest } from "../_helpers";

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const bucket = env.BBE_IMAGES as R2Bucket | undefined;
  if (!bucket) {
    return json(
      {
        ok: false,
        error: "no_r2_configured",
        hint: "Bind R2 bucket as BBE_IMAGES in Pages settings",
      },
      400,
    );
  }

  const form = await request.formData();
  const file = form.get("image") || form.get("file");
  const productId = String(form.get("productId") || crypto.randomUUID());
  if (!(file instanceof File)) return json({ ok: false, error: "image_required" }, 400);
  if (!file.type.startsWith("image/")) return json({ ok: false, error: "invalid_type" }, 400);
  if (file.size > 5 * 1024 * 1024) return json({ ok: false, error: "file_too_large" }, 400);

  const key = `products/${productId}/${Date.now()}-${sanitizeFilename(file.name)}`;
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  return json({ ok: true, key, url: `/api/images/${encodeURIComponent(key)}`, image_key: key, public_url: `/api/images/${encodeURIComponent(key)}` });
};
