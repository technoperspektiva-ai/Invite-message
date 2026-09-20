const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const RECIPIENTS = new Set(["Дружина", "Кохана", "Подруга", "Чоловік", "Коханий", "Друг"]);
const MAX_JPEG_BYTES = 900 * 1024;
let schemaPromise = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function shortId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

async function ensureSchema(env) {
  if (!schemaPromise) {
    schemaPromise = env.DB.exec(`
      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        photo BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON invitations(created_at);
    `).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function toBytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  return null;
}

async function getMeta(env, id) {
  await ensureSchema(env);
  return env.DB.prepare(
    "SELECT id, recipient, created_at, length(photo) AS photo_bytes FROM invitations WHERE id = ? LIMIT 1"
  ).bind(id).first();
}

async function getPhoto(env, id) {
  await ensureSchema(env);
  const row = await env.DB.prepare(
    "SELECT photo FROM invitations WHERE id = ? LIMIT 1"
  ).bind(id).first();
  return toBytes(row?.photo);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      try {
        await ensureSchema(env);
        const row = await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ ok: row?.ok === 1, storage: "d1" });
      } catch (error) {
        console.error("health failed", error);
        return json({ ok: false, storage: "d1", error: "database unavailable" }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/invitations") {
      try {
        await ensureSchema(env);
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
          return json({ error: "Очікується фото" }, 415);
        }

        const form = await request.formData();
        const recipient = String(form.get("recipient") || "");
        const file = form.get("photo");

        if (!RECIPIENTS.has(recipient)) return json({ error: "Некоректне звертання" }, 400);
        if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Додай фото" }, 400);
        if (String(file.type || "").toLowerCase() !== "image/jpeg") {
          return json({ error: "Фото не було підготовлене як JPEG" }, 415);
        }
        if (!file.size || file.size > MAX_JPEG_BYTES) {
          return json({ error: "Підготовлене фото завелике" }, 413);
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength < 32) return json({ error: "Фото пошкоджене" }, 400);

        const id = shortId();
        const createdAt = Date.now();
        await env.DB.prepare(
          "INSERT INTO invitations (id, recipient, photo, created_at) VALUES (?, ?, ?, ?)"
        ).bind(id, recipient, bytes, createdAt).run();

        // Strong consistency check against the exact row before a public link is returned.
        const verify = await getMeta(env, id);
        if (!verify || Number(verify.photo_bytes) !== bytes.byteLength || verify.recipient !== recipient) {
          throw new Error("D1 verification mismatch");
        }

        return json({
          id,
          url: `${url.origin}/i/${id}`,
          photoUrl: `${url.origin}/api/invitations/${id}/photo`
        }, 201);
      } catch (error) {
        console.error("create invitation failed", error);
        return json({ error: "Не вдалося надійно зберегти запрошення. Спробуй ще раз." }, 500);
      }
    }

    const photoMatch = url.pathname.match(/^\/api\/invitations\/([a-z0-9]+)\/photo$/i);
    if (request.method === "GET" && photoMatch) {
      try {
        const bytes = await getPhoto(env, photoMatch[1]);
        if (!bytes?.byteLength) return new Response("not found", { status: 404 });
        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(bytes.byteLength),
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff"
          }
        });
      } catch (error) {
        console.error("photo read failed", error);
        return new Response("photo unavailable", { status: 500 });
      }
    }

    const metaMatch = url.pathname.match(/^\/api\/invitations\/([a-z0-9]+)$/i);
    if (request.method === "GET" && metaMatch) {
      try {
        const row = await getMeta(env, metaMatch[1]);
        if (!row) return json({ error: "Запрошення не знайдено" }, 404);
        return json({
          id: row.id,
          recipient: row.recipient,
          createdAt: row.created_at,
          photoBytes: Number(row.photo_bytes || 0),
          photoUrl: `/api/invitations/${row.id}/photo`
        });
      } catch (error) {
        console.error("meta read failed", error);
        return json({ error: "Запрошення тимчасово недоступне" }, 500);
      }
    }

    if (request.method === "GET" && /^\/i\/[a-z0-9]+$/i.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/invite.html", url.origin), request));
    }

    return env.ASSETS.fetch(request);
  }
};
