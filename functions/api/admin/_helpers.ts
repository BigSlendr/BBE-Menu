import { json, requireAdmin } from "../_auth";

export const TIERS = new Set(["member", "insider", "elite", "reserve"]);

export const requireAdminSession = async (request: Request, env: any) => {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return null;
  return auth.admin;
};

export const requireAdminRequest = async (request: Request, env: any) => {
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return { ok: false as const, response: auth };
  return { ok: true as const, admin: auth.admin };
};

export const nowIso = () => new Date().toISOString();

export { json };
