import { json, requireAdmin } from "../_auth";

export const onRequestGet: PagesFunction = async (context) => {
  const { request, env } = context;

  if (!requireAdmin(request, env)) return json({ error: "Forbidden" }, 403);

  const db = env.DB as D1Database;

  const { results } = await db
    .prepare(
      `SELECT
        uv.user_id,
        u.email,
        u.first_name,
        u.last_name,
        uv.status,
        uv.id_key,
        uv.selfie_key,
        uv.id_expiration,
        uv.updated_at
      FROM user_verification uv
      LEFT JOIN users u ON u.id = uv.user_id
      WHERE uv.status IN ('pending','unverified','rejected')
      ORDER BY uv.updated_at DESC`
    )
    .all();

  return json({ ok: true, verifications: results });
};
