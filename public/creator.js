const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let recipient = 'Дружина';
let imageData = '';

$$('[data-value]').forEach(btn => btn.addEventListener('click', () => {
  $$('[data-value]').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  recipient = btn.dataset.value;
}));

$('#photoInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Оберіть зображення');
  try {
    imageData = await compressImage(file);
    $('#photoThumb').src = imageData;
    $('#photoThumb').hidden = false;
    $('#previewPhoto').src = imageData;
    $('#previewBtn').disabled = false;
    $('#createBtn').disabled = false;
  } catch (e) {
    console.error(e);
    toast('Не вдалося обробити фото');
  }
});

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
function closeDialog(dialog) { if (dialog.open) dialog.close(); }

$('#previewBtn').addEventListener('click', () => {
  if (!imageData) return;
  openDialog($('#previewDialog'));
});
$('#previewClose').addEventListener('click', () => closeDialog($('#previewDialog')));
$('#previewDialog').addEventListener('click', e => { if (e.target === $('#previewDialog')) closeDialog($('#previewDialog')); });

$('#linkClose').addEventListener('click', () => closeDialog($('#linkDialog')));
$('#linkDialog').addEventListener('click', e => { if (e.target === $('#linkDialog')) closeDialog($('#linkDialog')); });

$('#createBtn').addEventListener('click', async () => {
  if (!imageData) return;
  const btn = $('#createBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Створюємо…';
  try {
    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipient, image: imageData })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Помилка');
    $('#inviteLink').value = data.url;
    $('#openResource').href = data.url;
    openDialog($('#linkDialog'));
  } catch (e) {
    console.error(e);
    toast(e.message || 'Не вдалося створити запрошення');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Створити запрошення';
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
    if (navigator.share) await navigator.share({ title: 'Для тебе ♡', text: 'У мене є маленьке запрошення для тебе ♡', url });
    else { await navigator.clipboard.writeText(url); toast('Посилання скопійовано'); }
  } catch (e) { if (e?.name !== 'AbortError') console.error(e); }
});

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

