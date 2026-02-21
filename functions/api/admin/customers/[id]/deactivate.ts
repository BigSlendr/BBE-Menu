import { json } from "../../../_auth";
import { nowIso, requireAdminRequest } from "../../_helpers";

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);

  let body: any = {};
  try { body = await request.json(); } catch {}

  const reason = body?.reason == null ? null : String(body.reason).trim() || null;
  const now = nowIso();
  const db = env.DB as D1Database;

  await db
    .prepare(
      `UPDATE users
       SET is_active = 0,
           deactivated_at = ?,
           deactivation_reason = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .bind(now, reason, now, id)
    .run();

  await db.prepare("DELETE FROM sessions WHERE user_id = ? AND role = 'user'").bind(id).run();
  return json({ ok: true });
};
