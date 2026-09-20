# Invite Message v7

Fixes:
- photo is reconstructed in the Durable Object and returned as a Data URL in the invitation API;
- Safari/iPhone no longer depends on Blob/ObjectURL rendering for the invitation image;
- opened preview contains only the photo;
- mobile creator layout was rebuilt for narrow screens;
- R2 is not used.

Deploy:

```bash
npx wrangler deploy
```
