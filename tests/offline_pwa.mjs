/* A real browser, real worker and real disk profile; no mocked Cache API.
   node tests/offline_pwa.mjs (does not need the normal :8124 test server). */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const temp=mkdtempSync(join(tmpdir(),'yakyulife-offline-'));
const fixture=join(temp,'site');
for(const path of ['index.html','manifest.webmanifest','src','css','assets','tools']){
  cpSync(join(root,path),join(fixture,path),{recursive:true});
}
function release(){
  execFileSync(process.execPath,[join(fixture,'tools/build-offline.mjs')]);
  const worker=readFileSync(join(fixture,'sw.js'),'utf8');
  const assets=JSON.parse(worker.match(/const OFFLINE_ASSETS=([\s\S]*?);/)[1]);
  return new Map([...assets.map(a=>[a.url,readFileSync(join(fixture,a.url))]),['sw.js',Buffer.from(worker)]]);
}
let files=release(),broken='src/engine/season.js';
const manifest=JSON.parse(files.get('manifest.webmanifest'));
assert.equal(manifest.display,'standalone');
assert.equal(manifest.start_url,'./');
assert.equal(manifest.scope,'./');
assert.equal(manifest.id,'./');
assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'&&files.has(icon.src)));
assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&files.has(icon.src)));
const requests=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json',
  '.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  let file=url.pathname.replace(/^\/(?:yakyulife\/)?/,'')||'index.html';
  requests.push(url.pathname+url.search);
  res.setHeader('Cache-Control','no-store'); // Ordinary HTTP cache cannot make these tests pass.
  if(url.searchParams.has('__offline')&&file===broken){res.writeHead(200);res.end('stale CDN body');return;}
  if(!files.has(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');
  res.end(files.get(file));
});
async function listen(port=0){await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return server.address().port;}
async function stop(){if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
const port=await listen();
const base=`http://127.0.0.1:${port}/`;
const browserType=process.env.PWA_BROWSER==='webkit'?webkit:chromium;
const options={headless:true,viewport:{width:390,height:844},deviceScaleFactor:2,
  ...(browserType===chromium&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})};
