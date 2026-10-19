/* OFFLINE_VERSION / OFFLINE_ASSETS are injected by build-offline.mjs.
   Cache Storage is disk-backed, not the HTTP cache or service worker's memory.
   Each release installs atomically; a failed update must leave the old one usable. */
const APP_ROOT=new URL('./',self.location.href);
const CACHE_PREFIX='yakyulife-offline-'+encodeURIComponent(APP_ROOT.pathname)+'-';
const CACHE_NAME=CACHE_PREFIX+OFFLINE_VERSION;
const entries=OFFLINE_ASSETS.map(asset=>({...asset,key:new URL(asset.url,APP_ROOT).href}));
const byURL=new Map(entries.map(asset=>[asset.key,asset]));
const indexURL=new URL('index.html',APP_ROOT).href;
let preparing;

async function valid(response,asset){
  if(!response||!response.ok||response.type==='opaque')return false;
  const bytes=await response.clone().arrayBuffer();
  if(bytes.byteLength!==asset.bytes)return false;
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')===asset.sha256;
}

async function download(asset){
  const url=new URL(asset.key);
  // Bypass stale CDN responses, including versioned ES-module imports.
  url.searchParams.set('__offline',asset.sha256);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(url.href,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
    if(!(await valid(response,asset)))throw new Error('Incomplete or stale asset: '+asset.url);
    return response;
  }finally{clearTimeout(timeout);}
}

async function notify(message){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients){
    if(client.url.startsWith(APP_ROOT.href))client.postMessage({type:'OFFLINE_PROGRESS',version:OFFLINE_VERSION,...message});
  }
}

async function fillCache(){
  const cache=await caches.open(CACHE_NAME);
  const previous=await Promise.all((await caches.keys())
    .filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME).map(name=>caches.open(name)));
  let next=0,completed=0,failure;
  // Bound concurrent requests and wait for all writes before handling failure.
  await Promise.all(Array.from({length:4},async()=>{
    while(next<entries.length&&!failure){
      const asset=entries[next++];
      try{
        let response=await cache.match(asset.key);
        if(!(await valid(response,asset))){
          response=null;
          for(const old of previous){
            const candidate=await old.match(asset.key);
            if(await valid(candidate,asset)){response=candidate;break;}
          }
          if(!response)response=await download(asset);
          await cache.put(asset.key,response);
        }
        completed++;
        await notify({completed,total:entries.length});
      }catch(error){failure=error;}
    }
  }));
  if(failure)throw failure;
}

function prepare(){
  if(!preparing)preparing=fillCache().finally(()=>{preparing=null;});
  return preparing;
}

async function status(){
  const cache=await caches.open(CACHE_NAME);
  const present=await Promise.all(entries.map(async asset=>!!(await cache.match(asset.key))));
  const completed=present.filter(Boolean).length;
  return {type:'OFFLINE_STATUS',version:OFFLINE_VERSION,ready:completed===entries.length,
    completed,total:entries.length,bytes:entries.reduce((n,asset)=>n+asset.bytes,0)};
}

self.addEventListener('install',event=>{
  event.waitUntil(prepare().catch(async error=>{
    await caches.delete(CACHE_NAME);
    await notify({failed:true});
    throw error;
  }));
  // No skipWaiting: never swap the game's modules underneath an active career.
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    // Only our own scope: other games on the same GitHub Pages origin keep their data.
    await Promise.all((await caches.keys()).filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME)
      .map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  const port=event.ports?.[0];
  if(!port||!['GET_OFFLINE_STATUS','PREPARE_OFFLINE'].includes(event.data?.type))return;
  event.waitUntil((async()=>{
    try{
      if(event.data.type==='PREPARE_OFFLINE')await prepare();
      port.postMessage(await status());
    }catch{
      port.postMessage({...await status(),error:'下載未完成，請確認網路及裝置儲存空間後重試。'});
    }
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==APP_ROOT.origin)return; // Optional webfonts and external links are not required.
  const isHome=request.mode==='navigate'&&(url.pathname===APP_ROOT.pathname||url.pathname===new URL(indexURL).pathname);
  url.search=''; url.hash='';
  const key=isHome?indexURL:url.href;
  const asset=byURL.get(key);
  if(!asset)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await cache.match(key);
    if(cached)return cached;
    // Repair an individually missing file, but never mix files from different releases.
    try{
      const response=await download(asset);
      await cache.put(key,response.clone());
      return response;
    }catch{
      return new Response('離線檔案不完整。請連網後重新開啟遊戲，並在「離線遊玩與安裝」重試下載。',
        {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
