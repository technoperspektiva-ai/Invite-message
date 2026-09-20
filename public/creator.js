const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let recipient = 'Дружина';
let selectedFile = null;
let previewUrl = '';

$$('[data-value]').forEach(btn => btn.addEventListener('click', () => {
  $$('[data-value]').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  recipient = btn.dataset.value;
}));

$('#photoInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return toast('Фото має бути до 10 МБ');

  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);

  const thumb = $('#photoThumb');
  thumb.src = previewUrl;
  thumb.hidden = false;
  $('#previewPhoto').src = previewUrl;
  $('.photo-drop').classList.add('has-photo');
  $('#previewBtn').disabled = false;
  $('#createBtn').disabled = false;
});

function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
function closeDialog(dialog) { if (dialog.open) dialog.close(); }

$('#previewBtn').addEventListener('click', () => {
  if (!selectedFile) return;
  openDialog($('#previewDialog'));
});
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
  if (!selectedFile) return;
  const btn = $('#createBtn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Створюємо…';
  try {
    const form = new FormData();
    form.append('recipient', recipient);
    form.append('photo', selectedFile, selectedFile.name || 'photo.jpg');

    const res = await fetch('/api/invitations', { method: 'POST', body: form });
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
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
