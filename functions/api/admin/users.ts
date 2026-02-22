import { hashPassword, uuid } from "../auth/_utils";
import { json, requireSuperAdmin } from "../_auth";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  const db = env.DB as D1Database;
  const { results } = await db
    .prepare("SELECT id, email, name, COALESCE(is_active,1) AS is_active, COALESCE(is_super_admin,0) AS is_super_admin, created_at FROM admin_users ORDER BY created_at DESC")
    .all();

  return json({ ok: true, admins: results || [] });
};

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  const body = await request.json<any>().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const name = String(body?.name || "").trim();
  const password = String(body?.password || "");

  if (!email || !password || password.length < 8) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  const db = env.DB as D1Database;
  const existing = await db.prepare("SELECT id FROM admin_users WHERE lower(email)=lower(?)").bind(email).first();
  if (existing) return json({ ok: false, error: "email_in_use" }, 409);

  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO admin_users (id, email, name, password_hash, is_active, is_super_admin, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?)")
    .bind(uuid(), email, name || null, await hashPassword(password), now, now)
    .run();

  return json({ ok: true });
};
