/* 聯盟環境：par 的球員要打出聯盟平均、能力 80 的球員要打出聯盟頂尖，
   而且 ERA 與 WHIP 必須同進同退。

   舊版把 6.2 K/9、4.6 BB/9、9.2 H/9、.252 打擊率、1.0% 全壘打率全部寫死，
   只靠「− par」表達聯盟差異，於是三個聯盟的平均球季長得一模一樣；
   而 ERA 是獨立擲的，跟被安打／四死球無關，par 的投手會同時印出
   WHIP 1.53 與 ERA 4.32——同一列上的兩個數字互相打臉。

   對照的真實數字見 data/teams.js 的 env 註解。 */
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
  await page.goto(`${url}?seed=league-env`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const rng=await import('./src/core/rng.js?v=1.5.12');
    const season=await import('./src/engine/season.js?v=1.5.12');
    const {LV,envWhip,envLeagueOps}=await import('./src/data/teams.js?v=1.5.12');
    const th=await import('./src/data/thresholds.js?v=1.5.12');
    const med=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1];};

    const pit=(lv,ab,n)=>{ const o=[];
      for(let i=0;i<n;i++){ rng.seedInit('E'+lv+ab+i);
        const s=state.newState('投',1,'P',null);
        Object.assign(s,{stage:'PRO',lv,org:LV[lv].top,orgTeam:'X',role:'SP',
          seasonFactor:1,age:27,effort:'普通投'});
        Object.assign(s.ab,{sta:70,vel:ab,ctl:ab,brk:ab}); state.setS(s);
        const st=season.simSeason(lv); season.normalizePitchingStats(st,lv);
        const ip=st.IP;
        o.push({era:season.baseballERA(st),whip:season.baseballWHIP(st),
          k9:st.SO/ip*9,bb9:season.pitBB(st)/ip*9,h9:season.pitH(st)/ip*9,
          pHR:st.pHR,pH:season.pitH(st),
          /* 重算一次應該完全不動——四個會改成績的地方都走同一支 syncEra */
          reEra:(season.syncEra(st,lv),season.baseballERA(st))}); }
      return o; };
    const bat=(lv,ab,n)=>{ const o=[];
      for(let i=0;i<n;i++){ rng.seedInit('B'+lv+ab+i);
        const s=state.newState('打',1,'IF',null);
        Object.assign(s,{stage:'PRO',lv,org:LV[lv].top,orgTeam:'X',dpos:'1B',seasonFactor:1,age:27});
        Object.assign(s.ab,{sta:ab,con:ab,pow:ab,spd:ab,eye:ab,rng:60,fld:60,arm:60}); state.setS(s);
        const st=season.simSeason(lv);
        o.push({avg:st.AB?st.H/st.AB:0,HR:st.HR}); }
      return o; };

    const out={};
    for(const lv of ['CPBL1','NPB1','MLB']){
      const E=LV[lv].env, par=LV[lv].par;
      const P=pit(lv,par,300), P80=pit(lv,80,120);
      const B=bat(lv,par,300), B80=bat(lv,80,300);
      out[lv]={env:{era:E.era,whip:+envWhip(E).toFixed(3),k9:E.k9,bb9:E.bb9,h9:E.h9,avg:E.avg},
        par:{era:+med(P.map(x=>x.era)).toFixed(2),whip:+med(P.map(x=>x.whip)).toFixed(3),
             k9:+med(P.map(x=>x.k9)).toFixed(2),bb9:+med(P.map(x=>x.bb9)).toFixed(2),
             h9:+med(P.map(x=>x.h9)).toFixed(2),avg:+med(B.map(x=>x.avg)).toFixed(3)},
        top:{era:+med(P80.map(x=>x.era)).toFixed(2),HR:med(B80.map(x=>x.HR)),
             avg:+med(B80.map(x=>x.avg)).toFixed(3)},
        hrAllowed:{always:P.every(x=>Number.isFinite(x.pHR)),
                   leHits:P.every(x=>x.pHR<=x.pH)},
        eraStable:P.every(x=>Math.abs(x.reEra-x.era)<0.02),
        lgOps:+envLeagueOps(E).toFixed(3),
        th:{pitch:th.pitchTh(lv),bat:th.batTh(lv),keep:th.keepTh(lv)}};
    }
    return out;
  });

  const L=['CPBL1','NPB1','MLB'];
  for(const lv of L){
    const x=r[lv];
    /* ① par 的球員＝聯盟平均。這是整個環境表的定義，對不上就代表內插壞了。 */
    assert.ok(Math.abs(x.par.era-x.env.era)<0.10,`${lv} par 的 ERA 沒有落在聯盟平均：${x.par.era} vs ${x.env.era}`);
    assert.ok(Math.abs(x.par.k9-x.env.k9)<0.25,`${lv} par 的 K/9 偏離：${x.par.k9} vs ${x.env.k9}`);
    assert.ok(Math.abs(x.par.bb9-x.env.bb9)<0.20,`${lv} par 的 BB/9 偏離：${x.par.bb9} vs ${x.env.bb9}`);
    assert.ok(Math.abs(x.par.h9-x.env.h9)<0.30,`${lv} par 的 H/9 偏離：${x.par.h9} vs ${x.env.h9}`);
    assert.ok(Math.abs(x.par.avg-x.env.avg)<0.012,`${lv} par 的打擊率偏離：${x.par.avg} vs ${x.env.avg}`);

    /* ② ERA 與 WHIP 必須是同一個投手的兩個面向。舊版 par 的投手是 WHIP 1.53／ERA 4.32，
       那兩個數字在真實棒球裡不可能同時出現。 */
    assert.ok(Math.abs(x.par.whip-x.env.whip)<0.05,
      `${lv} par 的 WHIP 沒有跟著被安打與四死球走：${x.par.whip} vs ${x.env.whip}`);
    assert.equal(x.eraStable,true,`${lv} ERA 不是從零件算的——重算一次就變了`);

    /* ③ 被全壘打是獨立欄位，而且不可能超過被安打 */
    assert.equal(x.hrAllowed.always,true,`${lv} 沒有產生被全壘打 pHR`);
    assert.equal(x.hrAllowed.leHits,true,`${lv} 被全壘打超過被安打`);

    /* ④ 能力 80 ＝ 聯盟頂尖：ERA 要壓到聯盟平均的一半上下，打擊率要摸到打擊王 */
    assert.ok(x.top.era<x.env.era*0.62,`${lv} 滿檔投手壓不下去：${x.top.era} vs 聯盟 ${x.env.era}`);
    assert.ok(x.top.avg>x.env.avg*1.28,`${lv} 滿檔打者的打擊率不夠高：${x.top.avg}`);

    /* ⑤ 門檻表要跟著聯盟走，而且級距順序正確 */
    const t=x.th;
    assert.ok(t.pitch.era3<t.pitch.era2&&t.pitch.era2<t.pitch.era1,`${lv} 投手評等門檻順序錯亂`);
    assert.ok(t.bat.ops3>t.bat.ops2&&t.bat.ops2>t.bat.ops1,`${lv} 打者評等門檻順序錯亂`);
    assert.ok(t.keep.era>t.pitch.era2,`${lv} 降級免疫應該比「評等2」寬鬆`);
  }

  /* ⑥ 三個聯盟的長打環境順序：大聯盟 > 日職 > 中職。舊版是反的——
     0.075 的上限只有中職碰得到，最強的聯盟反而是天花板最低的。 */
  const hr=L.map(lv=>r[lv].top.HR);
  assert.ok(hr[2]>hr[1]&&hr[1]>hr[0],
    `滿檔砲的全壘打順序不是「大聯盟 > 日職 > 中職」：中職 ${hr[0]}／日職 ${hr[1]}／大聯盟 ${hr[2]}`);
  assert.ok(hr[0]>=25&&hr[0]<=36,'中職滿檔砲應該落在 30 支上下：'+hr[0]);
  assert.ok(hr[1]>=34&&hr[1]<=47,'日職滿檔砲應該落在 40 支上下：'+hr[1]);
  assert.ok(hr[2]>=43&&hr[2]<=58,'大聯盟滿檔砲應該落在 50 支上下：'+hr[2]);

  /* ⑦ 中職是高打擊率、低長打的聯盟（真實：.259／1.59%），日職與大聯盟打擊率一樣低 */
  assert.ok(r.CPBL1.env.avg>r.NPB1.env.avg&&r.CPBL1.env.avg>r.MLB.env.avg,
    '中職的聯盟打擊率應該最高');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,1));
}finally{ await browser.close(); }
