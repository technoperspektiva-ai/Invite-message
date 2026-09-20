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
let modalTimer;
let photoObjectUrl = '';

async function init() {
  const id = location.pathname.split('/').filter(Boolean).pop();
  try {
    const res = await fetch(`/api/invitations/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    $('#heroTitle').textContent = titles[data.recipient] || titles['Кохана'];

    photoObjectUrl = await fetchPhoto(`/api/invitations/${encodeURIComponent(id)}/photo?t=${Date.now()}`);
    await Promise.all([
      setImage('#letterPhoto', photoObjectUrl),
      setImage('#fullPhoto', photoObjectUrl)
    ]);

    $('#loading').hidden = true;
    $('#inviteShell').hidden = false;
  } catch (error) {
    console.error(error);
    $('#loading').hidden = true;
    $('#notFound').hidden = false;
  }
}

async function fetchPhoto(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('photo not found');
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('invalid photo');
  return URL.createObjectURL(blob);
}

function setImage(selector, src) {
  return new Promise((resolve, reject) => {
    const img = $(selector);
    const done = () => {
      img.classList.add('is-loaded');
      resolve();
    };
    img.onload = done;
    img.onerror = reject;
    img.src = src;
    if (img.complete && img.naturalWidth > 0) done();
  });
}

function openInvitation() {
  if (opened) return showModal();
  opened = true;
  $('#envelope').classList.add('open');
  $('#envelope').setAttribute('aria-expanded', 'true');
  $('#openBtn').querySelector('span').textContent = 'Переглянути фото';
  setTimeout(() => $('#envelope').classList.add('complete'), 780);
  modalTimer = setTimeout(showModal, 1550);
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
