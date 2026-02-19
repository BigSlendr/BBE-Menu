import { json, getSessionUserId } from "../_auth";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 6 * 1024 * 1024;

function extFromType(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "bin";
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export const onRequestPost: PagesFunction = async (context) => {
  const { request, env } = context;

  const userId = await getSessionUserId(request, env);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data" }, 400);
  }

  const idFile = form.get("id_image");
  const selfieFile = form.get("selfie_image");
  const idExp = normalizeDate(String(form.get("id_expiration") || "").trim() || null);

  if (!(idFile instanceof File) || !(selfieFile instanceof File)) {
    return json({ error: "Both id_image and selfie_image are required" }, 400);
  }

  if (!ALLOWED.has(idFile.type) || !ALLOWED.has(selfieFile.type)) {
    return json({ error: "Only JPG, PNG, or WEBP images are allowed" }, 400);
  }

  if (idFile.size > MAX_BYTES || selfieFile.size > MAX_BYTES) {
    return json({ error: "Each file must be 6MB or less" }, 400);
  }

  const ts = Date.now();
  const idKey = `verifications/${userId}/id-${ts}.${extFromType(idFile.type)}`;
  const selfieKey = `verifications/${userId}/selfie-${ts}.${extFromType(selfieFile.type)}`;

  await env.VERIFICATIONS.put(idKey, await idFile.arrayBuffer(), {
    httpMetadata: { contentType: idFile.type },
  });
  await env.VERIFICATIONS.put(selfieKey, await selfieFile.arrayBuffer(), {
    httpMetadata: { contentType: selfieFile.type },
  });

  const db = env.DB as D1Database;
  const now = new Date().toISOString();

  const existing = await db
    .prepare("SELECT user_id FROM user_verification WHERE user_id = ?")
    .bind(userId)
    .first();

  if (!existing) {
    await db
      .prepare(
        "INSERT INTO user_verification (user_id, status, id_key, selfie_key, id_expiration, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(userId, "pending", idKey, selfieKey, idExp, now)
      .run();
  } else {
    await db
      .prepare(
        "UPDATE user_verification SET status = ?, id_key = ?, selfie_key = ?, id_expiration = ?, updated_at = ? WHERE user_id = ?"
      )
      .bind("pending", idKey, selfieKey, idExp, now, userId)
      .run();
  }

  return json({ ok: true });
};
