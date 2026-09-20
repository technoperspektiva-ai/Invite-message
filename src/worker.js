const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const PHOTO_CHUNK_SIZE = 60_000;

export class InvitationStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/store") {
      const data = await request.json();
      const image = String(data.image || "");
      const parsed = parseDataImage(image);
      if (!parsed) return new Response("bad image", { status: 400 });

      const meta = {
        recipient: data.recipient,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };

      const base64 = parsed.base64;
      const count = Math.ceil(base64.length / PHOTO_CHUNK_SIZE);
      const values = {
        invite: meta,
        photoManifest: { type: parsed.type, count, version: 2 }
      };
      for (let i = 0; i < count; i++) {
        values[`photo:${String(i).padStart(3, "0")}`] = base64.slice(i * PHOTO_CHUNK_SIZE, (i + 1) * PHOTO_CHUNK_SIZE);
      }
      await this.ctx.storage.put(values);
      return new Response("ok");
    }

    if (request.method === "GET" && url.pathname === "/get") {
      const data = await this.ctx.storage.get("invite");
      if (!data) return new Response("not found", { status: 404 });
      const { image, ...meta } = data;
      return Response.json(meta);
    }

    if (request.method === "GET" && url.pathname === "/photo") {
      // v6: photo is stored as small base64 chunks so it works reliably
      // with Durable Object storage and does not require R2.
      const manifest = await this.ctx.storage.get("photoManifest");
      if (manifest?.count) {
        const keys = Array.from({ length: manifest.count }, (_, i) => `photo:${String(i).padStart(3, "0")}`);
        const chunks = await this.ctx.storage.get(keys);
        const base64 = keys.map(key => chunks.get(key) || "").join("");
        if (base64) {
          const bytes = base64ToBytes(base64);
          return imageResponse(bytes, manifest.type || "image/jpeg");
        }
      }

      // Compatibility with v5 binary storage.
      const binary = await this.ctx.storage.get("photo");
      if (binary) {
        const type = await this.ctx.storage.get("photoType") || "image/jpeg";
        return imageResponse(binary, type);
      }

      // Compatibility with v4, where the Data URL lived in the invite object.
      const legacy = await this.ctx.storage.get("invite");
      const parsed = legacy?.image ? parseDataImage(String(legacy.image)) : null;
      if (parsed) return imageResponse(parsed.bytes, parsed.type);

      return new Response("not found", { status: 404 });
    }

    return new Response("not found", { status: 404 });
  }
}

const RECIPIENTS = new Set(["Дружина", "Кохана", "Подруга", "Чоловік", "Коханий", "Друг"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function shortId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

function parseDataImage(value) {
  const match = /^data:(image\/(?:jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const bytes = base64ToBytes(match[2]);
  return { type: match[1], base64: match[2], bytes };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function imageResponse(body, type) {
  return new Response(body, {
    headers: {
      "content-type": type,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function inviteStub(env, id) {
  const objId = env.INVITES.idFromName(id);
  return env.INVITES.get(objId);
}

async function storeInvite(env, id, payload, image) {
  const res = await inviteStub(env, id).fetch("https://invite.internal/store", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, image })
  });
  if (!res.ok) throw new Error("invite store failed");
}

async function getInvite(env, id) {
  const res = await inviteStub(env, id).fetch("https://invite.internal/get");
  if (!res.ok) return null;
  return res.json();
}

async function getPhoto(env, id) {
  return inviteStub(env, id).fetch("https://invite.internal/photo");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/invitations") {
      try {
        const body = await request.json();
        const recipient = String(body.recipient || "");
        const image = String(body.image || "");
        if (!RECIPIENTS.has(recipient)) return json({ error: "Некоректне звертання" }, 400);

        const photo = parseDataImage(image);
        if (!photo) return json({ error: "Додай фото" }, 400);
        if (photo.bytes.byteLength > 480_000) return json({ error: "Фото завелике після обробки" }, 413);

        const id = shortId();
        const now = Date.now();
        await storeInvite(env, id, { recipient, createdAt: now, updatedAt: now }, image);
        return json({ id, url: `${url.origin}/i/${id}` }, 201);
      } catch (error) {
        console.error(error);
        return json({ error: "Не вдалося створити запрошення" }, 500);
      }
    }

    const photoMatch = url.pathname.match(/^\/api\/invitations\/([a-z0-9]+)\/photo$/i);
    if (request.method === "GET" && photoMatch) {
      const res = await getPhoto(env, photoMatch[1]);
      if (!res.ok) return new Response("Фото не знайдено", { status: 404 });
      return res;
    }

    const apiMatch = url.pathname.match(/^\/api\/invitations\/([a-z0-9]+)$/i);
    if (request.method === "GET" && apiMatch) {
      const data = await getInvite(env, apiMatch[1]);
      if (!data) return json({ error: "Запрошення не знайдено" }, 404);
      return json(data);
    }

    if (request.method === "GET" && /^\/i\/[a-z0-9]+$/i.test(url.pathname)) {
      const inviteUrl = new URL("/invite.html", url.origin);
      return env.ASSETS.fetch(new Request(inviteUrl, request));
    }

    return env.ASSETS.fetch(request);
  }
};
