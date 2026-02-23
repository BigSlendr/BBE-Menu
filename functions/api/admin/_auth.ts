import { getCookie, json } from "../auth/_utils";

export type AdminAuth = {
  id: number | string;
  email: string;
  role: string;
  is_active: number;
  must_change_password: number;
};

export async function ensureAdminAuthSchema(db: D1Database) {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS admin_sessions (id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)"
    )
    .run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at)").run();

  const pragma = await db.prepare("PRAGMA table_info(admins)").all<any>();
  const columns = new Set((pragma.results || []).map((r: any) => String(r.name || "").toLowerCase()));

  const addCol = async (name: string, ddl: string) => {
    if (columns.has(name)) return;
    await db.prepare(ddl).run();
  };

  await addCol("role", "ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  await addCol("is_active", "ALTER TABLE admins ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
  await addCol("must_change_password", "ALTER TABLE admins ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
  await addCol("password_updated_at", "ALTER TABLE admins ADD COLUMN password_updated_at TEXT");
}

export async function getAdminFromRequest(request: Request, env: any): Promise<AdminAuth | null> {
  const db = env.DB as D1Database;
  if (!db) return null;
  await ensureAdminAuthSchema(db);

  const sessionId = getCookie(request, "bb_admin_session");
  if (!sessionId) return null;

  const admin = await db
    .prepare(
      `SELECT a.id, a.email, a.role, COALESCE(a.is_active,1) AS is_active,
              COALESCE(a.must_change_password,0) AS must_change_password
       FROM admin_sessions s
       JOIN admins a ON a.id = s.admin_id
       WHERE s.id = ? AND s.expires_at > datetime('now')
       LIMIT 1`
    )
    .bind(sessionId)
    .first<any>();

  if (!admin) return null;
  if (Number(admin.is_active) !== 1) return null;

  return {
    id: admin.id,
    email: String(admin.email || ""),
    role: String(admin.role || "admin"),
    is_active: Number(admin.is_active || 1),
    must_change_password: Number(admin.must_change_password || 0),
  };
}

export async function requireAdmin(request: Request, env: any): Promise<AdminAuth | Response> {
  const admin = await getAdminFromRequest(request, env);
  if (!admin) return json({ ok: false, error: "unauthorized" }, 401);
  return admin;
}

export async function requireSuperAdmin(request: Request, env: any): Promise<AdminAuth | Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  if (admin.role !== "superadmin") return json({ ok: false, error: "forbidden" }, 403);
  return admin;
}

export function requirePasswordReady(admin: AdminAuth): Response | null {
  if (Number(admin.must_change_password) === 1) {
    return json({ ok: false, error: "password_change_required" }, 403);
  }
  return null;
}
