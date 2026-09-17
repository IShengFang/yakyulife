/* 二刀流收斂判定：升級緩衝一季 ＋ 成績豁免。

   玩家回報的那一局：24 歲、2A 打出 .304／42 轟／OPS 1.023，同一季投出
   ERA 2.52／WHIP 1.01，隔年直接跳上大聯盟，季初立刻被判「打擊跟不上大聯盟」。
   2A 的 min 是 47、大聯盟是 56，一個休賽季門檻跳了 9 點，而他在大聯盟
   還沒打過一球——卡片寫「球團把數據攤在你面前」，那個當下沒有數據可以攤。

   改法：判定一律用「他真的打過的那個層級」的尺。這支測試守住六件事：
     ① 第一次以二刀流站上職業的那一季不判定（沒有任何可以量的數據）
     ② 升級當季沿用舊層級的門檻——在舊層級站得住就不收斂
     ③ 舊層級就已經站不住 → 升級當季照樣收斂（緩衝不是免死金牌）
     ④ 在新層級站過一季之後，才改用新層級的門檻
     ⑤ 成績豁免：能力值差一點，但上一季弱側真的打出該層級的水準 → 不收斂
     ⑥ 降級不吃緩衝：往下走的時候直接用當前（較寬）的尺 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

try{
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=twoway-audit-grace`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state =await import('./src/core/state.js?v=2.0.9');
    const phases=await import('./src/flow/phases.js?v=2.0.9');
    const ability=await import('./src/engine/ability.js?v=2.0.9');
    const {LV}  =await import('./src/data/teams.js?v=2.0.9');

    /* 回報案例的能力側寫：投球側撐得住大聯盟，打擊側只到 2A 的水準。
       打擊四圍在 TW_BAR 收到 min+1.2 之後往上抬了兩點——測資要的是
       「過得了 2A、過不了大聯盟」這個關係，不是某一組固定的數字；
       底下三條斷言會把這個前提再驗一次，所以門檻再動也不會悄悄失效。 */
    const AB={sta:60,vel:62,ctl:60,brk:61,con:56,pow:55,spd:47,eye:51,rng:24,fld:24,arm:24};
    const mk=(over={},abv)=>{
      const s=state.newState('Lee',50,'TW',null);
      Object.assign(s,{stage:'PRO',year:2034,age:24,org:'MiLB',orgTeam:'孤星騎兵',
        lv:'A2',role:'SP',dpos:'DH',seasonFactor:1,effort:'普通投',twSeasons:3},over);
      Object.assign(s.ab,AB,abv||{});
      s.teamName=function(){return this.orgTeam||'';};
      state.setS(s); return s;
    };
    const run=(over,abv)=>{ const s=mk(over,abv);
      const fired=phases.twoWayAudit();
      return {fired,pos:s.pos,auditLv:s.twAuditLv,fellLv:s.twFellLv||null}; };

    /* 門檻本身，方便斷言時對照。ovr 讀的是 S，所以要先立一個狀態起來。 */
    mk();
    const bars={A2:LV.A2.min-phases.TW_BAR,MLB:LV.MLB.min-phases.TW_BAR,
      ovrPit:+ability.ovrPit().toFixed(2),ovrBat:+ability.ovrBat().toFixed(2)};

    /* ① 第一季：twAuditLv 還沒設定，一律放行並記下層級。 */
    const first=run({lv:'A2',twAuditLv:null});

    /* ②③④ 回報案例：2A → 大聯盟。 */
    const promoted =run({lv:'MLB',twAuditLv:'A2'});                 /* 升級當季，用 2A 的尺 */
    const settled  =run({lv:'MLB',twAuditLv:'MLB'});                /* 站過一季，用大聯盟的尺 */
    const tooWeak  =run({lv:'MLB',twAuditLv:'A2'},{con:22,pow:22,spd:22,eye:22}); /* 2A 都站不住 */

    /* ⑤ 成績豁免：能力值過不了大聯盟那條線，但上一季弱側真的打出水準。
       d 是「該季實力 − 該層級 par」，門檻是 (min − par) − TW_BAR＝大聯盟 −1.8。 */
    const exempt=run({lv:'MLB',twAuditLv:'MLB',lastLv:'MLB',
      lastSt:{dPit:6,dBat:-1}});                                     /* 弱側 −1 ≥ −3.5 → 留 */
    const noExempt=run({lv:'MLB',twAuditLv:'MLB',lastLv:'MLB',
      lastSt:{dPit:6,dBat:-9}});                                     /* 弱側 −9 → 收斂 */
    const injured=run({lv:'MLB',twAuditLv:'MLB',lastLv:'MLB',
      lastSt:{dPit:6}});                                             /* 傷缺季沒有 dBat → 不給豁免 */

    /* ⑥ 降級：大聯盟 → 2A，用 2A 的尺（較寬），不吃緩衝也不該被收斂。 */
    const demoted=run({lv:'A2',twAuditLv:'MLB'});

    return {bars,first,promoted,settled,tooWeak,exempt,noExempt,injured,demoted};
  });

  const B=JSON.stringify(r.bars);
  /* 側寫要對：投球側過得了大聯盟，打擊側只過得了 2A。不然底下的斷言沒有意義。 */
  assert.ok(r.bars.ovrPit>=r.bars.MLB,`測資的投球側應該撐得住大聯盟 ${B}`);
  assert.ok(r.bars.ovrBat>=r.bars.A2,`測資的打擊側應該撐得住 2A ${B}`);
  assert.ok(r.bars.ovrBat<r.bars.MLB,`測資的打擊側應該撐不住大聯盟 ${B}`);

  /* ① */
  assert.equal(r.first.fired,false,'第一次以二刀流站上職業的那一季不該判定');
  assert.equal(r.first.auditLv,'A2','放行的同時要把層級記下來');

  /* ② 這就是玩家回報的那一格 */
  assert.equal(r.promoted.fired,false,
    '剛從 2A 升上大聯盟就用大聯盟的尺去量——這正是回報的 bug');
  assert.equal(r.promoted.pos,'TW');
  assert.equal(r.promoted.auditLv,'MLB','緩衝過了，下一季要改用新層級');

  /* ③ */
  assert.equal(r.tooWeak.fired,true,'在舊層級就已經站不住的人，升級當季照樣收斂');
  assert.equal(r.tooWeak.pos,'P','打擊側崩掉要留投手');

  /* ④ */
  assert.equal(r.settled.fired,true,'在大聯盟站過一季之後，就該用大聯盟的尺');
  assert.equal(r.settled.fellLv,'MLB','收斂記錄的層級是他當下所在的層級');

  /* ⑤ */
  assert.equal(r.exempt.fired,false,'上一季弱側打出該層級的水準就不該被收斂');
  assert.equal(r.noExempt.fired,true,'弱側成績也不到水準時，豁免不該生效');
  assert.equal(r.injured.fired,true,'沒有該側的成績就沒有豁免，退回能力值判定');

  /* ⑥ */
  assert.equal(r.demoted.fired,false,'降回 2A 之後，用 2A 的尺應該撐得住');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,1));
}finally{ await browser.close(); }
