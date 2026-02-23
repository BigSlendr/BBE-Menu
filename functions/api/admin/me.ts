import { json } from "../auth/_utils";
import { requireAdminRequest } from "./_helpers";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env, { allowPasswordChangeRequired: true });
  if (!auth.ok) return auth.response;

  const admin = auth.admin;

  return json({
    ok: true,
    admin: {
      id: Number(admin.id),
      email: String(admin.email || ""),
      role: String(admin.role || "admin"),
    },
    must_change_password: Number(admin.must_change_password || 0) === 1,
  });
};
