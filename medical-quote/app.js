/* 富邦四季春快速報價 v1.22 — 計算引擎 + UI（純前端，無外部相依） */
(function(){
const P = window.PRODUCTS, RT = window.RATES;
const fmt = n => n==null ? '-' : Math.round(n).toLocaleString('zh-TW');
const pick = (tbl, age) => { for (const [up, v] of tbl) if (age <= up) return v; return null; };
const UNIT = {day:'元／日', wan:'萬元', unit:'單位', usd:'美元', h:'元'};
const RUN = p => p.unit==='day'?'百元日額':p.unit==='h'?'百元保額':p.unit==='usd'?'萬美元':p.unit==='unit'?'單位':(p.per?p.per+' 萬元':'萬元');
const unitsOf = (p, S) => p.unit==='day'||p.unit==='h' ? S/100 : p.unit==='usd' ? S/10000 : p.unit==='unit' ? 1 : S/(p.per||1);
// v1.14：同一主約可投保兩張（例：兩張 XWS5）→ 主約以「實例 id」記：第 1 張＝商品代號（XWS5），第 2 張起＝XWS5#2、XWS5#3…
const base = id => String(id).split('#')[0];
const inum = id => { const k = String(id).split('#')[1]; return k ? +k : 1; };
const lab = id => inum(id) > 1 ? `${base(id)}（第${inum(id)}張）` : base(id);
const DUPMAX = code => code === 'OLA6' ? 4 : 2;   // OLA6：同一被保險人小額終老限 4 件（含同業）；其他商品先開放兩張
const termLbl = (p, t) => (p && p.tl && p.tl[t]) || (t==0?'躉繳':t==1?'一年期':t+'年');
// v1.10：附約保額受主約額度限制改硬性擋（ADH ≦可附加額度 5 倍、SDL >50 萬 ≦可附加額度、LTU 2 倍／×10）；FDE/FDF/FDG 不可附加 FDC
// v1.9：主約性別／職業限制（CLX 女、CLZ 男；傷害險職業 1–4 類、ALA 限 1 類）
// v1.21：停售日程（富壽商開字第1150004618號）：CLX／CLZ 10/22 停售，10/23 起不受理新契約。以台北日期判斷；要恢復只刪這裡。
const STOPSALE = {CLX:'2026-10-23', CLZ:'2026-10-23'};
const STOPNOTE = '10/22 停售（10/23 起不受理新契約）';
const twToday = () => (window.__TODAY || new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()));
const isStopped = c => !!STOPSALE[c] && twToday() >= STOPSALE[c];
const stopSoon = c => !!STOPSALE[c] && !isStopped(c);
function pEl(p){
  if (isStopped(p.code)) return {ok:false, stop:true, why:'已停售（10/23 起不受理新契約）'};
  if (!eligible(p, st.age)) return {ok:false, why:'投保年齡 '+ageRangeText(p)};
  if (p.occMax && st.occ > p.occMax) return {ok:false, why:`投保職業類別限 1${p.occMax>1?'～'+p.occMax:''} 類`};
  if (p.sex && p.sex !== st.sex) return {ok:false, sexMis:true, why:p.sex===1?'男性專屬商品':'女性專屬商品'};
  return {ok:true};
}

// ---------- 規則 ----------
function termsFor(p, age, plan){
  const t = (plan && plan.startsWith('HAD')) ? p.terms80 : p.terms;
  return Object.keys(t).map(Number).filter(k => age >= t[k][0] && age <= t[k][1]);
}
function eligible(p, age){
  if (p.plans) return termsFor(p, age, 'HAC1').length + termsFor(p, age, 'HAD1').length > 0;
  return termsFor(p, age).length > 0;
}
function ageRangeText(p){
  const f = t => Object.entries(t).map(([k,[a,b]]) => `${p.tl&&p.tl[k]?p.tl[k]:k==0?'躉繳':k==1?'一年期':k+'年期'} ${a}–${b}歲`).join('、');
  return p.plans ? `HAC(75歲啟動) ${f(p.terms)}；HAD(80歲啟動) ${f(p.terms80)}` : f(p.terms);
}
function limits(p, age, occ, hsv){
  // 回傳以「輸入單位」計的 [min, max, step]；day=元/日、wan=萬元、unit=單位
  if (p.unit === 'unit') return [1, 1, 1];
  if (p.fixed) { const v = pick(p.fixed.age, age); return [v, v, 1]; }
  let mn = typeof p.min === 'object' ? pick(p.min.age, age) : p.min;
  if (hsv && p.minHSV) mn = p.minHSV;   // XWS5：同時附加 HSV 系列住院附約時最低 5 萬
  let mx;
  const m = p.max;
  if (m.all != null) mx = m.all;
  else if (m.occ) mx = m.occ[occ-1];
  else if (m.age) mx = pick(m.age, age);
  else if (m.occage) mx = pick(m.occage, age)[occ-1];
  const step = p.unit === 'day' || p.unit === 'h' ? 100 : (p.step || 1);
  return [mn, mx, step];
}

// ---------- 計算（對齊建議書 OP 公式） ----------
// 原始年繳 = ROUND(保額單位數 × 費率, 1)；繳別保費 = ROUND(年繳 × 繳別係數, 0)；實繳 = ROUND(繳別保費 × (1 − 折扣), 0)
function quote(p, q){
  const errs = [];
  if (!eligible(p, q.age)) errs.push(`投保年齡不符：${ageRangeText(p)}`);
  if (p.sex && q.sex && p.sex !== q.sex) errs.push(`性別不符：${p.sex===1?'男性':'女性'}專屬商品`);
  if (p.occMax && q.occ > p.occMax) errs.push(`投保職業類別限 1${p.occMax>1?'～'+p.occMax:''} 類（目前第 ${q.occ} 類）`);
  const plan = p.plans ? q.plan : p.code;
  const terms = termsFor(p, q.age, plan);
  if (!terms.includes(q.term)) errs.push(`此年齡不可選 ${termLbl(p,q.term)}（可選：${terms.map(t=>termLbl(p,t)).join('、')||'無'}）`);
  const [mn, mx, step] = limits(p, q.age, q.occ, q.hsv);
  const S = q.sum;
  if (!(S >= mn - 1e-9)) errs.push(`保額低於最低 ${mn.toLocaleString()} ${UNIT[p.unit]}` + (p.minHSV && !q.hsv ? `（HSV 附約附加於本主約時可投保 ${p.minHSV} 萬）` : ''));
  else if (p.minHSV && q.hsv && S > p.minHSV + 1e-9 && S < p.min - 1e-9) errs.push(`附加 HSV 時可投保 ${p.minHSV} 萬整；超過 ${p.minHSV} 萬須達最低 ${p.min} 萬`);
  if (q.cumOther > 0 && p.unit !== 'unit' && !p.fixed){   // v1.14：同商品第 2 張起：累計本險種最高保額扣掉前面幾張
    const left = Math.round((mx - q.cumOther)*100)/100;
    if (S > left + 1e-9) errs.push(`累計本險種最高 ${mx.toLocaleString()} ${UNIT[p.unit]}，同商品其他張已投保 ${q.cumOther.toLocaleString()} ${UNIT[p.unit]} → 這張 ≦${Math.max(0,left).toLocaleString()} ${UNIT[p.unit]}`);
  }
  if (!(S <= mx + 1e-9)) errs.push(`保額超過上限 ${mx.toLocaleString()} ${UNIT[p.unit]}`);
  if (!p.free && Math.abs(Math.round(S/step)*step - S) > 1e-6) errs.push(`保額需以 ${step} ${UNIT[p.unit]} 為單位`);
  if (errs.length) return {errs};
  const row = RT[p.code][`${plan}|${q.term}|${q.sex}`];
  const rate = row && row[1][q.age - row[0]];
  if (rate == null) return {errs:['查無費率（此組合不在費率表內）']};
  const units = unitsOf(p, S);
  const annual = Math.round(units * rate * 10 + 1e-7) / 10;
  const warns = [];
  if (p.soft && S < p.soft - 1e-9) warns.push(`保額低於一般最低 ${p.soft} 萬：僅限喪葬費用保險金缺口不足 ${p.soft} 萬者（限投保缺口額度）`);
  let rate2 = null, annual2 = null, from2 = null, renewRate = null, renewAnnual = null;
  if (p.step2){ const r2 = RT[p.code][`${plan}|${q.term}|${q.sex}|2`]; rate2 = r2 && r2[1][q.age - r2[0]]; from2 = p.step2[q.term]; if (rate2 != null) annual2 = Math.round(units * rate2 * 10 + 1e-7) / 10; }
  if (p.renew){ const rr = RT[p.code][`${plan}|${q.term}|${q.sex}|R`]; renewRate = rr && rr[1][q.age + 1 - rr[0]]; if (renewRate != null) renewAnnual = Math.round(units * renewRate * 10 + 1e-7) / 10; }
  const f = p.mf[q.mode] || 1;
  const modal = Math.round(annual * f + 1e-7);
  let bp = 0; const dl = [];
  if (q.payDisc && p.pay) { bp += p.pay*10000; dl.push(`繳費方式 ${p.pay*100}%`); }
  if (p.hi) for (const [th, r] of p.hi) if (S >= th) { bp += r*10000; dl.push(`高保額 ${r*100}%`); break; }
  bp = Math.min(bp, Math.round((p.cap||0)*10000));
  const paid = Math.round(modal * (10000 - bp) / 10000 + 1e-7);
  const n = {年繳:1,躉繳:1,半年繳:2,季繳:4,月繳:12}[q.mode];
  const firstYear = q.mode === '月繳' ? paid*12 : paid*n;  // 月繳首年實繳＝首期2個月＋續期10個月，首續期折扣相同時即 ×12
  let warn = p.warn && p.warn[`${q.term}|${q.sex}|${q.age}`];
  if (warns.length) warn = [warn, ...warns].filter(Boolean).join('；');
  const disc = v => Math.round(Math.round(v * f + 1e-7) * (10000 - bp) / 10000 + 1e-7);
  const paid2 = annual2 != null ? disc(annual2) : null, renewPaid = renewAnnual != null ? disc(renewAnnual) : null;
  return {rate, units, annual, modal, paid, bp, dl, firstYear, n, warn, rate2, annual2, paid2, from2, renewRate, renewAnnual, renewPaid, cur:p.cur||'TWD'};
}
// ---------- 常用優先排序：1 XWS5 → 2 OLA／OLA6 → 3 SDG → 4 男女癌（CLZ／CLX 男女平權皆列出；性別不符標示） ----------
const PRI = code => /^XWS5/.test(code) ? 1 : /^OLA/.test(code) ? 2 : code === 'SDG' ? 3 : (code === 'CLZ' || code === 'CLX') ? 4 : 99;
const FAV = code => PRI(code) <= 3;   // 標「常用」（v1.19.1：SDG 也標常用）
// ---------- 主約／附約目錄（尚未收錄費率者：只做投保年齡／性別／職業篩選＋商品說明） ----------
const CAT = window.CATALOG || [];
const KIND = {main:'主約', rider:'附約', waiver:'豁免附約'};
function catElig(c, age, sex, occ, pAge){
  if (c.sex && c.sex !== sex) return {ok:false, why:c.sex===1?'男性專屬商品':'女性專屬商品'};
  if (c.occx && c.occx.includes(occ)) return {ok:false, why:`職業第 ${c.occx.join('、')} 類不可附加`};
  const par = c.ages.filter(x => x.who === 'parent');
  if (par.length){
    if ((pAge == null || pAge === '') && age + 15 > Math.max(...par.map(x=>x.b))) return {ok:false, why:`被保險人 ${age} 歲，父母（要保人）年齡必超過 ${Math.max(...par.map(x=>x.b))} 歲上限`};
    if (pAge == null || pAge === '') return {ok:'cond', why:`看要保人（父母）年齡 ${par.map(x=>x.a+'–'+x.b).join('、')} 歲`};
    const hit = par.some(x => pAge >= x.a && pAge <= x.b);
    return hit ? {ok:true, terms:[`要保人 ${pAge} 歲`]} : {ok:false, why:`要保人（父母）年齡需 ${par.map(x=>x.a+'–'+x.b).join('、')} 歲`};
  }
  const prim = c.ages.filter(x => !x.who);
  const hit = prim.filter(x => age >= x.a && age <= x.b);
  if (hit.length) return {ok:true, terms:hit.map(x=>x.t)};
  const kid = c.ages.filter(x => x.who === '子女' && age >= x.a && age <= x.b);
  if (kid.length) return {ok:true, terms:['以子女身分附加'], child:true};
  return {ok:false, why:'投保年齡 '+agesText(c)};
}
function agesText(c){ return c.ages.map(x => `${x.t} ${x.a}–${x.b}歲`).join('、'); }

// ---------- 主約 → 附約 可附加關係（依各附約投保規則「附加條件」整理；硬性擋下 ok:false，其餘以提醒 warn 呈現） ----------
function mInfo(code){
  code = base(code);
  const p = P.find(x => x.code === code);
  const c0 = CAT.find(x => x.code === code && x.kind === 'main');
  if (p && c0) return {code, name:p.name, cat:c0.cat, cover:c0.cover, whole:/終身/.test(c0.cover), single:false, cancer:/防癌/.test(c0.cat), ci:/重疾|重大傷病/.test(c0.cat),
    acc:/傷害/.test(c0.cat), fx:code==='FDC', noRider:/不可附加附約/.test(c0.other||'') || /不可附加附約/.test(p.note||'') ? '此主約不可附加附約' : code==='SDKA' ? 'SDKA 僅可附加 AOR、CLR' : false, v1:true};
  if (p) return {code, name:p.name, cat:p.cat, cover:p.cover, whole:/終身/.test(p.cover), single:p.modes.length===1 && p.modes[0]==='躉繳',
    cancer:false, ci:/重疾|重大傷病/.test(p.cat), acc:false, fx:false, noRider:false, v1:true};
  const c = CAT.find(x => x.code === code);
  if (!c) return null;
  return {code, name:c.name, cat:c.cat, cover:c.cover, whole:/終身/.test(c.cover), single:false, cancer:/防癌/.test(c.cat), ci:/重疾|重大傷病/.test(c.cat),
    acc:/傷害/.test(c.cat), fx:c.code==='FDC', noRider:/不可附加附約/.test(c.other||'') ? '此主約不可附加附約' : c.code==='SDKA' ? 'SDKA 僅可附加 AOR、CLR' : false, v1:false};
}
const SDGS = ['SDG','SDH','SDJ','SDN'];
// 附約 r 能否附加在主約 m 上
function riderOnMain(r, m){
  if (m.noRider) return {ok:false, why:`${m.code}：${m.noRider}`};
  if ((m.code==='SDH'||m.code==='SDN') && !['ADG','ADH','TMR','XTY','CMR','CNR','HTA'].includes(r)) return {ok:false, why:`${m.code} 僅可附加 ADG、ADH、TMR、XTY、CMR、CNR、HTA`};
  const fxR = /^FD[EFG]$/.test(r);
  if (fxR && !m.fx) return {ok:false, why:'僅可附加同幣別外幣壽險主約（FAK1、FAZ、FBO、PFA…等，本工具未收錄）'};
  if (fxR && m.code==='FDC') return {ok:false, why:'FDC 不可附加附約；FDE／FDF／FDG 可附加主約為 FAK1、FAZ、FBO、PFA…等外幣壽險（本工具未收錄）'};
  if (!fxR && m.fx) return {ok:false, why:'外幣主約只能附加同幣別外幣附約'};
  const W = () => (r==='CWR4'||r==='PCC5') ? (m.whole && !m.cancer) : true;
  switch (r){
    case 'HLR2': return m.code==='HIY1' ? {ok:true} : {ok:false, why:'限附加於 HIY1 金享福保本'};
    case 'ADN': return m.code==='LTP' ? {ok:true} : {ok:false, why:'限附加於 LTP 憶心相守'};
    case 'CWR4': case 'PCC5': return W() ? {ok:true} : {ok:false, why:'僅可附加終身型主約（不含癌症險）'};
    case 'SDL': return m.whole && !m.ci ? {ok:true} : {ok:false, why:'僅可附加終身型主約（不含重大傷病）'};
    case 'SWZ': return !m.ci && !m.cancer ? {ok:true} : {ok:false, why:'不可附加重疾／重大傷病／癌症主約'};
    case 'LTU': return m.whole ? {ok:true} : m.code==='HAC' ? {ok:true, warn:'HAC 至 95 歲不夠長，須選 HAD（至 100 歲）'} : {ok:false, why:'主約保障期間不可短於 LTU（99 歲屆滿）→ 需終身型主約'};
    case 'ADG': return !m.acc || ['AJC1','AJI'].includes(m.code) ? {ok:true} : {ok:false, why:'不得附加於傷害險主約（AJC1、AJI 除外）'};
    case 'WPH': case 'WP': case 'WPA': case 'WPF1': return m.single ? {ok:false, why:'不可附加躉繳主約'} : {ok:true};
  }
  return {ok:true};
}
// 附約 r 在目前勾選下的狀態（v1.12 依主約逐張判斷）：{ok, why, hosts:[可附加的已勾主約], hostInfo:[{code, ok, why, single}]}
// inst：已勾附約，'CODE'（不分主約）或 'CODE@HOST'（附加在某張主約）
// 實支實付／防癌實支：同一被保險人限投保一張 → 已掛 A 主約，B 主約鎖住（可改掛）
const SINGLE = {HSV:'同一被保險人限投保一張實支實付型住院醫療保險（HSV 投保規則）', HSY:'同一被保險人本公司限投保一張具自負額實支實付（HSY 投保規則）', HSW:'同一被保險人限投保一張（HSW 投保規則）'};
function riderState(r, mains, inst){
  inst = inst || [];
  if (!mains.length) return {ok:false, why:'請先勾選主約', hostInfo:[]};
  const has = (c, h) => inst.includes(c) || inst.includes(c+'@'+h);
  const hasAny = c => inst.some(x => x === c || x.startsWith(c+'@'));
  const per = mains.map(code => {
    const b = riderOnMain(r, mInfo(code));   // code 可為實例 id（XWS5#2），可附加關係看商品代號
    if (!b.ok) return {code, ok:false, why:b.why};
    if (SINGLE[r]){ const o = inst.find(x => x.startsWith(r+'@') && x !== r+'@'+code); if (o) return {code, ok:false, single:true, why:`${SINGLE[r]}，已附加於 ${lab(o.split('@')[1])}`}; }
    if (r==='TMR' && !has('ADG', code)) return {code, ok:false, why:`須同一主約（${lab(code)}）勾 ADG`};
    if (r==='FDE' && has('FDF', code)) return {code, ok:false, why:'不可與 FDF 同附一主約'};
    if (r==='FDF' && has('FDE', code)) return {code, ok:false, why:'不可與 FDE 同附一主約'};
    if (r!=='WPH' && /^WP/.test(r) && has('WPH', code)) return {code, ok:false, why:`${lab(code)} 已附加 WPH（不可再附加其他豁免附約）`};
    if (r==='WPH' && WAIVERS.some(w => w!=='WPH' && has(w, code))) return {code, ok:false, why:`${lab(code)} 已附加其他豁免附約，WPH 不可再併附`};
    return {code, ok:true, warn:b.warn};
  });
  const hosts = per.filter(x => x.ok).map(x => x.code);
  if ((r==='CMR'||r==='CNR') && hosts.length && !mains.some(c => SDGS.includes(base(c))) && !['CWR4','PCC5','HSV','HSY'].some(hasAny))
    return {ok:false, why:'須搭 SDG／SDH／SDJ／SDN 主約，或同時勾 CWR4／PCC5／HSV／HSY', hosts, hostInfo:per};
  if (!hosts.length) return {ok:false, why:per.map(x => x.why).filter((v,i,a)=>a.indexOf(v)===i).join('；'), hostInfo:per};
  const warns = per.filter(x => x.ok && x.warn).map(x => x.warn);
  return {ok:true, hosts, warns, hostInfo:per};
}

// ---------- 附約／豁免附約試算（費率：riders_rates.js，自各附約「保險費費率表」PDF 抽取，不推估） ----------
const RR = window.RIDER_RATES || {};
const RMF = {年繳:1, 半年繳:0.52, 季繳:0.262, 月繳:0.088};
const RMF_HLR2 = {年繳:1, 半年繳:0.5, 季繳:0.25, 月繳:0.08333333};   // HLR2 費率表註：半年×0.5、季×0.25、月×0.08333333
const WAIVERS = ['WP','WPA','WPF1','WPH'];
const isW = c => WAIVERS.includes(c);
// u：day＝元／日（每百元費率）、wan＝萬元、yuan＝元、unit＝單位、plan＝計劃別（限 1 單位）、usd＝萬美元、waiver＝豁免
// per：費率單位（wan 時每 per 萬元一個費率單位）
const RCFG = {
  HJK:{u:'day', min:()=>500, max:(a,o)=>o<=3?3000:2500, yrt:1},
  HKR5:{u:'day', min:()=>100, max:(a,o)=>o<=3?2000:1500},
  HLR2:{u:'day', min:(a,o)=>o===6&&a>=56?500:800, max:(a,o)=>o<=3?(a<=55?2500:2000):(a<=55?2000:1500), terms:()=>[20], mf:RMF_HLR2, hostX2:1},
  SJR1:{u:'day', min:()=>800, max:()=>3000},
  ADM:{u:'day', min:()=>500, max:()=>2000, yrt:1},
  HSV:{u:'plan', plans:(a,o)=>o<=3?[1,2,3]:[1,2], yrt:1, pn:'HSV'},
  HSY:{u:'plan', plans:()=>[1,2], yrt:1, pn:'HSY'},
  HSW:{u:'plan', plans:()=>[1,2,3], yrt:1, pn:'HSW'},
  HTA:{u:'unit', min:()=>1, max:()=>2},
  PCC5:{u:'unit', min:()=>1, max:()=>6},
  CWR4:{u:'unit', min:()=>1, max:()=>5, terms:()=>[10,15,20]},
  CWR3:{u:'unit', min:()=>1, max:a=>a<14?2:3, terms:a=>a<=60?[15,20]:[15]},
  CMR:{u:'wan', per:10, step:10, min:()=>30, max:()=>60},
  CNR:{u:'wan', per:15, step:15, min:()=>15, max:()=>15},
  SDL:{u:'wan', per:10, min:()=>30, max:()=>200, yr:1, yrt:1, def:50},
  SWZ:{u:'wan', per:1, min:()=>10, max:()=>200},
  UCR:{u:'wan', per:1, min:()=>10, max:()=>200, yr:1, yrt:1},
  ADH:{u:'wan', per:1, min:()=>10, max:()=>200, yrt:1, defMax:1},   // v1.19 骨折險預設最高可投保額（≦主約可附加額度 5 倍、累計 200 萬）
  ADG:{u:'wan', per:1, min:(a,o,m)=>a<15?(m==='月繳'?2:1):30, max:a=>a<15?200:a<=60?2000:600, yrt:1, def:100},
  TMR:{u:'wan', per:1, min:()=>3, max:()=>20, yrt:1, tmr:1, def:10},   // v1.19.1 預設 10 萬（仍 3–20 萬且 ≦ADG 保額 10%：ADG 不足 100 萬時取上限）
  ADN:{u:'wan', per:10, step:10, min:()=>100, max:()=>300, yrt:1},
  LTU:{u:'yuan', per:10000, step:1000, min:()=>3000, max:()=>25000},
  FDE:{u:'usd', step:0.1, min:()=>1, max:()=>10, terms:()=>[20]},
  FDF:{u:'usd', step:0.1, min:()=>1, max:()=>10, terms:()=>[20]},
  FDG:{u:'usd', step:0.1, min:()=>1, max:()=>10, terms:()=>[20]},
  WP:{u:'waiver'}, WPA:{u:'waiver', parent:1}, WPF1:{u:'waiver', parent:1}, WPH:{u:'waiver'},
};
const RUNIT = {day:'元／日', wan:'萬元', yuan:'元', unit:'單位', usd:'萬美元'};
const RPER = c => { const g = RCFG[c]; return g.u==='day'?'每百元日額':g.u==='unit'?'每單位':g.u==='plan'?'每 1 單位（計劃別）':g.u==='usd'?'每萬美元':g.u==='yuan'?'每萬元保額':g.u==='waiver'?'每萬元投保金額（應繳保費）':g.tmr?'前 3 萬＋每加 1 萬':`每${g.per===1?'':g.per}萬元`; };
function rTable(code, q, renew){
  const R = RR[code]; if (!R) return null;
  const parts = R.kf.map(k => k==='sex' ? q.sex : k==='occ' ? q.occ : k==='plan' ? q.plan : k==='term' ? q.term : k==='yr' ? (renew?'r':'f') : '');
  const T = (renew && R.renew) ? R.renew : R.t;
  const row = T[parts.join('|')]; if (!row) return null;
  if (R.flat) return row[1][0];
  const v = row[1][q.age - row[0]];
  return v == null ? null : v;
}
// ---------- 主約「換算附約可附加額度」（萬元）：各主約投保規則「附加附約」欄 ----------
// ×1：XWS5、OLA6、XDY、AJC1、AJI、CLX、CLZ、SDG/SDH/SDN/SDJ/SDKA、SWB5、LTP、HTB；×70：XDN2；×100：LTS、LTQ、LTT；
// 日額型醫療：日額 ×100；SIE：保額 ×100；HAC／HAD：計劃 1／2／3 ＝ 10／20／30 萬
const CAPCO = {XWS5:1, OLA6:1, XDY:1, AJC1:1, AJI:1, CLX:1, CLZ:1, SDG:1, SDH:1, SDN:1, SDJ:1, SDKA:1, SWB5:1, LTP:1, HTB:1, XDN2:70, LTS:100, LTQ:100, LTT:100};
const LTC_WHOLE = ['LTS','LTQ'];   // 長期照顧終身型主約（LTU：≦主約保額 2 倍）
function capOf(p, s){
  if (!p || !s) return null;
  const sum = +s.sum;
  if (p.code==='HAC'){ const n = +String(s.plan||'').slice(-1); return [10,20,30][n-1] ? {wan:[10,20,30][n-1], txt:`${s.plan} 可附加額度 ${[10,20,30][n-1]} 萬`} : null; }
  if (!(sum > 0)) return null;
  if (p.unit==='day' && /醫療/.test(p.cat) && p.code!=='SWI') return {wan: sum*100/10000, txt:`${p.code} 日額 ${sum.toLocaleString()} 元 ×100`};
  if (p.code==='SIE') return {wan: sum*100/10000, txt:`SIE ${sum.toLocaleString()} 元 ×100`};
  if (p.unit==='wan' && p.code in CAPCO) return {wan: Math.round(sum*CAPCO[p.code]*100)/100, txt:`${p.code} ${sum.toLocaleString()} 萬${CAPCO[p.code]!==1?' ×'+CAPCO[p.code]:''}`};
  return null;
}
// 附約保額上限受主約額度限制（硬性擋下）：回傳 {max, why}；cap＝capOf 結果
function capRule(code, cap, hostCode){
  if (!cap) return null;
  const W = cap.wan;
  if (code==='ADH') return {max: Math.floor(W*5+1e-9), why:`≦主約保額（可附加額度）5 倍：${cap.txt}＝${W.toLocaleString()} 萬 ×5`};
  if (code==='SDL') return {max: Math.max(50, Math.floor(W+1e-9)), why:`超過 50 萬須 ≦主約可附加額度：${cap.txt}＝${W.toLocaleString()} 萬`};
  if (code==='LTU') return LTC_WHOLE.includes(hostCode)
    ? {max: Math.floor(W/100*10000*2+1e-9), why:`附長照終身型主約 ≦主約保額 2 倍：${hostCode} ${(W/100).toLocaleString()} 萬 ×2`}
    : {max: Math.floor(W*10000/10/1000+1e-9)*1000, why:`保額 ×10 ≦主約可附加額度：${cap.txt}＝${W.toLocaleString()} 萬`};
  return null;
}
const CAPPED = ['ADH','SDL','LTU'];
// 累計本險種最高保額（各附約投保規則）：同一附約掛在兩張主約時，兩張合計 ≦ 最高保額；others＝另一主約已投保額
function cumRule(code, age, occ, mode, others, capR){
  const g = RCFG[code]; if (!g || !g.max || !(others > 0)) return capR;
  const mx = g.max(age, occ, mode), u = RUNIT[g.u];
  const c = {max: Math.round((mx - others)*100)/100, why:`累計本險種最高 ${mx.toLocaleString()} ${u}，前一張主約已附加 ${others.toLocaleString()} ${u}`};
  return !capR || c.max < capR.max ? c : capR;
}
function rLim(code, age, occ, mode, hostSum, capR){
  const g = RCFG[code]; if (!g) return null;
  const L = {u:g.u, terms:g.terms ? g.terms(age) : null, plans:g.plans ? g.plans(age, occ) : null};
  if (g.min){ L.min = g.min(age, occ, mode); L.max = g.max(age, occ, mode); L.step = g.step || (g.u==='day'?100:1); }
  if (g.hostX2 && hostSum != null) L.max = Math.min(L.max, hostSum*2);        // HLR2 ≦ 主約日額 2 倍
  if (g.tmr && hostSum != null) L.max = Math.min(L.max, Math.floor(hostSum*0.1)); // TMR ≦ ADG 保額 10%
  if (capR && L.max != null && capR.max < L.max){ L.max = capR.max; L.capWhy = capR.why; }
  return L;
}
// q：{age, sex, occ, plan, term, sum, mode, payDisc, covered(豁免：被豁免保費年繳合計), hostSum}
function rQuote(code, q){
  const g = RCFG[code], R = RR[code];
  if (!g || !R) return {errs:['此附約費率尚未收錄']};
  const errs = [], L = rLim(code, q.age, q.occ, q.mode, q.hostSum, q.capR);
  if (L.capWhy && L.max < L.min) return {errs:[`額度不足，無法附加：${L.capWhy}＝${L.max.toLocaleString()} ${RUNIT[g.u]}，低於最低 ${L.min.toLocaleString()} ${RUNIT[g.u]}`]};
  if (L.plans && !L.plans.includes(+q.plan)) errs.push(`此職業類別可選計劃：${L.plans.map(p=>g.pn+p).join('、')}`);
  if (L.terms && !L.terms.includes(+q.term)) errs.push(`此年齡可選年期：${L.terms.join('／')} 年`);
  let units;
  if (g.u === 'waiver'){
    if (q.covered == null) return {errs:[q.coverWhy || '無法計算被豁免保費']};
    units = q.covered / 10000;
  } else if (g.u === 'plan') units = 1;
  else {
    const S = +q.sum;
    if (!(S >= L.min - 1e-9)) errs.push(`保額低於最低 ${L.min.toLocaleString()} ${RUNIT[g.u]}`);
    if (!(S <= L.max + 1e-9)) errs.push(`保額超過上限 ${L.max.toLocaleString()} ${RUNIT[g.u]}` + (g.hostX2 && q.hostSum!=null ? `（≦主約日額 ${q.hostSum.toLocaleString()} × 2）` : g.tmr && q.hostSum!=null ? `（≦ADG ${q.hostSum} 萬 × 10%）` : L.capWhy ? `（${L.capWhy}）` : ''));
    if (Math.abs(Math.round(S/L.step)*L.step - S) > 1e-6) errs.push(`保額需以 ${L.step.toLocaleString()} ${RUNIT[g.u]} 為單位`);
    units = g.u==='day' ? S/100 : g.u==='yuan' ? S/g.per : g.u==='usd' ? S : g.u==='unit' ? S : g.tmr ? 1 : S/g.per;
  }
  if (errs.length) return {errs};
  let rate = rTable(code, q);
  if (rate == null) return {errs:[R.kf.includes('occ') && q.age <= 14 && q.occ > 1 ? '費率表 14 歲（含）以下只有職業第 1 類費率' : `查無費率（${q.age} 歲${g.parent?'（要保人）':''}此組合不在費率表內）`]};
  let rateTxt = rate;
  if (g.tmr){ const add = R.add[String(q.occ)]; rateTxt = `${rate}＋${add}×${(+q.sum-3)}`; rate = rate + add*(+q.sum-3); }
  const annual = Math.round(units * rate * 10 + 1e-7) / 10;
  const f = (g.mf || RMF)[q.mode] || 1;
  const modal = Math.round(annual * f + 1e-7);
  const bp = q.payDisc ? 100 : 0;   // 繳費方式 1%＝總應收保費（主約＋附約）1%，依主約保費規定
  const paid = Math.round(modal * (10000 - bp) / 10000 + 1e-7);
  const n = {年繳:1,躉繳:1,半年繳:2,季繳:4,月繳:12}[q.mode] || 1;
  const out = {rate, rateTxt, units, annual, modal, paid, bp, n, firstYear: paid*n, cur: g.u==='usd' ? 'USD' : 'TWD'};
  if (g.yr || R.renew){ const rn = rTable(code, Object.assign({}, q, {age:q.age+1}), true); if (rn != null) out.renew = Math.round(units*rn*10+1e-7)/10; }
  return out;
}

// ---------- 通則（投保規定 115.09.30 一、(二)3.(3) 一般身分累計最高住院醫療日額） ----------
// 累計人壽保險保額＜30 萬 → 醫療險附約 ≦4,000；30～100 萬(含) ≦5,000；101～200 萬(含) ≦6,000；＞200 萬 ≦8,000；醫療險主約＋附約 ≦8,000
// 人壽保險保額＝壽險主約＋壽險附約＋重大疾病險（面額 × 「附加附約之人壽保險保額係數」，通算保額係數一覽表 115.09.30）
const LIFECO = {XWS5:1, OLA6:1, XDY:1, LTS:100, SDG:1, SDH:1, SDJ:1, SDKA:1, SWB5:1, SWD1:1, SWW:1};
const MEDDAY = ['HJK','HKR5','HLR2'];   // 以元／日投保之住院醫療附約（HSV／HSY／HSW 計劃型不在此計算）
// v1.22：手術醫療險另計（險種附表 115.09.30 捌、各型手術醫療險附表）：SIE、SJR1 等以保額 1 倍計，累計總保額 ≦3,000 元；
// 有效壽險累計通算保額＞200 萬且職業 1、2 類 ≦4,000 元。不計入住院醫療日額上限。
const SURG = {SIE:1, SJR1:1};
const surgCap = (lifeW, occ) => (lifeW > 200 && occ <= 2) ? 4000 : 3000;
function surgCheck(lifeW, occ, items){
  const cap = surgCap(lifeW, occ), t = items.reduce((a,x)=>a+x[1],0);
  return {cap, t, errs: t > cap ? [`險種附表：手術醫療險（SIE、SJR1 等）累計總保額 ≦${cap.toLocaleString()} 元${cap===4000?'（壽險＞200 萬且職業 1、2 類）':'（壽險＞200 萬且職業 1、2 類可 4,000 元）'}；目前 ${items.map(x=>x[0]+' '+x[1].toLocaleString()).join('＋')}＝${t.toLocaleString()} 元`] : []};
}
function medRiderCap(lifeWan){ return lifeWan < 30 ? 4000 : lifeWan <= 100 ? 5000 : lifeWan <= 200 ? 6000 : 8000; }
// 特定身分（投保規定 115.09.30 一、(二)3.(4)）：kid＝孩童／學生、home＝家管／退休人士／無業／待業；仍需符合 (3) 一般身分 → 取兩者較小
// 孩童／學生 0～5 歲(含)：附約 ≦4,000、主約＋附約 ≦4,000；6 歲以上：壽險 ≦200 萬 4,000／6,000、＞200 萬 6,000／6,000
// 家管／退休／無業／待業：壽險 ≦200 萬 4,000／4,000、＞200 萬 6,000／6,000
// ※ 孩童／學生比照父母或兄弟姊妹有效保單同額（par）：附約 ≦4,000、主約＋附約 ≦6,000
function specCaps(spec, age, lifeWan){
  if (!spec || !spec.on || !spec.id) return null;
  let r, t, lbl;
  if (spec.id === 'kid'){
    if (spec.par){ r = 4000; t = 6000; lbl = '孩童／學生（比照父母／兄弟姊妹保單）'; }
    else if (age <= 5){ r = 4000; t = 4000; lbl = '孩童／學生 0～5 歲'; }
    else if (lifeWan <= 200){ r = 4000; t = 6000; lbl = '孩童／學生 6 歲以上、壽險 ≦200 萬'; }
    else { r = 6000; t = 6000; lbl = '孩童／學生 6 歲以上、壽險 ＞200 萬'; }
  } else {
    if (lifeWan <= 200){ r = 4000; t = 4000; lbl = '家管／退休／無業／待業、壽險 ≦200 萬'; }
    else { r = 6000; t = 6000; lbl = '家管／退休／無業／待業、壽險 ＞200 萬'; }
  }
  return {r, t, lbl};
}
function medCheck(lifeWan, riderDays, mainDays, spec, age){
  const gcap = medRiderCap(lifeWan), sp = specCaps(spec, age, lifeWan), errs = [], merrs = [];
  const cap = sp ? Math.min(gcap, sp.r) : gcap, tcap = sp ? Math.min(8000, sp.t) : 8000;
  const rt = riderDays.reduce((a,x)=>a+x[1],0), mt = mainDays.reduce((a,x)=>a+x[1],0);
  const band = lifeWan < 30 ? '＜30 萬' : lifeWan <= 100 ? '30～100 萬' : lifeWan <= 200 ? '101～200 萬' : '＞200 萬';
  const who = sp ? `特定身分 ${sp.lbl}` : `累計人壽保險保額 ${lifeWan.toLocaleString()} 萬（${band}）`;
  if (rt > cap) errs.push(`通則：${who}${sp?`（壽險 ${lifeWan.toLocaleString()} 萬）`:''} → 醫療險附約住院日額累計 ≦${cap.toLocaleString()} 元；目前 ${riderDays.map(x=>x[0]+' '+x[1].toLocaleString()).join('＋')}＝${rt.toLocaleString()} 元`);
  if (rt && rt + mt > tcap) errs.push(`通則：${sp?who+' → ':''}醫療險主約＋附約累計住院日額 ≦${tcap.toLocaleString()} 元；目前 ${[...mainDays, ...riderDays].map(x=>x[0]+' '+x[1].toLocaleString()).join('＋')}＝${(rt+mt).toLocaleString()} 元`);
  if (mt > tcap) merrs.push(`通則：${sp?who+' → ':''}醫療險主約＋附約累計住院日額 ≦${tcap.toLocaleString()} 元；目前醫療主約 ${mainDays.map(x=>x[0]+' '+x[1].toLocaleString()).join('＋')}＝${mt.toLocaleString()} 元`);
  return {cap, tcap, gcap, sp, errs, merrs, rt, mt};
}
// ---------- v1.16 關鍵字即時搜尋：代號／中文名／類別＋英文關鍵字（大小寫、全半形不拘；空白分隔＝全部都要符合） ----------
const EN = [[/防癌|癌/, 'cancer'], [/重大傷病|重疾|重大疾病|特定傷病/, 'critical illness ci dread disease'], [/實支實付|實支/, 'reimbursement expense actual'], [/醫療|住院/, 'medical hospital health'], [/手術/, 'surgery'], [/醫材/, 'device'], [/傷害|意外/, 'accident injury'], [/骨折/, 'fracture bone'], [/壽險/, 'life'], [/終身/, 'whole lifetime'], [/長照|長期照顧/, 'ltc long-term care'], [/豁免/, 'waiver premium'], [/外幣|美元/, 'usd foreign dollar'], [/定期|一年期/, 'term'], [/失能/, 'disability'], [/主約/, 'main base plan'], [/附約|附加條款/, 'rider']];
const norm = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[\s　]+/g, ' ').trim();
function hayOf(code, name, cat, kind){ const zh = [code, name, cat, kind].join(' '); return norm(zh + ' ' + EN.filter(([re]) => re.test(zh)).map(x => x[1]).join(' ')); }
function qMatch(h, q){ const t = norm(q).split(' ').filter(Boolean); return !t.length || t.every(w => norm(h).includes(w)); }
const HAY = {};
for (const c of CAT) HAY[c.code] = hayOf(c.code, c.name, c.cat, KIND[c.kind]);
for (const p of P) HAY[p.code] = hayOf(p.code, p.name, p.cat + ' ' + ((CAT.find(c => c.code === p.code) || {}).cat || ''), '主約');
const qHit = (code, q) => qMatch(HAY[base(code)] || base(code), q);
window.QuoteEngine = {surgCheck, surgCap, SURG, MEDDAY, norm, qMatch, qHit, HAY, base, lab, inum, DUPMAX, SINGLE, cumRule, quote, medCheck, medRiderCap, specCaps, LIFECO, limits, termsFor, eligible, catElig, PRI, riderOnMain, riderState, mInfo, rQuote, rLim, RCFG, capOf, capRule};
if (typeof document === 'undefined') return;
document.title = '富邦四季春快速報價';
const _h1=document.querySelector('header h1'); if(_h1) _h1.textContent='富邦四季春快速報價';
const _sub=document.querySelector('header .sub'); if(_sub && !/v1\.22/.test(_sub.textContent)) _sub.textContent='v1.22｜富邦四季春快速報價｜SJR1 改計手術險累計・CLX／CLZ 10/22 停售｜僅供內部試算，以公司正式建議書為準';

