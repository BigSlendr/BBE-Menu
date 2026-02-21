import { json } from "../../_auth";
import { requireAdminRequest } from "../_helpers";

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "order id required" }, 400);

  const db = env.DB as D1Database;
  const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!order) return json({ error: "Order not found" }, 404);

  return json({ ok: true, order });
};
