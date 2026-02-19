export const onRequestGet: PagesFunction = async (context) => {
  try {
    const db = (context.env as any).DB as D1Database | undefined;
    if (!db) {
      return new Response(JSON.stringify({ ok: false, hasDB: false, error: "env.DB is missing (D1 binding not available)" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const tables = (results || []).map((r: any) => r.name);

    return new Response(JSON.stringify({ ok: true, hasDB: true, tables }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      hasDB: true,
      error: err?.message || String(err),
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
};
