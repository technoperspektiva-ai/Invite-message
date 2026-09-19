const envelope = document.getElementById('envelope');
const openBtn = document.getElementById('openBtn');
const modal = document.getElementById('modal');
const closeBtn = document.getElementById('closeBtn');
let opened = false;
let modalTimer;

function openInvitation() {
  if (opened) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    return;
  }
  opened = true;
  envelope.classList.add('open');
  envelope.setAttribute('aria-expanded', 'true');
  openBtn.textContent = 'Переглянути запрошення';
  setTimeout(() => envelope.classList.add('complete'), 760);
  modalTimer = setTimeout(() => {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }, 1500);
}

function closeInvitation() {
  clearTimeout(modalTimer);
  modal.hidden = true;
  document.body.style.overflow = '';
}

envelope.addEventListener('click', openInvitation);
openBtn.addEventListener('click', openInvitation);
closeBtn.addEventListener('click', closeInvitation);
modal.addEventListener('click', (e) => { if (e.target === modal) closeInvitation(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeInvitation(); });
