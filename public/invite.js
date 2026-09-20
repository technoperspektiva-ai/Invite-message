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

async function init() {
  const id = location.pathname.split('/').filter(Boolean).pop();
  try {
    const res = await fetch(`/api/invitations/${encodeURIComponent(id)}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    $('#heroTitle').textContent = titles[data.recipient] || titles['Кохана'];

    const photoUrl = data.photoUrl || `/api/invitations/${encodeURIComponent(id)}/photo`;
    const src = `${photoUrl}${photoUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(data.updatedAt || Date.now())}`;

    await Promise.all([
      setImage('#letterPhoto', src),
      setImage('#fullPhoto', src)
    ]);

    $('#loading').hidden = true;
    $('#inviteShell').hidden = false;
  } catch (error) {
    console.error(error);
    $('#loading').hidden = true;
    $('#notFound').hidden = false;
  }
}

function setImage(selector, src) {
  return new Promise((resolve, reject) => {
    const img = $(selector);
    const done = () => { img.classList.add('is-loaded'); resolve(); };
    img.onload = done;
    img.onerror = () => reject(new Error('photo load failed'));
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
