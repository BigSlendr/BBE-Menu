# BBE Menu

Cloudflare Pages static site for the Bobby Black Exclusive menu.

## Environment variables (Cloudflare Pages)

Set these in **Pages → Settings → Environment variables** for preview/production:

- `RESEND_API_KEY` (Secret)
- `MAIL_TO` (e.g. `budtender@bobbyblacknyc.com`)
- `MAIL_FROM` (e.g. `budtender@bobbyblacknyc.com` or `Bobby Black <budtender@bobbyblacknyc.com>`)

## Email features

- **Suggestions form** lives on the main page (`index.html`) in the **Suggestions** section near the footer.
  - Frontend sends `POST /api/suggestions`.
  - Pages Function `functions/api/suggestions.ts` validates and emails the submission via Resend.

- **Cart/Checkout order email** lives on `cart.html`.
  - Checkout form collects customer name/phone/email and special instructions.
  - On place order, frontend sends `POST /api/order` with customer details + itemized cart + totals.
  - Pages Function `functions/api/order.ts` validates, generates an `ORD-YYYYMMDD-XXXX` id, and emails the order via Resend.

## Local development

Run with Wrangler Pages dev (example):

```bash
npx wrangler pages dev .
```

## D1 migrations

Apply migrations with Wrangler:

```bash
wrangler d1 migrations apply <db_name> --local
wrangler d1 migrations apply <db_name> --remote
```

If migrations tooling is not configured yet, execute the SQL file directly instead:

```bash
wrangler d1 execute <db_name> --local --file=./migrations/0001_rewards.sql
wrangler d1 execute <db_name> --remote --file=./migrations/0001_rewards.sql
```

## Endpoint test examples (curl)

### Suggestions endpoint

```bash
curl -i -X POST http://localhost:8788/api/suggestions \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+1 555 123 4567",
    "message": "Love the menu, please add a sugar-free option."
  }'
```

### Order endpoint

```bash
curl -i -X POST http://localhost:8788/api/order \
  -H 'Content-Type: application/json' \
  -d '{
    "customer": {
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+1 555 123 4567"
    },
    "order": {
      "items": [
        {
          "id": "frosted-peaches",
          "name": "Frosted Peaches",
          "qty": 2,
          "price": 45,
          "variant": "3.5g",
          "notes": null
        }
      ],
      "subtotal": 90,
      "tax": null,
      "fees": null,
      "total": 90,
      "method": "unknown",
      "address": null,
      "specialInstructions": "Please text on arrival"
    }
  }'
```