// ---------- UI ----------
const $ = s => document.querySelector(s);
const st = {spec:{on:false, id:null, par:false}, age:30, sex:1, occ:1, pAge:null, pSex:1, open:null, sel:{}, rsel:{}, mains:[], riders:{}, dropped:[], gopen:{}, fold:{}, multi:false};
try { const o = JSON.parse(localStorage.getItem('fbq2')||'{}'); Object.assign(st, o, {open:null, dropped:[], fold:{}}); st.gopen = st.gopen || {}; st.rsel = st.rsel || {}; st.pSex = st.pSex || 1; st.spec = st.spec || {on:false, id:null, par:false}; } catch(e){}
// v1.17 預設單張主約模式；舊資料已有兩張以上主約 → 自動開啟第二張模式
if ((st.mains||[]).length > 1) st.multi = true;
// v1.12：附約逐張主約附加 st.riders＝{附約:[主約…]}、st.rsel 以 '附約@主約' 為鍵（舊版 {附約:主約} 自動轉換）
for (const [c, h] of Object.entries(st.riders || {})){ if (!Array.isArray(h)){ st.riders[c] = h ? [h] : []; if (h && st.rsel[c] && !st.rsel[c+'@'+h]) st.rsel[c+'@'+h] = st.rsel[c]; } }
const save = () => localStorage.setItem('fbq2', JSON.stringify({age:st.age,sex:st.sex,occ:st.occ,pAge:st.pAge,pSex:st.pSex,lifeEx:st.lifeEx,spec:st.spec,mains:st.mains,riders:st.riders,sel:st.sel,rsel:st.rsel,gopen:st.gopen,multi:!!st.multi}));
const riderCodes = () => Object.keys(st.riders);
const attached = c => st.riders[c] || [];
const instList = () => Object.entries(st.riders).flatMap(([c, hs]) => hs.map(h => [c, h]));
const instKeys = () => instList().map(([c, h]) => c+'@'+h);
const splitK = k => k.split('@');
function addInst(c, h){ const a = st.riders[c] || (st.riders[c] = []); if (!a.includes(h)) a.push(h); if (!st.rsel[c+'@'+h] && st.rsel[c]) st.rsel[c+'@'+h] = Object.assign({}, st.rsel[c]);
  // v1.19：計劃型附約（HSV1／2／3、HSY、HSW）改掛／換主約後沿用最後選的計劃（原本會掉回計劃 1）
  if (RCFG[c] && RCFG[c].u === 'plan'){ const pl = lastPlan(c); if (pl != null) (st.rsel[c+'@'+h] || (st.rsel[c+'@'+h] = {})).plan = pl; } }
