const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const RECIPIENTS = new Set(["Дружина", "Кохана", "Подруга", "Чоловік", "Коханий", "Друг"]);
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const B64_CHUNK = 48_000;

export class InvitationStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/store-v9") {
      const recipient = decodeURIComponent(url.searchParams.get("recipient") || "");
      const type = String(request.headers.get("x-photo-type") || "image/jpeg").toLowerCase();
      const bytes = new Uint8Array(await request.arrayBuffer());

      if (!RECIPIENTS.has(recipient)) return new Response("bad recipient", { status: 400 });
      if (type !== "image/jpeg") return new Response("photo must be jpeg", { status: 415 });
      if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES) return new Response("bad photo size", { status: 413 });

      const base64 = bytesToBase64(bytes);
      const count = Math.ceil(base64.length / B64_CHUNK);
      if (count > 120) return new Response("photo too large", { status: 413 });

      const now = Date.now();
      const entries = {
        invite: { recipient, createdAt: now, updatedAt: now, photoVersion: 9 },
        photoManifestV9: {
          type: "image/jpeg",
          count,
          byteLength: bytes.byteLength,
          base64Length: base64.length,
          version: 9
        }
      };

      for (let i = 0; i < count; i++) {
        entries[`photo9:${String(i).padStart(3, "0")}`] = base64.slice(i * B64_CHUNK, (i + 1) * B64_CHUNK);
      }

      await this.ctx.storage.put(entries);
      return new Response("ok");
    }

    if (request.method === "GET" && url.pathname === "/get") {
      const meta = await this.ctx.storage.get("invite");
      if (!meta) return new Response("not found", { status: 404 });
      return Response.json(meta);
    }

    if (request.method === "GET" && url.pathname === "/photo") {
      const photo = await readStoredPhoto(this.ctx.storage);
      if (!photo) return new Response("not found", { status: 404 });
      return new Response(photo.bytes, {
        headers: {
          "content-type": photo.type,
          "content-length": String(photo.bytes.byteLength),
          "cache-control": "no-store, max-age=0",
          "content-disposition": "inline; filename=invitation-photo.jpg",
          "x-content-type-options": "nosniff"
        }
      });
    }

    return new Response("not found", { status: 404 });
  }
}

async function readStoredPhoto(storage) {
  // v9: canonical, browser-safe JPEG stored as small base64 strings.
  const v9 = await storage.get("photoManifestV9");
  if (v9?.count) {
    const keys = Array.from({ length: v9.count }, (_, i) => `photo9:${String(i).padStart(3, "0")}`);
    const chunks = await storage.get(keys);
    const base64 = keys.map(key => chunks.get(key) || "").join("");
    if (!base64 || base64.length !== Number(v9.base64Length || base64.length)) return null;
    const bytes = base64ToBytes(base64);
    if (v9.byteLength && bytes.byteLength !== Number(v9.byteLength)) return null;
    return { type: "image/jpeg", bytes };
  }

  // v8 compatibility.
  const v8 = await storage.get("photoManifestV8");
  if (v8?.count) {
    const keys = Array.from({ length: v8.count }, (_, i) => `photo8:${String(i).padStart(3, "0")}`);
    const chunks = await storage.get(keys);
    const parts = keys.map(key => toUint8(chunks.get(key)));
    if (parts.some(x => !x)) return null;
    const total = parts.reduce((sum, x) => sum + x.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
    return { type: v8.type || "image/jpeg", bytes: out };
  }

  // v5-v7 compatibility.
  const manifest = await storage.get("photoManifest");
  if (manifest?.count) {
    const keys = Array.from({ length: manifest.count }, (_, i) => `photo:${String(i).padStart(3, "0")}`);
    const chunks = await storage.get(keys);
    const base64 = keys.map(key => chunks.get(key) || "").join("");
    if (base64) return { type: manifest.type || "image/jpeg", bytes: base64ToBytes(base64) };
  }

  const binary = await storage.get("photo");
  if (binary) {
    const bytes = toUint8(binary);
    if (bytes) return { type: (await storage.get("photoType")) || "image/jpeg", bytes };
  }

  const legacy = await storage.get("invite");
  if (legacy?.image) {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(legacy.image));
    if (match) return { type: match[1], bytes: base64ToBytes(match[2]) };
  }

  return null;
}

function toUint8(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function bytesToBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function shortId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

function inviteStub(env, id) {
  return env.INVITES.get(env.INVITES.idFromName(id));
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
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) return json({ error: "Очікується фото" }, 415);

        const form = await request.formData();
        const recipient = String(form.get("recipient") || "");
        const file = form.get("photo");

        if (!RECIPIENTS.has(recipient)) return json({ error: "Некоректне звертання" }, 400);
        if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Додай фото" }, 400);
        if (String(file.type || "").toLowerCase() !== "image/jpeg") return json({ error: "Фото не було підготовлене як JPEG" }, 415);
        if (!file.size || file.size > MAX_UPLOAD_BYTES) return json({ error: "Підготовлене фото має бути до 4 МБ" }, 413);

        const id = shortId();
        const bytes = await file.arrayBuffer();
        const res = await inviteStub(env, id).fetch(`https://invite.internal/store-v9?recipient=${encodeURIComponent(recipient)}`, {
          method: "POST",
          headers: { "x-photo-type": "image/jpeg" },
          body: bytes
        });
        if (!res.ok) throw new Error(`store failed: ${res.status} ${await res.text()}`);

        return json({ id, url: `${url.origin}/i/${id}` }, 201);
      } catch (error) {
        console.error("create invitation failed", error);
        return json({ error: "Не вдалося зберегти фото. Спробуй інше фото або ще раз." }, 500);
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
      return json({ ...data, photoUrl: `/api/invitations/${apiMatch[1]}/photo` });
    }

    if (request.method === "GET" && /^\/i\/[a-z0-9]+$/i.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/invite.html", url.origin), request));
    }

    return env.ASSETS.fetch(request);
  }
};
