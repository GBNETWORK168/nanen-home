(function(){
const box=document.getElementById('rates-box');if(!box)return;
const SYM={USD:'$',AUD:'$',JPY:'¥',EUR:'€',CNY:'¥'};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f=v=>v==null?'—':String(v);
function coin(code){return '<svg class="rc-coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="url(#gr)" stroke-width="1.8"/><circle cx="12" cy="12" r="7" fill="none" stroke="url(#gd)" stroke-width="1.2"/><text x="12" y="16.2" text-anchor="middle" font-size="11" font-weight="700" font-family="Georgia,serif" fill="url(#gd)">'+SYM[code]+'</text></svg>'}
fetch('data/rates.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw 0;return r.json()}).then(d=>{
  const cards=d.currencies.map(c=>`<article class="rate-card">
    <header>${coin(c.code)}<div><b>${esc(c.name)}</b><small>${esc(c.code)} ／ ${c.code==='JPY'?'每 1 日圓':'新台幣'}</small></div></header>
    <div class="rate-pair"><div><span>即期買入</span><strong>${f(c.spot_buy)}</strong></div><div><span>即期賣出</span><strong>${f(c.spot_sell)}</strong></div></div>
    <div class="rate-cash"><span>現金買入 ${f(c.cash_buy)}</span><span>現金賣出 ${f(c.cash_sell)}</span></div>
  </article>`).join('');
  box.innerHTML=`<div class="rate-grid">${cards}</div>
  <p class="rate-note">資料來源：<a href="${esc(d.source_url)}" target="_blank" rel="noopener">${esc(d.source)}</a>｜牌價最新掛牌時間：${esc(d.listed_at)}（台北時間）｜每日更新。匯率僅供參考，實際以銀行成交價為準。</p>`;
}).catch(()=>{box.innerHTML='<p class="rate-note">匯率資料暫時無法載入，請稍後重新整理，或前往 <a href="https://rate.bot.com.tw/xrt" target="_blank" rel="noopener">臺灣銀行牌告匯率</a> 查詢。</p>'});
})();
