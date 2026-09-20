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
            httpMetadata: { contentType: photo.type, cacheControl: "public, max-age=31536000, immutable" },
          });
        }

        const record = {
          id,
          created_at: new Date().toISOString(),
          expires_at: null,
          recipient_type: safeText(form.get("recipientType"), 40) || "Кохана",
          recipient_name: safeText(form.get("recipientName"), 80),
          headline: safeText(form.get("headline"), 120) || "Запрошення для коханої людини",
          subtitle: safeText(form.get("subtitle"), 180),
          date_text: safeText(form.get("date"), 40),
          time_text: safeText(form.get("time"), 40),
          location_text: safeText(form.get("location"), 120),
          dress_code: safeText(form.get("dressCode"), 120),
          note_text: safeText(form.get("note"), 500),
          photo_key: photoKey,
        };

        await env.DB.prepare(`
          INSERT INTO invitations (
            id, created_at, expires_at, recipient_type, recipient_name, headline, subtitle,
            date_text, time_text, location_text, dress_code, note_text, photo_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          record.id, record.created_at, record.expires_at, record.recipient_type, record.recipient_name,
          record.headline, record.subtitle, record.date_text, record.time_text,
          record.location_text, record.dress_code, record.note_text, record.photo_key
        ).run();

        return json({
          id,
          url: `${url.origin}/i/${id}`,
        }, { status: 201 });
      } catch (error) {
        console.error(error);
        return json({ error: "Не вдалося створити запрошення." }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/invitations/") && request.method === "GET") {
      const id = url.pathname.split("/").pop();
      const row = await env.DB.prepare("SELECT * FROM invitations WHERE id = ?").bind(id).first();
      if (!row) return json({ error: "Запрошення не знайдено." }, { status: 404 });
      return json({
        id: row.id,
        recipientType: row.recipient_type,
        recipientName: row.recipient_name,
        headline: row.headline,
        subtitle: row.subtitle,
        date: row.date_text,
        time: row.time_text,
        location: row.location_text,
        dressCode: row.dress_code,
        note: row.note_text,
        photoUrl: row.photo_key ? `/media/${encodeURIComponent(row.photo_key)}` : "",
      });
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
