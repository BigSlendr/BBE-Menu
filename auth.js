async function bbPost(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || "Request failed");
  }
  return json;
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