function lastPlan(c){ if (st.rsel[c] && st.rsel[c].plan != null) return +st.rsel[c].plan; const k = Object.keys(st.rsel).find(x => x.startsWith(c+'@') && st.rsel[x] && st.rsel[x].plan != null); return k ? +st.rsel[k].plan : null; }
function delInst(c, h){ const a = (st.riders[c] || []).filter(x => x !== h); if (a.length) st.riders[c] = a; else delete st.riders[c]; }
function moveInst(c, from, to){ const a = st.riders[c] || []; st.riders[c] = a.map(x => x === from ? to : x).filter((v,i,z)=>z.indexOf(v)===i); if (st.rsel[c+'@'+from]){ st.rsel[c+'@'+to] = Object.assign({}, st.rsel[c+'@'+from]); } }   // v1.19.1 複製而非共用同一物件
const termTxt = t => t==0?'躉繳':t==1?'一年期':t+'年';
// 通則醫療日額檢查（UI）：累計人壽保險保額＝已勾主約（LIFECO）＋①區「既有有效壽險保額」
const pOf = id => P.find(x => x.code === base(id));
const sibs = id => st.mains.filter(x => base(x) === base(id));             // 同商品各張（依勾選順序）
function renum(code){   // 同商品各張重新編號為 CODE、CODE#2…（附約掛載與設定跟著搬）
  const ids = st.mains.filter(x => base(x) === code), want = ids.map((x, i) => i ? code+'#'+(i+1) : code);
  if (ids.every((x, i) => x === want[i])) return;
  const mp = {}; ids.forEach((x, i) => mp[x] = want[i]);
  const sel = {}; ids.forEach(x => { if (st.sel[x]) sel[mp[x]] = st.sel[x]; }); ids.forEach(x => delete st.sel[x]); Object.assign(st.sel, sel);
  st.mains = st.mains.map(x => mp[x] || x);
  for (const c of Object.keys(st.riders)) st.riders[c] = st.riders[c].map(h => mp[h] || h);
  const rs = {}; for (const k of Object.keys(st.rsel)){ const [c, h] = k.split('@'); if (h && mp[h]){ rs[c+'@'+mp[h]] = st.rsel[k]; delete st.rsel[k]; } } Object.assign(st.rsel, rs);
}
function addDup(code){   // 同商品再投保一張
  st.multi = true;
  const p = P.find(x => x.code === code); if (!p) return null;
  if (!st.mains.includes(code)) { st.mains.push(code); return code; }
  const n = sibs(code).length; if (n >= DUPMAX(code)) { alert(`${code} 本工具最多 ${DUPMAX(code)} 張`); return null; }
  const id = code+'#'+(n+1), s0 = st.sel[code] || {};
  st.sel[id] = {term:s0.term, mode:s0.mode, payDisc:s0.payDisc, plan:s0.plan};
  st.mains.push(id); st.mshow = false; return id;
}
function lifeWan(){
  let w = +st.lifeEx || 0; const parts = st.lifeEx ? [`既有 ${st.lifeEx} 萬`] : [];
  for (const c of st.mains){ const p = pOf(c); if (!p || !(base(c) in LIFECO)) continue; const {s, r} = qOf(p, c); if (r.errs) continue; const v = (+s.sum) * LIFECO[base(c)]; w += v; parts.push(`${lab(c)} ${v.toLocaleString()} 萬`); }
  return {w: Math.round(w*100)/100, parts};
}
function surgState(){
  const it = [];
  for (const [rc, h] of instList()) if (SURG[rc] && !P.some(p=>p.code===rc)){ const d = rDefaults(rc, h); if (d && d.q.sum) it.push([attached(rc).length > 1 ? `${rc}(${lab(h)})` : rc, +d.q.sum * SURG[rc]]); }
  for (const c of st.mains){ const p = pOf(c); if (p && SURG[p.code]){ const s = defaultsFor(p, c); if (s.sum) it.push([lab(c), +s.sum * SURG[p.code]]); } }
  const L = lifeWan(); const m = surgCheck(L.w, st.occ, it); m.life = L; m.items = it; return m;
}
function medState(){
  const rd = [], md = [];
  for (const [rc, h] of instList()) if (MEDDAY.includes(rc)){ const d = rDefaults(rc, h); if (d && d.q.sum) rd.push([attached(rc).length > 1 ? `${rc}(${lab(h)})` : rc, +d.q.sum]); }
  for (const c of st.mains){ const p = pOf(c); if (p && isMedMain(p)){ const s = defaultsFor(p, c); md.push([lab(c), +s.sum]); } }
  const L = lifeWan(); const m = medCheck(L.w, rd, md, st.spec, st.age); m.life = L; return m;
}

