interface Env {
  RESEND_API_KEY?: string;
  MAIL_TO?: string;
  MAIL_FROM?: string;
}

type SuggestionPayload = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
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

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const validatePayload = (payload: SuggestionPayload): string | null => {
  const name = asTrimmedString(payload.name);
  const email = asTrimmedString(payload.email);
  const phone = asTrimmedString(payload.phone);
  const message = asTrimmedString(payload.message);

  if (!name) return "Name is required.";
  if (name.length > 80) return "Name must be 80 characters or fewer.";

  if (!email) return "Email is required.";
  if (email.length > 120) return "Email must be 120 characters or fewer.";

  if (phone.length > 40) return "Phone must be 40 characters or fewer.";

  if (!message) return "Message is required.";
  if (message.length > 2000) return "Message must be 2000 characters or fewer.";

  return null;
};

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  let payload: SuggestionPayload;
  try {
    payload = (await request.json()) as SuggestionPayload;
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

  const name = asTrimmedString(payload.name);
  const email = asTrimmedString(payload.email);
  const phone = asTrimmedString(payload.phone);
  const message = asTrimmedString(payload.message);
  const timestamp = new Date().toISOString();

  const html = `
    <h2>New Suggestion</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Phone:</strong> ${phone ? escapeHtml(phone) : "(not provided)"}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
    <p><strong>Timestamp:</strong> ${escapeHtml(timestamp)}</p>
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
      subject: `New Suggestion — ${name}`,
      html,
    }),
  });

  if (!resendResponse.ok) {
    const resendText = await resendResponse.text();
    return jsonResponse({ ok: false, error: `Unable to send email: ${resendText || resendResponse.statusText}` }, 502);
  }

  return jsonResponse({ ok: true }, 200);
};
