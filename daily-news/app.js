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
// typography system: titles/labels Noto Sans TC 700-900, body Noto Serif TC 400, captions Noto Sans TC 500,
// magazine headlines Noto Serif TC 600, English/numbers Inter tabular-nums. Picker overrides the CJK families.
const SANS='"Noto Sans TC","Noto Sans CJK TC",sans-serif',SERIF='"Noto Serif TC","Noto Serif CJK TC",serif',INTER='"Inter"';
const FONTS={sys:null,sans:SANS,serif:SERIF,jh:'"Microsoft JhengHei","微軟正黑體","Noto Sans TC","Noto Sans CJK TC",sans-serif'};
let fkey=localStorage.getItem('nn_font');if(!(fkey in FONTS))fkey='sys';
let R={};function roles(){const o=FONTS[fkey];R={T:o||SANS,H:o||SERIF,B:o||SERIF,S:o||SANS};}
const F_=(role)=>`${INTER},${R[role]}`;let F;
let bgkey=localStorage.getItem('nn_bg');if(!D.bg_pool.some(b=>b[0]===bgkey))bgkey=null;
const bgId=()=>bgkey||D.bg_auto;
function applyFont(){roles();F=F_('T');const st=document.body.style;['T','H','B','S'].forEach(k=>st.setProperty('--f'+k,R[k]));document.querySelectorAll('.fbtn').forEach(b=>b.classList.toggle('on',b.dataset.f===fkey));}
document.querySelectorAll('.fbtn').forEach(b=>b.onclick=()=>{fkey=b.dataset.f;localStorage.setItem('nn_font',fkey);applyFont();redraw();});
applyFont();
function renderBgs(){$('#bgs').innerHTML=D.bg_pool.map(([id,n])=>`<button class="bg${id===bgId()?' on':''}" data-id="${id}"><img src="img/bg/${id}-t.jpg" alt="${n}">${id===D.bg_auto?'<i>自動</i>':''}<span>${n}</span></button>`).join('');
  document.querySelectorAll('.bg').forEach(b=>b.onclick=()=>{bgkey=b.dataset.id===D.bg_auto?null:b.dataset.id;bgkey?localStorage.setItem('nn_bg',bgkey):localStorage.removeItem('nn_bg');renderBgs();redraw();});}
$('#bgreset').onclick=()=>{bgkey=null;localStorage.removeItem('nn_bg');renderBgs();redraw();};
renderBgs();
const ptitle=()=>($('#ptitle').value.trim()||'每日報報');
$('#ptitle').value=localStorage.getItem('nn_title')||'每日報報';
let _pt;$('#ptitle').oninput=()=>{const v=$('#ptitle').value.trim();v&&v!=='每日報報'?localStorage.setItem('nn_title',v):localStorage.removeItem('nn_title');clearTimeout(_pt);_pt=setTimeout(redraw,500);};
// custom title: font + colour (other poster text keeps its default colours)
const TF={heavy:['900',SANS,'思源黑體 Heavy'],bold:['700',SANS,'思源黑體 Bold'],medium:['500',SANS,'思源黑體 Medium'],
  serif600:['600',SERIF,'思源宋體 SemiBold'],serif400:['400',SERIF,'思源宋體 Regular'],inter:['800',`${INTER},"Noto Sans TC","Noto Sans CJK TC",sans-serif`,'Inter']};
