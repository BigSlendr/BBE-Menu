import { getSessionUserId, json } from "./_auth";

interface Env {
  DB: D1Database;
}

type MeRow = {
  id: string;
  email: string;
  account_status: string | null;
  verified_at: string | null;
  status_reason: string | null;
  points_balance: number | null;
  tier: string | null;
  lifetime_spend_cents: number | null;
};

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const user = await env.DB
    .prepare(
      `SELECT id, email, account_status, verified_at, status_reason, points_balance, tier, lifetime_spend_cents
       FROM users
       WHERE id = ?`
    )
    .bind(userId)
    .first<MeRow>();

  if (!user) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  return json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      account_status: user.account_status || "pending",
      verified_at: user.verified_at,
      status_reason: user.status_reason,
      points_balance: Number(user.points_balance || 0),
      tier: user.tier || "member",
      lifetime_spend_cents: Number(user.lifetime_spend_cents || 0),
    },
  });
};
