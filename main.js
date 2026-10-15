const slides=[...document.querySelectorAll('.slide')],dots=document.querySelector('.dots');let i=0,t;
slides.forEach((_,k)=>{const b=document.createElement('button');b.setAttribute('aria-label','第'+(k+1)+'則');b.onclick=()=>show(k);dots.appendChild(b)});
function show(k){i=(k+slides.length)%slides.length;slides.forEach((s,n)=>s.classList.toggle('active',n===i));[...dots.children].forEach((d,n)=>d.classList.toggle('on',n===i));clearInterval(t);t=setInterval(()=>show(i+1),6000)}
function go(d){show(i+d)}
function toggleNav(b){const m=document.getElementById('menu');const o=m.classList.toggle('open');b.setAttribute('aria-expanded',o)}
document.querySelectorAll('#menu a').forEach(a=>a.addEventListener('click',()=>document.getElementById('menu').classList.remove('open')));
if(slides.length)show(0);
