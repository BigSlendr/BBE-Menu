document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("unlockBtn");
  const input = document.getElementById("secret");
  const msg = document.getElementById("msg");
  const status = document.getElementById("status");

  if (!btn || !input) return;

  const setTabsLocked = (locked) => {
    document.querySelectorAll(".tab").forEach((tab) => {
      if (locked) {
        tab.setAttribute("disabled", "disabled");
        tab.setAttribute("aria-disabled", "true");
        tab.classList.add("locked");
      } else {
        tab.removeAttribute("disabled");
        tab.removeAttribute("aria-disabled");
        tab.classList.remove("locked");
      }
    });
  };

  setTabsLocked(true);

  btn.addEventListener("click", async () => {
    console.log("unlock clicked");
    const secret = input.value.trim();
    if (msg) msg.textContent = "";

    try {
      const response = await fetch("/api/admin/unlock", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const result = await response.json().catch(() => ({ ok: false, error: "invalid_json" }));
      console.log("unlock response", result);

      if (!response.ok || !result.ok) {
        setTabsLocked(true);
        if (status) status.textContent = "Locked";
        if (msg) msg.textContent = `Unlock failed (${response.status}): ${result.error || "invalid"}`;
        return;
      }

      try { sessionStorage.setItem("bb_admin_secret", secret); } catch {}
      setTabsLocked(false);
      if (status) status.textContent = "Unlocked";
      if (typeof window.refresh === "function") {
        await window.refresh();
      }
    } catch (error) {
      setTabsLocked(true);
      if (status) status.textContent = "Locked";
      if (msg) msg.textContent = `Unlock failed: ${error?.message || String(error)}`;
    }
  });
});
