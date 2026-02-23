import { json } from "../auth/_utils";
import { requireAdmin } from "./_auth";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  return json(
    {
      ok: true,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
      must_change_password: admin.force_password_change === 1,
    },
    200
  );
};
