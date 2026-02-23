import { json } from "../../../_auth";
import { nowIso, requireAdminRequest } from "../../_helpers";
import { ensureRewardsAdminSchema } from "../../_rewards-admin";

export const onRequestPut: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;
  if (auth.admin.role !== "superadmin") return json({ ok: false, error: "forbidden" }, 403);

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);

  const body = await request.json<any>().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const tier_override_code = body?.tier_override_code == null ? null : String(body.tier_override_code).trim().toLowerCase();
  const notes = body?.notes == null ? null : String(body.notes).trim() || null;

  const db = env.DB as D1Database;
  await ensureRewardsAdminSchema(db);

  if (tier_override_code) {
    const found = await db.prepare("SELECT code FROM reward_tiers WHERE LOWER(code)=LOWER(?) LIMIT 1").bind(tier_override_code).first();
    if (!found) return json({ error: "invalid_tier_override_code" }, 400);
  }

  const now = nowIso();
  await db.prepare("INSERT INTO customer_rewards (user_id, tier_override_code, updated_at, notes) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET tier_override_code=excluded.tier_override_code, updated_at=excluded.updated_at, notes=excluded.notes")
    .bind(id, tier_override_code, now, notes).run();

  return json({ ok: true, tier_override_code: tier_override_code || null });
};

export const onRequestPost = onRequestPut;
