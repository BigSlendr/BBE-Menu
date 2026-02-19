/* BBE Cart (no checkout) - GitHub Pages friendly */
(function () {
  const CART_KEY = "bbe_cart_v1";
  const AGE_KEY = "bbe_age_verified";
  const PRODUCTS_URL_DEFAULT = "content/products.json";

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
    catch { return []; }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  }

  function cartCount() {
    return loadCart().reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
  }

  function money(n) {
    if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "N/A";
    return "$" + Number(n).toFixed(0);
  }

  function sizeLabel(k) {
    return k === "g3_5" ? "3.5g" : k === "g7" ? "7g" : k === "g14" ? "14g" : k === "g28" ? "28g" : k;
  }

  async function fetchProducts(productsUrl) {
    const res = await fetch(productsUrl || PRODUCTS_URL_DEFAULT, { cache: "no-store" });
    const data = await res.json();
    return data.items || [];
  }

  async function bbGetMe() {
    try {
      const res = await fetch("/api/auth/me", { method: "GET" });
      return await res.json();
    } catch {
      return null;
    }
  }

  function bbOpenAuthModal({ title, message, mode }) {
    const modal = document.getElementById("bbAuthModal");
    const modalTitle = document.getElementById("bbAuthTitle");
    const modalMessage = document.getElementById("bbAuthMsg");

    const signInBtn = document.getElementById("bbAuthSignInBtn");
    const signUpBtn = document.getElementById("bbAuthSignUpBtn");
    const accountBtn = document.getElementById("bbAuthAccountBtn");

    if (!modal || !modalTitle || !modalMessage) return;

    modalTitle.textContent = title || "Action required";
    modalMessage.textContent = message || "";

    if (mode === "verify") {
      if (signInBtn) signInBtn.style.display = "none";
      if (signUpBtn) signUpBtn.style.display = "none";
      if (accountBtn) accountBtn.style.display = "inline-flex";
    } else {
      if (signInBtn) signInBtn.style.display = "inline-flex";
      if (signUpBtn) signUpBtn.style.display = "inline-flex";
      if (accountBtn) accountBtn.style.display = "none";
    }

    modal.style.display = "flex";
  }

  function bbCloseAuthModal() {
    const modal = document.getElementById("bbAuthModal");
    if (modal) modal.style.display = "none";
  }

  async function requireApprovedUser() {
    const me = await bbGetMe();

    if (!me || !me.loggedIn) {
      bbOpenAuthModal({
        title: "Sign in required",
        message: "Please sign in to submit your order.",
        mode: "signin",
      });
      return false;
    }

    const status = me.verificationStatus || "unverified";
    if (status !== "approved") {
      let msg = "Your account must be verified before submitting an order.";
      if (status === "pending") msg = "Your account is pending verification. Please check back soon.";
      if (status === "rejected") msg = "Your verification was rejected. Please contact support or re-verify.";

      bbOpenAuthModal({
        title: "Verification required",
        message: msg,
        mode: "verify",
      });
      return false;
    }

    return true;
  }

  function ensureModal() {
    if (document.getElementById("bbeSizeModal")) return;

    const modal = document.createElement("div");
    modal.id = "bbeSizeModal";
    modal.style.cssText = `
      position:fixed; inset:0; z-index:99999; display:none;
      align-items:center; justify-content:center; padding:18px;
      background:rgba(0,0,0,.72);
    `;

    modal.innerHTML = `
      <div style="
        width:100%; max-width:420px; background:#fff; border-radius:18px;
        padding:18px; box-shadow:0 20px 60px rgba(0,0,0,.35);
        font-family: Arial, sans-serif;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <div style="font-weight:900;font-size:18px;" id="bbeModalTitle">Select size</div>
          <button id="bbeModalClose" style="
            border:0;background:#eee;border-radius:999px;padding:8px 12px;
            font-weight:900;cursor:pointer;">✕</button>
        </div>
        <div id="bbeModalBody" style="margin-top:12px; display:grid; gap:10px;"></div>
        <div style="margin-top:14px; color:#666; font-size:12px;">
          Cart is for screenshot/sharing only — no checkout.
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("bbeModalClose").onclick = () => hideModal();
    modal.addEventListener("click", (e) => {
      if (e.target === modal) hideModal();
    });
  }

  function showModal() {
    const m = document.getElementById("bbeSizeModal");
    m.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function hideModal() {
    const m = document.getElementById("bbeSizeModal");
    if (!m) return;
    m.style.display = "none";
    document.body.style.overflow = "";
  }

  function addLineToCart(line) {
    const cart = loadCart();
    const key = line.id + "::" + (line.variantKey || "");
    const existing = cart.find(x => (x.key === key));
    if (existing) existing.qty = (Number(existing.qty) || 0) + (Number(line.qty) || 1);
    else cart.push({ ...line, key, qty: Number(line.qty) || 1 });
    saveCart(cart);
  }

  async function openAddFlow(itemId, productsUrl) {
    const items = await fetchProducts(productsUrl);
    const item = items.find(x => x.id === itemId);

    if (!item) {
      alert("Item not found.");
      return;
    }

    // Age gate check (if user hasn't verified yet, don't add)
    if (localStorage.getItem(AGE_KEY) !== "true") {
      alert("Please confirm 21+ before using the cart.");
      return;
    }

    // Flower: require size picker
    if (item.category === "Flower") {
      ensureModal();
      document.getElementById("bbeModalTitle").textContent = "Select size • " + item.name;

      const body = document.getElementById("bbeModalBody");
      body.innerHTML = "";

      const order = ["g3_5", "g7", "g14", "g28"];
      const any = order.some(k => (item.availability?.[k] !== false) && item.prices?.[k]);

      if (!any) {
        body.innerHTML = `<div style="color:#666;font-size:14px;">No sizes available.</div>`;
        showModal();
        return;
      }

      order.forEach(k => {
        const available = item.availability?.[k] !== false;
        const price = item.prices?.[k];

        const btn = document.createElement("button");
        btn.type = "button";
        btn.disabled = !(available && price);
        btn.style.cssText = `
          border:1px solid #eaeaea; background:${btn.disabled ? "#f4f4f4" : "#111"};
          color:${btn.disabled ? "#999" : "#fff"}; border-radius:14px;
          padding:12px 12px; cursor:${btn.disabled ? "not-allowed" : "pointer"};
          font-weight:900; text-align:left;
        `;
        btn.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
            <div>${sizeLabel(k)}</div>
            <div>${btn.disabled ? "N/A" : money(price)}</div>
          </div>
        `;

        btn.onclick = () => {
          addLineToCart({
            id: item.id,
            name: item.name,
            category: item.category,
            subcategory: item.subcategory || "",
            variantKey: k,
            variantLabel: sizeLabel(k),
            unitPrice: Number(price),
            image: item.image || ""
          });
          hideModal();
        };

        body.appendChild(btn);
      });

      showModal();
      return;
    }

    // Concentrates: per gram (defaults to 1g “line”)
    if (item.category === "Concentrates") {
      const price = item.prices?.perGram;
      if (!price) { alert("Price not available."); return; }

      addLineToCart({
        id: item.id,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory || "",
        variantKey: "perGram",
        variantLabel: "1g",
        unitPrice: Number(price),
        image: item.image || ""
      });
      return;
    }

    // Accessories: single price
    if (item.category === "Accessories") {
      const price = item.prices?.single;
      if (!price) { alert("Price not available."); return; }

      addLineToCart({
        id: item.id,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory || "",
        variantKey: "single",
        variantLabel: "Single",
        unitPrice: Number(price),
        image: item.image || ""
      });
      return;
    }

    alert("Unsupported category for cart.");
  }

  function updateCartCount() {
    const c = cartCount();
    const els = document.querySelectorAll('[data-bbe-cart-count], #bbeCartCount');
    if (!els.length) return;
    els.forEach((el) => {
      el.textContent = String(c);
      el.style.display = c > 0 ? "inline-block" : "none";
    });
  }

  function mountCartPill() {
    // Legacy API kept for backward compatibility.
    // Cart UI now lives directly in the header markup.
    updateCartCount();
  }

  // Expose API
  window.BBE_CART = {
    openAddFlow,
    loadCart,
    saveCart,
    money,
    updateCartCount,
    mountCartPill,
    requireApprovedUser,
    bbOpenAuthModal,
    bbCloseAuthModal
  };

  // Update count on page load
  document.addEventListener("DOMContentLoaded", () => {
    updateCartCount();

    const closeBtn = document.getElementById("bbAuthCloseBtn");
    const modal = document.getElementById("bbAuthModal");

    if (closeBtn) closeBtn.addEventListener("click", bbCloseAuthModal);

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) bbCloseAuthModal();
      });
    }
  });
})();
