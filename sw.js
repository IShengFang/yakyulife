/* This template is injected once by scripts/build-site.mjs. Never edit _site. */
const RELEASE = /* RELEASE_DATA */ null;
const BASE = self.registration.scope;
const PREFIX = 'yakyulife:' + encodeURIComponent(BASE) + ':';
const CACHE = PREFIX + RELEASE?.buildId;
const absolute = url => new URL(url, BASE).href;
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');

async function valid(response,entry){
  if(!response?.ok||response.redirected)throw new Error('Missing resource: '+entry.url);
  const type=response.headers.get('Content-Type')?.split(';')[0];
  if(type!==entry.mime&&!(entry.mime==='text/javascript'&&type==='application/javascript'))
    throw new Error('Wrong MIME: '+entry.url);
  const bytes=await response.clone().arrayBuffer();
  if(bytes.byteLength!==entry.size||await hash(bytes)!==entry.sha256)
    throw new Error('Wrong bytes: '+entry.url);
}
async function verify(){
  const cache=await caches.open(CACHE);
  for(const entry of RELEASE.resources)await valid(await cache.match(absolute(entry.url)),entry);
  return true;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  if(!RELEASE)throw new Error('Use the generated release artifact');
  // A build ID is unique to an artifact, including patches and rollbacks.
  // Never refresh an existing complete cache with bytes from the network.
  if(await caches.has(CACHE)){
    try{return await verify();}
    catch{
      // Browser termination can prevent the previous install's catch from running.
      // This unique candidate belongs to this install, never to a different build.
      await caches.delete(CACHE);
    }
  }
  const cache=await caches.open(CACHE);
  try{
    for(const entry of RELEASE.resources){
      const url=absolute(entry.url);
      const response=await fetch(url,{cache:'no-store',credentials:'same-origin'});
      await valid(response,entry);
      await cache.put(url,response);
    }
  }catch(error){await caches.delete(CACHE);throw error;}
  // No skipWaiting here. A complete waiting worker still needs player consent.
})()));

const scopedClients=async()=> (await self.clients.matchAll({type:'window',includeUncontrolled:true}))
  .filter(client=>client.url.startsWith(BASE));
function ask(client,type,transaction,expiresAt){
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();resolve(null);},2500);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
    client.postMessage({type,transaction,expiresAt,buildId:RELEASE.buildId},[channel.port2]);
  });
}
async function cleanup(){
  // Unknown, suspended and retiring clients retain old resources. A later HELLO
  // retries cleanup after all documents report that they run this build.
  const clients=await scopedClients();
  const versions=await Promise.all(clients.map(c=>ask(c,'PWA_VERSION')));
  if(versions.some(v=>v?.buildId!==RELEASE.buildId))return;
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE){
    // Do not delete the complete candidate of a newer waiting/installing worker.
    if(self.registration.waiting||self.registration.installing)return;
    await caches.delete(key);
  }
}
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Deliberately no clients.claim(): uncontrolled careers must keep running.
  for(const client of await scopedClients())client.postMessage({type:'PWA_ACTIVATED',buildId:RELEASE.buildId});
  await cleanup();
})()));

let switching=false;
async function switchVersion(){
  if(switching)return {ok:false};
  switching=true;
  const transaction=crypto.randomUUID();
  const expiresAt=Date.now()+12000;
  let clients=[],committed=false;
  try{
    await verify();
    clients=await scopedClients();
    const votes=await Promise.all(clients.map(c=>ask(c,'PWA_PREPARE',transaction,expiresAt)));
    if(votes.some(v=>!v?.safe))return {ok:false};
    const current=await scopedClients();
    if(current.length!==clients.length||current.some(c=>!clients.some(old=>old.id===c.id)))return {ok:false};
    if(Date.now()>expiresAt-1000)return {ok:false};
    await self.skipWaiting();
    committed=true;
    return {ok:true};
  }finally{
    switching=false;
    // Committed clients stay locked until controllerchange and reload. Failed
    // transactions are explicitly released, including a page that voted early.
    if(!committed){
      for(const client of clients)client.postMessage({type:'PWA_CANCEL',transaction});
    }
  }
}
self.addEventListener('message',event=>{
  if(!event.source?.url?.startsWith(BASE))return;
  const reply=data=>event.ports[0]?.postMessage(data);
  if(event.data?.type==='PWA_STATUS')event.waitUntil((async()=>{
    try{await verify();reply({ok:true,buildId:RELEASE.buildId});}
    catch{reply({ok:false,buildId:RELEASE.buildId});}
  })());
  if(event.data?.type==='PWA_UPDATE')event.waitUntil(switchVersion().then(reply,()=>reply({ok:false})));
  if(event.data?.type==='PWA_LOADED')event.waitUntil(cleanup());
});

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),base=new URL(BASE);
  if(event.request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate'&&(url.pathname===base.pathname||url.pathname===base.pathname+'index.html'))
      return await cache.match(absolute('index.html'))||new Response('離線資源不完整，請連線重試。',{status:503});
    const hit=await cache.match(event.request);
    if(hit)return hit;
    // Build-specific module URLs protect late loads in old documents during a
    // coordinated switch. Never ignore query strings or fetch new JS as fallback.
    const build=url.searchParams.get('build');
    if(build&&/^[a-f0-9-]{36}$/.test(build)&&await caches.has(PREFIX+build)){
      const old=await caches.open(PREFIX+build);
      const response=await old.match(event.request);
      if(response)return response;
    }
    if(/\.(?:js|css)$/.test(url.pathname))return new Response('Resource not in this release',{status:404});
    return fetch(event.request);
  })());
});
