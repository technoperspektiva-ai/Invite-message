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
let imageData = '';

async function init() {
  const id = location.pathname.split('/').filter(Boolean).pop();
  try {
    const res = await fetch(`/api/invitations/${encodeURIComponent(id)}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    $('#heroTitle').textContent = titles[data.recipient] || titles['Кохана'];

    imageData = String(data.image || '');
    if (!imageData.startsWith('data:image/')) {
      imageData = await fetchPhotoFallback(`/api/invitations/${encodeURIComponent(id)}/photo?t=${Date.now()}`);
    }

    await Promise.all([
      setImage('#letterPhoto', imageData),
      setImage('#fullPhoto', imageData)
    ]);

    $('#loading').hidden = true;
    $('#inviteShell').hidden = false;
  } catch (error) {
    console.error(error);
    $('#loading').hidden = true;
    $('#notFound').hidden = false;
  }
}

async function fetchPhotoFallback(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('photo not found');
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('invalid photo');
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

function setImage(selector, src) {
  return new Promise((resolve, reject) => {
    const img = $(selector);
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      img.classList.add('is-loaded');
      resolve();
    };
    const fail = (e) => {
      if (settled) return;
      settled = true;
      reject(e || new Error('image load failed'));
    };
    img.onload = done;
    img.onerror = fail;
    img.decoding = 'async';
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

init();
