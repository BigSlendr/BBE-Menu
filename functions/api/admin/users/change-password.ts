import { hashPassword, json, verifyPassword } from "../../auth/_utils";
import { ensureAdminAuthSchema } from "../_auth";
import { requireAdminRequest } from "../_helpers";

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env, { allowPasswordChangeRequired: true });
  if (!auth.ok) return auth.response;

  const body = await request.json<any>().catch(() => null);
  const currentPassword = String(body?.current_password ?? body?.currentPassword ?? "");
  const newPassword = String(body?.new_password ?? body?.newPassword ?? "");

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  const db = env.DB as D1Database;
  await ensureAdminAuthSchema(db);

  const admin = await db
    .prepare("SELECT id, password_hash FROM admins WHERE id = ? LIMIT 1")
    .bind(auth.admin.id)
    .first<any>();

  if (!admin) return json({ ok: false, error: "unauthorized" }, 401);

  const validCurrent = await verifyPassword(currentPassword, String(admin.password_hash || ""));
  if (!validCurrent) {
    return json({ ok: false, error: "invalid_current_password" }, 401);
  }

  await db
    .prepare("UPDATE admins SET password_hash = ?, must_change_password = 0, password_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .bind(await hashPassword(newPassword), auth.admin.id)
    .run();

  return json({ ok: true });
};
