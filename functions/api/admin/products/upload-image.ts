import { json } from "../../_auth";
import { sanitizeFilename } from "../../_products";
import { requireAdminRequest } from "../_helpers";

const resolveBucket = (env: Env): R2Bucket | undefined => {
  return (env.BBE_IMAGES || env.R2 || env.R2_IMAGES) as R2Bucket | undefined;
};

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const bucket = resolveBucket(env as Env);
  if (!bucket) return json({ ok: false, error: "no_r2_configured" }, 400);

  const form = await request.formData();
  const fileEntry = form.get("file") || form.get("image");
  const productId = String(form.get("productId") || "temp").trim() || "temp";

  if (!(fileEntry instanceof File)) return json({ ok: false, error: "file_required" }, 400);
  if (!fileEntry.type.startsWith("image/")) return json({ ok: false, error: "invalid_type" }, 400);
  if (fileEntry.size > 5 * 1024 * 1024) return json({ ok: false, error: "file_too_large" }, 400);

  const cleanedName = sanitizeFilename(fileEntry.name || "upload");
  const key = `products/${productId}/${Date.now()}-${cleanedName}`;

  await bucket.put(key, await fileEntry.arrayBuffer(), {
    httpMetadata: { contentType: fileEntry.type },
  });

  const url = `/api/images/${encodeURIComponent(key)}`;
  return json({ ok: true, key, url, image_key: key, public_url: url });
};
