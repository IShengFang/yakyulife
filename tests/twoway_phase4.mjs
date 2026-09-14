/* 二刀流 第 4 階段：觸發 B（高中解鎖天才後選擇轉入）與事件卡牌庫。
   校準數字見 docs/twoway-design.md §6。 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const POSAB_TW=['sta','vel','ctl','brk','con','pow','spd','eye'];
const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

try{
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=twoway-phase4`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.0.3');
    const phases=await import('./src/flow/phases.js?v=2.0.3');
    const ability=await import('./src/engine/ability.js?v=2.0.3');
    const events=await import('./src/flow/events.js?v=2.0.3');
    const {POS_AB}=await import('./src/data/abilities.js?v=2.0.3');

    /* ① 轉入：新增的那一側從「現有平均 × TW_CONVERT_RATIO」起步，不是從 20 起步。
       從頭擲會讓這個邀請變成陷阱（實測 18.8% → 6.6%）。 */
    const conv={};
    for(const pos of ['P','IF','C']){
      const s=state.newState('轉',1,pos,null); state.setS(s);
      /* 把現有能力墊到高中生後期的水準，才量得出「起點有沒有跟上」 */
      POS_AB[pos].forEach(k=>{ s.ab[k]=44; });
      const before=Object.keys(s.ab).sort().join(',');
      const g=phases.convertToTwoWay('genius');
      const fresh=g.gainedPit.concat(g.gainedBat);
      conv[pos]={before,after:Object.keys(s.ab).sort().join(','),
        fresh:fresh.slice().sort().join(','),
        freshMin:Math.min(...fresh.map(k=>s.ab[k])),
        keptOldTools:['rng','fld','arm','cat'].filter(k=>k in s.ab),
        pos:s.pos,twOrigin:s.twOrigin,dpos:s.dpos,role:s.role,
        potSta:s.pot.sta,ratio:phases.TW_CONVERT_RATIO};
    }

    /* ② 體力潛力的下限：單刀的潛力表過半會把體力抽到 44~62，
       照原值轉過來的話這個邀請對他們是死路。 */
    let lowSta=0;
    for(let i=0;i<2000;i++){
      const s=state.newState('x',1,'P',null); state.setS(s);
      phases.convertToTwoWay('genius');
      if(s.pot.sta<60)lowSta++;
    }

    /* ③ 轉入後 8 項配點鍵齊全、兩側都算得出 ovr。 */
    const s=state.newState('轉',1,'P',null); state.setS(s);
    phases.convertToTwoWay('genius');
    const usable={keys:POS_AB.TW.every(k=>Number.isFinite(s.ab[k])),
      ovrPit:Number.isFinite(ability.ovrPit()),ovrBat:Number.isFinite(ability.ovrBat()),
      ovr:Number.isFinite(ability.ovr()),type:ability.playerType()};

    /* ④ 事件卡：二刀流抽的是投手卡與打者卡的聯集，牌庫不該比任何單刀路線薄。 */
    const pool=(pos,st)=>({training:events.eventPool('training',{...st,pos}).length,
                           endorsement:events.eventPool('endorsement',{...st,pos}).length,
                           encounter:events.eventPool('encounter',{...st,pos}).length});
    const pro={age:25,stage:'PRO',org:'CPBL',lv:'CPBL1'};
    const deck={TW:pool('TW',pro),P:pool('P',pro),IF:pool('IF',pro),C:pool('C',pro)};

    return {conv,lowSta,usable,deck};
  });

  /* ① 轉入起點 */
  for(const pos of ['P','IF','C']){
    const c=r.conv[pos];
    assert.equal(c.pos,'TW');
    assert.equal(c.twOrigin,'genius','觸發 B 的來源要是 genius——七下路線才連坐拔天才');
    assert.equal(c.dpos,'DH');
    assert.equal(c.role,null);
    assert.ok(POSAB_TW.every(k=>c.after.includes(k)),'轉入後八項配點鍵不齊：'+c.after);
    assert.ok(c.freshMin>=Math.floor(44*c.ratio)-1,
      `${pos} 新增能力的起點太低（${c.freshMin}），會讓這個邀請變成陷阱`);
    if(pos!=='P')assert.ok(c.keptOldTools.length>0,'原有的守備工具不該被沒收（決議 7）');
  }
  assert.equal(r.lowSta,0,'轉入後體力潛力必須墊到二刀流的下限，否則過半的人練不動');

  /* ③ 轉入後可用 */
  assert.deepEqual({k:r.usable.keys,p:r.usable.ovrPit,b:r.usable.ovrBat,o:r.usable.ovr},
    {k:true,p:true,b:true,o:true});
  assert.match(r.usable.type,/二刀流|潛力股|老將/);

  /* ④ 牌庫是聯集，每個類別都不少於任何單刀路線 */
  for(const cat of ['training','endorsement','encounter']){
    assert.ok(r.deck.TW[cat]>=Math.max(r.deck.P[cat],r.deck.IF[cat]),
      `二刀流的${cat}牌庫比單刀薄：`+JSON.stringify(r.deck));
  }
  assert.ok(r.deck.TW.training>r.deck.P.training,'二刀流的訓練卡應該是投打聯集，比純投手多');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,2));
}finally{ await browser.close(); }
