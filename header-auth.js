(async function () {
  function safeSet(el, text, href) {
    if (!el) return;
    if (typeof text === "string") el.textContent = text;
    if (typeof href === "string") el.setAttribute("href", href);
  }

  async function getMe() {
    try {
      const res = await fetch("/api/auth/me", { method: "GET" });
      return await res.json();
    } catch {
      return null;
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const link = document.getElementById("bbMemberLink");
    if (!link) return;

    const me = await getMe();
    if (me && me.loggedIn) {
      safeSet(link, "ACCOUNT", "/account.html");
    } else {
      safeSet(link, "SIGN IN", "/member-signin.html");
    }
  });
})();