let context;
const errors=[];
async function launch(){
  context=await browserType.launchPersistentContext(join(temp,'profile'),options);
  // Optional fonts deliberately unavailable even on the first visit.
  await context.route('https://fonts.googleapis.com/**',route=>route.abort());
  await context.route('https://fonts.gstatic.com/**',route=>route.abort());
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  return context;
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#offline-summary')?.dataset.ready==='true',null,{timeout:30000});}
async function waitForRegistration(page,predicate,scope){
  const deadline=Date.now()+30000;
  let state;
  do{
    // Await the lookup on every poll; async waitForFunction predicates return a truthy Promise.
    state=await page.evaluate(async url=>{
      const reg=await navigator.serviceWorker.getRegistration(url);
      return reg?{installing:reg.installing?.state,waiting:reg.waiting?.state,active:reg.active?.state}:null;
    },scope);
    if(state&&predicate(state))return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }while(Date.now()<deadline);
  assert.fail('Timed out waiting for service worker registration: '+JSON.stringify(state));
}
async function status(page){return page.evaluate(async()=>{
  const channel=new MessageChannel();
  const result=new Promise(resolve=>channel.port1.onmessage=e=>{channel.port1.close();resolve(e.data);});
  navigator.serviceWorker.controller.postMessage({type:'GET_OFFLINE_STATUS'},[channel.port2]);
  return result;
});}
async function play(page){
  await page.locator('#btn-start').click();
  await page.waitForFunction(()=>document.querySelector('#start').style.display==='none');
  assert.ok((await page.locator('#log').innerText()).includes('球員誕生'));
  // Drive one real action (e.g. roll training dice), then check that the UI advanced.
  const before=await page.locator('#act').innerText();
  await page.locator('#act button:not([disabled])').first().click();
  await page.waitForFunction(old=>document.querySelector('#act').innerText!==old,before);
  const loaded=await page.evaluate(async()=>Promise.all(['Phosphor','Phosphor-Bold','Phosphor-Fill'].map(async family=>{
    const faces=await document.fonts.load(`16px "${family}"`);
    return faces.length>0&&faces.every(face=>face.status==='loaded');
  })));
  assert.deepEqual(loaded,[true,true,true],'all three icon fonts must work without a CDN');
}

try{
  await launch();
  let page=await context.newPage();
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>/未完成|未就緒/.test(document.querySelector('#offline-summary').textContent));
  assert.notEqual(await page.locator('#offline-summary').getAttribute('data-ready'),'true','partial install must not claim offline readiness');
  broken=null;
  await page.locator('#offline-open').click();
  await page.locator('#offline-prepare').click();
  await ready(page);
  await page.locator('#offline-dialog form button').click();
  console.log('PASS failed integrity check → retry → complete install');

  // Simulate losing one file, and prove readiness is based on Cache Storage contents.
  const initial=await status(page);
  await page.evaluate(async()=>{
    const name=(await caches.keys()).find(n=>n.startsWith('yakyulife-offline-%2F-'));
    await (await caches.open(name)).delete(new URL('src/data/teams.js',location.href).href);
  });
  await page.locator('#offline-open').click();
  await page.waitForFunction(()=>document.querySelector('#offline-summary').dataset.ready==='false');
  await page.locator('#offline-prepare').click();
  await ready(page);
  await page.locator('#offline-dialog form button').click();
  assert.equal((await status(page)).completed,initial.total);
  console.log('PASS missing cache file detected and repaired');

  await page.locator('#in-name').fill('離線球員');
  await page.locator('#in-number').fill('17');
  await play(page);
  await page.locator('#btn-menu').click();
  await page.locator('#md-offline').click();
  assert.equal(await page.locator('#offline-dialog').evaluate(el=>el.open),true);
  await page.locator('#offline-dialog form button').click();

  const nested=await context.newPage();
  await nested.goto(base+'yakyulife/',{waitUntil:'domcontentloaded'});
  await ready(nested);
  assert.ok(await nested.evaluate(()=>navigator.serviceWorker.controller.scriptURL.endsWith('/yakyulife/sw.js')));
  await nested.evaluate(()=>caches.open('another-app-cache'));
  assert.ok((await nested.locator('link[rel="manifest"]').getAttribute('href'))==='manifest.webmanifest');
  await context.close();context=null;
  await stop();

  // Stop the real server instead of emulating offline mode (which can block WebKit workers).
  // After a browser-process restart, disk storage is the only source.
  await launch();
  page=await context.newPage();
  const offlineResponses=[];
  page.on('response',response=>{if(response.url().startsWith(base))offlineResponses.push(response.fromServiceWorker());});
  await page.goto(base+'?seed=cold-boot',{waitUntil:'domcontentloaded'});
  await ready(page);
  assert.equal(await page.locator('#in-name').inputValue(),'離線球員');
  assert.equal(await page.locator('#seed-show').inputValue(),'cold-boot');
  await play(page);
  assert.ok(offlineResponses.length>30&&offlineResponses.every(Boolean),'all local resources must come from the worker');
  const indexPage=await context.newPage();
  await indexPage.goto(base+'index.html?seed=index-offline',{waitUntil:'domcontentloaded'});
  await ready(indexPage);
  await indexPage.close();
  const subPage=await context.newPage();
  await subPage.goto(base+'yakyulife/?seed=subdirectory',{waitUntil:'domcontentloaded'});
  await ready(subPage);
  await play(subPage);
  console.log('PASS offline browser-process restart, seed URLs, root and subdirectory gameplay');

  // New release: fail once, then verify waiting semantics while a career is open.
  const html=readFileSync(join(fixture,'index.html'),'utf8').replace('<body>','<body data-test-release="updated">');
  writeFileSync(join(fixture,'index.html'),html);
  files=release();broken='index.html';
  await listen(port);
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await waitForRegistration(page,reg=>!reg.installing&&!reg.waiting);
  assert.equal((await status(page)).version,initial.version);
  assert.ok((await status(page)).ready);
  console.log('PASS failed update preserves the playable release');

  broken=null;requests.length=0;
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await waitForRegistration(page,reg=>reg.waiting==='installed');
  assert.equal((await status(page)).version,initial.version);
  assert.equal(await page.locator('body').getAttribute('data-test-release'),null);
  assert.equal(await page.locator('#start').evaluate(el=>el.style.display),'none','update must not restart the career');
  const downloads=requests.filter(url=>url.includes('__offline='));
  assert.deepEqual(downloads.map(url=>new URL(url,base).pathname),['/index.html'],'unchanged assets must be reused');
  await page.close();
  // The other scope still has a running page; it must not prevent or be erased by this update.
  await waitForRegistration(subPage,reg=>!reg.waiting&&reg.active==='activated',base);
  await stop();
  page=await context.newPage();
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await ready(page);
  assert.equal(await page.locator('body').getAttribute('data-test-release'),'updated');
  const cacheNames=await page.evaluate(()=>caches.keys());
  assert.equal(cacheNames.filter(n=>n.startsWith('yakyulife-offline-%2F-')).length,1);
  assert.ok(cacheNames.some(n=>n.startsWith('yakyulife-offline-%2Fyakyulife%2F-')));
  assert.ok(cacheNames.includes('another-app-cache'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS update waits for closed clients, reuses files, activates offline, and preserves other scopes');
}finally{
  if(context)await context.close();
  await stop();
  rmSync(temp,{recursive:true,force:true});
}
