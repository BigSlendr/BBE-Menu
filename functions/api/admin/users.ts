import { hashPassword, json, uuid } from "../auth/_utils";
import { ensureAdminAuthSchema, requirePasswordReady, requireSuperAdmin } from "./_auth";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  const passwordGate = requirePasswordReady(auth);
  if (passwordGate) return passwordGate;

  const db = env.DB as D1Database;
  await ensureAdminAuthSchema(db);

  const { results } = await db
    .prepare(
      "SELECT id, email, role, COALESCE(is_active,1) AS is_active, created_at, COALESCE(must_change_password,0) AS must_change_password, password_updated_at FROM admins ORDER BY created_at DESC"
    )
    .all<any>();

  return json({ ok: true, admins: results || [] });
};

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  const passwordGate = requirePasswordReady(auth);
  if (passwordGate) return passwordGate;

  const body = await request.json<any>().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const tempPassword = String(body?.tempPassword || "");
  const role = String(body?.role || "admin").toLowerCase() === "superadmin" ? "superadmin" : "admin";

  if (!email || !tempPassword || tempPassword.length < 8) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  const db = env.DB as D1Database;
  await ensureAdminAuthSchema(db);

  const existing = await db.prepare("SELECT id FROM admins WHERE lower(email)=lower(?)").bind(email).first<any>();
  if (existing) return json({ ok: false, error: "email_in_use" }, 409);

  const id = uuid();
  await db
    .prepare(
      "INSERT INTO admins (id, email, password_hash, role, is_active, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, 1, datetime('now'))"
    )
    .bind(id, email, await hashPassword(tempPassword), role)
    .run();

  const inserted = await db
    .prepare("SELECT id, email, role, COALESCE(must_change_password,0) AS must_change_password FROM admins WHERE id = ?")
    .bind(id)
    .first<any>();

  return json({
    ok: true,
    admin: {
      id: inserted?.id ?? id,
      email: inserted?.email ?? email,
      role: inserted?.role ?? role,
      mustChangePassword: true,
    },
  });
};
