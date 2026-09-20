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

async function init() {
  const id = location.pathname.split('/').filter(Boolean).pop();
  try {
    const res = await fetch(`/api/invitations/${encodeURIComponent(id)}?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Запрошення не знайдено');
    if (!/^data:image\/jpeg;base64,/.test(String(data.image || ''))) throw new Error('Фото в запрошенні відсутнє');

    $('#heroTitle').textContent = titles[data.recipient] || 'Для тебе';
    await Promise.all([
      assignImage($('#letterPhoto'), data.image),
      assignImage($('#fullPhoto'), data.image)
    ]);

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
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      ok ? resolve() : reject(new Error('Фото не вдалося відкрити'));
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = src;
    if (img.complete && img.naturalWidth > 0) done(true);
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

init();
