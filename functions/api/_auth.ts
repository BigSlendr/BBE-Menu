export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  const parts = cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return p.substring(name.length + 1);
  }
  return null;
}

export async function getSessionUserId(request: Request, env: any): Promise<string | null> {
  const sessionId = getCookie(request, "bb_session");
  if (!sessionId) return null;

  const db = env.DB as D1Database;
  const session = await db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?")
    .bind(sessionId)
    .first<any>();

  if (!session) return null;
  if (Date.parse(session.expires_at) < Date.now()) return null;

  return session.user_id || null;
}

export function requireAdmin(request: Request, env: any): boolean {
  const secret = request.headers.get("x-admin-secret");
  return Boolean(secret && env.ADMIN_SECRET && secret === env.ADMIN_SECRET);
}
