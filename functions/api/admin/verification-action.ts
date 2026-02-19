import { json, requireAdmin } from "../_auth";

export const onRequestPost: PagesFunction = async (context) => {
  const { request, env } = context;

  if (!requireAdmin(request, env)) return json({ error: "Forbidden" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const user_id = String(body?.user_id || "").trim();
  const action = String(body?.action || "").trim();

  if (!user_id) return json({ error: "user_id required" }, 400);
  if (action !== "approve" && action !== "reject") {
    return json({ error: "action must be approve|reject" }, 400);
  }

  const status = action === "approve" ? "approved" : "rejected";

  const db = env.DB as D1Database;
  const now = new Date().toISOString();

  await db
    .prepare("UPDATE user_verification SET status = ?, updated_at = ? WHERE user_id = ?")
    .bind(status, now, user_id)
    .run();

  return json({ ok: true });
};
