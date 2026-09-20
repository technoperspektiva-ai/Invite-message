const $ = (s) => document.querySelector(s);
const copy = {
  'Дружина': ['Для дружини', 'Ти особлива. Я хочу розділити цей момент з тобою.'],
  'Кохана': ['Для коханої', 'Ти особлива. Я хочу розділити цей момент з тобою.'],
  'Подруга': ['Для подруги', 'Ти особлива. Нехай цей момент залишиться нашою маленькою історією.'],
  'Чоловік': ['Для чоловіка', 'Ти особливий. Я хочу розділити цей момент з тобою.'],
  'Коханий': ['Для коханого', 'Ти особливий. Я хочу розділити цей момент з тобою.'],
  'Друг': ['Для друга', 'Ти особливий. Нехай цей момент залишиться нашою маленькою історією.']
};
let opened = false;
let modalTimer;

async function init() {
  const id = location.pathname.split('/').filter(Boolean).pop();
  try {
    const res = await fetch(`/api/invitations/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    const [title, text] = copy[data.recipient] || copy['Кохана'];
    $('#heroTitle').textContent = title;
    $('#letterTitle').textContent = title;
    $('#fullTitle').textContent = title;
    $('#letterText').textContent = text;
    $('#fullText').textContent = text;
    $('#letterPhoto').src = data.image;
    $('#fullPhoto').src = data.image;
    $('#loading').hidden = true;
    $('#inviteShell').hidden = false;
  } catch {
    $('#loading').hidden = true;
    $('#notFound').hidden = false;
  }
}

function openInvitation() {
  if (opened) return showModal();
  opened = true;
  $('#envelope').classList.add('open');
  $('#envelope').setAttribute('aria-expanded', 'true');
  $('#openBtn').querySelector('span').textContent = 'Переглянути запрошення';
  setTimeout(() => $('#envelope').classList.add('complete'), 780);
  modalTimer = setTimeout(showModal, 1550);
}
function showModal() { $('#fullModal').hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal() { clearTimeout(modalTimer); $('#fullModal').hidden = true; document.body.style.overflow = ''; }

$('#envelope').addEventListener('click', openInvitation);
$('#openBtn').addEventListener('click', openInvitation);
$('#modalClose').addEventListener('click', closeModal);
$('#fullModal').addEventListener('click', e => { if (e.target === $('#fullModal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#fullModal').hidden) closeModal(); });

init();
