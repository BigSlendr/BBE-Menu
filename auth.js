async function bbPost(url, data) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data || {}),
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error("NETWORK — " + msg);
  }

  const raw = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {}

  if (!res.ok) {
    const serverMsg =
      parsed && (parsed.error || parsed.message)
        ? parsed.error || parsed.message
        : raw
          ? raw.slice(0, 800)
          : "No response body";

    throw new Error(`HTTP ${res.status} — ${serverMsg}`);
  }

  return parsed ?? {};
}

async function bbGetMe() {
  const res = await fetch("/api/auth/me", { method: "GET" });
  return res.json();
}

async function bbLogout() {
  const res = await fetch("/api/auth/logout", { method: "POST" });
  return res.json();
}

window.bbPost = bbPost;
window.bbGetMe = bbGetMe;
window.bbLogout = bbLogout;
