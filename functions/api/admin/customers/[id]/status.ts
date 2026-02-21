import { json } from "../../../_auth";
import { nowIso, requireAdminRequest } from "../../_helpers";

const VALID = new Set(["approved", "denied", "pending"]);

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

  const status = String(body?.account_status || "").trim().toLowerCase();
  if (!VALID.has(status)) return json({ error: "account_status must be approved|denied|pending" }, 400);

  const reason = body?.status_reason == null ? null : String(body.status_reason).trim() || null;
  const now = nowIso();

  const verified_at = status === "approved" ? now : null;
  const verified_by_admin_id = status === "approved" ? auth.adminId : null;
  const status_reason = status === "denied" ? reason : null;

  const db = env.DB as D1Database;

  await db
    .prepare(
      `UPDATE users
       SET account_status = ?, verified_at = ?, verified_by_admin_id = ?, status_reason = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(status, verified_at, verified_by_admin_id, status_reason, now, id)
    .run();

  await db
    .prepare(
      `INSERT INTO user_verification (user_id, status, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
    )
    .bind(id, status, now)
    .run();

  return json({ ok: true });
};