let tfont=localStorage.getItem('nn_tfont');if(!(tfont in TF))tfont='';
$('#tfont').value=tfont;
$('#tfont').onchange=()=>{tfont=$('#tfont').value;tfont?localStorage.setItem('nn_tfont',tfont):localStorage.removeItem('nn_tfont');redraw();};
const SW=[['金色漸層','gold'],['白','#ffffff'],['金','#f2b632'],['大心藍綠','#17a2a0'],['深藍','#0a1a3a'],['紅','#d7262b']];
let TCOL=localStorage.getItem('nn_tcolor')||'gold';localStorage.removeItem('nn_colors');
function renderCols(){$('#cols').innerHTML=`<div class=cr2><span class=cn2 style="font-weight:700">標題顏色<small style="font-weight:400;color:#888">（金色字圖時不套用）</small></span>${SW.map(([n,v])=>`<button class="sw${TCOL===v?' on':''}" data-v="${v}" title="${n}" style="background:${v==='gold'?'linear-gradient(#fff1b0,#f2b632,#c98a12)':v}"></button>`).join('')}<input type=color id=tcol value="${TCOL==='gold'?'#f2b632':TCOL}"></div>`;
  document.querySelectorAll('.sw').forEach(b=>b.onclick=()=>setCol(b.dataset.v));$('#tcol').onchange=()=>setCol($('#tcol').value);}
