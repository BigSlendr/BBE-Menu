import { json, requireSuperAdmin } from "../../../_auth";

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireSuperAdmin(request, env);
  if (auth instanceof Response) return auth;

  const id = String(params?.id || "").trim();
  if (!id) return json({ ok: false, error: "id_required" }, 400);

  const db = env.DB as D1Database;
  const target = await db.prepare("SELECT id, is_active, is_super_admin FROM admin_users WHERE id=?").bind(id).first<any>();
  if (!target) return json({ ok: false, error: "not_found" }, 404);

  const nextActive = Number(target.is_active || 0) === 1 ? 0 : 1;
  if (nextActive === 0 && Number(target.is_super_admin || 0) === 1) {
    const count = await db.prepare("SELECT COUNT(*) AS c FROM admin_users WHERE COALESCE(is_active,1)=1 AND COALESCE(is_super_admin,0)=1 AND id != ?").bind(id).first<any>();
    if (Number(count?.c || 0) < 1) return json({ ok: false, error: "cannot_remove_last_super_admin" }, 400);
  }

  await db.prepare("UPDATE admin_users SET is_active=?, updated_at=? WHERE id=?").bind(nextActive, new Date().toISOString(), id).run();
  return json({ ok: true, is_active: nextActive });
};
