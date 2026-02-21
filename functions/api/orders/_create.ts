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
    email?: unknown;
    delivery_method?: unknown;
    address?: unknown;
  };
  special_instructions?: unknown;
  specialInstructions?: unknown;
};

interface InsertOrderParams {
  db: D1Database;
  userId: string | null;
  payload: CreateOrderPayload;
}

type UserRewardsSnapshot = {
  points_balance: number;
  lifetime_spend_cents: number;
};

export type InsertOrderResult = {
  orderId: string;
  pointsEarned: number;
  newTier: string | null;
  newPointsBalance: number | null;
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

export const computeOrderPointsEarned = (subtotalCents: number): number => Math.floor(subtotalCents / 100) * 10;

export const getCartPayload = (payload: CreateOrderPayload): unknown => {
  if (Array.isArray(payload.cartItems)) return payload.cartItems;
  if (Array.isArray(payload.cart)) return payload.cart;
  if (payload.cart && typeof payload.cart === "object" && Array.isArray((payload.cart as { items?: unknown }).items)) {
    return (payload.cart as { items: unknown[] }).items;
  }
  return [];
};

export function validateCreateOrderPayload(_payload: CreateOrderPayload): string | null {
  return null;
}

export const insertOrder = async ({ db, userId, payload }: InsertOrderParams): Promise<InsertOrderResult> => {
  const orderId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const status = "placed";

  const subtotalCents = normalizeCents(payload.subtotal_cents, payload.subtotal) ?? 0;
  const taxCents = normalizeCents(payload.tax_cents, payload.tax) ?? 0;
  const totalCents = normalizeCents(payload.total_cents, payload.total) ?? 0;

  const customerName = asString(payload.customer?.name) || null;
  const customerPhone = asString(payload.customer?.phone) || null;
  const customerEmail = asString(payload.customer?.email) || null;
  const deliveryMethod = asString(payload.customer?.delivery_method) || null;
  const address = payload.customer?.address && typeof payload.customer.address === "object" ? payload.customer.address : null;
  const specialInstructions = asString(payload.special_instructions ?? payload.specialInstructions) || null;
  const cart = getCartPayload(payload);

  const pointsEarned = userId ? computeOrderPointsEarned(subtotalCents) : 0;
  let newPointsBalance: number | null = null;
  let newTier: string | null = null;

  if (userId) {
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
    newPointsBalance = Number(user.points_balance || 0) + pointsEarned;
    newTier = computeTierFromLifetimeSpend(newLifetimeSpendCents);

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
  }

  const orderColumns = await db.prepare("PRAGMA table_info(orders)").all<{ name: string }>();
  const existingColumns = new Set((orderColumns.results || []).map((column) => column.name));

  const orderRowValues: Record<string, unknown> = {
    id: orderId,
    user_id: userId,
    created_at: nowIso,
    status,
    subtotal_cents: subtotalCents,
    total_cents: totalCents,
    points_earned: pointsEarned,
    points_redeemed: 0,
    credit_cents_used: 0,
    tax_cents: taxCents,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    special_instructions: specialInstructions,
    delivery_method: deliveryMethod,
    address_json: address ? JSON.stringify(address) : null,
    cart_json: JSON.stringify(cart),
  };

  const insertableEntries = Object.entries(orderRowValues).filter(([column]) => existingColumns.has(column));
  const insertColumns = insertableEntries.map(([column]) => column).join(", ");
  const insertPlaceholders = insertableEntries.map(() => "?").join(", ");
  const insertValues = insertableEntries.map(([, value]) => value);

  await db.prepare(`INSERT INTO orders (${insertColumns}) VALUES (${insertPlaceholders})`).bind(...insertValues).run();

  return { orderId, pointsEarned, newTier, newPointsBalance };
};
