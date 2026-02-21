import { json } from "../../_auth";
import { requireAdminRequest } from "../_helpers";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const db = env.DB as D1Database;
  const { results } = await db
    .prepare(
      `SELECT
        id,
        email,
        first_name,
        last_name,
        phone,
        account_status,
        created_at,
        updated_at
      FROM users
      WHERE COALESCE(account_status, 'pending') = 'pending'
      ORDER BY COALESCE(updated_at, created_at) DESC`
    )
    .all();

  return json({ ok: true, users: results || [] });
};
