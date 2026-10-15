(function(){
const box=document.getElementById('nn-box');if(!box)return;
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dl='<svg class="si si-sm" aria-hidden="true"><use href="#i-down"/></svg>';
fetch('data/daily_news.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw 0;return r.json()}).then(d=>{
  const heads=d.headlines.map((h,i)=>`<li><a href="${esc(h.url)}" target="_blank" rel="noopener"><span class="nn-no">${i+1}</span><span class="nn-ht">${esc(h.title)}<small>${esc(h.source)}｜${esc(h.time)}</small></span></a></li>`).join('');
  const idx=d.indices.map(x=>`<div class="nn-q"><span>${esc(x.name)}</span><strong>${esc(x.value)}</strong><em class="${x.dir}">${x.dir==='up'?'上漲':'下跌'} ${esc(x.change)}</em></div>`).join('');
  const fig=(it,extra)=>`<figure class="nn-fig"><a href="${esc(it.full)}" target="_blank" rel="noopener"><img src="${esc(it.thumb)}" alt="${esc(it.caption)}" loading="lazy"></a><figcaption><b>${esc(it.caption)}</b>${extra||''}<a class="nn-dl" href="${esc(it.download_path)}" download="${esc(it.download)}">${dl}下載圖片</a></figcaption></figure>`;
  const posters=d.posters.map(p=>fig(p)).join('');
  const clips=d.clips.map(c=>fig(c,c.source_url?`<a class="nn-src" href="${esc(c.source_url)}" target="_blank" rel="noopener">原文：${esc(c.source)}</a>`:'')).join('');
  box.innerHTML=`<p class="nn-date">${esc(d.date_label)}　每日更新</p>
  <div class="nn-top">
    <div class="nn-card"><h3>五大重點財經頭條</h3><ol class="nn-heads">${heads}</ol></div>
    <div class="nn-card"><h3>重要指數</h3><div class="nn-qs">${idx}</div><p class="nn-note">${esc(d.indices_note)}</p></div>
  </div>
  <h3 class="nn-h3">今日海報</h3><div class="nn-figs">${posters}</div>
  <h3 class="nn-h3">新聞剪報</h3><div class="nn-figs">${clips}</div>
  <p class="center nn-actions"><a class="btn btn-gold" href="${esc(d.page)}">開啟南恩新聞報報完整版 →</a>${d.zip?`<a class="btn btn-gold btn-ghost" href="${esc(d.zip)}" download>${dl}全部圖片（ZIP）</a>`:''}</p>
  <p class="nn-note center">資料來源：中央社、工商時報、臺灣證券交易所、Reuters／Investing.com。內容僅供參考，不構成投資建議。</p>`;
}).catch(()=>{box.innerHTML='<p class="rate-note">南恩新聞報報暫時無法載入，請稍後重新整理，或直接開啟 <a href="daily-news/">完整版</a>。</p>'});
})();
