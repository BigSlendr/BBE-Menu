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

type UserRewardsSnapshot = {
  points_balance: number;
  lifetime_spend_cents: number;
};

export type InsertOrderResult = {
  orderId: string;
  pointsEarned: number;
  newTier: string;
  newPointsBalance: number;
};

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

export const computeTierFromLifetimeSpend = (lifetimeSpendCents: number): string => {
  if (lifetimeSpendCents >= 400000) return "reserve";
  if (lifetimeSpendCents >= 150000) return "elite";
  if (lifetimeSpendCents >= 50000) return "insider";
  return "member";
};

export const computeOrderPointsEarned = (subtotalCents: number): number =>
  Math.floor(subtotalCents / 100) * 10;

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

export const insertOrder = async ({ db, userId, payload }: InsertOrderParams): Promise<InsertOrderResult> => {
  const orderId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = "placed";

  const subtotalCents = normalizeCents(payload.subtotal_cents, payload.subtotal) ?? 0;
  const taxCents = normalizeCents(payload.tax_cents, payload.tax) ?? 0;
  const totalCents = normalizeCents(payload.total_cents, payload.total) ?? 0;
  const pointsEarned = computeOrderPointsEarned(subtotalCents);

  const customerName = asString(payload.customer?.name) || null;
  const customerPhone = asString(payload.customer?.phone) || null;
  const deliveryMethod = asString(payload.customer?.delivery_method) || null;
  const address = payload.customer?.address && typeof payload.customer.address === "object" ? payload.customer.address : null;

  const cart = getCartPayload(payload);

  const user = await db
    .prepare(`SELECT points_balance, lifetime_spend_cents FROM users WHERE id = ?`)
    .bind(userId)
    .first<UserRewardsSnapshot>();

  if (!user) {
    const userError = new Error("user record missing");
    (userError as Error & { statusCode?: number }).statusCode = 400;
    throw userError;
  }

  const newLifetimeSpendCents = Number(user.lifetime_spend_cents || 0) + subtotalCents;
  const newPointsBalance = Number(user.points_balance || 0) + pointsEarned;
  const newTier = computeTierFromLifetimeSpend(newLifetimeSpendCents);

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
        points_earned,
        customer_name,
        customer_phone,
        delivery_method,
        address_json,
        cart_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      orderId,
      userId,
      nowIso,
      status,
      subtotalCents,
      taxCents,
      totalCents,
      pointsEarned,
      customerName,
      customerPhone,
      deliveryMethod,
      address ? JSON.stringify(address) : null,
      JSON.stringify(cart)
    )
    .run();

  try {
    await db
      .prepare(
        `INSERT INTO points_ledger (
          id,
          user_id,
          created_at,
          type,
          points_delta,
          reason,
          order_id,
          meta_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        userId,
        nowIso,
        "earn",
        pointsEarned,
        "Order earned points",
        orderId,
        JSON.stringify({ rule: "10pts_per_$1", subtotal_cents: subtotalCents })
      )
      .run();
  } catch (error) {
    console.error("[orders/create] points_ledger insert failed after order insert", {
      orderId,
      userId,
      error,
    });
    throw new Error("failed to record points ledger for order");
  }

  await db
    .prepare(
      `UPDATE users
       SET points_balance = points_balance + ?,
           lifetime_spend_cents = lifetime_spend_cents + ?,
           tier = ?,
           last_activity_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .bind(pointsEarned, subtotalCents, newTier, nowIso, nowIso, userId)
    .run();

  return {
    orderId,
    pointsEarned,
    newTier,
    newPointsBalance,
  };
};
