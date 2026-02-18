document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!window.bbGetMe) return;
    const link = document.getElementById("bbMemberLink");
    if (!link) return;

    const me = await window.bbGetMe();

    if (me && me.loggedIn) {
      link.textContent = "ACCOUNT";
      link.setAttribute("href", "/account.html");
    } else {
      link.textContent = "SIGN IN";
      link.setAttribute("href", "/member-signin.html");
    }
  } catch {
    // fail silently
  }
});
