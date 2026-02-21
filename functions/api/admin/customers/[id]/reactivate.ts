import { json } from "../../../_auth";
import { nowIso, requireAdminRequest } from "../../_helpers";

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);

  const now = nowIso();
  const db = env.DB as D1Database;

  await db
    .prepare(
      `UPDATE users
       SET is_active = 1,
           deactivated_at = NULL,
           deactivation_reason = NULL,
           updated_at = ?
       WHERE id = ?`
    )
    .bind(now, id)
    .run();

  return json({ ok: true });
};
