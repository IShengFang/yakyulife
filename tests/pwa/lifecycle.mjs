import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {buildSite} from '../../scripts/build-site.mjs';
import {checkSite} from '../../scripts/check-site.mjs';
import {startServer} from '../../scripts/serve.mjs';
import {runCareer,digest} from '../e2e/career-fixture.mjs';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yakyulife-pwa-'));
const a=path.resolve(process.env.SITE_ROOT||'_site'),b=path.join(temp,'b');
const releaseA=await checkSite(a),releaseB=await buildSite(b);
await checkSite(b);
assert.notEqual(releaseA.buildId,releaseB.buildId);
assert.equal(releaseA.appVersion,releaseB.appVersion);
const buildOf=page=>page.locator('meta[name="yakyulife-build"]').getAttribute('content');
const waitStatus=(page,text)=>page.waitForFunction(text=>document.getElementById('pwa-status')?.textContent.includes(text),text,{timeout:30000});
const update=page=>page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
const ready=async page=>{
  await waitStatus(page,'離線資源已備妥');
  await page.locator('#pwa-action').click();
  await waitStatus(page,'可離線使用');
};
const closeServer=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
const launch=profile=>chromium.launchPersistentContext(profile,{headless:true,reducedMotion:'reduce'});
let context,server;
try{
  for(const base of ['/','/yakyulife/']){
    let current=a,fault=null,holdWorker=null;
    const requests=[];
    const local=await startServer({port:0,base,directory:()=>current,onRequest:async(req,res)=>{
      requests.push(req.url);
      if(req.url===base+'sw.js'&&holdWorker)await holdWorker;
      if(req.url===base+'unknown.html'){
        res.writeHead(200,{'Content-Type':'text/html'}).end('<title>Unknown client</title>');return true;
      }
      if(fault&&req.url.includes('src/pwa-build.js')){
        if(fault==='disconnect')req.socket.destroy();
        else if(fault==='mime')res.writeHead(200,{'Content-Type':'text/html'}).end('<html>wrong MIME</html>');
        else{
          const bytes=await fs.readFile(path.join(current,'src/pwa-build.js'));
          bytes[0]^=1;
          res.writeHead(200,{'Content-Type':'text/javascript'}).end(bytes);
        }
        return true;
      }
    }});
    server=local.server;
    const url=local.url,profile=path.join(temp,base==='/'?'root-profile':'sub-profile');
    context=await launch(profile);
    const external=[],errors=[];
    context.on('request',req=>{if(new URL(req.url()).origin!==new URL(url).origin)external.push(req.url());});
    context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));

    // Delay the actual worker response: installation cannot claim a career that
    // began before offline preparation finished (no routing or worker mocks).
    let releaseWorker;
    holdWorker=new Promise(resolve=>{releaseWorker=resolve;});
    const playing=await context.newPage();
    await playing.goto(url);
    await playing.locator('#btn-start').click();
    await playing.locator('#act .btn').first().waitFor();
    releaseWorker();holdWorker=null;
    await waitStatus(playing,'離線資源已備妥');
    assert.equal(await playing.evaluate(()=>!!navigator.serviceWorker.controller),false);
    await playing.locator('#pwa-action').click();
    assert.equal(await playing.locator('#start').evaluate(el=>el.style.display),'none');
    assert.equal(await playing.evaluate(()=>!!navigator.serviceWorker.controller),false);
    await playing.close();
    console.log(`${base} first installation preserves uncontrolled career`);

    const page=await context.newPage();
    await page.goto(url);
    await waitStatus(page,'可離線使用');
    assert.equal(await buildOf(page),releaseA.buildId);
    const cacheName='yakyulife:'+encodeURIComponent(url)+':'+releaseA.buildId;
    assert.equal(await page.evaluate(async name=>(await (await caches.open(name)).keys()).length,cacheName),releaseA.resources.length);
    assert.ok(requests.some(x=>x.includes('Phosphor.woff2')),'real font precache request');
    const manifest=await page.evaluate(async()=>await (await fetch('manifest.webmanifest')).json());
    assert.equal(manifest.start_url,'./');
    await page.evaluate(async()=>{await caches.open('unrelated-cache');});
    for(const entry of ['', 'index.html']){
      await page.goto(new URL(entry+'?seed=offline-same-seed',url).href);
      await waitStatus(page,'可離線使用');
      assert.equal(await page.locator('#seed-show').inputValue(),'offline-same-seed');
    }
    const missing=await page.evaluate(async()=>{
      const js=await fetch('src/core/state.js?v=wrong'),html=await fetch('missing.html');
      return [js.status,js.headers.get('content-type'),html.status];
    });
    assert.equal(missing[0],404);assert.ok(!missing[1]?.includes('text/html'));assert.equal(missing[2],404);

    current=b;
    for(const failure of ['disconnect','mime','hash']){
      fault=failure;
      await update(page);
      await waitStatus(page,'離線下載未完成');
      assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),false);
      assert.equal(await page.evaluate(async build=>(await caches.keys()).some(k=>k.endsWith(build)),releaseB.buildId),false);
      await page.reload();
      await waitStatus(page,'可離線使用');
      assert.equal(await buildOf(page),releaseA.buildId,'failed install must retain active shell');
    }
    fault=null;
    console.log(`${base} download failures preserve active cache`);
    // Reproduce the partial candidate left if the browser process dies before
    // install's error cleanup can run; the real next install must repair it.
    await page.evaluate(async({url,build})=>{
      const cache=await caches.open('yakyulife:'+encodeURIComponent(url)+':'+build);
      await cache.put(new URL('index.html',url),new Response('interrupted download'));
    },{url,build:releaseB.buildId});
    await update(page);
    await waitStatus(page,'新版本可用');
    // Waiting must never expose the newer network HTML, including ?seed navigation.
    await page.goto(new URL('?seed=waiting-shell',url).href);
    await waitStatus(page,'新版本可用');
    assert.equal(await buildOf(page),releaseA.buildId);
    const other=await context.newPage();
    await other.goto(url);
    await waitStatus(other,'新版本可用');
    await other.locator('#btn-start').click();
    await other.locator('#act .btn').first().waitFor();
    await page.locator('#pwa-action').click();
    await waitStatus(page,'更新已延後');
    assert.equal(await buildOf(other),releaseA.buildId);
    assert.equal(await page.locator('#start').evaluate(el=>el.inert),false,'failed vote unlocks home');
    await other.close();
    const unknown=await context.newPage();
    await unknown.goto(new URL('unknown.html',url).href);
    await page.locator('#pwa-action').click();
    await waitStatus(page,'更新已延後');
    await unknown.close();
    console.log(`${base} busy and unknown clients defer update`);

    const home=await context.newPage();await home.goto(url);await waitStatus(home,'新版本可用');
    let reloads=0,homeReloads=0;
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())reloads++;});
    home.on('framenavigated',frame=>{if(frame===home.mainFrame())homeReloads++;});
    await page.locator('#pwa-action').click();
    await Promise.all([waitStatus(page,'可離線使用'),waitStatus(home,'可離線使用')]);
    assert.equal(await buildOf(page),releaseB.buildId);assert.equal(await buildOf(home),releaseB.buildId);
    assert.equal(reloads,1);assert.equal(homeReloads,1);
    await page.waitForFunction(async old=>!(await caches.keys()).some(k=>k.endsWith(old)),releaseA.buildId);
    assert.ok(await page.evaluate(async()=>(await caches.keys()).includes('unrelated-cache')));

    // Rollback is another complete, consented transition, even with the same APP_VER.
    current=a;
    await update(page);await waitStatus(page,'新版本可用');
    await page.locator('#pwa-action').click();
    await Promise.all([waitStatus(page,'可離線使用'),waitStatus(home,'可離線使用')]);
    assert.equal(await buildOf(page),releaseA.buildId);
    await page.waitForFunction(async old=>!(await caches.keys()).some(k=>k.endsWith(old)),releaseB.buildId);
    assert.deepEqual(external,[],'worker and page must not request external resources');
    assert.deepEqual(errors,[]);

    // Clear HTTP cache, close the entire browser, stop the real server, then boot
    // the same persistent profile. Service Worker Cache Storage is the only source.
    const cdp=await context.newCDPSession(page);await cdp.send('Network.clearBrowserCache');
    await context.close();context=null;await closeServer(server);server=null;
    context=await launch(profile);
    for(const id of ['tw','convert']){
      const fixture=JSON.parse(await fs.readFile(new URL(`../fixtures/${id}.json`,import.meta.url)));
      const result=await runCareer(url,fixture,false,{browser:context,realNetwork:true,afterCareer:async p=>{
        await waitStatus(p,'可離線使用');
        // Offline icons must actually resolve to local font glyphs.
        assert.equal(await p.evaluate(async()=>{
          await document.fonts.load('16px Phosphor');
          return document.fonts.check('16px Phosphor');
        }),true);
        await p.evaluate(async()=>{
          const build=document.querySelector('meta[name="yakyulife-build"]').content;
          const share=await import('./src/ui/share-image.js?v=2.0.11&build='+build);
          share.shareImageSheet(['離線結算'],['離線留言'],{title:'離線生涯',body:'完成'});
        });
        await p.waitForFunction(()=>document.querySelector('#sh-pic')?.src?.startsWith('data:image/png'),null,{timeout:10000});
      }});
      assert.equal(digest(result.final),fixture.finalDigest,`${base} offline ${id} fixture`);
      assert.deepEqual(result.years.map(x=>({year:x.year,digest:digest(x)})),fixture.yearDigests);
    }
    await context.close();context=null;
    console.log(`PASS ${base}: install, seed, full cache, three download failures, waiting shell, multi-tab vote/reload, cleanup, rollback, persistent offline careers + PNG`);
  }

  const local=await startServer({port:0,directory:a});server=local.server;
  const browser=await webkit.launch();
  try{
    for(const fail of [false,true]){
      const p=await browser.newPage();
      if(fail)await p.addInitScript(()=>Object.defineProperty(navigator.serviceWorker,'register',{
        value:()=>Promise.reject(new Error('Registration denied'))}));
      const errors=[];p.on('pageerror',e=>errors.push(e.message));
      await p.goto(local.url);
      if(fail)await waitStatus(p,'離線尚未就緒，可連線遊玩');
      await p.locator('#btn-start').click();await p.locator('#act .btn').first().waitFor();
      if(fail){
        await p.locator('#pwa-action').click();
        assert.equal(await p.locator('#start').evaluate(el=>el.style.display),'none','retry must preserve an unsaved career');
      }
      assert.deepEqual(errors,[]);await p.close();
    }
  }finally{await browser.close();}
  console.log('PASS WebKit normal gameplay and registration failure fallback');
}finally{
  if(context)await context.close();
  if(server)await closeServer(server);
  await fs.rm(temp,{recursive:true,force:true});
}
