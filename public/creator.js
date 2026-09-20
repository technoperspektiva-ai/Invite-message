const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let recipient = 'Дружина';
let preparedBlob = null;
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
    toast('Не вдалося прочитати це фото. Спробуй інше.');
  } finally {
    setBusy(false);
  }
});

async function normalizePhoto(file) {
  if (!file.size) throw new Error('empty file');
  if (file.size > 25 * 1024 * 1024) throw new Error('source too large');

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (_) {}

  let width, height, source;
  if (bitmap) {
    width = bitmap.width; height = bitmap.height; source = bitmap;
  } else {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImage(objectUrl);
      width = img.naturalWidth; height = img.naturalHeight; source = img;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  if (!width || !height) throw new Error('image dimensions unavailable');
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(source, 0, 0, outW, outH);
  bitmap?.close?.();

  let quality = 0.88;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > 3.7 * 1024 * 1024 && quality > 0.62) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }
  if (!blob.size || blob.size > 4 * 1024 * 1024) throw new Error('normalized image too large');
  return blob;
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
  if (!preparedBlob) return;
  const btn = $('#createBtn');
  btn.disabled = true;
  const label = btn.querySelector('span');
  const old = label.textContent;
  label.textContent = 'Зберігаємо…';

  try {
    const form = new FormData();
    form.append('recipient', recipient);
    form.append('photo', preparedBlob, 'invitation-photo.jpg');

    const res = await fetch('/api/invitations', { method: 'POST', body: form, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Помилка ${res.status}`);

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
  setTimeout(() => el.remove(), 2500);
}
