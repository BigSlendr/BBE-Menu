import { json } from "../_auth";
import { requireAdminRequest } from "./_helpers";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const db = env.DB as D1Database;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [totalUsers, activeUsers, recentOrders, pendingVerification] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS c FROM users").first<{ c: number }>(),
    db.prepare("SELECT COUNT(*) AS c FROM users WHERE COALESCE(is_active, 1) = 1").first<{ c: number }>(),
    db.prepare("SELECT COUNT(*) AS c FROM orders WHERE created_at >= ?").bind(since).first<{ c: number }>(),
    db.prepare("SELECT COUNT(*) AS c FROM users WHERE COALESCE(account_status, 'pending') = 'pending'").first<{ c: number }>(),
  ]);

  return json({
    ok: true,
    metrics: {
      totalUsers: Number(totalUsers?.c || 0),
      activeUsers: Number(activeUsers?.c || 0),
      ordersLast7Days: Number(recentOrders?.c || 0),
      pendingVerification: Number(pendingVerification?.c || 0),
    },
  });
};
