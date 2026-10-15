// 南恩新聞報報 viewer + client-side poster
(function(){
const $=s=>document.querySelector(s);
let cat='全部', list=D.items.slice(), cur=0;
function filt(){list=cat==='全部'?D.items.slice():D.items.filter(i=>i.cat===cat);}
function show(k){
  cur=(k+list.length)%list.length; const it=list[cur];
  $('#vimg').src=it.img; $('#vimg').alt=it.title;
  $('#vdl').href=it.img; $('#vdl').setAttribute('download',it.dl);
  $('#vcnt').textContent=`${cat}　${cur+1} / ${list.length}`;
  $('#vsrc').innerHTML=`<a href="${it.url}" target=_blank rel=noopener>原文：${it.src}｜${it.time} ›</a>`;
  document.querySelectorAll('.it').forEach((e,j)=>e.classList.toggle('cur',j===cur));
}
function renderList(){
  $('#list').innerHTML=list.map((it,j)=>`<div class=it data-j=${j}><span class=c>${it.cat}</span><span class=t>${it.title}<small>${it.src}｜${it.time}</small></span></div>`).join('');
  document.querySelectorAll('.it').forEach(e=>e.onclick=()=>{show(+e.dataset.j);$('#viewer').scrollIntoView({behavior:'smooth',block:'center'});});
}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));b.classList.add('on');cat=b.dataset.c;filt();renderList();show(0);});
$('#prev').onclick=()=>show(cur-1); $('#next').onclick=()=>show(cur+1);
let sx=null,sy=null;
$('#viewer').addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
$('#viewer').addEventListener('touchend',e=>{if(sx===null)return;const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))show(cur+(dx<0?1:-1));sx=null;},{passive:true});
renderList(); show(0);

// poster tabs
document.querySelectorAll('.ptab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.ptab').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  const k=b.dataset.k;
  if(k==='custom'){$('#pstatic').style.display='none';$('#pcustom').style.display='';return;}
  $('#pstatic').style.display='';$('#pcustom').style.display='none';
  const [f,n]=D.posters[+k];$('#pimg').src='img/'+f;$('#pdl').href='img/'+f;$('#pdl').setAttribute('download',`${D.D8}-每日報報-${n}.png`);
});

// picker
let order=D.items.filter(i=>i.top).sort((a,b)=>a.top-b.top).map(i=>i.id);
order=order.concat(D.items.filter(i=>!i.top).map(i=>i.id));
let sel=new Set(D.items.filter(i=>i.top).map(i=>i.id));
const byId=Object.fromEntries(D.items.map(i=>[i.id,i]));
function renderPick(){
  const s=order.filter(id=>sel.has(id)), rest=order.filter(id=>!sel.has(id)); order=s.concat(rest);
  $('#pick').innerHTML=order.map((id,j)=>{const it=byId[id],on=sel.has(id);return `<div class="pk${on?' sel':''}"><input type=checkbox data-id=${id} ${on?'checked':''}><span class=n>${on?j+1:''}</span><span class=tx>${it.short}<br><small style="color:#888">${it.cat}・${it.src}</small></span>${on?`<button data-u=${id}>▲</button><button data-d=${id}>▼</button>`:''}</div>`}).join('');
  $('#pcnt').textContent=`已選 ${sel.size} / 5`;
  document.querySelectorAll('.pk input').forEach(c=>c.onchange=()=>{const id=c.dataset.id;if(c.checked){if(sel.size>=5){c.checked=false;alert('最多選 5 則');return;}sel.add(id);order=order.filter(x=>x!==id);order.splice(sel.size-1,0,id);}else sel.delete(id);renderPick();});
  document.querySelectorAll('[data-u],[data-d]').forEach(b=>b.onclick=()=>{const id=b.dataset.u||b.dataset.d,i=order.indexOf(id),j=b.dataset.u?i-1:i+1;if(j<0||j>=sel.size)return;[order[i],order[j]]=[order[j],order[i]];renderPick();});
}
renderPick();

