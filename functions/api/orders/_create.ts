export type CreateOrderPayload = {
  cart?: unknown;
  cartItems?: unknown;
  subtotal?: unknown;
  subtotal_cents?: unknown;
  tax?: unknown;
  tax_cents?: unknown;
  total?: unknown;
  total_cents?: unknown;
  customer?: {
    name?: unknown;
    phone?: unknown;
    delivery_method?: unknown;
    address?: unknown;
  };
};

interface InsertOrderParams {
  db: D1Database;
  userId: string;
  payload: CreateOrderPayload;
}

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const toCents = (dollars: number): number => Math.round(dollars * 100);

const normalizeCents = (centsValue: unknown, dollarsValue: unknown): number | null => {
  const cents = asFiniteNumber(centsValue);
  if (cents !== null) return Math.round(cents);

  const dollars = asFiniteNumber(dollarsValue);
  if (dollars !== null) return toCents(dollars);

  return null;
};

export const getCartPayload = (payload: CreateOrderPayload): unknown => {
  if (payload.cart && typeof payload.cart === "object") return payload.cart;
  if (Array.isArray(payload.cartItems)) return { items: payload.cartItems };
  return null;
};

export const validateCreateOrderPayload = (payload: CreateOrderPayload): string | null => {
  if (!payload || typeof payload !== "object") return "invalid payload";

  const cart = getCartPayload(payload);
  if (!cart) return "cart is required";

  const subtotalCents = normalizeCents(payload.subtotal_cents, payload.subtotal);
  const totalCents = normalizeCents(payload.total_cents, payload.total);
  const customer = payload.customer;

  if (subtotalCents === null) return "subtotal is required";
  if (totalCents === null) return "total is required";
  if (!customer || typeof customer !== "object") return "customer is required";

  const customerName = asString(customer.name);
  const customerPhone = asString(customer.phone);
  const deliveryMethod = asString(customer.delivery_method);

  if (!customerName) return "customer.name is required";
  if (!customerPhone) return "customer.phone is required";
  if (deliveryMethod !== "pickup" && deliveryMethod !== "delivery") {
    return "customer.delivery_method must be pickup or delivery";
  }

  return null;
};

export const insertOrder = async ({ db, userId, payload }: InsertOrderParams): Promise<string> => {
  const orderId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const status = "placed";

  const subtotalCents = normalizeCents(payload.subtotal_cents, payload.subtotal) ?? 0;
  const taxCents = normalizeCents(payload.tax_cents, payload.tax) ?? 0;
  const totalCents = normalizeCents(payload.total_cents, payload.total) ?? 0;

  const customerName = asString(payload.customer?.name) || null;
  const customerPhone = asString(payload.customer?.phone) || null;
  const deliveryMethod = asString(payload.customer?.delivery_method) || null;
  const address = payload.customer?.address && typeof payload.customer.address === "object" ? payload.customer.address : null;

  const cart = getCartPayload(payload);

  await db
    .prepare(
      `INSERT INTO orders (
        id,
        user_id,
        created_at,
        status,
        subtotal_cents,
        tax_cents,
        total_cents,
        customer_name,
        customer_phone,
        delivery_method,
        address_json,
        cart_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      orderId,
      userId,
      createdAt,
      status,
      subtotalCents,
      taxCents,
      totalCents,
      customerName,
      customerPhone,
      deliveryMethod,
      address ? JSON.stringify(address) : null,
      JSON.stringify(cart)
    )
    .run();

  return orderId;
};