function insAge(bd){
  const b = new Date(bd), t = new Date();
  let y = t.getFullYear()-b.getFullYear(), m = t.getMonth()-b.getMonth(), d = t.getDate()-b.getDate();
  if (d < 0) m -= 1; if (m < 0) { y -= 1; m += 12; }
  const extra = (m > 6 || (m === 6 && d > 0)) ? 1 : 0;   // 零數超過六個月加一歲
  return y + extra;
}
function defaultsFor(p, id){
  id = id || p.code;
  const s = st.sel[id] || {};
  const plan = p.plans ? (s.plan || 'HAC1') : p.code;
  const terms = termsFor(p, st.age, plan);
  const hsv = !!p.minHSV && hsvOn(id);   // 只有 HSV 實際附加於此主約（這一張）才算
  const [mn, mx] = limits(p, st.age, st.occ, hsv);
  let term = terms.includes(s.term) ? s.term : terms[terms.length-1];
  let sum = s.sum != null ? s.sum : (p.unit==='day' ? Math.min(Math.max(1000,mn),mx) : p.soft || mn);
  const mode = p.modes.includes(s.mode) ? s.mode : p.modes[0];
  // 同商品第 2 張起：累計本險種最高保額扣掉排在前面的各張
  let cumOther = 0; const sb = sibs(id), ix = sb.indexOf(id);
  if (ix > 0) for (const o of sb.slice(0, ix)){ const so = st.sel[o] || {}; cumOther += so.sum != null ? +so.sum || 0 : (p.unit==='day' ? Math.min(Math.max(1000,mn),mx) : p.soft || mn); }
  if (s.sum == null && cumOther > 0 && sum > mx - cumOther) sum = Math.max(mn, Math.round((mx - cumOther)*100)/100);
  return Object.assign({plan, term, sum, mode, hsv, payDisc: s.payDisc !== false, cumOther}, {terms});
}
const isMedMain = p => p.unit==='day' && /醫療/.test(p.cat);
let _medG = false;
function mainMed(p, r, id){   // 醫療主約日額本身已超過（特定身分）主約＋附約上限 → 硬性擋
  if (!r.errs && !_medG && SURG[p.code] && st.mains.includes(id || p.code)){ _medG = true; try { const m = surgState(); if (m.errs.length) return {errs:m.errs}; } finally { _medG = false; } }
  if (r.errs || _medG || !isMedMain(p) || !st.mains.includes(id || p.code)) return r;
  _medG = true; try { const m = medState(); if (m.merrs.length) return {errs:m.merrs}; } finally { _medG = false; }
  return r;
}
const qOf = (p, id) => { const s = defaultsFor(p, id); return {s, r:mainMed(p, quote(p, Object.assign({age:st.age, sex:st.sex, occ:st.occ}, s)), id)}; };

// 合格判斷（主約／附約共用）
function mainOk(code){ code = base(code); const p = P.find(x=>x.code===code); if (p) return pEl(p).ok; const c = CAT.find(x=>x.code===code); return !!c && c.kind==='main' && !!catElig(c, st.age, st.sex, st.occ, st.pAge).ok; }
function riderOk(code){ const c = CAT.find(x=>x.code===code); return !!c && c.kind!=='main' && !!catElig(c, st.age, st.sex, st.occ, st.pAge).ok; }
// 條件改變後清掉不合格的勾選；再清掉失去可附加主約的附約
function prune(){
  const drop = [];
  st.mains = st.mains.filter(c => mainOk(c) || (drop.push(lab(c)), false));
  for (const c of [...new Set(st.mains.map(base))]) renum(c);
  for (let pass = 0; pass < 3; pass++) for (const r of riderCodes()){
    if (!riderOk(r)){ delete st.riders[r]; drop.push(r); continue; }
    for (const h of [...attached(r)]){
      const rs = riderState(r, st.mains, instKeys().filter(k => k !== r+'@'+h));
      const hi = (rs.hostInfo || []).find(x => x.code === h);
      if (hi && hi.ok) continue;
      // 這張主約不能掛了：若此附約只有這一筆 → 改掛到第一張可附加主約（保留設定）；否則取消這一筆
      const alt = (rs.hosts || []).filter(x => !attached(r).includes(x));
      if (attached(r).length === 1 && alt.length) moveInst(r, h, alt[0]);
      else { delInst(r, h); if (!st.riders[r]) drop.push(r); }
    }
  }
  if (drop.length) st.dropped = [...new Set(drop)];
}

// ---------- 附約試算（UI 端）：附約繳別／繳費方式折扣跟著所附加的主約 ----------
const rSel = (code, host) => st.rsel[code+'@'+host] || (st.rsel[code+'@'+host] = st.rsel[code] ? Object.assign({}, st.rsel[code]) : {});
// 先附加的主約上同一附約的保額合計（累計本險種）：先掛的那張用滿額度，後掛的只能用剩餘額度
function rOthers(code, host){
  const g = RCFG[code]; if (!g || !g.min) return 0;
  let t = 0;
  for (const h of attached(code)){ if (h === host) break; const s = st.rsel[code+'@'+h] || {}; t += s.sum != null ? +s.sum || 0 : g.defMax ? (+rDefaults(code, h).q.sum || 0) : (g.def != null ? g.def : g.u==='day' ? 1000 : g.min(st.age, st.occ, '年繳')); }
  return t;
}
function rDefaults(code, host){
  const g = RCFG[code]; if (!g) return null;
  if (host == null) host = attached(code)[0];
  const s = rSel(code, host);
  const hp = host ? pOf(host) : null, hs = hp ? defaultsFor(hp, host) : null;
  const mode = hp ? hs.mode : (RMF[s.mode] ? s.mode : '年繳');
  const payDisc = hp ? !!(hp.pay && hs.payDisc) : false;
  let hostSum = null;
  if (g.hostX2 && hp && hp.unit==='day') hostSum = +hs.sum;
  if (g.tmr && attached('ADG').includes(host)){ const a = st.rsel['ADG@'+host]; hostSum = a && a.sum != null ? +a.sum : RCFG.ADG.def; }
  let capR = CAPPED.includes(code) ? capRule(code, capOf(hp, hs), base(host)) : null;
  capR = cumRule(code, st.age, st.occ, mode, rOthers(code, host), capR);
  const L = rLim(code, st.age, st.occ, mode, hostSum, capR);
  const q = {age:st.age, sex:st.sex, occ:st.occ, mode, payDisc, hostSum, capR};
  if (L.plans) q.plan = L.plans.includes(+s.plan) ? +s.plan : L.plans[0];
  if (L.terms) q.term = L.terms.includes(+s.term) ? +s.term : L.terms[L.terms.length-1];
  if (L.min != null){ const d = g.defMax ? (capR ? L.max : L.min) : g.def != null ? g.def : g.u==='day' ? 1000 : L.min; q.sum = s.sum != null ? s.sum : Math.max(Math.min(Math.max(d, L.min), L.max), L.min); }
  if (g.parent){ q.age = st.pAge; q.sex = st.pSex || 1; }
  return {q, L, hp, hs, host};
}
// 豁免附約：投保金額＝所附主約＋該主約其他附約（不含豁免）之應繳保費；年期＝主約繳費年期
function rCover(host){
  const hp = pOf(host);
  if (!hp) return {why:`${lab(host)} 保費待試算（主約費率整理中），無法計算豁免保費`};
  const {s, r} = qOf(hp, host);
  if (r.errs) return {why:`${lab(host)} 設定不符，先修正主約`};
  if (hp.cur === 'USD') return {why:`${lab(host)} 為美元保單，台幣豁免附約不適用`};
  let tot = r.annual; const parts = [`${lab(host)} ${fmt(r.annual)}`];
  for (const [rc, h] of instList()){
    if (h !== host || isW(rc) || !RCFG[rc] || RCFG[rc].u==='usd') continue;
    const x = rCalc(rc, h); if (x.r.errs) return {why:`${rc} 設定不符，先修正附約`};
    tot += x.r.annual; parts.push(`${rc} ${fmt(x.r.annual)}`);
  }
  return {covered: Math.round(tot*10)/10, term: s.term, parts};
}
function rCalc(code, host){
  const d = rDefaults(code, host); if (!d) return {r:{errs:['此附約費率尚未收錄']}};
  const {q} = d;
  if (isW(code)){
    if (RCFG[code].parent && (st.pAge == null || st.pAge === '')) return {d, r:{errs:['請在第①區填「要保人（父母）年齡」與性別']}};
    const c = rCover(d.host);
    if (c.why) return {d, r:{errs:[c.why]}};
    q.covered = c.covered;
    if (code === 'WP'){ const k = {10:'10',15:'15',20:'20',25:'25',30:'30'}[c.term]; if (!k) return {d, r:{errs:[`WP 費率只有主約繳費 10／15／20／25／30 年（及 55／60／65 歲滿期、終身繳），${lab(d.host)} 目前 ${c.term} 年`]}}; q.term = k; }
    else { if (!(c.term >= 3 && c.term <= 30)) return {d, r:{errs:[`${code} 限主約繳費 3–30 年，${lab(d.host)} 目前 ${c.term} 年`]}}; q.term = c.term; }
    d.cover = c;
  }
  const r = rQuote(code, q);
  if (!r.errs && SURG[code]){ const m = surgState(); if (m.errs.length) return {d, r:{errs:m.errs}}; }
  if (!r.errs && MEDDAY.includes(code)){ const m = medState(); if (m.errs.length) return {d, r:{errs:m.errs.map(e => e + `（累計壽險：${m.life.parts.join('＋')||'無'}；可在①區填既有壽險保額）`)}}; }
  return {d, r};
}
function rctl(code, host){
  const g = RCFG[code]; if (!g || !RR[code]) return '';
  const {d, r} = rCalc(code, host); if (!d) return '';
  const {q, L, hp} = d, K = code+'@'+d.host;
  let h = '<div class="rctl">';
  if (L.plans) h += `<div class="chips">${L.plans.map(p=>`<button class="chip${p===q.plan?' on':''}" data-rk="plan" data-r="${K}" data-v="${p}">${g.pn}${p}</button>`).join('')}</div>`
    + (st.rsel[K] && st.rsel[K].plan != null && +st.rsel[K].plan !== q.plan ? `<div class="lim">⚠ 職業第 ${st.occ} 類不可選 ${g.pn}${st.rsel[K].plan}，目前以 ${g.pn}${q.plan} 試算</div>` : '');
  if (L.terms && L.terms.length > 1) h += `<div class="chips">${L.terms.map(t=>`<button class="chip${t===q.term?' on':''}" data-rk="term" data-r="${K}" data-v="${t}">${t} 年繳</button>`).join('')}</div>`;
  if (L.min != null){
    const fixed = L.min === L.max;
    h += `<div class="sumrow">${fixed?'':`<button class="pm" data-rk="sumd" data-r="${K}" data-v="-1">−</button>`}<input data-rsum="${K}" type="number" inputmode="decimal" step="${L.step}" value="${q.sum}" ${fixed?'readonly':''}><span class="unit">${RUNIT[g.u]}</span>${fixed?'':`<button class="pm" data-rk="sumd" data-r="${K}" data-v="1">＋</button>`}</div>`
      + `<div class="lim">${fixed?'固定':''}${fixed?L.min.toLocaleString():L.min.toLocaleString()+'–'+L.max.toLocaleString()} ${RUNIT[g.u]}${L.step>1&&!fixed?`（每 ${L.step.toLocaleString()}）`:g.u==='usd'?'（以千美元為單位）':''}${L.capWhy?`<br>🔒 上限 ${L.max.toLocaleString()} ${RUNIT[g.u]}：${L.capWhy}`:''}</div>`;
  }
  if (!hp && !isW(code)) h += `<div class="chips">${Object.keys(RMF).map(m=>`<button class="chip${m===q.mode?' on':''}" data-rk="mode" data-r="${K}" data-v="${m}">${m}</button>`).join('')}</div>`;
  if (r.errs) h += `<div class="err">⛔ ${r.errs.join('<br>⛔ ')}</div>`;
  else {
    const cur = r.cur==='USD' ? 'US$ ' : 'NT$ ';
    h += `<div class="rres"><b>${cur}${fmt(r.paid)}</b> <small>${q.mode}${q.mode!=='年繳'?'每期':''}${r.bp?'（含繳費方式 1%）':''}</small><span>年繳 ${fmt(r.annual)}｜費率 ${typeof r.rateTxt==='number'?r.rateTxt.toLocaleString():r.rateTxt} ${r.cur==='USD'?'美元':'元'}／${RPER(code)}${g.parent?`｜要保人 ${q.age} 歲${q.sex==1?'男':'女'}`:''}${isW(code)?`｜${q.term} 年期`:''}</span></div>`;
    if (isW(code) && d.cover) h += `<div class="rn">投保金額＝${d.cover.parts.join('＋')}＝${fmt(d.cover.covered)} 元（年繳應繳保費）；豁免保費依費率表×投保金額推算，請以建議書核對。</div>`;
    if (r.renew != null) h += `<div class="rn">一年期：明年續保（${st.age+1} 歲${code==='HSW'?'，續保費率表':''}）年繳約 ${fmt(r.renew)}${r.cur==='USD'?' 美元':' 元'}</div>`;
    else if (g.yrt) h += `<div class="rn">一年期，續保時依續保年齡費率重新計算。</div>`;
    if (r.cur === 'USD') h += `<div class="rn">美元保單：保費以美元計，不併入新台幣合計。</div>`;
    if (!hp && !isW(code)) h += `<div class="rn">${lab(d.host)} 主約保費整理中：繳別自選，繳費方式折扣未計。</div>`;
  }
  return h + '</div>';
}

