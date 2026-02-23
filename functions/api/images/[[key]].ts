import { json } from "../_auth";

export const onRequestGet: PagesFunction = async ({ params, env }) => {
  const bucket = env.BBE_IMAGES as R2Bucket | undefined;
  if (!bucket) {
    return json({ ok: false, error: "no_r2_configured", hint: "Bind R2 bucket as BBE_IMAGES in Pages settings" }, 404);
  }

  const key = decodeURIComponent(String((params as any).key || "").trim());
  if (!key) return json({ error: "missing_key" }, 400);

  const object = await bucket.get(key);
  if (!object || !object.body) return json({ error: "not_found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=3600");
  return new Response(object.body, { headers });
};
