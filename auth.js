/* 南恩通訊處：共用登入閘門（純前端，只能擋一般瀏覽；不是伺服器端權限控管）
 * 同步載入於各頁 <head> 最前面：未登入 → 隱藏頁面並導向 login.html；登入狀態存 localStorage 30 天。
 * 密碼不放明文：僅保存 SHA-256(帳號大寫|密碼|salt) 再加 20000 次迭代雜湊的結果。 */
(function(){
'use strict';
var SALT='51e75dcb74180df81f626908',HASH='b3610596ce042be4aad76d09cce5333128cc6b0e73ca5302ad750e7a43e21d18',ITER=20000,DAYS=30,KEY='nn_auth_v1';
var d=document,cs=d.currentScript;
if(!cs){var ss=d.getElementsByTagName('script');for(var i=ss.length-1;i>=0;i--){if(/auth\.js(\?|$)/.test(ss[i].src||'')){cs=ss[i];break}}}
var ROOT=cs&&cs.src?cs.src.replace(/[^\/]*(\?.*)?$/,''):location.origin+'/';
var isLogin=d.documentElement.hasAttribute('data-nn-login');

/* ---- SHA-256（同步、無相依） ---- */
var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function utf8(s){return unescape(encodeURIComponent(s))}
function sha256(str){
  var m=utf8(str),l=m.length,w=new Array(64),H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],i,j,b=[];
  for(i=0;i<l;i++)b[i>>2]|=m.charCodeAt(i)<<(24-(i%4)*8);
  b[l>>2]|=0x80<<(24-(l%4)*8);b[(((l+8)>>6)<<4)+15]=l*8;
  for(i=0;i<b.length;i+=16){
    var a=H.slice(0);
    for(j=0;j<64;j++){
      if(j<16)w[j]=b[i+j]|0;else{var x=w[j-15],y=w[j-2];
        w[j]=(((x>>>7|x<<25)^(x>>>18|x<<14)^(x>>>3))+w[j-7]+((y>>>17|y<<15)^(y>>>19|y<<13)^(y>>>10))+w[j-16])|0}
      var e=a[4],t1=(a[7]+((e>>>6|e<<26)^(e>>>11|e<<21)^(e>>>25|e<<7))+((e&a[5])^(~e&a[6]))+K[j]+w[j])|0,
          f=a[0],t2=(((f>>>2|f<<30)^(f>>>13|f<<19)^(f>>>22|f<<10))+((f&a[1])^(f&a[2])^(a[1]&a[2])))|0;
      a=[(t1+t2)|0,a[0],a[1],a[2],(a[3]+t1)|0,a[4],a[5],a[6]];
    }
    for(j=0;j<8;j++)H[j]=(H[j]+a[j])|0;
  }
  var o='';for(i=0;i<8;i++)o+=('00000000'+(H[i]>>>0).toString(16)).slice(-8);return o;
}
function derive(user,pw){var h=sha256(String(user).trim().toUpperCase()+'|'+pw+'|'+SALT);for(var i=0;i<ITER;i++)h=sha256(h+SALT);return h}

/* ---- 登入狀態 ---- */
function authed(){try{var o=JSON.parse(localStorage.getItem(KEY)||'null');return !!(o&&o.h===HASH&&o.exp>Date.now())}catch(e){return false}}
function login(user,pw){if(derive(user,pw)!==HASH)return false;
  try{localStorage.setItem(KEY,JSON.stringify({h:HASH,exp:Date.now()+DAYS*864e5}))}catch(e){return false}return true}
function logout(){try{localStorage.removeItem(KEY)}catch(e){}location.replace(ROOT+'login.html')}
function safeNext(n){try{var u=new URL(n,location.href);if(u.origin===location.origin&&u.href.indexOf(ROOT)===0&&!/login\.html/.test(u.pathname))return u.href}catch(e){}return ROOT}
window.NNAuth={login:login,logout:logout,isAuthed:authed,root:ROOT,safeNext:safeNext};

function gate(){
  var s=d.createElement('style');s.id='nn-gate';s.textContent='html{visibility:hidden!important}';(d.head||d.documentElement).appendChild(s);
  location.replace(ROOT+'login.html?next='+encodeURIComponent(location.href));
}
if(isLogin){
  if(authed()){var q=/[?&]next=([^&]*)/.exec(location.search);location.replace(safeNext(q?decodeURIComponent(q[1]):ROOT))}
}else{
  if(!authed())gate();
  /* 返回上一頁（bfcache）或其他分頁登出時重新檢查 */
  window.addEventListener('pageshow',function(e){if(!authed())gate()});
  window.addEventListener('storage',function(e){if(e.key===KEY&&!authed())gate()});
  /* 登出按鈕 */
  var css='.nn-logout{cursor:pointer;font:inherit;font-weight:700;color:#9a7a2c;border:1px solid rgba(201,162,74,.65);border-radius:999px;padding:3px 14px;background:#fffdf7;white-space:nowrap;text-decoration:none;line-height:1.5}.nn-logout:hover{background:#f6ecd0}.nn-logout::after{display:none!important}'+
   '.nn-logout.nn-float{position:fixed;left:10px;bottom:10px;z-index:2147483000;font:700 13px/1.5 "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;padding:5px 14px;box-shadow:0 2px 10px rgba(6,37,74,.18);opacity:.92}'+
   '@media print{.nn-logout{display:none!important}}';
  function addBtn(){
    if(d.querySelector('.nn-logout'))return;
    var st=d.createElement('style');st.textContent=css;d.head.appendChild(st);
    var a=d.createElement('a');a.href='#';a.className='nn-logout';a.textContent='登出';a.setAttribute('role','button');
    a.addEventListener('click',function(e){e.preventDefault();logout()});
    var nav=d.querySelector('header nav#menu')||d.querySelector('header nav');
    if(nav)nav.appendChild(a);else{a.className+=' nn-float';d.body.appendChild(a)}
  }
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',addBtn);else addBtn();
}
})();
