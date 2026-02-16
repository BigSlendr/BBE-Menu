# BBE Menu

## Test suggestions endpoint (Cloudflare Pages Functions)

Set your Pages environment variables first:

- `RESEND_API_KEY`
- `MAIL_TO`
- `MAIL_FROM`

Then test locally (for example with `wrangler pages dev`):

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