const img=src=>new Promise((r,j)=>{const m=new Image();m.onload=()=>r(m);m.onerror=j;m.src=src;});
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
const F='"Noto Sans TC","Noto Sans CJK TC",sans-serif';
function fit(c,t,max,size,w){let s=size;do{c.font=`${w} ${s}px ${F}`;s-=1}while(c.measureText(t).width>max&&s>18);}
async function poster(ids){
  const heads=ids.map(id=>byId[id].short);
  const txt=heads.join('')+'每日報報五大重點財經頭條美元澳幣日圓人民幣道瓊標普那斯達克台股加權0123456789.,+-()%（）／：；漲跌較美股為東收盤紅綠資料來源截至台北時間灣證券交易所中央社工商時報ReutersInvesting.comNewsUSDAUDJPYCNY';
  try{await Promise.all(['900','700','500'].map(w=>document.fonts.load(`${w} 40px "Noto Sans TC"`,txt)));}catch(e){}
  const [bg,title,logo]=await Promise.all([img('img/bg-v4.jpg'),img('img/title.png'),img('img/logo.png')]);
  const cv=document.createElement('canvas');cv.width=1080;cv.height=1920;const c=cv.getContext('2d');
  c.drawImage(bg,0,0,1080,1920);
  const tw=800,th=tw*title.height/title.width;c.drawImage(title,(1080-tw)/2,70,tw,th);
  c.textAlign='center';c.fillStyle='#fff';c.shadowColor='rgba(0,0,0,.6)';c.shadowBlur=10;
  c.font=`900 76px ${F}`;c.fillText(`${D.date} News`,540,395);c.shadowBlur=0;
  const gold=(y,h)=>{const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#ffe680');g.addColorStop(1,'#f7c531');return g};
  const cardW=225,gap=20,x0=(1080-4*cardW-3*gap)/2;
  // FX
  
  
  c.fillStyle='#fff';c.font=`900 56px ${F}`;c.shadowColor='rgba(0,0,0,.6)';c.shadowBlur=10;c.fillText('五大重點財經頭條',540,908);c.shadowBlur=0;
  heads.forEach((h,k)=>{const y=956+k*92;rr(c,60,y,960,74,16);c.fillStyle='rgba(8,18,50,.72)';c.fill();c.strokeStyle='#fff';c.lineWidth=3;c.stroke();
    c.beginPath();c.arc(112,y+37,25,0,7);c.fillStyle='#f7c531';c.fill();c.fillStyle='#0a1a3a';c.font=`900 30px ${F}`;c.textAlign='center';c.fillText(k+1,112,y+48);
    c.textAlign='left';c.fillStyle='#fff';fit(c,h,830,38,700);c.fillText(h,155,y+50);});
  c.textAlign='center';
  D.idx.forEach(([n,v,a,p,u],k)=>{const x=x0+k*(cardW+gap),y=1442,h=272;
    c.shadowColor='rgba(0,0,0,.4)';c.shadowBlur=14;rr(c,x,y,cardW,h,22);c.fillStyle=gold(y,h);c.fill();c.shadowBlur=0;
    c.fillStyle='#111';fit(c,n,cardW-20,38,900);c.fillText(n,x+cardW/2,y+58);
    c.strokeStyle='rgba(0,0,0,.25)';c.lineWidth=2;c.beginPath();c.moveTo(x+14,y+84);c.lineTo(x+cardW-14,y+84);c.stroke();
    fit(c,v,cardW-16,40,900);c.fillText(v,x+cardW/2,y+146);
    c.fillStyle=u==='up'?'#d4001a':'#078a32';fit(c,a,cardW-16,34,700);c.fillText(a,x+cardW/2,y+200);c.font=`700 34px ${F}`;c.fillText(`(${p})`,x+cardW/2,y+248);});
  c.fillStyle='#fff';c.font=`500 24px ${F}`;const n2=D.idxnote+'　紅漲綠跌';c.fillText(n2,540,1762);
  c.fillStyle='rgba(6,16,45,.65)';rr(c,30,1800,1020,96,10);c.fill();
  c.drawImage(logo,42,1803,90,90*logo.height/logo.width);
  c.fillStyle='#e8eeff';const s1='資料來源：'+D.sources,s2=`資料截至 ${D.asof}（台北時間）`;fit(c,s1,860,22,500);c.fillText(s1,600,1840);c.font=`500 22px ${F}`;c.fillText(s2,600,1874);
  return cv;
}
$('#gen').onclick=async()=>{
  if(sel.size!==5){alert('請選滿 5 則頭條');return;}
  $('#gen').textContent='產生中…';
  try{const cv=await poster(order.slice(0,5));
    const blob=await new Promise(r=>cv.toBlob(r,'image/png'));const url=URL.createObjectURL(blob);
    $('#pout').innerHTML=`<img src="${url}" alt="自選每日報報海報"><div class=vbar style="justify-content:center"><a class="btn red" href="${url}" download="${D.D8}-每日報報-自選.png" style="margin:0">下載圖片</a></div><div class=tip>手機可長按圖片儲存。</div>`;
  }catch(e){$('#pout').textContent='產生失敗：'+e;}
  $('#gen').textContent='產生海報';
};
})();