// v1.16 已勾主約編號（像建議書購物車「1. XWS5」「2. OLA6」），顏色依順序
const mIdx = id => st.mains.indexOf(id);
const mno = id => { const i = mIdx(id); return i < 0 || st.mains.length < 2 ? '' : `<span class="mno m${i%4}">${i+1}</span>`; };
const mlab = id => { const i = mIdx(id); return i < 0 || st.mains.length < 2 ? lab(id) : `${i+1}. ${lab(id)}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const instH = (code, h) => `<div class="inst m${mIdx(h)%4}"><div class="ih">└ 掛 ${mno(h)}<b>${lab(h)}</b>${RR[code] ? '' : '｜保費待試算'}${riderWarn(code, h)}</div>${RR[code] ? rctl(code, h) : ''}</div>`;
const box = (key, on, dis, title) => `<label class="pk${dis?' dis':''}" title="${title||''}"><input type="checkbox" data-pick="${key}" ${on?'checked':''} ${dis?'disabled':''}><span></span></label>`;

function catItem(c, e, rs, F){
  const isM = c.kind === 'main', key = (isM?'m:':'r:')+c.code, on = isM ? st.mains.includes(c.code) : F ? attached(c.code).includes(F) : attached(c.code).length > 0;
  const open = st.open === c.code;
  const sexNo = !!e.sexMis;
  const dis = (!isM && !on && !(rs && rs.ok)) || (isM && sexNo && !on);
  const tag = (PRI(c.code) < 99 ? `<span class="tag pri">優先 ${PRI(c.code)}</span>` : '') + (sexNo ? `<span class="tag sexno">⚠ 性別不符（${c.sex===1?'限男性':'限女性'}）</span>` : '') + (e.ok==='cond' ? '<span class="tag cond">看要保人年齡</span>' : e.child ? '<span class="tag cond">子女身分</span>' : '');
  let sub = '';
  if (!isM && F){   // v1.16：只看可掛某張主約的附約
    const oth = attached(c.code).filter(h => h !== F);
    const othH = oth.length ? `<div class="host oth">另掛於：${oth.map(h => mno(h) + lab(h)).join('、')}</div>` : '';
    if (on) sub = instH(c.code, F) + othH;
    else if (rs && !rs.ok) sub = `<div class="why">🔒 ${rs.why}${rs.single ? ` <button type="button" class="hc lk" data-rmv="${c.code}@${F}">點此改掛到 ${mlab(F)}</button>` : ''}</div>` + othH;
    else sub = othH;
  } else if (!isM){
    const multi = st.mains.length > 1 && rs && rs.hostInfo && rs.hostInfo.length > 1;
    if (multi && (on || rs.ok)) sub = hostChips(c.code, rs) + (on ? attached(c.code).map(h => instH(c.code, h)).join('') : '');
    else if (on){ const h = attached(c.code)[0];
      sub = `<div class="host">附加於：${mno(h)}<b>${lab(h)}</b>${RR[c.code] ? '' : '｜保費待試算'}${riderWarn(c.code, h)}</div>` + (RR[c.code] ? rctl(c.code, h) : '');
    } else if (rs && !rs.ok) sub = `<div class="why">🔒 ${rs.why}</div>`;
  } else if (on) sub = `<div class="host">✓ 已勾選｜保費待試算（費率整理中）</div>`;
  else if (sexNo) sub = `<div class="why">⚠ 性別不符：${c.sex===1?'男性':'女性'}專屬商品，目前被保險人為${st.sex==1?'男':'女'}性，可點開看內容，不能勾選投保</div>`;
  const mi = isM && on ? st.mains.indexOf(c.code) : -1;
  return `<div class="prod${!isM && RR[c.code] ? ' rq' : ' pend'}${open?' open':''}${on?' picked':''}${dis?' locked':''}${mi>=0&&st.mains.length>1?' mk m'+(mi%4):''}" data-c="${c.code}"${isM?` id="p-${c.code}"`:''}>
    <div class="ph">${box(key, on, dis, sexNo?'性別不符':dis&&rs?rs.why:'')}${mi>=0?mno(c.code):''}<span class="code ${c.kind}">${c.code}</span><span class="nm">${c.name}${tag}<span class="meta">${e.ok===true||e.sexMis?e.terms.join('／')+'｜':''}${c.cover}｜${!isM && RR[c.code] ? '<b class="ok">✅ 可試算</b>' : '<em>費率整理中</em>'}</span></span><span class="arrow">${open?'▲':'ⓘ'}</span></div>${sub}
    <div class="pb">${open ? catPanel(c, e) : ''}</div></div>`;
}
function riderWarn(r, h){
  const p = pOf(h), s = p && st.sel[h];
  const w = [];
  const capKnown = p && !!capOf(p, defaultsFor(p, h));
  if (CAPPED.includes(r) && !capKnown) w.push(`${lab(h)} 的附約可附加額度未收錄／主約費率整理中，${r} 保額上限無法自動檢查，請以建議書確認`);
  if (r==='SDL') w.push(attached('SDL').length > 1 ? '每張主約各自 ≦50 萬不受主約額度限制；兩張合計 ≦200 萬' : '≦50 萬不受主約額度限制');
  if (['SJR1','HTA','HKR5','SWZ'].includes(r)) w.push('附約年期不得超過主約');
  if (r==='WP' && p && s && ![10,15,20,25,30].includes(s.term)) w.push(`WP 需主約繳費 10／15／20／25／30 年（目前 ${termTxt(s.term)}）`);
  if (SINGLE[r]) w.push(SINGLE[r].replace(/（.*）/, '') + '（含同業），請確認');
  if (r==='HSV' && base(h)==='XWS5') w.push(`掛 ${lab(h)} 時這張 XWS5 最低 5 萬`);
  if (r==='WPF1' && attached('WPA').includes(h)) w.push('WPF1 規則寫與 WPA 僅可擇一，請確認');
  if (MEDDAY.includes(r) && st.mains.length > 1) w.push('兩張主約日額合計仍受通則醫療日額上限');
  if (SURG[r]) w.push('手術醫療險另計，不算住院日額：SIE＋SJR1 等累計 ≦3,000 元（壽險＞200 萬且職業 1、2 類 4,000 元）');
  const rs = riderState(r, [h], instKeys().filter(k => k !== r+'@'+h));
  if (rs.warns) w.push(...rs.warns);
  return w.length ? `<span class="w">⚠ ${w.join('；')}</span>` : '';
}
// 兩張以上主約：每個附約列出可掛哪幾張主約（逐張勾選；限一張者鎖住、可改掛）
function hostChips(code, rs){
  const on = attached(code);
  const chips = rs.hostInfo.map(x => {
    const k = code+'@'+x.code;
    const mc = ' m' + (st.mains.indexOf(x.code) % 4);
    if (on.includes(x.code)) return `<button type="button" class="hc on${mc}" data-rh="${k}" title="取消附加於 ${mlab(x.code)}">☑ ${mlab(x.code)}</button>`;
    if (x.ok) return `<button type="button" class="hc${mc}" data-rh="${k}" title="加掛於 ${mlab(x.code)}">☐ ${mlab(x.code)}</button>`;
    if (x.single) return `<button type="button" class="hc lk" data-rmv="${k}" title="${x.why}">🔒 ${mlab(x.code)}・限一張（點此改掛）</button>`;
    return `<span class="hc lk" title="${x.why}">🔒 ${mlab(x.code)}</span>`;
  }).join('');
  const why = rs.hostInfo.filter(x => !x.ok && !on.includes(x.code)).map(x => `<div class="hwhy">🔒 ${mlab(x.code)}：${x.why}</div>`).join('');
  return `<div class="hosts"><span class="hl">${on.length ? '附加於' : '可附加於'}：</span>${chips}${why}</div>`;
}
function catPanel(c, e){
  const row = (k, v) => v ? `<tr><th>${k}</th><td>${v}</td></tr>` : '';
  let h = `<div class="what"><b>這是甚麼？</b> 富邦人壽${c.name}（${c.code}）｜${KIND[c.kind]}｜${c.cat}</div>`;
  h += `<table class="info">${row('投保年齡', c.ages.map(x=>`${x.t}：${x.a}–${x.b} 歲`).join('<br>'))}${row('保障期間', c.cover)}${row('保額規定', c.sum)}${row(c.kind==='main'?'附加附約':'附加條件', c.attach)}${row('其他', [c.other, c.note].filter(Boolean).join('<br>'))}${row('職業限制', c.occx.length?`第 ${c.occx.join('、')} 類不可附加`:'')}</table>`;
  if (e.sexMis) h += `<div class="err">⚠ 性別不符：${e.why}（目前被保險人為${st.sex==1?'男':'女'}性）。男女平權列出供比較／說明，實際投保須符合性別。</div>`;
  else if (e.ok === false) h += `<div class="err">⛔ ${e.why}</div>`;
  if (c.ben.length) h += `<div class="ben"><b>主要給付項目</b>（金額依條款／商品內容說明）<div class="chips">${c.ben.map(b=>`<span class="chip">${b}</span>`).join('')}</div></div>`;
  if (c.kind!=='main' && RR[c.code]) h += `<div class="note">✅ 保費試算：勾選後即可在附約列上選${RCFG[c.code].u==='plan'?'計劃別':RCFG[c.code].u==='waiver'?'（豁免附約自動以主約＋附約保費為投保金額）':'保額／日額'}並即時算出保費，計入底部合計。費率來源：${RR[c.code].src.split('/').pop()}（${RPER(c.code)}）</div>`;
  else h += `<div class="stub">💡 保費試算：此商品費率資料整理中，請先以公司建議書系統試算。勾選後會列入組合，保費標示「待試算」、不計入合計。</div>`;
  h += `<div class="note">依據：${c.rule}（投保規則）</div>`;
  return h;
}

function v1Item(p, id){
  if (!id){ const ex = sibs(p.code).filter(x => x !== p.code); return v1Item(p, p.code) + ex.map(x => v1Item(p, x)).join(''); }
  const dupN = inum(id), ts = p.plans ? [...new Set([...termsFor(p,st.age,'HAC1'),...termsFor(p,st.age,'HAD1')])].sort((a,b)=>a-b) : termsFor(p, st.age);
  const [mn,mx] = limits(p, st.age, st.occ);
  const lim = p.unit==='unit' ? '1 單位' : (mn===mx ? `限 ${mn.toLocaleString()} ${UNIT[p.unit]}` : `${mn.toLocaleString()}–${mx.toLocaleString()} ${UNIT[p.unit]}`) + (p.minHSV ? `（搭 HSV 最低 ${p.minHSV} 萬）` : '');
  const el = pEl(p), sexNo = !!el.sexMis;
  const tag = (FAV(p.code) ? '<span class="tag fav">常用</span>' : PRI(p.code) < 99 ? `<span class="tag pri">優先 ${PRI(p.code)}</span>` : '') + (sexNo ? `<span class="tag sexno">⚠ 性別不符（${p.sex===1?'限男性':'限女性'}）</span>` : '') + (p.cur==='USD' ? '<span class="tag cond">美元</span>' : '') + (stopSoon(p.code) ? `<span class="tag stop">⏰ ${STOPNOTE}</span>` : isStopped(p.code) ? '<span class="tag stop">已停售</span>' : '');
  const on = st.mains.includes(id), open = on ? !st.fold[id] : st.open===p.code;
  let sub = '';
  const nS = sibs(p.code).length, canDup = st.multi && on && nS < DUPMAX(p.code) && id === sibs(p.code)[nS-1];
  const dupBtn = canDup ? `<div class="dupr"><button type="button" class="chip dup" data-mdup="${p.code}">➕ 同商品再投保一張 ${p.code}（第${nS+1}張，附約各自掛）</button></div>` : '';
  if (on){ const {s, r} = qOf(p, id); sub = r.errs ? `<div class="why">⛔ 設定不符，未計入合計${p.minHSV && !s.hsv && (+s.sum||0) < p.min ? ` <button class="chip hsvq" data-hsv5="${id}">⚡ 勾 HSV → ${p.minHSV} 萬</button>` : ''}</div>` : `<div class="host">✓ ${termLbl(p,s.term)}｜${p.unit==='unit'?'1單位':s.sum.toLocaleString()+UNIT[p.unit]}｜${s.mode} <b>${p.cur==='USD'?'US$':'NT$'} ${fmt(r.paid)}</b></div>`; }
  else if (sexNo) sub = `<div class="why">⚠ 性別不符：${p.sex===1?'男性':'女性'}專屬商品，目前被保險人為${st.sex==1?'男':'女'}性，可點開看內容與費率，不能勾選投保</div>`;
  sub += dupBtn;
  const nm = (p.code==='OLA6' ? `${p.name}<span class="tag ola">OLA 系列</span>` : p.name) + (dupN > 1 ? `<span class="tag dupt">第 ${dupN} 張</span>` : nS > 1 && on ? '<span class="tag dupt">第 1 張</span>' : '');
  const mi = on ? mIdx(id) : -1;
  return `<div class="prod${open?' open':''}${on?' picked':''}${dupN>1?' dupi':''}${mi>=0&&st.mains.length>1?' mk m'+(mi%4):''}" data-c="${id}" id="p-${id.replace('#','_')}">
    <div class="ph">${box('m:'+id, on, sexNo && !on, sexNo?'性別不符':'')}${mi>=0?mno(id):''}<span class="code main">${p.code}${dupN>1?'<sup>'+dupN+'</sup>':''}</span><span class="nm">${nm}${tag}<span class="meta">${ts.map(t=>termLbl(p,t)).join('／')}｜${lim}｜保障 ${p.cover}</span></span><span class="arrow">${open?'▲':'ⓘ'}</span></div>${sub}
    <div class="pb">${open ? panel(p, id) : ''}</div></div>`;
}
function grouped(items, fn){
  let h = '', cat = '';
  for (const it of items){ const c = it.c || it; if (c.cat !== cat){ cat = c.cat; h += `<div class="cat">${cat}</div>`; } h += fn(it); }
  return h;
}

function render(){
  prune();
  syncHsv();
  $('#age').value = st.age;
  document.querySelectorAll('#sex button').forEach(b => b.classList.toggle('on', +b.dataset.v === st.sex));
  // v1.15：被保險人性別配色（男＝藍、女＝玫瑰色系）
  document.body.classList.toggle('fem', st.sex === 2); { const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = st.sex === 2 ? '#a3325c' : '#0a4f8f'; }
  $('#occ').value = st.occ;
  $('#page').value = st.pAge == null ? '' : st.pAge;
  if ($('#lifeex')) $('#lifeex').value = st.lifeEx == null ? '' : st.lifeEx;
  const sp = st.spec || {};
  $('#specon').checked = !!sp.on; $('#specbox').hidden = !sp.on;
  document.querySelectorAll('#specid button').forEach(b => b.classList.toggle('on', b.dataset.v === sp.id));
  $('#specparw').hidden = sp.id !== 'kid'; $('#specpar').checked = !!sp.par;
  const ms = medState();
  $('#spechint').innerHTML = !sp.on ? '' : !sp.id ? '請選身分類型' : (ms.sp ? `目前適用：<b>${ms.sp.lbl}</b>（依①區年齡 ${st.age} 歲、累計壽險 ${ms.life.w.toLocaleString()} 萬）→ 附約 ≦${ms.sp.r.toLocaleString()}、主約＋附約 ≦${ms.sp.t.toLocaleString()} 元；仍需符合一般身分上限，取較小者。` : '')
    + (sp.on && sp.id==='kid' && st.age<=5 && ms.life.w>1000 ? '<br>⚠️ 0～5 歲孩童累計壽險上限 1,000 萬' : '')
    + (sp.on && sp.id ? `<br>※ 投保規定 115.09.30 一、(二)3.(4)。${sp.id==='kid'?'若可提出父母相關收入、財力證明，可另行評估（仍需符合一般身分上限）。':'家管／退休人士可提出本人、配偶或父母收入／財力證明另行評估；無業、待業者不適用。'}` : '');
  if ($('#medcap')) $('#medcap').innerHTML = `通則醫療附約日額上限${ms.sp?'（特定身分）':''}：累計壽險保額 <b>${ms.life.w.toLocaleString()} 萬</b>${ms.life.parts.length?'（'+ms.life.parts.join('＋')+'）':''} → 醫療險附約日額累計 ≦<b>${ms.cap.toLocaleString()}</b> 元、主約＋附約 ≦<b>${ms.tcap.toLocaleString()}</b> 元${ms.rt||ms.mt?`｜已勾 附約 ${ms.rt.toLocaleString()}${ms.mt?'＋主約 '+ms.mt.toLocaleString():''} 元`:''}`;
  document.querySelectorAll('#psex button').forEach(b => b.classList.toggle('on', +b.dataset.v === (st.pSex||1)));
  const ok = P.filter(p => { const e = pEl(p); return e.ok || (e.sexMis && PRI(p.code) < 99); }), no = P.filter(p => !ok.includes(p));
  const pOk = ok.filter(p => PRI(p.code) < 99), rest = ok.filter(p => PRI(p.code) === 99);
  const ev = CAT.filter(c => !(c.kind==='main' && P.some(p=>p.code===c.code))).map(c => ({c, e:catElig(c, st.age, st.sex, st.occ, st.pAge)}));
  const mAll = ev.filter(x => x.c.kind==='main' && x.e.ok), mPri = mAll.filter(x => PRI(x.c.code) < 99), mOk = mAll.filter(x => PRI(x.c.code) === 99), mNo0 = ev.filter(x => x.c.kind==='main' && !x.e.ok);
  // 男女平權：常用優先的性別專屬主約（CLZ／CLX）若只因性別不符，仍列在常用優先、標「性別不符」
  const mSex = mNo0.filter(x => PRI(x.c.code) < 99 && x.c.sex && x.c.sex !== st.sex).map(x => { const e2 = catElig(Object.assign({}, x.c, {sex:0}), st.age, st.sex, st.occ, st.pAge); return e2.ok ? {c:x.c, e:Object.assign({}, e2, {ok:false, sexMis:true, why:x.e.why})} : null; }).filter(Boolean);
  const mNo = mNo0.filter(x => !mSex.some(y => y.c.code === x.c.code));
  const rOk = ev.filter(x => x.c.kind!=='main' && x.e.ok), rNo = ev.filter(x => x.c.kind!=='main' && !x.e.ok);
  const rc = riderCodes();
  const ik = instKeys(); rOk.forEach(x => x.rs = riderState(x.c.code, st.mains, ik));
  const nAttach = rOk.filter(x => x.rs.ok).length;
  $('#cnt').textContent = `${st.age} 歲${st.sex==1?'男':'女'}｜職業第 ${st.occ} 類`;
  $('#sumMain').textContent = ok.length + mAll.length; $('#sumRider').textContent = rOk.length;
  $('#subMain').textContent = mAll.length ? `可試算 ${ok.length}｜費率整理中 ${mAll.length}` : `全部可試算 ${ok.length}`;
  $('#subRider').textContent = st.mains.length ? `已勾主約可搭 ${nAttach} 項` : '先勾主約，才能勾附約';
  // 常用快選（step2）
  // v1.15：常用快選只放公司主推：XWS5、OLA6、CLZ（男）、CLX（女）；SDG 仍在常用優先清單
  // 只顯示目前年齡／性別／職業可投保者（不符的快選按鈕直接隱藏；已勾者保留以便取消）
  // v1.19：SDG 回到常用快選（XWS5、OLA6、SDG、男女癌），一樣只顯示可投保年齡
  const quick = ['XWS5','OLA6','SDG','CLZ','CLX'].filter(c => !isStopped(c)).map(c => P.find(p=>p.code===c)).filter(p => p && (pEl(p).ok || st.mains.includes(p.code)));
  const QN = {XWS5:'XWS5 新平準終身', OLA6:'OLA6 金來寶（OLA）', SDG:'SDG 醫保安心重大傷病', CLZ:'CLZ 男性癌症', CLX:'CLX 女性癌症'};
  $('#quick').innerHTML = '⭐ 常用快選：' + (quick.length ? '' : '<span class="hint">此年齡／性別沒有可投保的主推商品</span>') + quick.map(p => { const e = pEl(p), el = !!e.ok, on = st.mains.includes(p.code);
    return `<button type="button" class="qk${on?' on':''}" data-quick="${p.code}" ${el||on?'':'disabled'}>${on?'☑':'☐'} ${QN[p.code]}${stopSoon(p.code)?`<span class="tag stop">${STOPNOTE}</span>`:''}${el?'':e.sexMis?'（性別不符）':'（年齡不符）'}</button>` + (st.multi && on && sibs(p.code).length < DUPMAX(p.code) ? `<button type="button" class="qk dupq" data-mdup="${p.code}">＋第${sibs(p.code).length+1}張 ${p.code}</button>` : ''); }).join('') + (st.mains.length && !st.multi ? '<button type="button" class="qk need2" data-multi="1">➕ 需要第二張主約</button>' : '');
  $('#multihint').hidden = !st.multi;
  // 主約區
  const pri = [...pOk.map(p => ({k:PRI(p.code), c:p.code, h:v1Item(p), sx:!!pEl(p).sexMis})), ...mPri.map(x => ({k:PRI(x.c.code), c:x.c.code, h:catItem(x.c, x.e)})), ...mSex.map(x => ({k:PRI(x.c.code), c:x.c.code, h:catItem(x.c, x.e), sx:true}))].sort((a,b)=>a.k-b.k || (a.sx?1:0)-(b.sx?1:0) || (a.c==='CLZ'?-1:1));
  const lbl = (c, sx) => (c==='CLZ' ? '男性癌症 CLZ' : c==='CLX' ? '女性癌症 CLX' : c==='OLA6' ? 'OLA6（OLA）' : c) + (sx ? '（性別不符）' : '');
  let h = st.dropped.length ? `<div class="warn">條件改變，已自動取消不符的勾選：${st.dropped.join('、')}</div>` : '';
  st.dropped = [];
  // 常用優先：獨立醒目區塊
  // 有勾主約 → 其他未勾主約收起（只留已勾的）；全部取消勾選 → 恢復顯示全部
  const fold = st.mains.length > 0 && !st.mshow;
  const nAllMain = pri.length + rest.length + mOk.length;
  const Q = st.q || '', qOn = !!norm(Q);
  let nQm = 0, nQr = 0;
  if (qOn){
    // v1.16 搜尋模式：不分組、不收起，直接列出符合的主約（常用優先排前）
    const all = [...pOk.map(p => ({k:PRI(p.code), cat:p.cat, c:p.code, h:() => v1Item(p), sx:!!pEl(p).sexMis})), ...mPri.map(x => ({k:PRI(x.c.code), cat:x.c.cat, c:x.c.code, h:() => catItem(x.c, x.e)})), ...mSex.map(x => ({k:PRI(x.c.code), cat:x.c.cat, c:x.c.code, h:() => catItem(x.c, x.e), sx:true})),
      ...rest.map(p => ({k:99, cat:p.cat, c:p.code, h:() => v1Item(p)})), ...mOk.map(x => ({k:99, cat:x.c.cat, c:x.c.code, h:() => catItem(x.c, x.e)}))];
    const hit = all.filter(x => qHit(x.c, Q)).sort((a,b) => a.k-b.k || (a.sx?1:0)-(b.sx?1:0) || (a.k===99 ? a.cat.localeCompare(b.cat) : 0));
    nQm = hit.length;
    const hidM = st.mains.filter(id => !qHit(id, Q));
    h += `<div class="qhd">🔍「${esc(Q)}」符合主約 <b>${hit.length}</b> 項${hidM.length ? `｜已勾 ${hidM.map(mlab).join('、')} 不符合關鍵字，暫不顯示` : ''}</div>`;
    let cat = '';
    h += hit.map(x => { let o = ''; if (x.k === 99 && x.cat !== cat){ cat = x.cat; o += `<div class="cat">${cat}</div>`; } return o + x.h(); }).join('') || `<div class="empty">沒有符合「${esc(Q)}」的可投保主約${no.concat(mNo).length ? '（可看下方「此條件不可投保」）' : ''}。</div>`;
    $('#list').innerHTML = h;
  } else if (fold && !st.multi){
    // v1.17 單張主約模式：只顯示已勾的這一張，其他主約全部收起；要第二張再按「需要第二張主約」
    const one = st.mains.map(id => { const p = pOf(id); if (p) return v1Item(p, id); const c = CAT.find(x => x.code === base(id)); return c ? catItem(c, catElig(c, st.age, st.sex, st.occ, st.pAge)) : ''; }).join('');
    h += `<div class="favbox one"><div class="subhd favhd">✅ 已選主約：${st.mains.map(lab).join('、')}</div>` + one + `</div>`;
    h += `<div class="need2box"><button type="button" class="need2big" data-multi="1">➕ 需要第二張主約</button><span>（例如再加一張 XWS5／OLA6，或 SDG、癌症險，附約各自掛）</span></div>`;
    h += `<div class="mfold">📁 其他主約已收起 <button type="button" class="mini" data-mshow="1">換主約／看全部</button></div>`;
    $('#list').innerHTML = h;
  } else if (fold){
    // v1.13：收起時「常用優先」仍全部保留（方便加第二張主約，如 XWS5＋SDG），只收起非優先的其他主約
    const othP = [...rest.filter(p=>st.mains.includes(p.code)).map(p=>v1Item(p)), ...mOk.filter(x=>st.mains.includes(x.c.code)).map(x=>catItem(x.c, x.e))];
    h += `<div class="multibar">➕ 第二張主約：從下面勾選（同商品可按「再投保一張」）</div><div class="favbox"><div class="subhd favhd">✅ 已勾主約（${st.mains.length}）：${st.mains.map(mlab).join('、')}｜⭐ 常用優先：${pri.map(x=>lbl(x.c, x.sx)).join(' → ')}</div>` + pri.map(x=>x.h).join('') + othP.join('') + `</div>`;
    const nHid = nAllMain - pri.length - othP.length;
    h += `<div class="mfold">📁 其他 ${nHid} 個主約已收起 <button type="button" class="mini" data-mshow="1">顯示全部主約</button></div>`;
    h += `<div class="mfold">第二張主約模式 <button type="button" class="mini" data-multi="0">只要一張主約</button></div>`;
    $('#list').innerHTML = h;
  } else {
  if (st.mains.length) h += `<div class="mfold">已顯示全部主約${st.multi ? '' : '（目前只要一張：勾別的會換掉）'} <button type="button" class="mini" data-mshow="0">收起未勾選主約</button></div>`;
  h += pri.length ? `<div class="favbox"><div class="subhd favhd">⭐ 常用優先（${pri.length}）：${pri.map(x=>lbl(x.c, x.sx)).join(' → ')}</div>` + pri.map(x=>x.h).join('') + `</div>` : '';
  // 其他主約：依類型分組，預設收合（有勾選或手動打開的組才展開）
  const groups = [];
  for (const it of [...rest.map(p=>({cat:p.cat, h:()=>v1Item(p), code:p.code, v1:true})), ...mOk.map(x=>({cat:x.c.cat, h:()=>catItem(x.c, x.e), code:x.c.code}))]){
    let g = groups.find(g=>g.cat===it.cat); if (!g) groups.push(g = {cat:it.cat, items:[]}); g.items.push(it);
  }
  const nOther = rest.length + mOk.length;
  h += `<div class="subhd othhd">📂 其他主約（${nOther}）依類型分組，點類別展開 <button type="button" class="mini" data-gall="1">全部展開</button><button type="button" class="mini" data-gall="0">全部收合</button></div>`;
  h += groups.map(g => { const picked = g.items.filter(i=>st.mains.includes(i.code)).length, nv = g.items.filter(i=>i.v1).length;
    const open = picked > 0 || st.gopen[g.cat];
    return `<details class="grp" data-g="${g.cat}" ${open?'open':''}><summary><span>${g.cat}</span><span class="gc">${g.items.length} 項${nv&&nv<g.items.length?`（可試算 ${nv}）`:nv?'':'（費率整理中）'}${picked?`｜<b>已勾 ${picked}</b>`:''}</span></summary>${open ? g.items.map(i=>i.h()).join('') : ''}</details>`; }).join('') || '<div class="empty">此年齡沒有其他主約。</div>';
  $('#list').innerHTML = h;
  }
  const noF = no.filter(p => !qOn || qHit(p.code, Q)), mNoF = mNo.filter(x => !qOn || qHit(x.c.code, Q));
  const noM = noF.map(p => `<div class="nl"><b>${p.code}</b> ${p.name}<br>${pEl(p).why}</div>`).join('') + mNoF.map(x => `<div class="nl"><b>${x.c.code}</b> ${x.c.name}<br>${x.e.why}</div>`).join('');
  $('#nl').innerHTML = noM; $('#nolist').style.display = noM ? '' : 'none';
  $('#nolistcnt').textContent = `（${noF.length + mNoF.length}${qOn ? '，符合關鍵字' : ''}）`;
  if (qOn && !nQm && noM) $('#nolist').open = true;
  // 附約區：可搭的排前面
  $('#rhint').innerHTML = st.mains.length ? `已勾主約：<b>${st.mains.map(mlab).join('、')}</b>${st.mains.length>1?'（兩張主約：附約各自掛在對應那張主約下）':''}。可附加的附約可直接勾選，勾了就能選保額／計劃並即時算保費（繳別跟著主約）；🔒 為此組合不能附加（原因寫在下方）。` : '👆 先在上面勾選主約，這裡會打開可附加的附約。';
  // v1.16：兩張以上主約時可「只看可掛某張主約的附約」（勾選即掛那張）
  if (!(st.mains.length > 1 && st.mains.includes(st.rfocus))) st.rfocus = null;
  const F = st.rfocus;
  if (F) rOk.forEach(x => { const hi = (x.rs.hostInfo || []).find(y => y.code === F);
    x.rs = hi && hi.ok && x.rs.ok ? {ok:true, hosts:[F], hostInfo:[hi], warns:hi.warn ? [hi.warn] : []} : {ok:false, why:hi && !hi.ok ? hi.why : x.rs.why, single:!!(hi && hi.single), hostInfo:hi ? [hi] : []}; });
  const isOn = x => F ? attached(x.c.code).includes(F) : attached(x.c.code).length > 0;
  const rq = rOk.filter(x => !qOn || qHit(x.c.code, Q));
  const rs1 = rq.filter(x => x.rs.ok || isOn(x)), rs2 = rq.filter(x => !(x.rs.ok || isOn(x)));
  nQr = rq.length;
  const B = bundle();
  $('#mtree').innerHTML = mtree(B);
  $('#rlist').innerHTML = (qOn ? `<div class="qhd">🔍「${esc(Q)}」符合附約 <b>${rq.length}</b> 項</div>` : '')
    + (F ? `<div class="rfbar m${mIdx(F)%4}">👉 只看可附加於 ${mno(F)}<b>${lab(F)}</b> 的附約，勾選就掛這張 <button type="button" class="mini" data-rfocus="">顯示全部附約</button></div>` : '')
    + (grouped(rs1, x => catItem(x.c, x.e, x.rs, F)) || (qOn ? `<div class="empty">沒有符合「${esc(Q)}」的${F ? '可掛 '+esc(mlab(F))+' ' : '可附加'}附約。</div>` : st.mains.length ? '<div class="empty">已勾主約沒有可附加的附約。</div>' : ''))
    + (rs2.length ? `<div class="subhd pendhd">🔒 ${F ? '不能附加於 '+esc(mlab(F)) : '此組合不能附加'}（${rs2.length}）</div>` + grouped(rs2, x => catItem(x.c, x.e, x.rs, F)) : '');
  const rNoF = rNo.filter(x => !qOn || qHit(x.c.code, Q));
  const noR = rNoF.map(x => `<div class="nl"><b>${x.c.code}</b> ${x.c.name}<br>${x.e.why}</div>`).join('');
  $('#rnl').innerHTML = noR; $('#rnolist').style.display = noR ? '' : 'none';
  $('#rnolistcnt').textContent = `（${rNoF.length}${qOn ? '，符合關鍵字' : ''}）`;
  // 搜尋列：結果數＋跳轉
  $('#qx').hidden = !Q;
  $('#qres').innerHTML = qOn ? `<button type="button" class="qj" data-jump="secMain">主約 <b>${nQm}</b> ↓</button><button type="button" class="qj" data-jump="secRider">附約 <b>${nQr}</b> ↓</button>` : '<span class="hint">例：xws、ola、癌、實支、骨折、cancer，打字即篩選</span>';
  renderCart(B); save();
}

// XWS5 想做 5 萬 → 保額欄下方立即出現「勾 HSV（掛 XWS5）」；保額 < 最低保額且未搭 HSV 時醒目提示
function hsvBox(p, s, id){
  id = id || p.code; const L = lab(id);
  const on = hsvOn(id), hh = attached('HSV')[0], low = (+s.sum||0) < p.min - 1e-9;
  const can = riderOk('HSV');
  const hot = low && !on;
  let lbl;
  if (on) lbl = `<b>HSV 已附加於 ${L}</b> → 最低保額 ${p.minHSV} 萬（整）可投保；取消勾選則回到最低 ${p.min} 萬`;
  else if (hh) lbl = `<b>改掛 HSV 到 ${L}</b>（目前掛 ${lab(hh)}；HSV 同一被保險人限一張）→ ${L} 可投保 ${p.minHSV} 萬`;
  else lbl = `<b>附加 HSV 住院醫療附約（掛 ${L}）</b> → ${L} 最低保額可降到 ${p.minHSV} 萬`;
  if (hot) lbl = `⚡ ${L} ${(+s.sum).toLocaleString()} 萬低於最低 ${p.min} 萬：` + lbl;
  if (!can) return `<div class="hsvbox dis">HSV 此年齡／條件不可附加（${L} 最低 ${p.min} 萬）</div>`;
  return `<label class="hsvbox${hot?' hot':''}${on?' on':''}"><input type="checkbox" data-hsvx="${id}" ${on?'checked':''}><span>${lbl}${!on?`<small>HSV 也可改掛 OLA6 等其他主約，但只有掛 ${L} 才能 ${p.minHSV} 萬${sibs(id).length>1?'；兩張 XWS5 只有掛 HSV 的那張可做 5 萬':''}</small>`:''}</span></label>`
    + (!on && !low ? `<div class="chips"><button class="chip" data-hsv5="${id}">⚡ 直接做 ${p.minHSV} 萬（自動勾 HSV）</button></div>` : '');
}
function attachHsv(code, sum5){
  const p = pOf(code); if (!p) return;
  if (!st.mains.includes(code)){ st.mains.push(code); st.mshow = false; }
  const rs = riderState('HSV', st.mains, instKeys().filter(k=>!k.startsWith('HSV@')));
  if (!(riderOk('HSV') && rs.ok && rs.hosts.includes(code))){ alert('HSV 目前無法附加於 '+code+'：'+(rs.why||'年齡／條件不符')); return; }
  const was = attached('HSV')[0]; if (was && was !== code) moveInst('HSV', was, code); else addInst('HSV', code);
  const s = st.sel[code] || (st.sel[code] = {});
  if (sum5 || s.sum == null || s.sum < p.min || s.sum === p.min){ s.sum = p.minHSV; s.hsv = true; }
  if (was && was !== code){ const o = st.sel[was]; if (o && o.sum != null && o.sum < p.min) o.sum = p.min; }   // HSV 改掛後原本那張回到最低保額
}
function panel(p, id){
  id = id || p.code;
  const s = defaultsFor(p, id); st.sel[id] = Object.assign({}, s, {terms:undefined, cumOther:undefined});
  const [mn, mx, step] = limits(p, st.age, st.occ, s.hsv);
  let h = `<div class="what"><b>這是甚麼？</b> 富邦人壽${p.name}（${p.code}）｜主約｜${p.cat}｜保障 ${p.cover}｜投保年齡 ${ageRangeText(p)}</div>`;
  if (inum(id) > 1 || sibs(id).length > 1) h += `<div class="note">📑 同商品兩張：這是 <b>${lab(id)}</b>，保額／年期／繳別與附約各自設定；累計本險種最高保額兩張合計計算${s.cumOther?`（前面已 ${s.cumOther.toLocaleString()} ${UNIT[p.unit]}）`:''}。</div>`;
  if (!st.mains.includes(id)) h += `<div class="note">☐ 勾選左側方框即加入組合，並可勾選可附加的附約。</div>`;
  if (p.plans){
    const pl = s.plan.slice(3), start = s.plan.startsWith('HAD') ? 80 : 75;
    h += `<div class="fl">計劃別</div><div class="chips">${[1,2,3].map(i=>`<button class="chip${pl==i?' on':''}" data-k="plan" data-p="${id}" data-v="${start==75?'HAC':'HAD'}${i}">計劃 ${i}</button>`).join('')}</div>`;
    h += `<div class="fl">實支實付保險金啟動日</div><div class="chips">${[75,80].map(a=>{const code=(a==75?'HAC':'HAD')+pl; const can=termsFor(p,st.age,code).length>0; return `<button class="chip${start==a?' on':''}" data-k="plan" data-p="${id}" data-v="${code}" ${can?'':'disabled'}>${a} 歲（${a==75?'HAC':'HAD'}${pl}）${can?'':'－年齡不符'}</button>`}).join('')}</div>`;
  }
  h += `<div class="fl">繳費年期</div><div class="chips">${s.terms.map(t=>`<button class="chip${t===s.term?' on':''}" data-k="term" data-p="${id}" data-v="${t}">${termLbl(p,t)}</button>`).join('')}</div>`;
  if (p.unit !== 'unit'){
    h += `<div class="fl">${p.unit==='day'?'住院醫療日額':'保額'}（${mn===mx?'固定':mn.toLocaleString()+'–'+mx.toLocaleString()}，${p.unit==='day'||p.unit==='h'?'以百元為單位':p.code==='ALA'?'以元為單位，可輸入小數萬元':'每 '+step.toLocaleString()+' '+UNIT[p.unit]}）</div>
      <div class="sumrow"><button class="pm" data-k="sumd" data-p="${id}" data-v="-1">−</button><input data-sum="${id}" type="number" inputmode="decimal" step="${step}" value="${s.sum}" ${mn===mx?'readonly':''}><span class="unit">${UNIT[p.unit]}</span><button class="pm" data-k="sumd" data-p="${id}" data-v="1">＋</button></div>`;
  }
  if (p.minHSV) h += hsvBox(p, s, id);
  if (p.modes.length > 1) h += `<div class="fl">繳別</div><div class="chips">${p.modes.map(m=>`<button class="chip${m===s.mode?' on':''}" data-k="mode" data-p="${id}" data-v="${m}">${m}</button>`).join('')}</div>`;
  if (p.pay) h += `<label class="chk"><input type="checkbox" data-pd="${id}" ${s.payDisc?'checked':''}> 繳費方式折扣 ${p.pay*100}%（首期匯款／轉帳／富邦信用卡；續期轉帳／富邦信用卡／自行繳費）</label>`;
  const r = mainMed(p, quote(p, Object.assign({age:st.age, sex:st.sex, occ:st.occ}, s)), id);
  if (r.errs) h += `<div class="err">⛔ ${r.errs.join('<br>⛔ ')}</div>`;
  else {
    const CU = p.cur==='USD' ? 'US$' : 'NT$';
    h += `<div class="res"><div>${s.mode}${s.mode!=='年繳'&&s.mode!=='躉繳'?'每期':''}實繳保費${p.step2?`（第 1～${r.from2-1} 保單年度）`:''}</div><div class="big">${CU} ${fmt(r.paid)}</div>
      <table><tr><td>${s.mode==='躉繳'?'躉繳':'年繳'}保費（折扣前）</td><td>${fmt(r.annual)}</td></tr>
      ${s.mode!=='年繳'&&s.mode!=='躉繳'?`<tr><td>${s.mode}每期（折扣前）</td><td>${fmt(r.modal)}</td></tr><tr><td>首年實繳合計</td><td>${fmt(r.firstYear)}</td></tr>`:''}
      <tr><td>折扣</td><td>${r.bp? (r.bp/100)+'%（'+r.dl.join('＋')+'）':'無'}</td></tr>
      <tr><td>費率</td><td>${r.rate.toLocaleString()} ${p.cur==='USD'?'美元':'元'}／每${RUN(p)}</td></tr>
      ${r.paid2!=null?`<tr><td>第 ${r.from2} 保單年度起～繳費期滿 ${s.mode}實繳</td><td><b>${fmt(r.paid2)}</b>（年繳 ${fmt(r.annual2)}，費率 ${r.rate2}）</td></tr>`:''}
      ${p.renew?`<tr><td>明年（${st.age+1} 歲）續保年繳</td><td>${r.renewAnnual!=null?fmt(r.renewAnnual)+'（續保費率 '+r.renewRate+'）':'—'}</td></tr>`:''}</table></div>`;
    if (r.warn) h += `<div class="warn">⚠ ${r.warn}</div>`;
  }
  if (p.health) h += `<div class="note">另有健康管理保險費折扣（${p.health*100}%，依保費規定／條款於續期適用，未計入上方金額）。</div>`;
  if (p.note) h += `<div class="note">${p.note}</div>`;
  if (p.keyfmt==='yrt') h += `<div class="note">一年期自然費率：上方為首年保費，續保依續保年齡費率計收。</div>`;
  h += `<div class="ben"><b>主要給付項目</b>（金額依條款／商品內容說明）<div class="chips">${p.ben.map(b=>`<span class="chip">${b}</span>`).join('')}</div></div>`;
  h += `<div class="note">保障期間：${p.cover}｜建議書 ${p.ver}｜費率來源：${p.v19?'官方保險費費率表 PDF（已逐格對 '+p.src.split('/').pop()+'）':p.src.split('/').pop()}${p.rule?'｜投保規則：'+p.rule:''}</div>`;
  return h;
}

// ---------- 組合（勾選即組合） ----------
function bundle(){
  const items = [];
  st.mains.forEach((code, g) => { const n0 = items.length;
    const p = pOf(code);
    if (p){ const {s, r} = qOf(p, code);
      const desc = (p.plans?`計劃${s.plan.slice(3)}(${s.plan.startsWith('HAD')?80:75}歲啟動)｜`:'') + termLbl(p,s.term)+(s.term>1&&!(p.tl&&p.tl[s.term])?'期':'') + (p.unit==='unit'?'｜1單位':`｜${(+s.sum).toLocaleString()}${UNIT[p.unit]}`) + (p.minHSV && s.hsv ? '｜搭 HSV' : '');
      const usdM = p.cur==='USD';
      items.push({kind:'主約', code:(p.plans?s.plan:base(code))+(inum(code)>1?`（第${inum(code)}張）`:''), name:p.name, desc, mode:s.mode, paid:r.errs?null:r.paid, firstYear:r.errs||usdM?0:r.firstYear, usd:!r.errs&&usdM?r.firstYear:0, cur:usdM?'USD':'TWD', err:!!r.errs});
    } else { const c = CAT.find(x=>x.code===code); items.push({kind:'主約', code, name:c.name, desc:c.cat, pending:true}); }
    const rs = instList().filter(([rc, h]) => h === code).map(([rc]) => rc).sort((a,b) => isW(a) - isW(b));
    for (const rc of rs){ const c = CAT.find(x=>x.code===rc);
      if (!RR[rc]){ items.push({kind:KIND[c.kind], code:rc, rc, name:c.name, amt:'', desc:`附加於 ${lab(code)}`, pending:true, sub:true}); continue; }
      const {d, r} = rCalc(rc, code), q = d ? d.q : {}, g = RCFG[rc];
      const amt = g.u==='plan' ? `計劃${q.plan}` : g.u==='waiver' ? `${q.term||''}年期` : `${(+q.sum).toLocaleString()}${RUNIT[g.u]}` + (q.term ? `｜${q.term}年繳` : '');
      items.push({kind:KIND[c.kind], code:g.u==='plan'?g.pn+q.plan:rc, rc, name:c.name, amt, desc:`附加於 ${lab(code)}｜${amt}`, mode:q.mode, paid:r.errs?null:r.paid, firstYear:r.errs||r.cur==='USD'?0:r.firstYear, usd:!r.errs&&r.cur==='USD'?r.firstYear:0, cur:r.cur, err:!!r.errs, sub:true}); }
    for (let i = n0; i < items.length; i++){ items[i].g = g; items[i].mid = code; }
  });
  return items;
}
// v1.16 每張主約一組（主約＋其附約）小計
function groupsOf(it){ return st.mains.map((id, g) => { const xs = it.filter(x => x.g === g); return {id, g, xs, main:xs.find(x => !x.sub), sub:xs.reduce((a,x)=>a+(x.firstYear||0),0), usd:xs.reduce((a,x)=>a+(x.usd||0),0)}; }); }
const amtTxt = x => x.pending ? '待試算' : x.err ? '⛔ 設定不符' : (x.cur==='USD'?'US$ ':'')+fmt(x.paid);
function mtree(it){
  if (st.mains.length < 2) return '';   // v1.17 單張主約不顯示投保組合卡片
  const G = groupsOf(it), n = G.length;
  return `<div class="mtree"><div class="mth">📋 投保組合（每張主約各自掛附約）${n>1?'<span>點主約卡＝只看可掛那張的附約</span>':''}</div>`
    + G.map(G1 => { const {id, g, xs, main} = G1, rs = xs.filter(x => x.sub), on = st.rfocus === id;
      return `<div class="mcard m${g%4}${on?' on':''}"${n>1?` data-rfocus="${on?'':id}"`:''}><div class="mch">${mno(id)}<b>${lab(id)}</b><span class="nm">${main?main.name:''}</span><span class="amt">${main?amtTxt(main):''}</span></div>`
        + `<div class="mcr">${rs.length ? rs.map(x => `<span class="rcp">└ ${x.code}${x.amt && x.code===x.rc?' '+x.amt.split('｜')[0]:''} <b>${amtTxt(x)}</b></span>`).join('') : '<span class="none">尚未附加附約</span>'}</div>`
        + `<div class="mcf">主約＋附約 ${rs.length} 項｜首年小計 <b>NT$ ${fmt(G1.sub)}</b>${G1.usd?`＋US$ ${fmt(G1.usd)}`:''}${n>1?`<span class="go">${on?'✓ 目前只看這張（再點取消）':'只看可掛這張的附約 ▸'}</span>`:''}</div></div>`; }).join('') + '</div>';
}
let _lastTot = null;
function renderCart(it){
  const c = $('#cart'); it = it || bundle();
  if (!it.length){ c.classList.add('hidden'); $('#cartsum').innerHTML = '<span class="ct0">尚未勾選主約<small>勾主約後這裡即時合計保費</small></span>'; $('#cartmini').innerHTML = ''; $('#cartbody').innerHTML = ''; _lastTot = null; return; }
  c.classList.remove('hidden');
  const tot = it.reduce((a,x)=>a+(x.firstYear||0),0), usd = it.reduce((a,x)=>a+(x.usd||0),0), pend = it.filter(x=>x.pending).length, err = it.filter(x=>x.err).length;
  const nM = it.filter(x=>x.kind==='主約').length, G = groupsOf(it);
  $('#cartsum').innerHTML = `<span class="ctl">首年實繳合計｜主約 ${nM}・附約 ${it.length-nM}</span><span class="ctot">NT$ <b id="ctot">${fmt(tot)}</b>${usd?` ＋ US$ <b>${fmt(usd)}</b>`:''}</span><small>≈ 每月約 ${fmt(tot/12)} 元${pend?`｜另 ${pend} 項待試算`:''}</small>${err?`<small class="e">${err} 項設定不符未計</small>`:''}`;
  if (_lastTot != null && _lastTot !== tot){ const b = $('#ctot'); if (b){ b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } }
  _lastTot = tot;
  $('#cartmini').innerHTML = G.length > 1 ? G.map(x => `<span class="cm m${x.g%4}">${mno(x.id)}${lab(x.id)} ${fmt(x.sub)}</span>`).join('') : '';
  $('#cartbody').innerHTML = G.map(x => `<div class="cg m${x.g%4}"><div class="cgh" data-goto="${x.id}">${mno(x.id)}<b>${lab(x.id)}</b><span>小計 NT$ ${fmt(x.sub)}${x.usd?`＋US$ ${fmt(x.usd)}`:''}</span></div>`
      + x.xs.map(y => `<div class="ci${y.sub?' sub':''}"><div>${y.sub?'└ ':''}${y.code} ${y.name}<small>${y.kind}｜${y.sub ? (y.amt || y.desc) : y.desc}</small></div><div style="text-align:right">${amtTxt(y)}<small>${y.pending||y.err?'':y.mode}</small></div></div>`).join('') + '</div>').join('')
    + `<div class="ctot2">首年實繳合計 <b>NT$ ${fmt(tot)}</b>${usd?` ＋ US$ ${fmt(usd)}`:''}</div><div style="display:flex;gap:8px;margin-top:10px"><button id="copy">複製文字（貼 LINE）</button><button id="clear">全部取消勾選</button></div>`;
}
function cartText(){
  const it = bundle(), tot = it.reduce((a,x)=>a+(x.firstYear||0),0), usd = it.reduce((a,x)=>a+(x.usd||0),0), pend = it.filter(x=>x.pending).length, G = groupsOf(it), multi = G.length > 1;
  return `【富邦保費試算】${st.age}歲${st.sex==1?'男':'女'}\n` + G.map(g => g.xs.map(x=>`${x.sub?'　└':multi?(g.g+1)+'. ':'・'}${x.code} ${x.name}｜${x.sub ? (x.amt || x.desc) : x.desc}｜${x.pending?'保費待試算':x.err?'設定不符':x.mode+' '+fmt(x.paid)+(x.cur==='USD'?' 美元':' 元')}`).join('\n') + (multi ? `\n　小計（首年）${fmt(g.sub)} 元` : '')).join('\n') + `\n首年實繳合計：${fmt(tot)} 元${usd?`＋${fmt(usd)} 美元`:''}${pend?`（不含 ${pend} 項待試算）`:''}\n※僅供參考，以公司正式建議書為準`;
}

// HSV 附約實際附加在哪張主約上；XWS5「最低 5 萬」只在 HSV 掛在 XWS5 時成立
function hsvOn(code){ return attached('HSV').includes(code); }
function syncHsv(){
  for (const p of P.filter(x=>x.minHSV)) for (const id of [...new Set([p.code, ...sibs(p.code)])]){
    const s = st.sel[id] || (st.sel[id] = {}), on = hsvOn(id), was = !!s.hsv;
    s.hsv = on;
    if (on && !was && (s.sum == null || s.sum === p.min)) s.sum = p.minHSV;
    if (!on && was && s.sum != null && s.sum < p.min) s.sum = p.min;   // 剛取消 HSV 才拉回最低；使用者自己打 5 萬則保留並提示勾 HSV
  }
}
function toggle(key, on){
  const [t, code] = key.split(':');
  if (t === 'm'){
    if (on && !st.multi && st.mains.length && !st.mains.includes(code)){   // v1.17 單張模式：勾另一個主約＝換掉目前主約，附約能搬就搬
      const old = st.mains[0], rcs = instList().filter(([rc, h]) => h === old).map(([rc]) => rc);
      toggle('m:'+old, false); st.mains.push(code);
      for (const rc of rcs){ const rs = riderState(rc, st.mains, instKeys()); if (rs.ok && rs.hosts.includes(code)) addInst(rc, code); }
      st.mshow = false; if (P.some(p=>p.code===base(code))) st.open = null; return;
    }
    if (on && !st.mains.includes(code)) st.mains.push(code);
    if (!on){ st.mains = st.mains.filter(c=>c!==code); for (const [rc, h] of instList()) if (h === code) delInst(rc, h); delete st.sel[code]; renum(base(code)); }
    if (on && P.some(p=>p.code===base(code))) st.open = null;
    if (on) st.mshow = false;                      // 新勾主約 → 其他主約收起
  } else {
    const F = st.rfocus && st.mains.includes(st.rfocus) ? st.rfocus : null;
    if (on){ const s = riderState(code, st.mains, instKeys()); if (!s.ok) return; addInst(code, F && s.hosts.includes(F) ? F : s.hosts[0]); }   // 預設第一張可附加主約；「只看某張」時掛那張
    else if (F) delInst(code, F); else delete st.riders[code];
  }
}

document.addEventListener('click', e => {
  { const sb = e.target.closest && e.target.closest('#specid button'); if (sb){ st.spec.id = sb.dataset.v; if (sb.dataset.v !== 'kid') st.spec.par = false; render(); return; } }
  const pm = e.target.closest('#step1 .pm');
  if (pm){ st.age = Math.max(0, Math.min(85, st.age + +pm.dataset.d)); render(); return; }
  const sx = e.target.closest('#sex button');
  if (sx){ st.sex = +sx.dataset.v; render(); return; }
  if (e.target.closest('.pk')) return;            // 勾選框交給 change 事件
  if (e.target.id === 'qx'){ st.q = ''; $('#q').value = ''; render(); $('#q').focus(); return; }
  const rf = e.target.closest('[data-rfocus]');
  if (rf){ st.rfocus = rf.dataset.rfocus || null; render(); if (st.rfocus){ const r = $('#rlist'); if (r && r.getBoundingClientRect().top > innerHeight * 0.8) r.scrollIntoView({behavior:'smooth', block:'start'}); } return; }
  const gt = e.target.closest('[data-goto]');
  if (gt){ const el = document.getElementById('p-'+gt.dataset.goto.replace('#','_')); if (el){ $('#cart').classList.remove('open'); $('#cartopen').textContent = '明細 ▲'; el.scrollIntoView({behavior:'smooth', block:'start'}); } return; }
  const mu = e.target.closest('[data-multi]');
  if (mu){
    if (mu.dataset.multi === '1'){ st.multi = true; st.mshow = false; render(); const l = $('#secMain'); if (l) l.scrollIntoView({behavior:'smooth', block:'start'}); return; }
    const extra = st.mains.slice(1);
    if (extra.length && !confirm(`回到只要一張主約，會取消：${extra.map(lab).join('、')}（及掛在上面的附約）。確定？`)) return;
    for (const id of extra) toggle('m:'+id, false);
    st.multi = false; st.rfocus = null; render(); return;
  }
  const md = e.target.closest('[data-mdup]');
  if (md){ const id = addDup(md.dataset.mdup); render(); if (id){ const el = document.getElementById('p-'+id.replace('#','_')); if (el) el.scrollIntoView({behavior:'smooth', block:'start'}); } return; }
  const qk = e.target.closest('[data-quick]');
  if (qk){ const c = qk.dataset.quick; toggle('m:'+c, !st.mains.includes(c)); render(); const el = document.getElementById('p-'+c); if (el) el.scrollIntoView({behavior:'smooth', block:'start'}); return; }
  const ph = e.target.closest('.ph');
  if (ph){ const c = ph.parentNode.dataset.c; if (st.mains.includes(c) && P.some(p=>p.code===base(c))){ st.fold[c] = !st.fold[c]; render(); return; } st.open = st.open===c ? null : c; render(); return; }
  const ms = e.target.closest('[data-mshow]');
  if (ms){ st.mshow = ms.dataset.mshow === '1'; render(); return; }
  const ga = e.target.closest('[data-gall]');
  if (ga){ e.preventDefault(); document.querySelectorAll('#list details.grp').forEach(d => st.gopen[d.dataset.g] = ga.dataset.gall==='1'); render(); return; }
  const k = e.target.closest('[data-k]');
  if (k){
    const p = pOf(k.dataset.p); if (!p) return; const s = st.sel[k.dataset.p] || (st.sel[k.dataset.p] = {});
    const v = k.dataset.v;
    if (k.dataset.k==='plan') s.plan = v;
    else if (k.dataset.k==='term') s.term = +v;
    else if (k.dataset.k==='mode') s.mode = v;
    else if (k.dataset.k==='sumd'){ const [mn,mx,step]=limits(p,st.age,st.occ,s.hsv); const cur=+s.sum||0;
      if (p.minHSV && !s.hsv && +v<0 && cur <= mn + 1e-9) s.sum = p.minHSV;   // XWS5 在 10 萬再按 − → 跳 5 萬並立即提示勾 HSV
      else s.sum = Math.round((Math.min(mx,Math.max(mn,cur+ +v*step)))*100)/100; }
    render(); return;
  }
  const rk = e.target.closest('[data-rk]');
  if (rk){ const [c, h] = splitK(rk.dataset.r), v = rk.dataset.v, s = rSel(c, h);
    if (rk.dataset.rk==='plan'){ s.plan = +v; st.rsel[c] = Object.assign(st.rsel[c] || {}, {plan:+v}); } else if (rk.dataset.rk==='term') s.term = +v; else if (rk.dataset.rk==='mode') s.mode = v;
    else if (rk.dataset.rk==='sumd'){ const d = rDefaults(c, h); const L = d.L; s.sum = Math.round(Math.min(L.max, Math.max(L.min, (+d.q.sum||0) + +v*L.step))*100)/100; }
    render(); return; }
  const ps = e.target.closest('#psex button');
  if (ps){ st.pSex = +ps.dataset.v; render(); return; }
  const jp = e.target.closest('[data-jump]');
  if (jp){ document.getElementById(jp.dataset.jump).scrollIntoView({behavior:'smooth', block:'start'}); return; }
  if (e.target.id==='cartopen'){ $('#cart').classList.toggle('open'); e.target.textContent = $('#cart').classList.contains('open') ? '明細 ▼' : '明細 ▲'; return; }
  if (e.target.id==='clear'){ st.mains=[]; st.riders={}; st.multi=false; st.rfocus=null; for (const k of Object.keys(st.sel)) if (k.includes('#')) delete st.sel[k]; render(); return; }
  const h5 = e.target.closest('[data-hsv5]');
  if (h5){ attachHsv(h5.dataset.hsv5, true); render(); return; }
  const ht = e.target.closest('[data-hsvto]');
  if (ht){ const m = ht.dataset.hsvto;
    if (riderOk('HSV')) attachHsv(m, false); else alert('HSV 目前無法附加於 '+m+'：年齡／條件不符'); render(); return; }
  const rh = e.target.closest('[data-rh]');
  if (rh){ const [c, h] = splitK(rh.dataset.rh);
    if (attached(c).includes(h)) delInst(c, h);
    else { const rs = riderState(c, st.mains, instKeys()); const hi = rs.hostInfo && rs.hostInfo.find(x => x.code === h); if (hi && hi.ok) addInst(c, h); else alert(`${c} 不能附加於 ${lab(h)}：${hi ? hi.why : ''}`); }
    render(); return; }
  const rmv = e.target.closest('[data-rmv]');
  if (rmv){ const [c, h] = splitK(rmv.dataset.rmv), from = attached(c)[0];
    if (c === 'HSV') attachHsv(h, false); else if (from) moveInst(c, from, h); render(); return; }
  if (e.target.id==='copy'){ const t=cartText(); (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>alert('已複製'),()=>prompt('請複製以下文字',t)); return; }
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.pick){ toggle(d.pick, t.checked); render(); return; }
  if (d.hsvx){ if (t.checked) attachHsv(d.hsvx, false); else if (hsvOn(d.hsvx)) delInst('HSV', d.hsvx); render(); return; }
  if (d.sum){ st.sel[d.sum].sum = parseFloat(t.value)||0; render(); return; }
  if (d.rsum){ const [c, h] = splitK(d.rsum); rSel(c, h).sum = parseFloat(t.value)||0; render(); return; }
  if (d.pd){ st.sel[d.pd].payDisc = t.checked; render(); return; }
  if (t.id==='age'){ st.age = Math.max(0, Math.min(85, parseInt(t.value)||0)); render(); }
  if (t.id==='page'){ const v = t.value.trim(); st.pAge = v==='' ? null : Math.max(0, Math.min(99, parseInt(v)||0)); render(); }
  if (t.id==='occ'){ st.occ = +t.value; render(); }
  if (t.id==='specon'){ st.spec.on = t.checked; render(); return; }
  if (t.id==='specpar'){ st.spec.par = t.checked; render(); return; }
  if (t.id==='lifeex'){ const v = t.value.trim(); st.lifeEx = v==='' ? null : Math.max(0, parseFloat(v)||0); render(); }
  if (t.id==='bd' && t.value){ st.age = insAge(t.value); $('#agehint').textContent = `生日 ${t.value} → 今日保險年齡 ${st.age} 歲`; render(); }
});
// v1.16 關鍵字即時搜尋（注音／拼音組字中不篩，組字完成才篩）
document.addEventListener('input', e => { if (e.target.id !== 'q' || e.isComposing) return; st.q = e.target.value; render(); });
document.addEventListener('compositionend', e => { if (e.target.id !== 'q') return; st.q = e.target.value; render(); });
document.addEventListener('keydown', e => { if (e.target.id === 'q' && e.key === 'Escape'){ st.q = ''; e.target.value = ''; render(); } });
{ const setHH = () => document.documentElement.style.setProperty('--hh', document.querySelector('header').offsetHeight + 'px'); setHH(); addEventListener('resize', setHH); }
document.addEventListener('toggle', e => { const d = e.target; if (!d.matches || !d.matches('details.grp')) return; const was = !!st.gopen[d.dataset.g]; if (was === d.open) return; st.gopen[d.dataset.g] = d.open; if (d.open && !d.querySelector('.prod')) render(); else save(); }, true);
{ const pend = CAT.filter(c=>c.kind==='main' ? !P.some(p=>p.code===c.code) : !RR[c.code]).map(c=>c.code);
  $('#ver').textContent = `可試算主約 ${P.length} 項：` + P.map(p=>p.code).join('、') + `｜可試算附約 ${CAT.filter(c=>c.kind!=='main'&&RR[c.code]).length} 項：` + CAT.filter(c=>c.kind!=='main'&&RR[c.code]).map(c=>c.code).join('、') + (pend.length ? '｜費率整理中：' + pend.join('、') : '｜全部商品皆可試算'); }
render();
})();
