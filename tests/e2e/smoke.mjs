import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route(/^https?:/,route=>{
      if(new URL(route.request().url()).origin===new URL(url).origin)return route.continue();
      return route.fulfill({status:200,contentType:'text/css',body:''});
    });
    await page.goto(new URL('?seed=phase0-smoke',url).href,{waitUntil:'domcontentloaded'});
    await page.locator('#in-name').fill('基準測試');
    await page.locator('#in-number').fill('17');
    await page.locator('#btn-start').click();
    await page.locator('#act .btn').first().waitFor();
    assert.equal(await page.locator('#start').evaluate(el=>getComputedStyle(el).display),'none');
    const before=await page.locator('#log .card').count();
    await page.locator('#act .btn').first().click();
    assert.ok((await page.locator('#log .card').count())>=before);
    assert.deepEqual(errors,[],`${name} browser errors`);
    process.stdout.write(`${name}: first game interaction passed\n`);
  }finally{await browser.close();}
}
