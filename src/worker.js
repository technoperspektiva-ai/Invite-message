const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const PHOTO_CHUNK_SIZE = 512 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const RECIPIENTS = new Set(["Дружина", "Кохана", "Подруга", "Чоловік", "Коханий", "Друг"]);
const SAFE_IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/heic", "image/heif"
]);

export class InvitationStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/store-v8") {
      const recipient = decodeURIComponent(url.searchParams.get("recipient") || "");
      const type = String(request.headers.get("x-photo-type") || "image/jpeg").toLowerCase();
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (!RECIPIENTS.has(recipient)) return new Response("bad recipient", { status: 400 });
      if (!SAFE_IMAGE_TYPES.has(type)) return new Response("bad image type", { status: 400 });
      if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return new Response("bad image size", { status: 400 });

      const now = Date.now();
      const count = Math.ceil(bytes.byteLength / PHOTO_CHUNK_SIZE);
      const writes = {
        invite: { recipient, createdAt: now, updatedAt: now },
        photoManifestV8: { type, count, size: bytes.byteLength, version: 8 }
      };

      for (let i = 0; i < count; i++) {
        const start = i * PHOTO_CHUNK_SIZE;
        const end = Math.min(bytes.byteLength, start + PHOTO_CHUNK_SIZE);
        const part = bytes.slice(start, end);
        writes[`photo8:${String(i).padStart(3, "0")}`] = part.buffer;
      }

      await this.ctx.storage.put(writes);
      return new Response("ok");
    }

    // Backward compatibility with v4-v7 JSON/Data-URL storage.
    if (request.method === "POST" && url.pathname === "/store") {
      const data = await request.json();
      const parsed = parseDataImage(String(data.image || ""));
      if (!parsed) return new Response("bad image", { status: 400 });
      const now = Date.now();
      const count = Math.ceil(parsed.base64.length / 60_000);
      const values = {
        invite: { recipient: data.recipient, createdAt: data.createdAt || now, updatedAt: data.updatedAt || now },
        photoManifest: { type: parsed.type, count, version: 3 }
      };
      for (let i = 0; i < count; i++) {
        values[`photo:${String(i).padStart(3, "0")}`] = parsed.base64.slice(i * 60_000, (i + 1) * 60_000);
      }
      await this.ctx.storage.put(values);
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
          "cache-control": "private, max-age=31536000, immutable",
          "x-content-type-options": "nosniff"
        }
      });
    }

    return new Response("not found", { status: 404 });
  }
}

async function readStoredPhoto(storage) {
  const v8 = await storage.get("photoManifestV8");
  if (v8?.count) {
    const keys = Array.from({ length: v8.count }, (_, i) => `photo8:${String(i).padStart(3, "0")}`);
    const chunks = await storage.get(keys);
    const total = Number(v8.size || 0) || keys.reduce((sum, key) => sum + byteLengthOf(chunks.get(key)), 0);
    if (!total) return null;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const key of keys) {
      const part = toUint8(chunks.get(key));
      if (!part) return null;
      out.set(part, offset);
      offset += part.byteLength;
    }
    return { type: v8.type || "image/jpeg", bytes: out };
  }

  const manifest = await storage.get("photoManifest");
  if (manifest?.count) {
    const keys = Array.from({ length: manifest.count }, (_, i) => `photo:${String(i).padStart(3, "0")}`);
    const chunks = await storage.get(keys);
    const base64 = keys.map(key => chunks.get(key) || "").join("");
    if (base64) return { type: manifest.type || "image/jpeg", bytes: base64ToBytes(base64) };
  }

  const binary = await storage.get("photo");
  if (binary) {
    const type = await storage.get("photoType") || "image/jpeg";
    const bytes = toUint8(binary);
    if (bytes) return { type, bytes };
  }

  const legacy = await storage.get("invite");
  if (legacy?.image) {
    const parsed = parseDataImage(String(legacy.image));
    if (parsed) return { type: parsed.type, bytes: parsed.bytes };
  }
  return null;
}

function byteLengthOf(value) {
  const bytes = toUint8(value);
  return bytes ? bytes.byteLength : 0;
}

function toUint8(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function shortId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

function parseDataImage(value) {
  const match = /^data:(image\/(?:jpeg|webp|png|avif|gif|heic|heif));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  return { type: match[1], base64: match[2], bytes: base64ToBytes(match[2]) };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function guessImageType(type, name = "") {
  const normalized = String(type || "").toLowerCase();
  if (SAFE_IMAGE_TYPES.has(normalized)) return normalized;
  const ext = String(name).split(".").pop()?.toLowerCase();
  const byExt = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    avif: "image/avif", gif: "image/gif", heic: "image/heic", heif: "image/heif"
  };
  return byExt[ext] || "";
}

function inviteStub(env, id) {
  const objId = env.INVITES.idFromName(id);
  return env.INVITES.get(objId);
}

async function storeInviteRaw(env, id, recipient, type, bytes) {
  const target = `https://invite.internal/store-v8?recipient=${encodeURIComponent(recipient)}`;
  const res = await inviteStub(env, id).fetch(target, {
    method: "POST",
    headers: { "x-photo-type": type },
    body: bytes
  });
  if (!res.ok) throw new Error(`invite store failed: ${res.status}`);
}

async function storeInviteLegacy(env, id, payload, image) {
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
        const contentType = request.headers.get("content-type") || "";
        const id = shortId();

        if (contentType.includes("multipart/form-data")) {
          const form = await request.formData();
          const recipient = String(form.get("recipient") || "");
          const file = form.get("photo");
          if (!RECIPIENTS.has(recipient)) return json({ error: "Некоректне звертання" }, 400);
          if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Додай фото" }, 400);

          const type = guessImageType(file.type, file.name);
          if (!type) return json({ error: "Підтримуються JPG, PNG, WEBP, AVIF, GIF, HEIC та HEIF" }, 415);
          if (!file.size || file.size > MAX_PHOTO_BYTES) return json({ error: "Фото має бути до 10 МБ" }, 413);

          const bytes = await file.arrayBuffer();
          await storeInviteRaw(env, id, recipient, type, bytes);
          return json({ id, url: `${url.origin}/i/${id}` }, 201);
        }

        // Old cached frontend compatibility.
        const body = await request.json();
        const recipient = String(body.recipient || "");
        const image = String(body.image || "");
        if (!RECIPIENTS.has(recipient)) return json({ error: "Некоректне звертання" }, 400);
        const photo = parseDataImage(image);
        if (!photo) return json({ error: "Додай фото" }, 400);
        await storeInviteLegacy(env, id, { recipient, createdAt: Date.now(), updatedAt: Date.now() }, image);
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
      return json({ ...data, photoUrl: `/api/invitations/${apiMatch[1]}/photo` });
    }

    if (request.method === "GET" && /^\/i\/[a-z0-9]+$/i.test(url.pathname)) {
      const inviteUrl = new URL("/invite.html", url.origin);
      return env.ASSETS.fetch(new Request(inviteUrl, request));
    }

    return env.ASSETS.fetch(request);
  }
};
