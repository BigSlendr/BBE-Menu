const $ = (s) => document.querySelector(s);
const state = {
  admin: null,
  needsBootstrap: false,
  panel: "dashboard",
  views: [],
  products: {
    items: [],
    selectedId: null,
    form: null,
    filters: { query: "", category: "", featured: "" },
    saving: false,
    uploading: false,
  },
};

const navItems = [["dashboard", "Dashboard"], ["csm", "CSM Dashboard"], ["orders", "Orders"], ["customers", "Customers"], ["products", "Products"], ["verification", "Verification"]];

const toast = (message, type = "ok") => {
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.textContent = message;
  $("#toastRoot").appendChild(el);
  setTimeout(() => el.remove(), 3000);
};

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: "include", ...opts });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(res.ok ? "Unexpected server response" : "Server error – check logs"); }
  if (!res.ok) throw new Error(data.error || data.msg || data.code || `Request failed (${res.status})`);
  return data;
}

function money(cents) { return `$${(Number(cents || 0) / 100).toFixed(2)}`; }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }

function setWorkspaceVisible(visible) {
  $(".sidebar").hidden = !visible;
  $("#workspace").hidden = !visible;
  $("#workspaceTopbar").hidden = !visible;
}

function isSuperAdminRole(role) { return role === "superadmin" || role === "super_admin" || role === "owner"; }

function openDrawer(title, obj) {
  $("#drawerTitle").textContent = title;
  $("#drawerBody").innerHTML = `<pre>${esc(JSON.stringify(obj, null, 2))}</pre>`;
  $("#detailDrawer").classList.add("open");
}

function normalizeProductForm(product = {}, variants = []) {
  return {
    id: product.id || null,
    slug: product.slug || "",
    name: product.name || "",
    brand: product.brand || "",
    category: product.category || "",
    type: product.subcategory || "",
    description: product.description || "",
    effectsInput: Array.isArray(product.effects) ? product.effects.join(", ") : "",
    is_featured: Number(product.is_featured || 0) ? 1 : 0,
    is_published: Number(product.is_published ?? 1) ? 1 : 0,
    image_url: product.image_url || "",
    image_key: product.image_key || "",
    image_path: product.image_path || "",
    variants: (variants || []).map((v, i) => ({ label: v.label || "", price_cents: Number(v.price_cents || 0), is_active: Number(v.is_active ?? 1), sort_order: Number(v.sort_order ?? i) })),
  };
}

async function loadProductsList() {
  const params = new URLSearchParams();
  if (state.products.filters.query) params.set("query", state.products.filters.query);
  if (state.products.filters.category) params.set("category", state.products.filters.category);
  if (state.products.filters.featured !== "") params.set("featured", state.products.filters.featured);
  const data = await api(`/api/admin/products?${params.toString()}`);
  state.products.items = data.products || [];
  if (!state.products.selectedId && state.products.items.length) state.products.selectedId = state.products.items[0].id;
  if (state.products.selectedId && !state.products.items.some((p) => p.id === state.products.selectedId)) state.products.selectedId = state.products.items[0]?.id || null;
}

async function loadSelectedProduct() {
  if (!state.products.selectedId) {
    state.products.form = normalizeProductForm();
    return;
  }
  const data = await api(`/api/admin/products/${state.products.selectedId}`);
  state.products.form = normalizeProductForm(data.product || {}, data.variants || []);
}

function productImagePreview(form) {
  const src = form.image_url || form.image_path || (form.image_key ? `/api/images/${encodeURIComponent(form.image_key)}` : "");
  return src ? `<img src="${esc(src)}" alt="Product image" class="product-image-preview" />` : `<div class="product-image-empty muted">No image uploaded</div>`;
}

