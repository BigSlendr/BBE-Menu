import { hashPassword, uuid } from "../../auth/_utils";
import { adminAuthJson, ensureAdminSessionSchema, getErrorMessage } from "./_helpers";

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const db = env.DB as D1Database;
    await ensureAdminSessionSchema(db);
    const body = await request.json<any>().catch(() => null);
    const secret = String(body?.secret || "").trim();
    const email = String(body?.email || env.OWNER_EMAIL || "").trim().toLowerCase();
    const password = String(body?.password || env.OWNER_PASSWORD || "");
    const name = String(body?.name || env.OWNER_NAME || "").trim();

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

    return adminAuthJson({ ok: true }, 200);
  } catch (err) {
    return adminAuthJson({ ok: false, error: "server_error", msg: getErrorMessage(err) }, 500, "exception", "server_error", "Unhandled bootstrap error");
  }
};

export const onRequestGet: PagesFunction = async ({ env }) => {
  try {
    const db = env.DB as D1Database;
    await ensureAdminSessionSchema(db);
    const row = await db.prepare("SELECT COUNT(*) AS count FROM admin_users").first<any>();
    return adminAuthJson({ ok: true, needs_bootstrap: Number(row?.count || 0) === 0 }, 200);
  } catch (err) {
    return adminAuthJson({ ok: false, error: "server_error", msg: getErrorMessage(err) }, 500, "exception", "server_error", "Unhandled bootstrap status error");
  }
};
