const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const creatorView = $("#creatorView");
const inviteView = $("#inviteView");
const form = $("#inviteForm");
const statusEl = $("#formStatus");
const shareDialog = $("#shareDialog");
const shareUrl = $("#shareUrl");
const nativeShareBtn = $("#nativeShareBtn");
const openInviteLink = $("#openInviteLink");
let createdUrl = "";
let photoObjectUrl = "";

const recipientLabels = {
  "Дружина":"Дружини","Кохана":"Коханої","Подруга":"Подруги",
  "Чоловік":"Чоловіка","Коханий":"Коханого","Друг":"Друга"
};

function updatePreview(){
  const type = $("#recipientType").value;
  $("#previewFor").textContent = recipientLabels[type] || type;
  $("#previewHeadline").textContent = $("#headlineInput").value || "Ти особлива";
  $("#previewCopy").textContent = $("#noteInput").value || "Я хочу розділити цей момент з тобою.";
  $("#previewDate").textContent = $("#dateInput").value || "—";
  $("#previewTime").textContent = $("#timeInput").value || "—";
  $("#previewLocation").textContent = $("#locationInput").value || "—";
}

$$('[data-value]').forEach(btn=>btn.addEventListener('click',()=>{
  $$('[data-value]').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  $("#recipientType").value = btn.dataset.value;
  const isMale = ["Чоловік","Коханий","Друг"].includes(btn.dataset.value);
  if (!$("#headlineInput").dataset.edited) $("#headlineInput").value = isMale ? "Ти особливий" : "Ти особлива";
  updatePreview();
}));

["#recipientName","#dateInput","#timeInput","#locationInput","#dressInput","#headlineInput","#noteInput"].forEach(id=>{
  $(id).addEventListener('input',e=>{if(id==="#headlineInput") e.target.dataset.edited="1"; updatePreview();});
});

$("#photoInput").addEventListener('change',e=>{
  const file=e.target.files?.[0]; if(!file) return;
  if(photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  photoObjectUrl=URL.createObjectURL(file);
  [$("#photoThumb"),$("#previewPhoto")].forEach(img=>{img.src=photoObjectUrl;img.hidden=false;});
  $("#photoPlaceholder").hidden=true;
});

form.addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$("#createBtn");
  btn.disabled=true; statusEl.textContent="Створюю персональне посилання…";
  try{
    const body=new FormData(form);
    const res=await fetch('/api/invitations',{method:'POST',body});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Помилка створення');
    createdUrl=data.url;
    shareUrl.value=createdUrl;
    openInviteLink.href=createdUrl;
    shareDialog.showModal();
    statusEl.textContent="Готово — запрошення можна надсилати.";
  }catch(err){statusEl.textContent=err.message;}finally{btn.disabled=false;}
});

$("#dialogClose").addEventListener('click',()=>shareDialog.close());
$("#copyBtn").addEventListener('click',async()=>{
  await navigator.clipboard.writeText(shareUrl.value);
  $("#copyBtn").textContent="Скопійовано";
  setTimeout(()=>$("#copyBtn").textContent="Копіювати",1300);
});

async function shareCurrent(){
  const url=createdUrl||location.href;
  const title="Для тебе — маленьке запрошення ♡";
  if(navigator.share){
    try{await navigator.share({title,text:"Я підготував(ла) для тебе маленьке запрошення ♡",url});}catch(e){if(e.name!=="AbortError") console.warn(e);}
  }else{
    await navigator.clipboard.writeText(url);
    alert("Посилання скопійовано");
  }
}
nativeShareBtn.addEventListener('click',shareCurrent);
$("#shareInviteBtn").addEventListener('click',shareCurrent);

const publicEnvelope=$("#publicEnvelope");
const publicOpen=$("#publicOpen");
let opened=false;
function openPublic(){
  if(opened) return;
  opened=true; publicEnvelope.classList.add('open'); publicEnvelope.setAttribute('aria-expanded','true');
  publicOpen.querySelector('span').textContent='Запрошення відкрите';
  setTimeout(()=>publicEnvelope.classList.add('complete'),780);
}
publicEnvelope.addEventListener('click',openPublic); publicOpen.addEventListener('click',openPublic);

async function loadPublicInvite(id){
  creatorView.hidden=true; inviteView.hidden=false;
  try{
    const res=await fetch(`/api/invitations/${encodeURIComponent(id)}`);
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Запрошення не знайдено');
    const who=data.recipientName ? `${data.recipientType} ${data.recipientName}` : data.recipientType;
    $("#publicTitle").textContent=`Для ${who}`;
    $("#publicHeadline").textContent=data.headline||"Для тебе";
    $("#publicNote").textContent=data.note||"";
    $("#publicDate").textContent=data.date||"—";
    $("#publicTime").textContent=data.time||"—";
    $("#publicLocation").textContent=data.location||"—";
    $("#publicDress").textContent=data.dressCode||"—";
    if(data.photoUrl){$("#publicPhoto").src=data.photoUrl;$("#publicPhoto").hidden=false;$("#publicPhotoPlaceholder").hidden=true;}
    createdUrl=location.href;
  }catch(err){$("#publicTitle").textContent=err.message;publicEnvelope.disabled=true;publicOpen.disabled=true;}
}

const match=location.pathname.match(/^\/i\/([^/]+)/);
if(match) loadPublicInvite(match[1]); else updatePreview();
