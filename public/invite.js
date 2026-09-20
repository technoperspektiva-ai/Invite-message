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
    const res = await fetch(`/api/invitations/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    $('#heroTitle').textContent = titles[data.recipient] || titles['Кохана'];

    const photoUrl = `/api/invitations/${encodeURIComponent(id)}/photo?v=${encodeURIComponent(data.updatedAt || data.createdAt || Date.now())}`;
    await Promise.all([
      setImage('#letterPhoto', photoUrl),
      setImage('#fullPhoto', photoUrl)
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
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
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
  $('#fullModal').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  clearTimeout(modalTimer);
  $('#fullModal').hidden = true;
  document.body.style.overflow = '';
}

$('#envelope').addEventListener('click', openInvitation);
$('#openBtn').addEventListener('click', openInvitation);
$('#modalClose').addEventListener('click', closeModal);
$('#fullModal').addEventListener('click', e => { if (e.target === $('#fullModal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#fullModal').hidden) closeModal(); });

init();
