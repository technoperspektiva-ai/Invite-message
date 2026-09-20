const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const RECIPIENTS = new Set(["Дружина", "Кохана", "Подруга", "Чоловік", "Коханий", "Друг"]);
const MAX_JPEG_BYTES = 900 * 1024;

export class InvitationStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/store-v10") {
      const recipient = decodeURIComponent(url.searchParams.get("recipient") || "");
      const type = String(request.headers.get("x-photo-type") || "image/jpeg").toLowerCase();
      const bytes = new Uint8Array(await request.arrayBuffer());

      if (!RECIPIENTS.has(recipient)) return new Response("bad recipient", { status: 400 });
      if (type !== "image/jpeg") return new Response("photo must be jpeg", { status: 415 });
      if (!bytes.byteLength || bytes.byteLength > MAX_JPEG_BYTES) return new Response("bad photo size", { status: 413 });

      const imageData = `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
      // SQLite-backed Durable Object values may be up to 2 MiB. We deliberately
      // keep the complete record well below that to avoid chunking/reassembly bugs.
      if (imageData.length > 1_450_000) return new Response("encoded photo too large", { status: 413 });

      const record = {
        version: 10,
        recipient,
        imageData,
        createdAt: Date.now()
      };

      await this.ctx.storage.put("recordV10", record);
      // Keep minimal metadata for backwards/debug compatibility.
      await this.ctx.storage.put("invite", { recipient, createdAt: record.createdAt, photoVersion: 10 });
      return new Response("ok");
    }

    if (request.method === "GET" && url.pathname === "/public") {
      const current = await this.ctx.storage.get("recordV10");
      if (current?.recipient && current?.imageData) {
        return Response.json(current, { headers: { "cache-control": "no-store" } });
      }

      // Backwards compatibility for links made by v4-v9.
      const meta = await this.ctx.storage.get("invite");
      if (!meta) return new Response("not found", { status: 404 });
      const legacyPhoto = await readLegacyPhoto(this.ctx.storage);
      if (!legacyPhoto) return new Response("photo not found", { status: 404 });
      return Response.json({
        version: Number(meta.photoVersion || 9),
        recipient: meta.recipient,
        imageData: `data:${legacyPhoto.type};base64,${bytesToBase64(legacyPhoto.bytes)}`,
        createdAt: meta.createdAt || Date.now()
      }, { headers: { "cache-control": "no-store" } });
    }

    return new Response("not found", { status: 404 });
  }
}

async function readLegacyPhoto(storage) {
  const v9 = await storage.get("photoManifestV9");
  if (v9?.count) {
    const keys = Array.from({ length: v9.count }, (_, i) => `photo9:${String(i).padStart(3, "0")}`);
    const chunks = await storage.get(keys);
    const base64 = keys.map(key => chunks.get(key) || "").join("");
    if (base64) return { type: "image/jpeg", bytes: base64ToBytes(base64) };
  }

  const v8 = await storage.get("photoManifestV8");
  if (v8?.count) {
    const keys = Array.from({ length: v8.count }, (_, i) => `photo8:${String(i).padStart(3, "0")}`);
    const chunks = await storage.get(keys);
    const parts = keys.map(key => toUint8(chunks.get(key)));
    if (!parts.some(x => !x)) {
      const total = parts.reduce((sum, x) => sum + x.byteLength, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
      return { type: v8.type || "image/jpeg", bytes: out };
    }
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

async function fetchPublic(env, id) {
  return inviteStub(env, id).fetch("https://invite.internal/public");
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
        if (!file.size || file.size > MAX_JPEG_BYTES) return json({ error: "Підготовлене фото завелике" }, 413);

        const id = shortId();
        const bytes = await file.arrayBuffer();
        const storeRes = await inviteStub(env, id).fetch(`https://invite.internal/store-v10?recipient=${encodeURIComponent(recipient)}`, {
          method: "POST",
          headers: { "x-photo-type": "image/jpeg" },
          body: bytes
        });
        if (!storeRes.ok) throw new Error(`store failed: ${storeRes.status} ${await storeRes.text()}`);

        // Critical reliability check: do not hand the user a dead link.
        const verify = await fetchPublic(env, id);
        if (!verify.ok) throw new Error(`verify failed: ${verify.status}`);
        const verified = await verify.json();
        if (!verified?.imageData?.startsWith("data:image/jpeg;base64,") || !RECIPIENTS.has(verified.recipient)) {
          throw new Error("verify payload invalid");
        }

        return json({ id, url: `${url.origin}/i/${id}` }, 201);
      } catch (error) {
        console.error("create invitation failed", error);
        return json({ error: "Не вдалося створити запрошення. Фото не було надійно збережене — спробуй ще раз." }, 500);
      }
    }

    const apiMatch = url.pathname.match(/^\/api\/invitations\/([a-z0-9]+)$/i);
    if (request.method === "GET" && apiMatch) {
      const res = await fetchPublic(env, apiMatch[1]);
      if (!res.ok) return json({ error: "Запрошення не знайдено" }, 404);
      return new Response(res.body, { status: 200, headers: JSON_HEADERS });
    }

    if (request.method === "GET" && /^\/i\/[a-z0-9]+$/i.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/invite.html", url.origin), request));
    }

    return env.ASSETS.fetch(request);
  }
};
