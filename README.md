# Invite Message v8

Photo pipeline rebuilt without R2 and without client-side canvas/base64 conversion.

- creator uploads the original photo as multipart/form-data;
- Durable Object stores the original binary image in chunks;
- invitation loads the photo from a dedicated binary /photo endpoint;
- supports JPG, PNG, WEBP, AVIF, GIF, HEIC and HEIF;
- old v4-v7 invitations remain readable;
- opened card contains only the photo;
- envelope animation and public /i/... link remain.

Deploy:

```bash
npx wrangler deploy
```
