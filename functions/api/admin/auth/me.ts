import { requireAdmin } from "../../_auth";
import { adminAuthJson, ensureAdminSessionSchema, getErrorMessage } from "./_helpers";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  try {
    const db = env.DB as D1Database;
    await ensureAdminSessionSchema(db);

    const auth = await requireAdmin(request, env);
    if (auth instanceof Response) {
      return adminAuthJson({ ok: false, error: "not_authenticated" }, 401);
    }

    return adminAuthJson(
      { ok: true, admin: { id: auth.admin.id, email: auth.admin.email, name: auth.admin.name, is_super_admin: Number(auth.admin.is_super_admin) } },
      200
    );
  } catch (err) {
    return adminAuthJson({ ok: false, error: "server_error", msg: getErrorMessage(err) }, 500, "exception", "server_error", "Unhandled me error");
  }
};
