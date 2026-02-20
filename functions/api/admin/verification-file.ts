import { requireAdmin, json } from "../_auth";

export const onRequestGet: PagesFunction = async (context) => {
  const { request, env } = context;

  if (!requireAdmin(request, env)) return json({ error: "Forbidden" }, 403);

  const url = new URL(request.url);
  const key = (url.searchParams.get("key") || "").trim();
  if (!key) return json({ error: "key required" }, 400);

  const obj = await env.VERIFICATIONS.get(key);
  if (!obj) return json({ error: "Not found" }, 404);

  const ct =
    obj.httpMetadata && (obj.httpMetadata as any).contentType
      ? (obj.httpMetadata as any).contentType
      : "application/octet-stream";

  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": ct,
      "cache-control": "no-store",
    },
  });
};
