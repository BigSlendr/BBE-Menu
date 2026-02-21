import { getSessionUserId, json, requireAdmin } from "../_auth";

export const TIERS = new Set(["member", "insider", "elite", "reserve"]);

export const requireAdminRequest = async (request: Request, env: any) => {
  if (!requireAdmin(request, env)) return { ok: false as const, response: json({ error: "Forbidden" }, 403) };
  const adminId = await getSessionUserId(request, env);
  return { ok: true as const, adminId };
};

export const nowIso = () => new Date().toISOString();
