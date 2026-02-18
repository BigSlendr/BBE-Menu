import { json, getCookie, clearCookie } from "./_utils";

export const onRequestPost: PagesFunction = async (context) => {
  const { request, env } = context;
  const sessionId = getCookie(request, "bb_session");

  if (sessionId) {
    const db = env.DB as D1Database;
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
};
