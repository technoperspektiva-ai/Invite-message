# Invite Message v11 — D1 rebuild

This build removes Durable Objects from runtime and stores invitations/photos in Cloudflare D1.

## Why v11

Previous builds used one Durable Object per invitation. v11 replaces that path entirely with one D1 table and a dedicated raw-JPEG endpoint. The creator verifies both metadata and the actual JPEG before exposing a share link.

## Deploy

```bash
npx wrangler deploy
```

Wrangler 4.45+ automatically provisions the D1 binding declared in `wrangler.toml`; no account-specific `database_id` is committed to the repository.

The config also includes the required `v2` legacy Durable Object deletion migration because earlier releases had already created `InvitationStore` in migration `v1`.

## Routes

- `/` — creator
- `POST /api/invitations` — create invitation
- `GET /api/invitations/:id` — metadata
- `GET /api/invitations/:id/photo` — raw JPEG photo
- `/i/:id` — recipient invitation page
- `/api/health` — D1 health check

The Worker creates the `invitations` table automatically on first request.