function renderProductsPanelHtml() {
  const list = state.products.items;
  const categories = Array.from(new Set(list.map((p) => (p.category || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const form = state.products.form || normalizeProductForm();

  return `<div class="products-shell">
    <aside class="products-list panel">
      <div class="products-list-head">
        <h2>Products</h2>
        <button id="productsNewBtn" class="btn btn-gold">New Product</button>
      </div>
      <div class="products-filters">
        <input id="productsSearch" type="search" placeholder="Search products" value="${esc(state.products.filters.query)}" />
        <select id="productsCategoryFilter"><option value="">All categories</option>${categories.map((c) => `<option value="${esc(c)}" ${state.products.filters.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <select id="productsFeaturedFilter">
          <option value="" ${state.products.filters.featured === "" ? "selected" : ""}>All</option>
          <option value="1" ${state.products.filters.featured === "1" ? "selected" : ""}>Featured</option>
          <option value="0" ${state.products.filters.featured === "0" ? "selected" : ""}>Not featured</option>
        </select>
      </div>
      <div class="products-list-scroll">${list.map((p) => `<button class="product-list-item ${state.products.selectedId === p.id ? "active" : ""}" data-product-id="${p.id}"><strong>${esc(p.name || "Untitled")}</strong><span class="muted">${esc(p.category || "Uncategorized")}</span></button>`).join("") || '<div class="muted">No products found.</div>'}</div>
    </aside>
    <section class="products-editor panel">
      <div class="products-editor-head"><h3>${form.id ? `Edit: ${esc(form.name || "Product")}` : "Create Product"}</h3><span id="productsStatus" class="muted"></span></div>
      <div class="product-form-grid">
        <label>Name<input id="pName" value="${esc(form.name)}" /></label>
        <label>Slug<input id="pSlug" value="${esc(form.slug)}" placeholder="auto-from-name" /></label>
        <label>Brand<input id="pBrand" value="${esc(form.brand)}" /></label>
        <label>Category<input id="pCategory" value="${esc(form.category)}" placeholder="Flower" /></label>
        <label>Type<input id="pType" value="${esc(form.type)}" placeholder="Indoor / Resin / Accessory" /></label>
        <label>Effects (comma separated)<input id="pEffects" value="${esc(form.effectsInput)}" placeholder="relaxed, creative" /></label>
        <label class="span-2">Description<textarea id="pDescription" rows="4">${esc(form.description)}</textarea></label>
      </div>
      <div class="products-inline-toggles">
        <label><input id="pPublished" type="checkbox" ${form.is_published ? "checked" : ""}/> Published</label>
        <label><input id="pFeatured" type="checkbox" ${form.is_featured ? "checked" : ""}/> Featured</label>
      </div>
      <div class="product-image-card"><div>${productImagePreview(form)}</div><div class="products-image-actions"><input id="productImageFile" type="file" accept="image/*" /><button id="productsUploadImageBtn" class="btn" ${state.products.uploading ? "disabled" : ""}>${state.products.uploading ? "Uploading..." : "Upload Image"}</button></div></div>
      <h4>Sizes / Prices</h4>
      <div id="variantsWrap">${(form.variants || []).map((v, i) => `<div class="variant-row" data-variant-index="${i}"><input class="v-label" placeholder="Size label" value="${esc(v.label)}" /><input class="v-price" type="number" min="0" step="0.01" value="${(Number(v.price_cents || 0) / 100).toFixed(2)}" /><label><input class="v-active" type="checkbox" ${Number(v.is_active ?? 1) ? "checked" : ""}/> Active</label><button class="btn btn-small variant-remove" data-variant-index="${i}">Remove</button></div>`).join("")}</div>
      <button id="addVariantBtn" class="btn btn-small">Add Size</button>
      <div class="products-editor-actions"><button id="productsDeleteBtn" class="btn" ${form.id ? "" : "disabled"}>Unpublish</button><button id="productsSaveBtn" class="btn btn-gold" ${state.products.saving ? "disabled" : ""}>${state.products.saving ? "Saving..." : "Save"}</button></div>
    </section>
  </div>`;
}

async function renderProductsPanel() {
  await loadProductsList();
  await loadSelectedProduct();
  $("#workspace").innerHTML = renderProductsPanelHtml();
  bindProductsEvents();
}

function collectProductFormFromDom() {
  const form = state.products.form || normalizeProductForm();
  const variants = Array.from(document.querySelectorAll("#variantsWrap .variant-row")).map((row, i) => ({
    label: row.querySelector(".v-label").value.trim(),
    price_cents: Math.round(Number(row.querySelector(".v-price").value || 0) * 100),
    is_active: row.querySelector(".v-active").checked ? 1 : 0,
    sort_order: i,
  })).filter((v) => v.label);
  return {
    ...form,
    name: $("#pName").value.trim(),
    slug: $("#pSlug").value.trim(),
    brand: $("#pBrand").value.trim(),
    category: $("#pCategory").value.trim(),
    subcategory: $("#pType").value.trim(),
    description: $("#pDescription").value.trim(),
    effects: $("#pEffects").value.split(",").map((x) => x.trim()).filter(Boolean),
    is_published: $("#pPublished").checked ? 1 : 0,
    is_featured: $("#pFeatured").checked ? 1 : 0,
    variants,
  };
}

async function saveProduct() {
  const payload = collectProductFormFromDom();
  if (!payload.name || !payload.category) {
    toast("Name and category are required.", "error");
    return;
  }
  state.products.saving = true;
  $("#productsStatus").textContent = "Saving...";
  try {
    let response;
    if (payload.id) {
      response = await api(`/api/admin/products/${payload.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      response = await api("/api/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      state.products.selectedId = response.product?.id || null;
    }
    toast("Product saved.");
    await renderProductsPanel();
  } catch (e) {
    toast(e.message, "error");
    $("#productsStatus").textContent = e.message;
  } finally {
    state.products.saving = false;
  }
}

async function uploadProductImage() {
  const fileInput = $("#productImageFile");
  if (!fileInput?.files?.length) return toast("Choose an image file first.", "error");
  let form = collectProductFormFromDom();

  if (!form.id) {
    await saveProduct();
    if (!state.products.selectedId) return;
    await loadSelectedProduct();
    form = state.products.form;
  }

  const fd = new FormData();
  fd.set("file", fileInput.files[0]);
  fd.set("productId", form.id);

  state.products.uploading = true;
  try {
    const d = await api("/api/admin/products/upload-image", { method: "POST", body: fd });
    state.products.form.image_key = d.key || d.image_key || "";
    state.products.form.image_url = d.url || d.public_url || "";
    state.products.form.image_path = d.url || d.public_url || "";
    toast("Image uploaded. Click Save to persist.");
    $("#workspace").innerHTML = renderProductsPanelHtml();
    bindProductsEvents();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    state.products.uploading = false;
  }
}

function bindProductsEvents() {
  document.querySelectorAll(".product-list-item").forEach((row) => row.onclick = async () => {
    state.products.selectedId = row.dataset.productId;
    await renderProductsPanel();
  });

  $("#productsNewBtn").onclick = async () => { state.products.selectedId = null; state.products.form = normalizeProductForm(); $("#workspace").innerHTML = renderProductsPanelHtml(); bindProductsEvents(); };
  $("#productsSearch").onchange = async (e) => { state.products.filters.query = e.target.value.trim(); await renderProductsPanel(); };
  $("#productsCategoryFilter").onchange = async (e) => { state.products.filters.category = e.target.value; await renderProductsPanel(); };
  $("#productsFeaturedFilter").onchange = async (e) => { state.products.filters.featured = e.target.value; await renderProductsPanel(); };

  $("#productsSaveBtn").onclick = async () => saveProduct();
  $("#productsUploadImageBtn").onclick = async () => uploadProductImage();
  $("#addVariantBtn").onclick = () => {
    const wrap = $("#variantsWrap");
    const idx = wrap.querySelectorAll(".variant-row").length;
    wrap.insertAdjacentHTML("beforeend", `<div class="variant-row" data-variant-index="${idx}"><input class="v-label" placeholder="Size label" /><input class="v-price" type="number" min="0" step="0.01" value="0.00" /><label><input class="v-active" type="checkbox" checked /> Active</label><button class="btn btn-small variant-remove" data-variant-index="${idx}">Remove</button></div>`);
    bindProductsEvents();
  };
  document.querySelectorAll(".variant-remove").forEach((btn) => btn.onclick = (e) => { e.preventDefault(); btn.closest(".variant-row").remove(); });

  const del = $("#productsDeleteBtn");
  if (del) del.onclick = async () => {
    if (!state.products.form?.id) return;
    await api(`/api/admin/products/${state.products.form.id}`, { method: "DELETE" });
    toast("Product unpublished.");
    state.products.selectedId = null;
    await renderProductsPanel();
  };
}

function renderSetPassword() { /* unchanged auth views */
  const root = $("#authView");
  setWorkspaceVisible(false);
  root.hidden = false;
  root.innerHTML = `<div class="card"><h3>Set New Password</h3><p class="muted">You must change your temporary password before continuing.</p><input id="newAdminPassword" placeholder="New password" type="password" /><input id="confirmAdminPassword" placeholder="Confirm new password" type="password" /><div id="passwordStatus" class="muted" style="min-height:18px;margin:8px 0 0;"></div><button id="setPasswordBtn" class="btn btn-gold">Update Password</button></div>`;
  $("#setPasswordBtn").onclick = async () => {
    const status = $("#passwordStatus");
    status.textContent = "";
    const next = $("#newAdminPassword").value || "";
    const confirm = $("#confirmAdminPassword").value || "";
    if (next.length < 8) { status.textContent = "Password must be at least 8 characters."; return; }
    if (next !== confirm) { status.textContent = "Passwords do not match."; return; }
    try {
      await api("/api/admin/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newPassword: next }) });
      const me = await api("/api/admin/me");
      state.admin = me.data?.admin || me.admin;
      renderAuth();
    } catch (e) { status.textContent = e.message; toast(e.message, "error"); }
  };
}

function renderAuth() {
  const root = $("#authView");
  if (state.admin && state.admin.mustChangePassword) return renderSetPassword();
  if (state.admin) { root.hidden = true; setWorkspaceVisible(true); $("#adminIdentity").textContent = `${state.admin.name || state.admin.email || state.admin.username} (${state.admin.role})`; return renderApp(); }

  setWorkspaceVisible(false);
  root.hidden = false;
  root.innerHTML = `<div class="card"><h3>Admin Login</h3><input id="loginUsername" placeholder="Email" /><input id="loginSecret" placeholder="Secret" type="password" /><div id="loginStatus" class="muted" style="min-height:18px;margin:8px 0 0;"></div><button id="loginBtn" class="btn btn-gold">Login</button></div>
  <div class="card" ${state.needsBootstrap ? "" : "hidden"}><h3>Bootstrap Super Admin</h3><input id="bootSecret" placeholder="Bootstrap secret" type="password" /><input id="bootEmail" placeholder="Owner email" /><input id="bootName" placeholder="Owner name" /><input id="bootPassword" placeholder="Password" type="password" /><button id="bootBtn" class="btn btn-gold">Bootstrap</button></div>`;
  $("#loginBtn").onclick = async () => {
    const status = $("#loginStatus");
    status.textContent = "";
    try {
      const d = await api("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: $("#loginUsername").value, password: $("#loginSecret").value }) });
      state.admin = d.data?.admin || d.admin;
      renderAuth();
    } catch (e) { status.textContent = e.message; toast(e.message, "error"); }
  };
  if (state.needsBootstrap) $("#bootBtn").onclick = async () => { try { await api("/api/admin/bootstrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: $("#bootSecret").value, email: $("#bootEmail").value, name: $("#bootName").value, password: $("#bootPassword").value }) }); toast("Super admin bootstrapped."); } catch (e) { toast(e.message, "error"); } };
}

function renderNav() {
  const items = [...navItems];
  if (isSuperAdminRole(state.admin?.role)) items.push(["admin-users", "Admin Users"]);
  $("#sideNav").innerHTML = items.map(([k, label]) => `<button class="btn nav-btn ${state.panel === k ? "active" : ""}" data-panel="${k}">${label}</button>`).join("");
  document.querySelectorAll(".nav-btn").forEach((b) => b.onclick = () => { state.panel = b.dataset.panel; renderApp(); });
}

async function panelDashboard() { const range = $("#globalRange").value; const q = new URLSearchParams({ range }); if (range === "custom") { q.set("start", $("#customStart").value); q.set("end", $("#customEnd").value); } const d = await api(`/api/admin/dashboard?${q.toString()}`); const m = d.metrics || {}; return `<div class="dashboard-controls"><h2>Dashboard</h2><span class="muted">${esc(d.range.start)} → ${esc(d.range.end)}</span></div><div class="cards"><div class="card"><div class="muted">Revenue (Completed)</div><h3>${money(m.revenue_completed_cents)}</h3></div><div class="card"><div class="muted">Pending</div><h3>${money(m.pending_cents)}</h3></div><div class="card"><div class="muted">Cancelled</div><h3>${money(m.cancelled_cents)}</h3></div><div class="card"><div class="muted">AOV (Completed)</div><h3>${money(m.aov_completed_cents)}</h3></div></div>`; }
async function panelCsm() { const [dashboard, totalUsers, activeUsers, pendingVerification] = await Promise.all([api(`/api/admin/dashboard?range=7d`), api(`/api/admin/customers?limit=1`).catch(() => ({ customers: [] })), api(`/api/admin/customers?active=1&limit=1`).catch(() => ({ customers: [] })), api(`/api/admin/verification/pending`).catch(() => ({ users: [] }))]); const m = dashboard.metrics || {}; return `<div class="dashboard-controls"><h2>CSM Dashboard</h2><span class="muted">Customer lifecycle summary</span></div><div class="cards"><div class="card"><div class="muted">Total Users</div><h3>${Number(dashboard.totalUsers || totalUsers.customers?.length || 0)}</h3></div><div class="card"><div class="muted">Active Users</div><h3>${Number(dashboard.activeUsers || activeUsers.customers?.length || 0)}</h3></div><div class="card"><div class="muted">Orders (7d)</div><h3>${Number(dashboard.ordersLast7Days || m.orders_completed_count || 0)}</h3></div><div class="card"><div class="muted">Pending Verification</div><h3>${Number(dashboard.pendingVerification || pendingVerification.users?.length || 0)}</h3></div></div>`; }
async function panelOrders() { const q = encodeURIComponent($("#globalSearch").value || ""); const d = await api(`/api/admin/orders?query=${q}`); return `<h2>Orders</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>Status</th><th>Total</th><th>Created</th></tr></thead><tbody>${(d.orders || []).map((o) => `<tr class='clickable-row order-row' data-id='${o.id}'><td>${esc(o.id)}</td><td>${esc(o.status)}</td><td>${money(o.total_cents)}</td><td>${esc(o.created_at)}</td></tr>`).join("")}</tbody></table></div>`; }
async function panelCustomers() { const q = encodeURIComponent($("#globalSearch").value || ""); const d = await api(`/api/admin/customers?query=${q}`); return `<h2>Customers</h2><div class='table-wrap'><table><thead><tr><th>Email</th><th>Status</th><th>Lifetime Spend</th></tr></thead><tbody>${(d.customers || []).map((c) => `<tr class='clickable-row customer-row' data-id='${c.id}'><td>${esc(c.email)}</td><td>${esc(c.account_status)}</td><td>${money(c.lifetime_spend_cents)}</td></tr>`).join("")}</tbody></table></div>`; }
async function panelVerification() { const d = await api(`/api/admin/verification/pending`); return `<h2>Verification</h2><div class='table-wrap'><table><thead><tr><th>User</th><th>Status</th><th>Updated</th></tr></thead><tbody>${(d.users || []).map((u) => `<tr><td>${esc(u.email)}</td><td>${esc(u.account_status || "pending")}</td><td>${esc(u.updated_at || "")}</td></tr>`).join("")}</tbody></table></div>`; }
async function panelAdminUsers() { const d = await api("/api/admin/users"); const admins = d.admins || []; return `<div style='display:flex;justify-content:space-between;align-items:center;'><h2>Admin Users</h2><button id='newAdminBtn' class='btn btn-gold'>Create Admin</button></div><div class='table-wrap'><table><thead><tr><th>Email</th><th>Active</th><th>Role</th><th>Must Change Password</th><th>Password Updated</th></tr></thead><tbody>${admins.map((a) => `<tr><td>${esc(a.email)}</td><td>${Number(a.is_active) ? "Yes" : "No"}</td><td>${esc(a.role || "admin")}</td><td>${Number(a.must_change_password) ? "Yes" : "No"}</td><td>${esc(a.password_updated_at || "")}</td></tr>`).join("")}</tbody></table></div>`; }

async function renderApp() {
  renderNav();
  const root = $("#workspace");
  root.innerHTML = `<div class='skeleton'></div><div class='skeleton'></div>`;
  try {
    if (state.panel === "products") return renderProductsPanel();
    const panels = { dashboard: panelDashboard, csm: panelCsm, orders: panelOrders, customers: panelCustomers, verification: panelVerification, "admin-users": panelAdminUsers };
    root.innerHTML = await (panels[state.panel] || panelDashboard)();
    bindPanelEvents();
  } catch (e) { root.innerHTML = `<div class='card error-card'>${esc(e.message)}</div>`; }
}

function bindPanelEvents() {
  document.querySelectorAll(".order-row").forEach((r) => r.onclick = async () => openDrawer("Order", await api(`/api/admin/orders/${r.dataset.id}`)));
  document.querySelectorAll(".customer-row").forEach((r) => r.onclick = async () => openDrawer("Customer", await api(`/api/admin/customers/${r.dataset.id}`)));
  const n = $("#newAdminBtn");
  if (n) n.onclick = async () => { const email = prompt("Admin email"); if (!email) return; const tempPassword = prompt("Temp password (min 8 chars)"); if (!tempPassword) return; const role = prompt("Role (superadmin/admin)") || "admin"; await api("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, tempPassword, role }) }); renderApp(); };
}

async function init() {
  const requestedView = (new URL(window.location.href)).searchParams.get("view");
  if (requestedView) state.panel = requestedView;

  $("#logoutBtn").onclick = async () => { await api("/api/admin/logout", { method: "POST" }); state.admin = null; $("#detailDrawer").classList.remove("open"); renderAuth(); };
  $("#drawerClose").onclick = () => { const d = $("#detailDrawer"); d.classList.remove("open"); d.classList.remove("minimized"); };
  const m = $("#drawerMinimize");
  if (m) m.onclick = () => $("#detailDrawer").classList.toggle("minimized");
  $("#refreshBtn").onclick = () => renderApp();
  $("#globalSearch").onchange = () => renderApp();
  $("#globalRange").onchange = () => { const custom = $("#globalRange").value === "custom"; $("#customStart").hidden = !custom; $("#customEnd").hidden = !custom; renderApp(); };
  $("#customStart").onchange = () => renderApp();
  $("#customEnd").onchange = () => renderApp();

  const boot = await api("/api/admin/auth/bootstrap-create").catch(() => ({ needs_bootstrap: false }));
  state.needsBootstrap = !!boot.needs_bootstrap;

  try { const me = await api("/api/admin/me"); state.admin = me.data?.admin || me.admin; } catch { state.admin = null; }
  renderAuth();
}

document.addEventListener("DOMContentLoaded", () => init().catch((e) => toast(e.message, "error")));
