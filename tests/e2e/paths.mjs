import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startServer} from '../../scripts/serve.mjs';

const browser=await chromium.launch({headless:true});
try{
  for(const base of ['/','/yakyulife/']){
    const {server,url}=await startServer({port:0,base});
    try{
      const page=await browser.newPage();
      try{
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.route(/^https?:/,route=>new URL(route.request().url()).origin===new URL(url).origin
          ?route.continue():route.fulfill({status:200,contentType:'text/css',body:''}));
        for(const entry of ['', 'index.html']){
          await page.goto(new URL(`${entry}?seed=phase0-path`,url).href,{waitUntil:'domcontentloaded'});
          assert.equal(await page.locator('#seed-show').inputValue(),'phase0-path');
          assert.equal(await page.locator('#ver-badge').textContent(),'v2.0.11');
          assert.equal(new URL(page.url()).pathname,base+entry);
        }
        assert.deepEqual(errors,[]);
        process.stdout.write(`${base} and ${base}index.html: seed entry passed\n`);
      }finally{await page.close();}
    }finally{await new Promise(resolve=>server.close(resolve));}
  }
}finally{await browser.close();}
