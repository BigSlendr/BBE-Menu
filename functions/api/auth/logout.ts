import { json, getCookie, clearCookie } from "./_utils";

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const { request, env } = context;
    const db = env.DB as D1Database;
    if (!db) return json({ error: "DB binding missing (env.DB undefined)" }, 500);

    const sessionId = getCookie(request, "bb_session");

    if (sessionId) {
      await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": clearCookie("bb_session"),
        "cache-control": "no-store",
      },
    });
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
};
