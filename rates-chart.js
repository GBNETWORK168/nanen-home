(function(){
const box=document.getElementById('rates-trend');if(!box)return;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const NS='http://www.w3.org/2000/svg';
let D=null,cur=0,hover=-1,W=0,uid=Math.random().toString(36).slice(2,7);
const dec=c=>c==='JPY'?4:(c==='EUR'||c==='AUD'||c==='USD'||c==='CNY'?3:2);
const fmt=(v,c)=>v.toFixed(c==='JPY'?4:3).replace(/0$/,'');
const fd=d=>d.replace(/-/g,'/');
const fdShort=d=>d.slice(2).replace(/-/g,'/');
function stats(rows){let hi=0,lo=0;rows.forEach((r,i)=>{if(r[2]>rows[hi][2])hi=i;if(r[2]<rows[lo][2])lo=i});return{hi,lo}}
function shell(){
  box.innerHTML=`<div class="rt-card">
  <div class="rt-head"><div><h3>近一年匯率走勢</h3><p class="rt-sub" id="rt-sub-${uid}"></p></div></div>
  <div class="rt-tabs" role="tablist" aria-label="選擇幣別">${D.currencies.map((c,i)=>`<button type="button" role="tab" class="rt-tab" data-i="${i}" aria-selected="${i===cur}"><b>${esc(c.name)}</b><small>${esc(c.code)}</small></button>`).join('')}</div>
  <div class="rt-stats" id="rt-stats-${uid}"></div>
  <div class="rt-plot" id="rt-plot-${uid}"></div>
  <p class="rate-note rt-note">資料來源：<a href="${esc(D.source_url)}" target="_blank" rel="noopener">${esc(D.source)}</a>｜${esc(D.basis)}｜涵蓋 ${fd(D.range_start)} 至 ${fd(D.range_end)}（缺牌告日略過）｜每日更新。僅供參考，實際以銀行成交價為準。</p>
  </div>`;
  box.querySelectorAll('.rt-tab').forEach(b=>{
    b.addEventListener('click',()=>{cur=+b.dataset.i;hover=-1;box.querySelectorAll('.rt-tab').forEach(x=>x.setAttribute('aria-selected',x===b));draw()});
    b.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const n=(cur+(e.key==='ArrowRight'?1:D.currencies.length-1))%D.currencies.length;const t=box.querySelectorAll('.rt-tab')[n];t.focus();t.click()}});
  });
}
function el(n,a,t){const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);if(t!=null)e.textContent=t;return e}
function draw(){
  const c=D.currencies[cur],rows=c.rows,n=rows.length;if(!n)return;
  const plot=document.getElementById('rt-plot-'+uid);
  W=Math.max(260,Math.floor(plot.clientWidth||320));
  const narrow=W<520,H=narrow?230:300;
  const m={l:narrow?44:58,r:narrow?12:20,t:14,b:28};
  const iw=W-m.l-m.r,ih=H-m.t-m.b;
  const vals=rows.map(r=>r[2]);let mn=Math.min(...vals),mx=Math.max(...vals);
  const pad=(mx-mn)*0.12||mx*0.01;mn-=pad;mx+=pad;
  const t0=Date.parse(rows[0][0]),t1=Date.parse(rows[n-1][0]),span=Math.max(1,t1-t0);
  const X=d=>m.l+(Date.parse(d)-t0)/span*iw,Y=v=>m.t+(1-(v-mn)/(mx-mn))*ih;
  const st=stats(rows),last=rows[n-1];
  // stats
  document.getElementById('rt-sub-'+uid).textContent=`${c.name}（${c.code}）兌新台幣・${fd(rows[0][0])} ～ ${fd(last[0])}・共 ${n} 個牌告日`+(c.code==='JPY'?'・每 1 日圓':'');
  const chg=last[2]-rows[0][2],pct=chg/rows[0][2]*100;
  const dp=c.code==='JPY'?4:3;
  document.getElementById('rt-stats-'+uid).innerHTML=
   `<div class="rt-st"><span>目前（${fdShort(last[0])}）</span><strong>${fmt(last[2],c.code)}</strong></div>`+
   `<div class="rt-st hi"><span>近一年最高（${fdShort(rows[st.hi][0])}）</span><strong>${fmt(rows[st.hi][2],c.code)}</strong></div>`+
   `<div class="rt-st lo"><span>近一年最低（${fdShort(rows[st.lo][0])}）</span><strong>${fmt(rows[st.lo][2],c.code)}</strong></div>`+
   `<div class="rt-st ${chg>=0?'up':'dn'}"><span>區間變動（自 ${fdShort(rows[0][0])}）</span><strong>${chg>=0?'+':''}${chg.toFixed(dp)}（${chg>=0?'+':''}${pct.toFixed(2)}%）</strong></div>`;
  const svg=el('svg',{width:W,height:H,viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':`${c.name}近一年即期賣出匯率走勢，最高 ${fmt(rows[st.hi][2],c.code)}，最低 ${fmt(rows[st.lo][2],c.code)}，目前 ${fmt(last[2],c.code)}`});
  const defs=el('defs',{});
  defs.innerHTML=`<linearGradient id="rtl-${uid}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#1565c0"/><stop offset=".62" stop-color="#0e9f9a"/><stop offset="1" stop-color="#43a047"/></linearGradient><linearGradient id="rta-${uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0e9f9a" stop-opacity=".22"/><stop offset="1" stop-color="#0e9f9a" stop-opacity="0"/></linearGradient>`;
  svg.appendChild(defs);
  // y grid
  const ticks=4;for(let i=0;i<=ticks;i++){const v=mn+(mx-mn)*i/ticks,y=Y(v);
    svg.appendChild(el('line',{x1:m.l,x2:W-m.r,y1:y,y2:y,stroke:i?'rgba(93,111,130,.16)':'rgba(201,162,74,.55)','stroke-width':1,'stroke-dasharray':i?'3 4':'0'}));
    svg.appendChild(el('text',{x:m.l-7,y:y+4,'text-anchor':'end','class':'rt-ax'},v.toFixed(c.code==='JPY'?4:2)))}
  // x ticks: month starts
  const months=[];let prev='';rows.forEach(r=>{const k=r[0].slice(0,7);if(k!==prev){months.push(r[0]);prev=k}});
  const step=narrow?Math.ceil(months.length/5):Math.ceil(months.length/7);
  months.forEach((d,i)=>{if(i%step)return;const x=X(d);if(x<m.l+8||x>W-m.r-18)return;
    svg.appendChild(el('line',{x1:x,x2:x,y1:H-m.b,y2:H-m.b+4,stroke:'rgba(93,111,130,.5)'}));
    svg.appendChild(el('text',{x:x,y:H-8,'text-anchor':'middle','class':'rt-ax'},narrow?d.slice(2,7).replace('-','/'):d.slice(0,7).replace('-','/')))});
  svg.appendChild(el('text',{x:m.l,y:H-8,'text-anchor':'start','class':'rt-ax rt-ax2'},''));
  // area + line
  let pd='';rows.forEach((r,i)=>{pd+=(i?'L':'M')+X(r[0]).toFixed(1)+' '+Y(r[2]).toFixed(1)});
  svg.appendChild(el('path',{d:pd+`L${X(last[0]).toFixed(1)} ${H-m.b}L${X(rows[0][0]).toFixed(1)} ${H-m.b}Z`,fill:`url(#rta-${uid})`}));
  svg.appendChild(el('path',{d:pd,fill:'none',stroke:`url(#rtl-${uid})`,'stroke-width':2.2,'stroke-linejoin':'round','stroke-linecap':'round'}));
  // max/min/last markers
  const mk=(i,col,lab,above)=>{const r=rows[i],x=X(r[0]),y=Y(r[2]);
    svg.appendChild(el('circle',{cx:x,cy:y,r:4.5,fill:'#fff',stroke:col,'stroke-width':2}));
    let tx=x,anc='middle';if(x<m.l+34){anc='start';tx=x-4}else if(x>W-m.r-34){anc='end';tx=x+4}
    svg.appendChild(el('text',{x:tx,y:above?y-9:y+17,'text-anchor':anc,'class':'rt-mk',fill:col},lab+' '+fmt(r[2],c.code)))};
  mk(st.hi,'#c8372d','高',true);mk(st.lo,'#9a7a2c','低',false);
  svg.appendChild(el('circle',{cx:X(last[0]),cy:Y(last[2]),r:3.6,fill:'#43a047',stroke:'#fff','stroke-width':1.5}));
  // hover
  const g=el('g',{'class':'rt-hv',style:'display:none'});
  const vl=el('line',{y1:m.t,y2:H-m.b,stroke:'rgba(201,162,74,.9)','stroke-width':1}),dot=el('circle',{r:5,fill:'#1565c0',stroke:'#fff','stroke-width':2});
  const tipbg=el('rect',{rx:8,ry:8,fill:'#06254a',opacity:.94}),t1el=el('text',{'class':'rt-tip',fill:'#e8cb7a'}),t2el=el('text',{'class':'rt-tip rt-tip2',fill:'#fff'});
  [vl,dot,tipbg,t1el,t2el].forEach(x=>g.appendChild(x));svg.appendChild(g);
  const ov=el('rect',{x:m.l,y:m.t,width:iw,height:ih,fill:'transparent','style':'touch-action:pan-y;cursor:crosshair'});svg.appendChild(ov);
  function show(clientX){const b=svg.getBoundingClientRect(),px=clientX-b.left,tt=t0+(px-m.l)/iw*span;
    let lo=0,hi=n-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(Date.parse(rows[mid][0])<tt)lo=mid;else hi=mid}
    const i=Math.abs(Date.parse(rows[lo][0])-tt)<Math.abs(Date.parse(rows[hi][0])-tt)?lo:hi,r=rows[i],x=X(r[0]),y=Y(r[2]);
    g.style.display='';vl.setAttribute('x1',x);vl.setAttribute('x2',x);dot.setAttribute('cx',x);dot.setAttribute('cy',y);
    t1el.textContent=fd(r[0]);t2el.textContent='賣出 '+fmt(r[2],c.code)+'｜買入 '+fmt(r[1],c.code);
    const w=Math.max(t1el.getComputedTextLength?t1el.getComputedTextLength():0,t2el.getComputedTextLength?t2el.getComputedTextLength():0)+16,h=40;
    let bx=x+10;if(bx+w>W-4)bx=x-10-w;if(bx<4)bx=4;let by=m.t+4;
    tipbg.setAttribute('x',bx);tipbg.setAttribute('y',by);tipbg.setAttribute('width',w);tipbg.setAttribute('height',h);
    t1el.setAttribute('x',bx+8);t1el.setAttribute('y',by+16);t2el.setAttribute('x',bx+8);t2el.setAttribute('y',by+32)}
  ov.addEventListener('pointermove',e=>show(e.clientX));ov.addEventListener('pointerdown',e=>show(e.clientX));
  ov.addEventListener('pointerleave',()=>{g.style.display='none'});
  plot.innerHTML='';plot.appendChild(svg);
}
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(D){const p=document.getElementById('rt-plot-'+uid);if(p&&Math.floor(p.clientWidth)!==W)draw()}},120)});
fetch('data/rates_history.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw 0;return r.json()}).then(d=>{
  if(!d.currencies||!d.currencies.length)throw 0;D=d;shell();draw()
}).catch(()=>{box.innerHTML='<p class="rate-note">近一年匯率走勢暫時無法載入，請稍後重新整理，或前往 <a href="https://rate.bot.com.tw/xrt/quote/ltm/USD" target="_blank" rel="noopener">臺灣銀行歷史匯率</a> 查詢。</p>'});
})();
