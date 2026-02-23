import { json } from "../auth/_utils";
import { requireAdmin } from "./_auth";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const db = env.DB as D1Database | undefined;
  if (!db) {
    return json({ ok: false, error: "db_missing" }, 500);
  }

  const currentAdmin = await db
    .prepare(
      `SELECT
         id,
         email,
         COALESCE(role,'admin') AS role,
         COALESCE(force_password_change,0) AS force_password_change
       FROM admins
       WHERE id = ?
       LIMIT 1`
    )
    .bind(admin.id)
    .first<{ id: string; email: string; role: string; force_password_change: number }>();

  if (!currentAdmin) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  return json(
    {
      ok: true,
      admin: {
        id: currentAdmin.id,
        email: currentAdmin.email,
        role: currentAdmin.role,
      },
      must_change_password: Number(currentAdmin.force_password_change) === 1,
    },
    200
  );
};
