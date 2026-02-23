import { json } from "../../../_auth";
import { nowIso, requireAdminRequest } from "../../_helpers";

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  const db = env.DB as D1Database;
  const { results } = await db.prepare("SELECT tag, created_at, created_by_admin_id FROM customer_tags WHERE user_id = ? ORDER BY tag ASC").bind(id).all();
  return json({ ok: true, tags: results || [] });
};

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);
  const body = await request.json<any>().catch(() => null);
  const tag = String(body?.tag || "").trim();
  if (!tag) return json({ error: "tag required" }, 400);

  const db = env.DB as D1Database;
  try {
    await db.prepare("INSERT INTO customer_tags (user_id, tag, created_at, created_by_admin_id) VALUES (?, ?, ?, ?)").bind(id, tag, nowIso(), auth.adminId).run();
  } catch {
    return json({ error: "Tag already exists" }, 409);
  }

  return json({ ok: true });
};

export const onRequestPut: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);
  const body = await request.json<any>().catch(() => null);
  const tagsRaw = Array.isArray(body?.tags) ? body.tags : String(body?.tags || "").split(",");
  const tags = Array.from(new Set(tagsRaw.map((t: any) => String(t || "").trim()).filter(Boolean)));

  const db = env.DB as D1Database;
  await db.prepare("DELETE FROM customer_tags WHERE user_id = ?").bind(id).run();
  for (const tag of tags) {
    await db.prepare("INSERT INTO customer_tags (user_id, tag, created_at, created_by_admin_id) VALUES (?, ?, ?, ?)").bind(id, tag, nowIso(), auth.adminId).run();
  }
  return json({ ok: true, tags });
};
