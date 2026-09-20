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
    if (request.method === "GET" && url.pathname === "/get") {
      const data = await this.ctx.storage.get("invite");
      if (!data) return new Response("not found", { status: 404 });
      return Response.json(data);
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

async function storeInvite(env, id, payload) {
  const objId = env.INVITES.idFromName(id);
  const stub = env.INVITES.get(objId);
  const res = await stub.fetch("https://invite.internal/store", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("store failed");
}

async function getInvite(env, id) {
  const objId = env.INVITES.idFromName(id);
  const stub = env.INVITES.get(objId);
  const res = await stub.fetch("https://invite.internal/get");
  if (!res.ok) return null;
  return res.json();
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
        if (!image.startsWith("data:image/jpeg;base64,") && !image.startsWith("data:image/webp;base64,")) {
          return json({ error: "Додай фото" }, 400);
        }
        if (image.length > 900_000) return json({ error: "Фото завелике після обробки" }, 413);

        const id = shortId();
        await storeInvite(env, id, { recipient, image, createdAt: Date.now() });
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

    if (request.method === "GET" && /^\/i\/[a-z0-9]+$/i.test(url.pathname)) {
      const inviteUrl = new URL("/invite.html", url.origin);
      return env.ASSETS.fetch(new Request(inviteUrl, request));
    }

    return env.ASSETS.fetch(request);
  }
};
