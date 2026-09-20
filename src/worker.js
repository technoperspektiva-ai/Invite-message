const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

function makeId() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 18);
}

function safeText(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function allowedImage(file) {
  return file && typeof file === "object" && file.size > 0 && file.size <= 5 * 1024 * 1024 &&
    ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type);
}

function inviteDataKey(id) {
  return `invites/${id}/data.json`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/invitations" && request.method === "POST") {
      try {
        const form = await request.formData();
        const id = makeId();
        const photo = form.get("photo");
        let photoKey = null;

        if (photo && photo.size) {
          if (!allowedImage(photo)) {
            return json({ error: "Фото має бути JPG, PNG, WEBP або AVIF до 5 МБ." }, { status: 400 });
          }
          const ext = (photo.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
          photoKey = `invites/${id}/photo.${ext}`;
          await env.MEDIA.put(photoKey, photo.stream(), {
            httpMetadata: {
              contentType: photo.type,
              cacheControl: "public, max-age=31536000, immutable",
            },
          });
        }

        const record = {
          id,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          recipientType: safeText(form.get("recipientType"), 40) || "Кохана",
          recipientName: safeText(form.get("recipientName"), 80),
          headline: safeText(form.get("headline"), 120) || "Запрошення для коханої людини",
          subtitle: safeText(form.get("subtitle"), 180),
          date: safeText(form.get("date"), 40),
          time: safeText(form.get("time"), 40),
          location: safeText(form.get("location"), 120),
          dressCode: safeText(form.get("dressCode"), 120),
          note: safeText(form.get("note"), 500),
          photoKey,
        };

        await env.MEDIA.put(inviteDataKey(id), JSON.stringify(record), {
          httpMetadata: {
            contentType: "application/json; charset=utf-8",
            cacheControl: "no-store",
          },
        });

        return json({ id, url: `${url.origin}/i/${id}` }, { status: 201 });
      } catch (error) {
        console.error(error);
        return json({ error: "Не вдалося створити запрошення." }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/invitations/") && request.method === "GET") {
      const id = safeText(url.pathname.split("/").pop(), 64);
      const object = await env.MEDIA.get(inviteDataKey(id));
      if (!object) return json({ error: "Запрошення не знайдено." }, { status: 404 });

      try {
        const record = JSON.parse(await object.text());
        return json({
          id: record.id,
          recipientType: record.recipientType,
          recipientName: record.recipientName,
          headline: record.headline,
          subtitle: record.subtitle,
          date: record.date,
          time: record.time,
          location: record.location,
          dressCode: record.dressCode,
          note: record.note,
          photoUrl: record.photoKey ? `/media/${encodeURIComponent(record.photoKey)}` : "",
        });
      } catch (error) {
        console.error(error);
        return json({ error: "Дані запрошення пошкоджено." }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/media/") && request.method === "GET") {
      const key = decodeURIComponent(url.pathname.slice("/media/".length));
      const object = await env.MEDIA.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      return new Response(object.body, { headers });
    }

    return env.ASSETS.fetch(request);
  },
};
