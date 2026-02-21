import { json, getCookie } from "./_utils";

export const onRequestGet: PagesFunction = async (context) => {
  try {
    const { request, env } = context;
    const db = env.DB as D1Database;
    if (!db) return json({ error: "DB binding missing (env.DB undefined)" }, 500);

    const sessionId = getCookie(request, "bb_session");

    if (!sessionId) return json({ loggedIn: false });

    const session = await db.prepare(
      `SELECT user_id, expires_at FROM sessions WHERE id = ?`
    ).bind(sessionId).first<any>();

    if (!session) return json({ loggedIn: false });

    if (Date.parse(session.expires_at) < Date.now()) {
      return json({ loggedIn: false });
    }

    const user = await db.prepare(
      `SELECT id, email, first_name, last_name, account_status, verified_at, status_reason FROM users WHERE id = ?`
    ).bind(session.user_id).first<any>();


    return json({
      loggedIn: true,
      user: {
        id: user?.id,
        email: user?.email,
        first_name: user?.first_name,
        last_name: user?.last_name,
      },
      verificationStatus: user?.account_status || "pending",
      verified_at: user?.verified_at || null,
      status_reason: user?.status_reason || null,
    });
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
};
