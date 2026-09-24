import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from 'playwright';

export const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function runCareer(url,fixture,record=false,options={}){
  const browser=options.browser||await chromium.launch({headless:true});
  let page;
  try{
    page=await browser.newPage({reducedMotion:'reduce'});
    const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.route(/^https?:/,route=>new URL(route.request().url()).origin===new URL(url).origin
      ?route.continue():route.fulfill({status:200,contentType:'text/css',body:''}));
    await page.goto(new URL(`?seed=${encodeURIComponent(fixture.seed)}`,url).href,
      {waitUntil:'domcontentloaded'});
    await page.locator('#in-name').fill(fixture.name);
    await page.locator('#in-number').fill(String(fixture.jersey));
    await page.locator(`#seg-pos button[data-v="${fixture.pos}"]`).click();
    await page.locator('#btn-start').click();
    const result=await page.evaluate(async({record,expected,conversion,probe})=>{
      const {S}=await import('./src/core/state.js?v=2.0.11');
      const actions=[],years=[];
      let at=0,lastYear=S.year,undid=false,sawConversion=false;
      const text=el=>el.textContent.trim().replace(/\s+/g,' ');
      const snapshot=()=>({year:S.year,age:S.age,pos:S.pos,twOrigin:S.twOrigin,
        stage:S.stage,lv:S.lv,team:S.team,orgTeam:S.orgTeam,
        ab:S.ab,pot:S.pot,stats:S.stats,salary:S.salary,
        honors:S.honors,log:S.log,
        ending:[...document.querySelectorAll('#log .card')].find(x=>
          x.querySelector('h4')?.textContent.includes('退役後・')||
          x.querySelector('h4')?.textContent.includes('第二人生'))?.textContent.trim()||null,
        done:S.done});
      const push=(action)=>{
        if(record)actions.push(action);
        else assertAction(action);
      };
      const assertAction=action=>{
        const want=expected[at];
        if(JSON.stringify(want)!==JSON.stringify(action))
          throw new Error(`Action ${at}: expected ${JSON.stringify(want)}, got ${JSON.stringify(action)}`);
        at++;
      };
      for(let n=0;n<5000&&!S.done;n++){
        const alloc=[...document.querySelectorAll('#al-rows .abrow')].filter(el=>el.onclick);
        const done=document.querySelector('#al-btm .btn.main');
        const undo=document.querySelector('#al-btm .btn:not(.main)');
        const choices=[...document.querySelectorAll('#act > button.btn')];
        if(probe&&choices.length&&text(document.querySelector('#act > .title')||document.querySelector('#act')).includes('天賦覺醒')){
          sawConversion=true;break;
        }
        if(alloc.length){
          const row=alloc[0],idx=[...row.parentElement.children].indexOf(row);
          push(['a',idx]);row.click();
          if(!undid){
            const u=document.querySelector('#al-btm .btn:not(.main)');
            if(u&&!u.disabled){push(['u']);u.click();undid=true;}
          }
        }else if(done){push(['d']);done.click();}
        else if(choices.length){
          const title=text(document.querySelector('#act > .title')||document.querySelector('#act'));
          let idx=choices.findIndex(x=>x.classList.contains('main'));
          if(idx<0)idx=0;
          if(conversion&&title.includes('天賦覺醒')){
            const offer=choices.findIndex(x=>text(x).includes('二刀流'));
            if(offer>=0){idx=offer;sawConversion=true;}
          }
          const label=text(choices[idx]);push(['c',title,idx,label]);choices[idx].click();
        }else{
          await new Promise(resolve=>setTimeout(resolve,10));
          if(n>20)throw new Error(`No action at year ${S.year}, ${S.stage}`);
        }
        if(S.year!==lastYear||S.done){years.push(structuredClone(snapshot()));lastYear=S.year;}
        if(n===4999)throw new Error('Career exceeded 5000 actions');
      }
      if(!record&&!probe&&at!==expected.length)throw new Error(`Only replayed ${at}/${expected.length} actions`);
      return {actions,years,final:structuredClone(snapshot()),sawConversion,undid};
    },{record,expected:fixture.actions||[],conversion:!!fixture.conversion,probe:!!options.probe});
    assert.deepEqual(pageErrors,[]);
    if(options.probe)return result;
    assert.ok(result.final.done,'career must reach retirement');
    assert.ok(result.undid,'career must exercise allocation undo');
    if(fixture.conversion)assert.ok(result.sawConversion,'conversion offer was not reached');
    return result;
  }finally{if(page)await page.close();if(!options.browser)await browser.close();}
}
