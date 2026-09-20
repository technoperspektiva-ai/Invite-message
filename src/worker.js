const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const RECIPIENTS = new Set(["Дружина", "Кохана", "Подруга", "Чоловік", "Коханий", "Друг"]);
const MAX_DATA_URI_CHARS = 950_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function shortId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 18);
}

async function ensureSchema(env) {
  // Do not cache D1 promises globally. Workers may reuse an isolate for many
  // requests, while I/O objects belong to the request that created them.
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      photo_data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON invitations(created_at)"
  ).run();
}

async function getInvite(env, id, includePhoto = true) {
  await ensureSchema(env);
  const sql = includePhoto
    ? "SELECT id, recipient, photo_data, created_at FROM invitations WHERE id = ?1 LIMIT 1"
    : "SELECT id, recipient, created_at, length(photo_data) AS photo_chars FROM invitations WHERE id = ?1 LIMIT 1";
  return env.DB.prepare(sql).bind(id).first();
}

function validImageDataUri(value) {
  return typeof value === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      try {
        await ensureSchema(env);
        const row = await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ ok: row?.ok === 1, storage: "d1-text", version: 12 });
      } catch (error) {
        console.error("health failed", error);
        return json({ ok: false, storage: "d1-text", version: 12, error: String(error?.message || error) }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/invitations") {
      let stage = "request";
      try {
        stage = "schema";
        await ensureSchema(env);

        stage = "json";
        const body = await request.json();
        const recipient = String(body?.recipient || "");
        const image = String(body?.image || "");

        if (!RECIPIENTS.has(recipient)) return json({ error: "Некоректне звертання" }, 400);
        if (!validImageDataUri(image)) return json({ error: "Додай фото" }, 400);
        if (image.length > MAX_DATA_URI_CHARS) return json({ error: "Фото завелике після обробки" }, 413);

        const id = shortId();
        const createdAt = Date.now();

        stage = "insert";
        const result = await env.DB.prepare(
          "INSERT INTO invitations (id, recipient, photo_data, created_at) VALUES (?1, ?2, ?3, ?4)"
        ).bind(id, recipient, image, createdAt).run();
        if (result?.success === false) throw new Error("D1 insert returned success=false");

        stage = "verify";
        const verify = await getInvite(env, id, false);
        if (!verify || verify.recipient !== recipient || Number(verify.photo_chars || 0) !== image.length) {
          throw new Error("D1 verification mismatch");
        }

        return json({ id, url: `${url.origin}/i/${id}` }, 201);
      } catch (error) {
        console.error("create invitation failed", { stage, error });
        return json({
          error: "Не вдалося зберегти запрошення.",
          code: "CREATE_FAILED",
          stage,
          detail: String(error?.message || error)
        }, 500);
      }
    }

    const apiMatch = url.pathname.match(/^\/api\/invitations\/([a-z0-9]+)$/i);
    if (request.method === "GET" && apiMatch) {
      try {
        const row = await getInvite(env, apiMatch[1], true);
        if (!row) return json({ error: "Запрошення не знайдено" }, 404);
        if (!validImageDataUri(row.photo_data)) {
          return json({ error: "Фото запрошення пошкоджене" }, 500);
        }
        return json({
          id: row.id,
          recipient: row.recipient,
          createdAt: row.created_at,
          image: row.photo_data
        });
      } catch (error) {
        console.error("invite read failed", error);
        return json({ error: "Запрошення тимчасово недоступне", detail: String(error?.message || error) }, 500);
      }
    }

    if (request.method === "GET" && /^\/i\/[a-z0-9]+$/i.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/invite.html", url.origin), request));
    }

    return env.ASSETS.fetch(request);
  }
};