function setCol(v){TCOL=v;v==='gold'?localStorage.removeItem('nn_tcolor'):localStorage.setItem('nn_tcolor',v);renderCols();redraw();}
renderCols();
$('#ptreset').onclick=()=>{$('#ptitle').value='每日報報';tfont='';$('#tfont').value='';TCOL='gold';['nn_title','nn_tfont','nn_tcolor'].forEach(k=>localStorage.removeItem(k));renderCols();redraw();};
const titleFont=s=>{const [w,f]=TF[tfont||'heavy'];return `${w} ${s}px ${f}`;};
function redraw(){if($('#pout img'))$('#gen').click();}
function fit(c,t,max,size,w,fam){fam=fam||F;let s=size;do{c.font=`${w} ${s}px ${fam}`;s-=1}while(c.measureText(t).width>max&&s>18);}
async function poster(ids){
  const heads=ids.map(id=>byId[id].short);
  const txt=heads.join('')+'每日報報五大重點財經頭條美元澳幣日圓人民幣道瓊標普那斯達克台股加權0123456789.,+-()%（）／：；漲跌較美股為東收盤紅綠資料來源截至台北時間灣證券交易所中央社工商時報ReutersInvesting.comNewsUSDAUDJPYCNY';
  const fl=[];['T','H','S'].forEach(k=>['900','700','600','500'].forEach(w=>fl.push(`${w} 40px ${R[k]}`)));['800','700','600'].forEach(w=>fl.push(`${w} 40px ${INTER}`));
  fl.push(titleFont(40));
  try{await Promise.all(fl.map(f=>document.fonts.load(f,txt+ptitle())));await document.fonts.ready;}catch(e){}
  const [bg,title,logo]=await Promise.all([img(`img/bg/${bgId()}.jpg`),img('img/title.png'),img('img/logo.png')]);
  const cv=document.createElement('canvas');cv.width=1080;cv.height=1920;const c=cv.getContext('2d');
  c.drawImage(bg,0,0,1080,1920);
  const PT=ptitle();
  if(PT==='每日報報'&&!tfont){const tw=800,th=tw*title.height/title.width;c.drawImage(title,(1080-tw)/2,70,tw,th);}
  else{let s=170;c.font=titleFont(s);while(c.measureText(PT).width>960&&s>40){s-=2;c.font=titleFont(s);}
    c.textAlign='center';c.textBaseline='middle';const cy=172,g=c.createLinearGradient(0,cy-s/2,0,cy+s/2);
    g.addColorStop(0,'#fff1b0');g.addColorStop(.45,'#f2b632');g.addColorStop(.8,'#c98a12');g.addColorStop(1,'#8a5a08');
    c.lineJoin='round';c.lineWidth=Math.max(4,s/18);c.strokeStyle='#5a3a06';c.shadowColor='rgba(0,0,0,.7)';c.shadowBlur=14;c.shadowOffsetY=6;c.strokeText(PT,540,cy);
    c.shadowBlur=0;c.shadowOffsetY=0;c.fillStyle=TCOL==='gold'?g:TCOL;c.fillText(PT,540,cy);c.textBaseline='alphabetic';}
  c.textAlign='center';c.fillStyle='#ffffff';c.shadowColor='rgba(0,0,0,.6)';c.shadowBlur=10;
  c.font=`800 76px ${INTER}`;c.fillText(`${D.date} News`,540,395);c.shadowBlur=0;
  const gold=(y,h)=>{const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#ffe680');g.addColorStop(1,'#f7c531');return g};
  const cardW=225,gap=20,x0=(1080-4*cardW-3*gap)/2;
  // FX
  
  
  c.fillStyle='#ffffff';c.font=`900 56px ${F_('T')}`;c.shadowColor='rgba(0,0,0,.6)';c.shadowBlur=10;c.fillText('五大重點財經頭條',540,908);c.shadowBlur=0;
  heads.forEach((h,k)=>{const y=956+k*92;rr(c,60,y,960,74,16);c.fillStyle='rgba(8,18,50,.72)';c.fill();c.strokeStyle='#fff';c.lineWidth=3;c.stroke();
    c.beginPath();c.arc(112,y+37,25,0,7);c.fillStyle='#f7c531';c.fill();c.fillStyle='#0a1a3a';c.font=`800 30px ${INTER}`;c.textAlign='center';c.fillText(k+1,112,y+48);
    c.textAlign='left';c.fillStyle='#ffffff';fit(c,h,830,38,600,F_('H'));c.fillText(h,155,y+50);});
  c.textAlign='center';
  D.idx.forEach(([n,v,a,p,u],k)=>{const x=x0+k*(cardW+gap),y=1442,h=272;
    c.shadowColor='rgba(0,0,0,.4)';c.shadowBlur=14;rr(c,x,y,cardW,h,22);c.fillStyle=gold(y,h);c.fill();c.shadowBlur=0;
    c.fillStyle='#111111';fit(c,n,cardW-20,38,900,F_('T'));c.fillText(n,x+cardW/2,y+58);
    c.strokeStyle='rgba(0,0,0,.25)';c.lineWidth=2;c.beginPath();c.moveTo(x+14,y+84);c.lineTo(x+cardW-14,y+84);c.stroke();
    fit(c,v,cardW-16,40,700,INTER);c.fillText(v,x+cardW/2,y+146);
    c.fillStyle=u==='up'?'#d4001a':u==='fl'?'#333333':'#078a32';fit(c,a,cardW-16,34,600,INTER);c.fillText(a,x+cardW/2,y+200);c.font=`600 34px ${INTER}`;c.fillText(`(${p})`,x+cardW/2,y+248);});
  c.fillStyle='#e8eeff';c.font=`500 24px ${F_('S')}`;const n2=D.idxnote+'　紅漲綠跌';c.fillText(n2,540,1762);
  c.fillStyle='rgba(6,16,45,.65)';rr(c,30,1800,1020,96,10);c.fill();
  c.drawImage(logo,42,1803,90,90*logo.height/logo.width);
  c.fillStyle='#e8eeff';const s1='資料來源：'+D.sources,s2=`資料截至 ${D.asof}（台北時間）`;fit(c,s1,860,22,500,F_('S'));c.fillText(s1,600,1840);c.font=`500 22px ${F_('S')}`;c.fillText(s2,600,1874);
  return cv;
}
$('#gen').onclick=async()=>{
  if(sel.size!==5){alert('請選滿 5 則頭條');return;}
  $('#gen').textContent='產生中…';
  try{const cv=await poster(order.slice(0,5));
    const blob=await new Promise(r=>cv.toBlob(r,'image/png'));const url=URL.createObjectURL(blob);
    $('#pout').innerHTML=`<img src="${url}" alt="自選每日報報海報"><div class=vbar style="justify-content:center"><a class="btn red" href="${url}" download="${D.D8}-${ptitle().replace(/[\\/:*?"<>|]/g,'')}-自選-${bgId()}-${tfont||'default'}.png" style="margin:0">下載圖片</a></div><div class=tip>手機可長按圖片儲存。</div>`;
  }catch(e){$('#pout').textContent='產生失敗：'+e;}
  $('#gen').textContent='產生海報';
};
})();
