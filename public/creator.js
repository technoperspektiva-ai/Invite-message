const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let recipient = 'Дружина';
let preparedBlob = null;
let preparedDataUri = '';
let previewUrl = '';

$$('[data-value]').forEach(btn => btn.addEventListener('click', () => {
  $$('[data-value]').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  recipient = btn.dataset.value;
}));

$('#photoInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setBusy(true);
  try {
    preparedBlob = await normalizePhoto(file);
    preparedDataUri = await blobToDataUri(preparedBlob);
    if (preparedDataUri.length > 900_000) throw new Error('prepared image too large');

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(preparedBlob);

    const thumb = $('#photoThumb');
    thumb.src = previewUrl;
    thumb.hidden = false;
    $('#previewPhoto').src = previewUrl;
    $('#photoPlaceholder').hidden = true;
    $('#changePill').hidden = false;
    $('#previewBtn').disabled = false;
    $('#createBtn').disabled = false;
  } catch (error) {
    console.error(error);
    preparedBlob = null;
    preparedDataUri = '';
    toast('Не вдалося підготувати фото. Спробуй інше.');
  } finally {
    setBusy(false);
  }
});

async function normalizePhoto(file) {
  if (!file.size) throw new Error('empty file');
  if (file.size > 30 * 1024 * 1024) throw new Error('source too large');

  const source = await decodeSource(file);
  const width = source.width;
  const height = source.height;
  if (!width || !height) throw new Error('image dimensions unavailable');

  let maxSide = 1280;
  let quality = 0.84;
  let blob = null;

  // D1 stores the final JPEG as base64 TEXT. Keep the JPEG <= 560 KiB so
  // the complete row stays comfortably below D1's 2 MB row limit.
  for (let attempt = 0; attempt < 12; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas unavailable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(source.drawable, 0, 0, outW, outH);
    blob = await canvasToBlob(canvas, quality);
    if (blob.size <= 560 * 1024) break;
    if (quality > 0.58) quality -= 0.07;
    else maxSide = Math.max(720, Math.round(maxSide * 0.82));
  }

  source.cleanup?.();
  if (!blob?.size || blob.size > 600 * 1024) throw new Error('normalized image too large');
  return blob;
}

async function decodeSource(file) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bitmap.width, height: bitmap.height, drawable: bitmap, cleanup: () => bitmap.close?.() };
    } catch (_) {}
  }

  const objectUrl = URL.createObjectURL(file);
  const img = await loadImage(objectUrl).catch(err => { URL.revokeObjectURL(objectUrl); throw err; });
  return { width: img.naturalWidth, height: img.naturalHeight, drawable: img, cleanup: () => URL.revokeObjectURL(objectUrl) };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('jpeg conversion failed')), 'image/jpeg', quality);
  });
}

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('base64 conversion failed'));
    reader.readAsDataURL(blob);
  });
}

function setBusy(value) {
  $('#photoBusy').hidden = !value;
  $('#photoInput').disabled = value;
}

function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
function closeDialog(dialog) { if (dialog.open) dialog.close(); }

$('#previewBtn').addEventListener('click', () => preparedBlob && openDialog($('#previewDialog')));
$('#previewClose').addEventListener('click', () => closeDialog($('#previewDialog')));
$('#previewDialog').addEventListener('click', e => { if (e.target === $('#previewDialog')) closeDialog($('#previewDialog')); });
$('#linkClose').addEventListener('click', () => closeDialog($('#linkDialog')));
$('#linkDialog').addEventListener('click', e => { if (e.target === $('#linkDialog')) closeDialog($('#linkDialog')); });

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeDialog($('#previewDialog'));
  closeDialog($('#linkDialog'));
});

$('#createBtn').addEventListener('click', async () => {
  if (!preparedDataUri) return;
  const btn = $('#createBtn');
  btn.disabled = true;
  const label = btn.querySelector('span');
  const old = label.textContent;
  label.textContent = 'Створюємо…';

  try {
    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipient, image: preparedDataUri }),
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const extra = data.stage ? ` (${data.stage})` : '';
      throw new Error(`${data.error || `Помилка ${res.status}`}${extra}`);
    }

    const check = await fetch(`/api/invitations/${encodeURIComponent(data.id)}?t=${Date.now()}`, { cache: 'no-store' });
    const payload = await check.json().catch(() => ({}));
    if (!check.ok || !payload.image || !payload.recipient) {
      throw new Error(payload.error || 'Запрошення не пройшло перевірку');
    }

    $('#inviteLink').value = data.url;
    $('#openResource').href = data.url;
    openDialog($('#linkDialog'));
  } catch (error) {
    console.error(error);
    toast(error.message || 'Не вдалося створити запрошення');
  } finally {
    btn.disabled = false;
    label.textContent = old;
  }
});

$('#copyLink').addEventListener('click', async () => {
  const url = $('#inviteLink').value;
  try { await navigator.clipboard.writeText(url); toast('Посилання скопійовано'); }
  catch { $('#inviteLink').select(); document.execCommand('copy'); toast('Посилання скопійовано'); }
});

$('#shareLink').addEventListener('click', async () => {
  const url = $('#inviteLink').value;
  if (!url) return;
  try {
    if (navigator.share) await navigator.share({ title: 'Для тебе ♡', text: 'Для тебе є маленьке запрошення ♡', url });
    else { await navigator.clipboard.writeText(url); toast('Посилання скопійовано'); }
  } catch (e) { if (e?.name !== 'AbortError') console.error(e); }
});

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  $('#toastHost').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
