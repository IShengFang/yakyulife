/* 二刀流 第 5 階段：結算版面。
   一段二刀流生涯在四張表(逐年板、生涯累積、逐年結算、合約薪資)與結算圖上，
   投打兩側都必須看得到；而且判斷依據要跟計分一致——看「打出來的東西」，
   不是退休當下的 S.pos（89.5% 的人退休前已經被強制轉回單刀）。

   同時守住第 2 階段留下的一個回歸：投球側的欄位分家沒做乾淨的話，
   純投手的 st.G 會變成 0（見 §「單刀投手的 G」的斷言）。 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=twoway-phase5`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const season=await import('./src/engine/season.js?v=1.5.12');
    const career=await import('./src/engine/career.js?v=1.5.12');
    const retire=await import('./src/ui/retire.js?v=1.5.12');
    const share=await import('./src/ui/share-image.js?v=1.5.12');

    /* ── ① 單刀投手的 G ──
       第 2 階段把投球區塊整段改成寫 st.GP，而 normalizePitchingStats 是靠
       Number.isFinite(st.GP) 判斷「這是不是二刀流」，結果每個純投手都被判成
       二刀流：st.G 從此永遠是 0，逐年表、後援出賽上限、鐵人判定全部讀到 0。 */
    const p=state.newState('純投',1,'P',null);
    Object.assign(p,{stage:'PRO',lv:'CPBL1',role:'SP',seasonFactor:1,age:25});
    Object.assign(p.ab,{sta:55,vel:60,ctl:58,brk:56});
    state.setS(p);
    const ps=season.simSeason('CPBL1'); season.normalizePitchingStats(ps,'CPBL1');
    const soloP={G:ps.G,hasGP:'GP' in ps,hasPH:'pH' in ps,
      whip:ps.WHIP,recomputed:+(season.baseballWHIP(ps)||0).toFixed(2)};

    /* ── ② 二刀流：兩側的欄位真的分家 ── */
    const t=state.newState('二刀',1,'TW',null);
    Object.assign(t,{stage:'PRO',lv:'CPBL1',role:'SP',dpos:'DH',seasonFactor:1,age:25,effort:'普通投'});
    Object.assign(t.ab,{sta:60,vel:62,ctl:58,brk:58,con:62,pow:60,spd:52,eye:56});
    state.setS(t);
    const ts=season.simSeason('CPBL1'); season.normalizePitchingStats(ts,'CPBL1');
    const twSeason={GP:ts.GP,G:ts.G,pH:ts.pH,pBB:ts.pBB,H:ts.H,BB:ts.BB,IP:ts.IP,PA:ts.PA,
      whip:+(season.baseballWHIP(ts)||0).toFixed(2),
      whipFromBatting:+(((ts.H+ts.BB)/ts.IP)).toFixed(2)};

    /* ── ③ 版面：已被強制轉回外野手，但十九年的二刀流履歷還在 ── */
    const twStat=()=>({yr:19,GP:360,G:2100,PA:8800,AB:7700,H:2200,HR:330,RBI:1200,SB:80,BB:900,
      pH:1900,pBB:620,W:150,L:90,SV:0,HLD:0,IP:2100,SO:2000,ER:760,AS:8,DEF:0,DPG:{DH:2100}});
    const yr=(y,two)=>({y,age:20+(y-2040),tm:'新北騎士一軍',lv:'CPBL1',p:'DH',role:'SP',
      salary:5000+(y-2040)*100,inj:false,
      st:two?{GP:22,G:120,PA:500,AB:440,H:130,HR:28,RBI:90,SB:4,BB:55,pH:110,pBB:40,
              W:12,L:6,SV:0,HLD:0,IP:140,SO:150,ER:45,avg:130/440,DEF:0,_dh:true}
            /* 被強制轉回之後的單刀打者球季：投球側整排要印 '-'，不是 0 */
            :{G:130,PA:560,AB:500,H:150,HR:30,RBI:100,SB:5,BB:55,W:0,L:0,SV:0,HLD:0,
              IP:0,SO:0,ER:0,avg:150/500,DEF:0,_dh:true}});
    const s=state.newState('大谷',1,'OF',null);
    Object.assign(s,{stage:'PRO',year:2059,age:39,org:'CPBL',lv:'CPBL1',orgTeam:'新北騎士',
      dpos:'DH',role:null,twSeasons:19,salary:120000,seasonFactor:1,
      stats:{CPBL:twStat(),NPB:null,MLB:null,MINOR:null},
      honors:['2050 中職年度最佳投手','2050 中職年度最佳打者'],
      intlCount:2,
      intlStat:{G:18,GP:3,PA:76,AB:66,H:22,HR:5,RBI:16,SB:1,BB:10,pH:20,pBB:8,
        W:2,L:0,SV:0,HLD:0,IP:24,SO:30,ER:8},
      intlLog:[{year:2047,name:'世界棒球經典賽',rank:'冠軍',
        st:{G:9,GP:2,PA:38,AB:33,H:11,HR:3,RBI:9,SB:0,BB:5,pH:10,pBB:4,W:1,L:0,SV:0,IP:12,SO:15,ER:4}},
        {year:2051,name:'世界12強賽',rank:'亞軍',
        st:{G:9,GP:1,PA:38,AB:33,H:11,HR:2,RBI:7,SB:1,BB:5,pH:10,pBB:4,W:1,L:0,SV:0,IP:12,SO:15,ER:4}}]});
    s.log=[yr(2040,true),yr(2041,true),yr(2057,false)];
    s.teamName=function(){return this.orgTeam||'';};
    state.setS(s);

    const view={twoWayView:career.twoWayView(),pos:s.pos};
    const cum=retire.rpCumData();
    const pro=retire.rpProData(s.log.filter(x=>x.st));
    const pay=retire.rpSalaryData(s.log.filter(x=>x.st));
    const intl=retire.rpIntlData();
    const table=career.statTable('CPBL');

    /* 逐年板(遊戲中的「逐年」分頁)：六格裡投打各佔三格 */
    const dom=await import('./src/ui/dom.js?v=1.5.12');
    dom.board(1);
    const bd=document.getElementById('bd-detail');
    let boardHd=[],boardRow=[];
    const bdRoot=document.getElementById('board');
    if(bdRoot)bdRoot.classList.add('detail-open');   /* detailSync 只在展開時才重畫 */
    if(bd){ bd.dataset.tab='y'; dom.detailSync();
      const rows=[...bd.querySelectorAll('.sec-y .bd-yr')];
      const head=rows.find(x=>x.classList.contains('hd'));
      if(head)boardHd=[...head.querySelectorAll('.n')].map(x=>x.textContent.trim());
      const first=rows.filter(x=>!x.classList.contains('hd')).pop();
      if(first)boardRow=[...first.querySelectorAll('.n')].map(x=>x.textContent.trim());
    }

    /* 結算圖：三個模式都要畫得出來，而且欄位是二刀流的那一組 */
    const capture=mode=>{
      const drawn=[],orig=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(v,...a){ drawn.push(String(v)); return orig.call(this,v,...a); };
      try{ share.renderShareImage(['中職名人堂（評價分 9000）'],['留言'],
        {mode,ending:{title:'測試結局',body:'第一段。'}}); }
      finally{ CanvasRenderingContext2D.prototype.fillText=orig; }
      return drawn;
    };
    const img={stats:capture('stats'),salary:capture('salary')};

    /* 引退文案：四篇都要有二刀流的敘事人稱 */
    const endingPos=retire.endingPos();
    const prose={pos:endingPos,
      nextGame:retire.nextGameEnding(endingPos).body,
      nextBase:retire.nextBaseEnding(endingPos).body,
      jersey:retire.jerseyWeightEnding(endingPos).body,
      ghost:retire.oldGhostLongCareerComment(endingPos)};

    return {soloP,twSeason,view,cum,pro,pay,intl,table,boardHd,boardRow,img,prose,
      tagline:retire.rpTagline()};
  });

  /* ── ① 單刀投手沒有被誤判成二刀流 ── */
  assert.ok(r.soloP.G>0,'純投手的 st.G 變成 0——投球側欄位分家做錯了，逐年表與鐵人判定都會壞掉');
  assert.equal(r.soloP.hasGP,false,'單刀投手不該有 GP 欄位（pitG() 靠它判斷身分）');
  assert.equal(r.soloP.hasPH,false,'單刀投手不該有 pH 欄位（pitH() 靠它判斷身分）');
  assert.ok(r.soloP.whip>0.5&&r.soloP.whip<2.5,'單刀投手的 WHIP 壞掉了：'+r.soloP.whip);
  assert.equal(r.soloP.whip,r.soloP.recomputed);

  /* ── ② 二刀流的投打欄位分家 ── */
  assert.ok(r.twSeason.GP>0&&r.twSeason.G>0,'二刀流的登板數與打擊出賽要各自存在');
  assert.ok(r.twSeason.GP<r.twSeason.G,'登板數不該等於打擊出賽數');
  assert.ok(r.twSeason.pH>0&&r.twSeason.pBB>0,'被安打／投出的四死球沒有存進 pH/pBB');
  assert.ok(Math.abs(r.twSeason.whip-r.twSeason.whipFromBatting)>0.05,
    'WHIP 還是用打擊側的安打與保送算的：'+JSON.stringify(r.twSeason));
  assert.ok(r.twSeason.whip>0.5&&r.twSeason.whip<2.5,'二刀流的 WHIP 不合理：'+r.twSeason.whip);

  /* ── ③ 版面判斷不看 S.pos ── */
  assert.equal(r.view.pos,'OF','前置條件：這個角色已經被強制轉回外野手');
  assert.equal(r.view.twoWayView,true,'已被轉回的二刀流仍必須用二刀流版面');

  const both=(hd,tag)=>{
    assert.ok(hd.includes('投G')&&hd.includes('打G'),`${tag} 沒有同時列出投打出賽：`+hd.join(','));
    assert.ok(hd.some(h=>/ERA|IP/.test(h)),`${tag} 缺投球側欄位：`+hd.join(','));
    assert.ok(hd.some(h=>/AVG|OPS|HR/.test(h)),`${tag} 缺打擊側欄位：`+hd.join(','));
  };
  both(r.cum.hd,'生涯累積');
  both(r.pro.hd,'逐年結算');
  both(r.pay.hd,'合約薪資');
  both(r.intl.hd,'國際賽');
  assert.equal(r.cum.rows[0].txt.length,r.cum.hd.length);
  assert.equal(r.intl.tot.length,r.intl.hd.length);

  /* 轉回之後的單刀球季：投球側印 '-'，不是 0 */
  const rows=r.pro.blocks.flatMap(b=>b.rows);
  assert.equal(rows.length,3);
  assert.ok(rows[0].lvl.includes('二刀'),'二刀流球季的層級欄要標「二刀」：'+rows[0].lvl);
  assert.ok(!rows[2].lvl.includes('二刀'),'轉回之後的球季不該還標二刀：'+rows[2].lvl);
  assert.equal(rows[2].txt[0],'-','轉回之後沒有登板，投球側要印 - 而不是 0');
  assert.notEqual(rows[2].txt[5],'-','轉回之後的打擊側仍有數字');

  /* 累積表：兩側都有值 */
  const cum0=r.cum.rows[0].txt;
  assert.ok(cum0.every(v=>v!=='-'),'十九年二刀流的累積表不該有空欄：'+cum0.join(','));

  /* statTable 的 HTML 也走同一組欄位 */
  assert.ok(/投G/.test(r.table)&&/打G/.test(r.table),'生涯累積數據的 HTML 表沒有換成二刀流欄位');

  /* ── ④ 逐年板：六格裡投打各三格 ── */
  assert.deepEqual(r.boardHd,['IP','W-L','ERA','PA','HR','AVG'],'逐年板的欄位不是二刀流那一組');
  assert.equal(r.boardRow.length,6);
  assert.equal(r.boardRow[0],'-','轉回之後的球季在逐年板上，投球側要印 -');

  /* ── ⑤ 結算圖 ── */
  const has=(xs,t)=>xs.some(x=>x.includes(t));
  assert.ok(has(r.img.stats,'投G')&&has(r.img.stats,'打G'),'結算圖的年表沒有換成二刀流欄位');
  assert.ok(has(r.img.salary,'投G')&&has(r.img.salary,'打G'),'結算圖的薪資表沒有換成二刀流欄位');
  assert.ok(has(r.img.stats,'生涯年表（職業成績）'));

  /* ── ⑥ 引退文案與標語 ── */
  assert.equal(r.prose.pos,'TW');
  assert.ok(/投出了一次三振/.test(r.prose.nextGame)&&/一壘安打/.test(r.prose.nextGame),
    '〈下一場比賽〉沒有寫成二刀流的版本');
  assert.ok(/投丟/.test(r.prose.nextBase),'〈下一個壘包〉沒有寫成二刀流的版本');
  assert.ok(/打擊區/.test(r.prose.jersey),'〈球衣的重量〉沒有寫成二刀流的版本');
  assert.ok(/二刀流/.test(r.prose.ghost),'老將留言沒有認出二刀流');
  assert.ok(/二刀流/.test(r.tagline),'結算標語沒有認出二刀流：'+r.tagline);

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({soloP:r.soloP,twSeason:r.twSeason,
    hd:{cum:r.cum.hd,pro:r.pro.hd,pay:r.pay.hd,intl:r.intl.hd,board:r.boardHd}},null,2));
}finally{ await browser.close(); }
