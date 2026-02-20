import { getSessionUserId, getVerificationStatus, json } from "./_auth";
import { insertOrder } from "./orders/_create";

interface Env {
  RESEND_API_KEY?: string;
  MAIL_TO?: string;
  MAIL_FROM?: string;
  DB: D1Database;
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
  items?: unknown;
  subtotal?: unknown;
  notes?: unknown;
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

const getPayloadItems = (payload: OrderPayload): OrderItem[] => {
  if (Array.isArray(payload.items)) return payload.items as OrderItem[];
  if (Array.isArray(payload.order?.items)) return payload.order.items as OrderItem[];
  return [];
};

const getPayloadSubtotal = (payload: OrderPayload): number => {
  const topLevel = asNumber(payload.subtotal);
  if (Number.isFinite(topLevel)) return topLevel;
  return asNumber(payload.order?.subtotal);
};

const getPayloadNotes = (payload: OrderPayload): string => {
  return asTrimmedString(payload.notes) || asTrimmedString(payload.order?.specialInstructions);
};

const validatePayload = (payload: OrderPayload): string | null => {
  const customer = payload.customer ?? {};
  const items = getPayloadItems(payload);
  const name = asTrimmedString(customer.name);
  const phone = asTrimmedString(customer.phone);

  if (!name) return "Customer name is required.";
  if (name.length > 80) return "Customer name must be 80 characters or fewer.";
  if (!phone) return "Customer phone is required.";
  if (phone.length > 40) return "Customer phone must be 40 characters or fewer.";

  if (!Array.isArray(items) || items.length < 1) return "At least one order item is required.";

  for (const rawItem of items as OrderItem[]) {
    const itemName = asTrimmedString(rawItem?.name);
    const qty = asNumber(rawItem?.qty);
    const price = asNumber(rawItem?.price);

    if (!itemName) return "Each item must include a name.";
    if (!Number.isFinite(qty) || qty < 1) return "Each item quantity must be at least 1.";
    if (!Number.isFinite(price) || price < 0) return "Each item price must be 0 or greater.";
  }

  const total = asNumber(payload.order?.total);
  if (Number.isFinite(total) && total < 0) return "Order total must be 0 or greater.";

  return null;
};

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  const verificationStatus = await getVerificationStatus(userId, env);
  if (verificationStatus !== "approved") {
    return json({ error: "Verification required" }, 403);
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
  const order = payload.order ?? {};
  const items = getPayloadItems(payload);

  const orderId = generateOrderId();
  const timestamp = new Date().toISOString();
  const customerName = asTrimmedString(customer.name);
  const customerPhone = asTrimmedString(customer.phone);
  const customerEmail = asTrimmedString(customer.email) || "(not provided)";
  const orderMethod = asTrimmedString(order.method) || "unknown";
  const specialInstructions = getPayloadNotes(payload) || "(none)";

  const parsedSubtotal = getPayloadSubtotal(payload);
  const subtotal = Number.isFinite(parsedSubtotal) ? parsedSubtotal : items.reduce((sum, item) => sum + asNumber(item.price) * asNumber(item.qty), 0);
  const subtotalCents = Math.round(Number(subtotal) * 100);
  const tax = Number.isFinite(asNumber(order.tax)) ? asNumber(order.tax) : null;
  const fees = Number.isFinite(asNumber(order.fees)) ? asNumber(order.fees) : null;
  const providedTotal = asNumber(order.total);
  const total = Number.isFinite(providedTotal) ? providedTotal : subtotal + (tax || 0) + (fees || 0);
  const totalCents = Math.round(Number(total) * 100);
  const taxCents = Math.round(Number(tax || 0) * 100);

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

  let orderDbId = "";
  try {
    orderDbId = await insertOrder({
      db: env.DB,
      userId,
      payload: {
        cart: payload.order ?? { items },
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        customer: {
          name: customerName,
          phone: customerPhone,
          delivery_method: orderMethod === "delivery" ? "delivery" : "pickup",
          address: address,
        },
      },
    });
  } catch (error) {
    console.error("[order] failed to insert order", error);
    return jsonResponse({ ok: false, error: "Unable to save order." }, 500);
  }

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

  return jsonResponse({ ok: true, id: orderId, order_id: orderDbId }, 200);
};
