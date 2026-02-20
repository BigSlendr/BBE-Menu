import { getSessionUserId, json } from "../_auth";
import { CreateOrderPayload, insertOrder, validateCreateOrderPayload } from "./_create";

interface Env {
  DB: D1Database;
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let payload: CreateOrderPayload;
  try {
    payload = (await request.json()) as CreateOrderPayload;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const validationError = validateCreateOrderPayload(payload);
  if (validationError) {
    return json({ ok: false, error: validationError }, 400);
  }

  try {
    const orderId = await insertOrder({ db: env.DB, userId, payload });
    return json({ ok: true, orderId });
  } catch (error) {
    console.error("[orders/create] failed to insert order", error);
    return json({ ok: false, error: "failed to create order" }, 500);
  }
};
