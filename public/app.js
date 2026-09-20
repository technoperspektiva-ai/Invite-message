const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const photoInput = $('#photoInput');
const photoThumb = $('#photoThumb');
const previewPhoto = $('#previewPhoto');
const previewDialog = $('#previewDialog');
const previewBtn = $('#previewBtn');
const shareBtn = $('#shareBtn');
const shareInside = $('#shareInside');
let recipient = 'Дружина';
let imageDataUrl = '';

const copy = {
  'Дружина': ['Для дружини', 'Ти особлива. Я хочу розділити цей момент з тобою.'],
  'Кохана': ['Для коханої', 'Ти особлива. Я хочу розділити цей момент з тобою.'],
  'Подруга': ['Для подруги', 'Ти особлива. Нехай цей момент залишиться нашою маленькою історією.'],
  'Чоловік': ['Для чоловіка', 'Ти особливий. Я хочу розділити цей момент з тобою.'],
  'Коханий': ['Для коханого', 'Ти особливий. Я хочу розділити цей момент з тобою.'],
  'Друг': ['Для друга', 'Ти особливий. Нехай цей момент залишиться нашою маленькою історією.'],
};

function updateText(){
  const [title, text] = copy[recipient] || copy['Кохана'];
  $('#previewTitle').textContent = title;
  $('#previewText').textContent = text;
}

$$('[data-value]').forEach(btn => btn.addEventListener('click', () => {
  $$('[data-value]').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  recipient = btn.dataset.value;
  updateText();
}));

photoInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) return toast('Оберіть JPG, PNG, WEBP або AVIF');
  if (file.size > 12 * 1024 * 1024) return toast('Фото завелике — максимум 12 МБ');
  imageDataUrl = await readFile(file);
  photoThumb.src = imageDataUrl; photoThumb.hidden = false;
  previewPhoto.src = imageDataUrl;
  previewBtn.disabled = false; shareBtn.disabled = false;
});

function readFile(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function openPreview(){
  if (!imageDataUrl) return;
  updateText();
  if (!previewDialog.open) previewDialog.showModal();
}
function closePreview(){ if(previewDialog.open) previewDialog.close(); }
previewBtn.addEventListener('click', openPreview);
$('#previewClose').addEventListener('click', closePreview);
previewDialog.addEventListener('click', e => { if(e.target === previewDialog) closePreview(); });
previewDialog.addEventListener('cancel', e => { e.preventDefault(); closePreview(); });

async function renderInviteBlob(){
  const canvas = $('#exportCanvas');
  const ctx = canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  const g=ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,'#f8f5ff'); g.addColorStop(.55,'#eee9fa'); g.addColorStop(1,'#e2daf3');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const rg=ctx.createRadialGradient(180,180,0,180,180,480); rg.addColorStop(0,'rgba(255,255,255,.75)'); rg.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=rg;ctx.fillRect(0,0,W,H);
  ctx.textAlign='center';
  ctx.fillStyle='#776d8d'; ctx.font='600 24px Montserrat, sans-serif'; ctx.fillText('ОСОБЛИВЕ ЗАПРОШЕННЯ',W/2,100);
  const [title,text]=copy[recipient]||copy['Кохана'];
  ctx.fillStyle='#443a5c';ctx.font='600 78px Georgia, serif';ctx.fillText(title,W/2,205);
  const img=await loadImage(imageDataUrl);
  const box={x:270,y:300,w:540,h:540,r:54};
  roundRect(ctx,box.x,box.y,box.w,box.h,box.r);ctx.fillStyle='#f7f3ff';ctx.fill();ctx.save();roundRect(ctx,box.x+18,box.y+18,box.w-36,box.h-36,40);ctx.clip();drawCover(ctx,img,box.x+18,box.y+18,box.w-36,box.h-36);ctx.restore();
  ctx.beginPath();ctx.arc(W/2,850,54,0,Math.PI*2);ctx.fillStyle='#77659e';ctx.fill();ctx.fillStyle='#fff';ctx.font='42px Georgia';ctx.fillText('♡',W/2,865);
  ctx.fillStyle='#443a5c';ctx.font='italic 42px Georgia, serif';wrapText(ctx,text,W/2,955,760,56);
  ctx.fillStyle='#8b809d';ctx.font='600 18px Montserrat, sans-serif';ctx.fillText('МАЛЕНЬКЕ ЗАПРОШЕННЯ ДО ВЕЛИКОЇ ІСТОРІЇ',W/2,1240);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/png',0.95));
}

function loadImage(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawCover(ctx,img,x,y,w,h){const s=Math.max(w/img.width,h/img.height);const dw=img.width*s,dh=img.height*s;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
function wrapText(ctx,text,x,y,maxWidth,lineHeight){const words=text.split(' ');let line='',lines=[];for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}lines.push(line);lines.forEach((l,i)=>ctx.fillText(l,x,y+i*lineHeight));}

async function shareInvite(){
  if(!imageDataUrl) return;
  try{
    const blob=await renderInviteBlob();
    const file=new File([blob],'zaprosennia.png',{type:'image/png'});
    if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
      await navigator.share({title:'Запрошення для тебе ♡',text:'Маленьке запрошення для особливої людини',files:[file]});
      return;
    }
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='zaprosennia.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Запрошення збережено як PNG');
  }catch(err){if(err?.name!=='AbortError'){console.error(err);toast('Не вдалося підготувати запрошення');}}
}
shareBtn.addEventListener('click',shareInvite);
shareInside.addEventListener('click',shareInvite);

function toast(message){const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2200);}
updateText();
