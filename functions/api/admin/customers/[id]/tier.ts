import { json } from "../../../_auth";
import { nowIso, requireAdminRequest, TIERS } from "../../_helpers";

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const now = nowIso();
  const tier_override = body?.tier_override == null ? null : String(body.tier_override).trim().toLowerCase();
  const reason = body?.reason == null ? null : String(body.reason).trim() || null;

  const db = env.DB as D1Database;

  if (tier_override === null || tier_override === "") {
    await db
      .prepare(
        `UPDATE users
         SET tier_override = NULL,
             tier_override_reason = NULL,
             tier_override_at = NULL,
             tier_override_by_admin_id = NULL,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(now, id)
      .run();
    return json({ ok: true, cleared: true });
  }

  if (!TIERS.has(tier_override)) return json({ error: "Invalid tier_override" }, 400);

  await db
    .prepare(
      `UPDATE users
       SET tier_override = ?,
           tier_override_reason = ?,
           tier_override_at = ?,
           tier_override_by_admin_id = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .bind(tier_override, reason, now, auth.adminId, now, id)
    .run();

  return json({ ok: true });
};
