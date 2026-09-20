# Love Invite Studio

Сервіс персональних запрошень під Cloudflare Workers + D1 + R2.

## Що вже працює
- Вибір звертання: Дружина / Кохана / Подруга / Чоловік / Коханий / Друг.
- Завантаження власного фото до 5 МБ.
- Редагування дати, часу, місця, дрес-коду, заголовка і тексту.
- Live preview у лавандово-сріблястій палітрі.
- Створення постійного URL виду `/i/<id>`.
- Фото зберігається в R2, дані запрошення — в D1.
- Одержувач бачить анімований конверт і відкриває лист.
- Кнопка «Надіслати запрошення» використовує Web Share API на iPhone/Android; на desktop є копіювання посилання.

## Cloudflare — перший запуск

1. Встановити залежності:
   `npm install`
2. Увійти:
   `npx wrangler login`
3. Створити D1:
   `npx wrangler d1 create love-invite-db`
4. Скопіювати `database_id` у `wrangler.toml` замість `REPLACE_WITH_D1_DATABASE_ID`.
5. Створити R2 bucket:
   `npx wrangler r2 bucket create love-invite-media`
6. Міграція:
   `npm run db:migrate:remote`
7. Deploy:
   `npm run deploy`

Для локального тесту D1:
`npm run db:migrate:local` і потім `npm run dev`.

## Важливо
`wrangler.toml` навмисно містить placeholder для D1 database_id — Cloudflare видає його лише після створення бази у вашому акаунті.
