# Invite Message v12 — reliable D1 text storage

This build keeps D1, but removes the two fragile parts from v11:

1. no global cached D1 I/O promise;
2. no BLOB / Uint8Array / multipart pipeline.

The browser converts the chosen photo to a compact JPEG, then to a base64 data URI. D1 stores that value as normal TEXT in the same row as the invitation metadata. One public API read returns the complete invitation, so the recipient page does not depend on a second photo request.

## Deploy

```bash
npx wrangler deploy
```

No R2 is used. No manual database_id is required with current Wrangler automatic provisioning.

## Diagnostic endpoint

Open `/api/health` after deploy. A healthy deployment returns:

```json
{"ok":true,"storage":"d1-text","version":12}
```

If creation fails, the UI now includes the failing stage (`schema`, `json`, `insert`, or `verify`) instead of hiding the useful signal.
