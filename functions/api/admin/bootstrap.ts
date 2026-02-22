import { hashPassword, uuid } from "../auth/_utils";
import { adminAuthJson } from "./auth/_helpers";

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const db = env.DB as D1Database;
  const body = await request.json<any>().catch(() => ({}));

  const secret = String(body?.secret || "").trim();
  const email = String(body?.email || env.OWNER_EMAIL || "").trim().toLowerCase();
  const name = String(body?.name || env.OWNER_NAME || "").trim();
  const password = String(body?.password || env.OWNER_PASSWORD || "");

  if (!env.ADMIN_BOOTSTRAP_SECRET || secret !== String(env.ADMIN_BOOTSTRAP_SECRET)) {
    return adminAuthJson({ ok: false, error: "invalid_secret" }, 403);
  }
  if (!email || !password || password.length < 8) {
    return adminAuthJson({ ok: false, error: "invalid_payload" }, 400);
  }

  const now = new Date().toISOString();
  const existing = await db.prepare("SELECT id FROM admin_users WHERE lower(email)=lower(?)").bind(email).first<{ id: string }>();

  if (existing) {
    await db
      .prepare("UPDATE admin_users SET name=?, password_hash=?, is_active=1, is_super_admin=1, updated_at=? WHERE id=?")
      .bind(name || null, await hashPassword(password), now, existing.id)
      .run();
  } else {
    await db
      .prepare("INSERT INTO admin_users (id, email, name, password_hash, is_active, is_super_admin, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)")
      .bind(uuid(), email, name || null, await hashPassword(password), now, now)
      .run();
  }

  return adminAuthJson({ ok: true });
};
