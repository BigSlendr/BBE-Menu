interface Env {
  RESEND_API_KEY?: string;
  MAIL_TO?: string;
  MAIL_FROM?: string;
}

type OrderItem = {
  id?: unknown;
  name?: unknown;
  qty?: unknown;
  price?: unknown;
  variant?: unknown;
  notes?: unknown;
};

type OrderPayload = {
  customer?: {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
  };
  order?: {
    items?: unknown;
    subtotal?: unknown;
    tax?: unknown;
    fees?: unknown;
    total?: unknown;
    method?: unknown;
    address?: unknown;
    specialInstructions?: unknown;
  };
};

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const jsonResponse = (body: Record<string, unknown>, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...baseHeaders,
    },
  });

const asTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asNumber = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number.NaN);

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const money = (value: number): string => `$${value.toFixed(2)}`;

const generateOrderId = (): string => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `ORD-${y}${m}${d}-${rand}`;
};

const validatePayload = (payload: OrderPayload): string | null => {
  const customer = payload.customer ?? {};
  const order = payload.order ?? {};
  const name = asTrimmedString(customer.name);
  const phone = asTrimmedString(customer.phone);

  if (!name) return "Customer name is required.";
  if (name.length > 80) return "Customer name must be 80 characters or fewer.";
  if (!phone) return "Customer phone is required.";
  if (phone.length > 40) return "Customer phone must be 40 characters or fewer.";

  if (!Array.isArray(order.items) || order.items.length < 1) return "At least one order item is required.";

  for (const rawItem of order.items as OrderItem[]) {
    const itemName = asTrimmedString(rawItem?.name);
    const qty = asNumber(rawItem?.qty);
    const price = asNumber(rawItem?.price);

    if (!itemName) return "Each item must include a name.";
    if (!Number.isFinite(qty) || qty < 1) return "Each item quantity must be at least 1.";
    if (!Number.isFinite(price) || price < 0) return "Each item price must be 0 or greater.";
  }

  const total = asNumber(order.total);
  if (!Number.isFinite(total) || total < 0) return "Order total must be 0 or greater.";

  return null;
};

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  let payload: OrderPayload;
  try {
    payload = (await request.json()) as OrderPayload;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    return jsonResponse({ ok: false, error: validationError }, 400);
  }

  const apiKey = env.RESEND_API_KEY;
  const mailTo = env.MAIL_TO;
  const mailFrom = env.MAIL_FROM;
  if (!apiKey || !mailTo || !mailFrom) {
    return jsonResponse({ ok: false, error: "Missing required mail configuration." }, 500);
  }

  const customer = payload.customer!;
  const order = payload.order!;
  const items = order.items as OrderItem[];

  const orderId = generateOrderId();
  const timestamp = new Date().toISOString();
  const customerName = asTrimmedString(customer.name);
  const customerPhone = asTrimmedString(customer.phone);
  const customerEmail = asTrimmedString(customer.email) || "(not provided)";
  const orderMethod = asTrimmedString(order.method) || "unknown";
  const specialInstructions = asTrimmedString(order.specialInstructions) || "(none)";

  const subtotal = Number.isFinite(asNumber(order.subtotal)) ? asNumber(order.subtotal) : items.reduce((sum, item) => sum + asNumber(item.price) * asNumber(item.qty), 0);
  const tax = Number.isFinite(asNumber(order.tax)) ? asNumber(order.tax) : null;
  const fees = Number.isFinite(asNumber(order.fees)) ? asNumber(order.fees) : null;
  const total = asNumber(order.total);

  const address = order.address && typeof order.address === "object" ? (order.address as Record<string, unknown>) : null;
  const formattedAddress = address
    ? [
        asTrimmedString(address.line1),
        asTrimmedString(address.line2),
        [asTrimmedString(address.city), asTrimmedString(address.state), asTrimmedString(address.zip)].filter(Boolean).join(", "),
      ]
        .filter(Boolean)
        .join("<br/>") || "(not provided)"
    : "(not provided)";

  const itemLines = items
    .map((item) => {
      const itemName = escapeHtml(asTrimmedString(item.name));
      const qty = asNumber(item.qty);
      const price = asNumber(item.price);
      const variant = asTrimmedString(item.variant);
      const notes = asTrimmedString(item.notes);
      return `
        <li style="margin-bottom:10px;">
          <strong>${itemName}</strong> — Qty: ${qty} @ ${money(price)}
          ${variant ? `<br/><em>Variant:</em> ${escapeHtml(variant)}` : ""}
          ${notes ? `<br/><em>Notes:</em> ${escapeHtml(notes)}` : ""}
        </li>
      `;
    })
    .join("");

  const html = `
    <h2>New Order ${escapeHtml(orderId)}</h2>
    <p><strong>Timestamp:</strong> ${escapeHtml(timestamp)}</p>
    <h3>Customer</h3>
    <p>
      <strong>Name:</strong> ${escapeHtml(customerName)}<br/>
      <strong>Phone:</strong> ${escapeHtml(customerPhone)}<br/>
      <strong>Email:</strong> ${escapeHtml(customerEmail)}
    </p>

    <h3>Order Details</h3>
    <p><strong>Method:</strong> ${escapeHtml(orderMethod)}</p>
    <p><strong>Address:</strong><br/>${formattedAddress}</p>
    <p><strong>Special Instructions:</strong><br/>${escapeHtml(specialInstructions).replace(/\n/g, "<br/>")}</p>

    <h3>Items</h3>
    <ul>${itemLines}</ul>

    <h3>Totals</h3>
    <p>
      <strong>Subtotal:</strong> ${money(subtotal)}<br/>
      <strong>Tax:</strong> ${tax === null ? "(not provided)" : money(tax)}<br/>
      <strong>Fees:</strong> ${fees === null ? "(not provided)" : money(fees)}<br/>
      <strong>Total:</strong> ${money(total)}
    </p>
  `;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [mailTo],
      subject: `New Order — ${customerName} — ${money(total)}`,
      html,
    }),
  });

  if (!resendResponse.ok) {
    const resendText = await resendResponse.text();
    return jsonResponse({ ok: false, error: `Unable to send email: ${resendText || resendResponse.statusText}` }, 502);
  }

  return jsonResponse({ ok: true, id: orderId }, 200);
};
