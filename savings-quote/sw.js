/* Quote tool service worker: open pages instantly from the phone's cache,
   re-check the server in the background, and tell the page when numbers changed.
   Kill switch: replace this file with one that calls self.registration.unregister(). */
const CACHE='qt-v1';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  for(const k of await caches.keys()) if(k!==CACHE) await caches.delete(k);
  await self.clients.claim();})()));
const keyOf=u=>{const x=new URL(u);x.search='';x.hash='';if(x.pathname.endsWith('/'))x.pathname+='index.html';return x.href;};
const sig=r=>r&&(r.headers.get('etag')||r.headers.get('last-modified')||r.headers.get('content-length')||'');
self.addEventListener('fetch',e=>{
  const req=e.request,u=new URL(req.url);
  if(req.method!=='GET'||u.origin!==location.origin)return;
  if(!/\.(html|json)$|\/$/.test(u.pathname))return;
  const key=keyOf(req.url);
  e.respondWith((async()=>{
    const c=await caches.open(CACHE),old=await c.match(key);
    const net=fetch(key,{cache:'no-cache'}).then(async r=>{
      if(r&&r.ok&&r.type==='basic'){
        const changed=old&&sig(old)!==sig(r);
        await c.put(key,r.clone());
        if(changed){const cid=e.resultingClientId||e.clientId;
          const send=async()=>{const cl=cid&&await self.clients.get(cid);if(cl)cl.postMessage({type:'qt-updated'});return !!cl;};
          if(!(await send()))setTimeout(send,1500);}
      }return r;}).catch(()=>null);
    if(old){e.waitUntil(net);return old;}
    const r=await net;return r||new Response('離線中，且此頁尚未快取',{status:503,headers:{'content-type':'text/plain;charset=utf-8'}});
  })());
});
