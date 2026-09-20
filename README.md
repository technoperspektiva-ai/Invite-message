# Invite Message v10 — reliable invitation links

This build removes the fragile photo-chunk reconstruction path for newly created invitations.

## Deploy

```bash
npx wrangler deploy
```

No R2, D1 or manual database ID is required. The project uses a SQLite-backed Durable Object.

## Reliability changes

- Creator always converts the selected image to browser-safe JPEG.
- JPEG is aggressively kept below 900 KiB.
- The complete invitation (recipient + image data URL) is stored as one Durable Object value, safely below the 2 MiB SQLite-backed DO value limit.
- The Worker verifies the stored invitation before returning the public link.
- The browser performs a second verification before showing the link/share dialog.
- `/i/<id>` uses a single API response for metadata + photo, so there is no separate photo endpoint that can fail independently.
- v4-v9 links have a best-effort legacy reader.
