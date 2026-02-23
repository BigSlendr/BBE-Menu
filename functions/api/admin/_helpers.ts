import { json } from "../auth/_utils";
import { requireAdmin, requirePasswordReady } from "./_auth";

export const TIERS = new Set(["member", "insider", "elite", "reserve"]);

export const requireAdminSession = async (request: Request, env: any) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return null;
  return admin;
};

export const requireAdminRequest = async (request: Request, env: any, opts?: { allowPasswordChangeRequired?: boolean }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return { ok: false as const, response: admin };

  if (!opts?.allowPasswordChangeRequired) {
    const passwordGate = requirePasswordReady(admin);
    if (passwordGate) return { ok: false as const, response: passwordGate };
  }

  return { ok: true as const, admin, adminId: String(admin.id) };
};

export const nowIso = () => new Date().toISOString();

export { json };
