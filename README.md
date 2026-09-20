# Invite Message v5

Виправлення:
- фото зберігається в Durable Object окремим binary value, без R2;
- старі v4-запрошення також підтримуються;
- на листівці та у fullscreen-перегляді показується тільки фото;
- збережено анімацію конверта, окремий URL `/i/<id>` і закриття fullscreen кнопкою × / тапом поза фото / Escape.

## Deploy

```bash
npx wrangler deploy
```

R2 не потрібен.
