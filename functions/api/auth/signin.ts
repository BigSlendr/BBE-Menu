import { json, uuid, verifyPassword, setCookie } from "./_utils";

export const onRequestPost: PagesFunction = async (context) => {
  const { request, env } = context;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) return json({ error: "Email and password required" }, 400);

  const db = env.DB as D1Database;
  const user = await db.prepare(
    "SELECT id, password_hash FROM users WHERE email = ?"
  ).bind(email).first<any>();

  if (!user) return json({ error: "Invalid credentials" }, 401);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return json({ error: "Invalid credentials" }, 401);

  const sessionId = uuid();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(sessionId, user.id, expiresAt).run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": setCookie("bb_session", sessionId, 7),
      "cache-control": "no-store",
    },
  });
};
