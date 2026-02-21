import { json } from "../../../../_auth";
import { requireAdminRequest } from "../../../_helpers";

export const onRequestDelete: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  const tag = decodeURIComponent(String(params?.tag || "").trim());
  if (!id || !tag) return json({ error: "customer id and tag required" }, 400);

  const db = env.DB as D1Database;
  await db.prepare("DELETE FROM customer_tags WHERE user_id = ? AND tag = ?").bind(id, tag).run();
  return json({ ok: true });
};
