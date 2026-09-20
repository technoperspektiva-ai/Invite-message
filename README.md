# Invite Message

Cloudflare Worker + Static Assets + R2. Запрошення та фото зберігаються в R2, тому D1/database_id не потрібні.

## Cloudflare

Worker name: `invite-message`
R2 binding: `MEDIA`
R2 bucket: `love-invite-media`

Якщо bucket вже створений у Cloudflare, connected build з командою `npx wrangler deploy` має пройти без ручної підстановки `database_id`.

Якщо bucket ще не існує, створіть його один раз:

```bash
npx wrangler r2 bucket create love-invite-media
```

Після цього:

```bash
npm install
npx wrangler deploy
```

## Що виправлено

- назва Worker приведена до `invite-message`, як очікує Cloudflare CI;
- D1 binding і placeholder `REPLACE_WITH_D1_DATABASE_ID` прибрані;
- дані запрошень тепер зберігаються як JSON у R2;
- фото як і раніше зберігаються в R2;
- публічні URL `/i/<id>` та Share API залишилися без змін.
