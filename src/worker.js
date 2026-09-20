const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export class InvitationStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/store") {
      const data = await request.json();
      await this.ctx.storage.put("invite", data);
      return new Response("ok");
    }

    if (request.method === "PUT" && url.pathname === "/photo") {
      const buffer = await request.arrayBuffer();
      const type = request.headers.get("content-type") || "image/jpeg";
      await this.ctx.storage.put("photo", buffer);
      await this.ctx.storage.put("photoType", type);
      return new Response("ok");
    }

    if (request.method === "GET" && url.pathname === "/get") {
      const data = await this.ctx.storage.get("invite");
      if (!data) return new Response("not found", { status: 404 });
      const { image, ...meta } = data;
      return Response.json(meta);
    }

    if (request.method === "GET" && url.pathname === "/photo") {
      let buffer = await this.ctx.storage.get("photo");
      let type = await this.ctx.storage.get("photoType") || "image/jpeg";

      // Backward compatibility for invitations created by v4, where the
      // compressed image was stored inside the invitation JSON.
      if (!buffer) {
        const legacy = await this.ctx.storage.get("invite");
        const parsed = legacy?.image ? parseDataImage(String(legacy.image)) : null;
        if (parsed) {
          buffer = parsed.bytes.buffer;
          type = parsed.type;
          await this.ctx.storage.put("photo", buffer);
          await this.ctx.storage.put("photoType", type);
        }
      }

      if (!buffer) return new Response("not found", { status: 404 });
      return new Response(buffer, {
        headers: {
          "content-type": type,
          "cache-control": "public, max-age=31536000, immutable"
        }
      });
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
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { type: match[1], bytes };
}

function inviteStub(env, id) {
  const objId = env.INVITES.idFromName(id);
  return env.INVITES.get(objId);
}

async function storeInvite(env, id, payload, photo) {
  const stub = inviteStub(env, id);
  const metaRes = await stub.fetch("https://invite.internal/store", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!metaRes.ok) throw new Error("metadata store failed");

  const photoRes = await stub.fetch("https://invite.internal/photo", {
    method: "PUT",
    headers: { "content-type": photo.type },
    body: photo.bytes
  });
  if (!photoRes.ok) throw new Error("photo store failed");
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
        if (photo.bytes.byteLength > 700_000) return json({ error: "Фото завелике після обробки" }, 413);

        const id = shortId();
        const now = Date.now();
        await storeInvite(env, id, { recipient, createdAt: now, updatedAt: now }, photo);
        return json({ id, url: `${url.origin}/i/${id}` }, 201);
      } catch (error) {
        console.error(error);
        return json({ error: "Не вдалося створити запрошення" }, 500);
      }
    }

    const apiMatch = url.pathname.match(/^\/api\/invitations\/([a-z0-9]+)$/i);
    if (request.method === "GET" && apiMatch) {
      const data = await getInvite(env, apiMatch[1]);
      if (!data) return json({ error: "Запрошення не знайдено" }, 404);
      return json(data);
    }

    const photoMatch = url.pathname.match(/^\/api\/invitations\/([a-z0-9]+)\/photo$/i);
    if (request.method === "GET" && photoMatch) {
      const res = await getPhoto(env, photoMatch[1]);
      if (!res.ok) return new Response("Фото не знайдено", { status: 404 });
      return res;
    }

    if (request.method === "GET" && /^\/i\/[a-z0-9]+$/i.test(url.pathname)) {
      const inviteUrl = new URL("/invite.html", url.origin);
      return env.ASSETS.fetch(new Request(inviteUrl, request));
    }

    return env.ASSETS.fetch(request);
  }
};
