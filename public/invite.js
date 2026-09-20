const $ = (s) => document.querySelector(s);
const titles = {
  'Дружина': 'Для дружини',
  'Кохана': 'Для коханої',
  'Подруга': 'Для подруги',
  'Чоловік': 'Для чоловіка',
  'Коханий': 'Для коханого',
  'Друг': 'Для друга'
};

let opened = false;
let modalTimer = 0;
let photoObjectUrl = '';

async function init() {
  const id = location.pathname.split('/').filter(Boolean).pop();
  try {
    const metaRes = await fetch(`/api/invitations/${encodeURIComponent(id)}?v=9&t=${Date.now()}`, { cache: 'no-store' });
    if (!metaRes.ok) throw new Error('Запрошення не знайдено');
    const data = await metaRes.json();
    $('#heroTitle').textContent = titles[data.recipient] || 'Для тебе';

    const photoRes = await fetch(`${data.photoUrl || `/api/invitations/${encodeURIComponent(id)}/photo`}?v=9&t=${Date.now()}`, { cache: 'no-store' });
    if (!photoRes.ok) throw new Error(`Фото недоступне (${photoRes.status})`);
    const type = photoRes.headers.get('content-type') || '';
    if (!type.startsWith('image/')) throw new Error('Сервер повернув не зображення');
    const blob = await photoRes.blob();
    if (!blob.size) throw new Error('Фото порожнє');

    photoObjectUrl = URL.createObjectURL(blob);
    await Promise.all([assignImage($('#letterPhoto'), photoObjectUrl), assignImage($('#fullPhoto'), photoObjectUrl)]);

    $('#loading').hidden = true;
    $('#inviteShell').hidden = false;
  } catch (error) {
    console.error(error);
    $('#loading').hidden = true;
    $('#errorText').textContent = error.message || 'Спробуй відкрити посилання ще раз.';
    $('#notFound').hidden = false;
  }
}

function assignImage(img, src) {
  return new Promise((resolve, reject) => {
    const onLoad = () => cleanup(true);
    const onError = () => cleanup(false);
    const cleanup = (ok) => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      ok ? resolve() : reject(new Error('Браузер не зміг показати фото'));
    };
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
    img.src = src;
    if (img.complete && img.naturalWidth > 0) cleanup(true);
  });
}

function openInvitation() {
  if (opened) return showModal();
  opened = true;
  $('#envelope').classList.add('open');
  $('#envelope').setAttribute('aria-expanded', 'true');
  $('#openBtn').querySelector('span').textContent = 'Переглянути фото';
  setTimeout(() => $('#envelope').classList.add('complete'), 760);
  modalTimer = window.setTimeout(showModal, 1500);
}

function showModal() {
  clearTimeout(modalTimer);
  $('#fullModal').hidden = false;
  document.body.classList.add('modal-open');
}

function closeModal() {
  clearTimeout(modalTimer);
  $('#fullModal').hidden = true;
  document.body.classList.remove('modal-open');
}

$('#envelope').addEventListener('click', openInvitation);
$('#openBtn').addEventListener('click', openInvitation);
$('#modalClose').addEventListener('click', closeModal);
$('#fullModal').addEventListener('click', e => { if (e.target === $('#fullModal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#fullModal').hidden) closeModal(); });
window.addEventListener('pagehide', () => { if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl); });

init();
