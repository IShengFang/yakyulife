/* 讀 tools/sim-twoway.mjs 的輸出，算各路線的評價級距分布，並反解二刀流的校準常數。
     node tools/analyze-twoway.mjs /tmp/tw.json [/tmp/hl]

   評價分的定義（與 engine/career.js 的 tierOf 完全一致）：
     sc     = careerScore × Kbase + honorScore × Khonor
     hofTh  = TIER_TH[0] × posTierK × HOF_TH_K
   模擬時已經把 careerScore / honorScore / posTierK / TIER_TH 全部記成原始值，
   所以這裡可以任意換 (Kbase, Khonor, HOF_TH_K) 重算，不必重跑模擬。 */
import fs from 'node:fs';
const FILE=process.argv[2]||'/tmp/tw.json';
const ROOT=process.argv[3]||'/tmp/hl';
const ECON=await import(ROOT+'/data/economy.js');
const rows=JSON.parse(fs.readFileSync(FILE,'utf8'));

const pct=(a,b)=>b?(a/b*100).toFixed(1)+'%':'—';
/* 生涯評價「一個聯盟一份履歷」，取最好的那一份（與 ui/retire.js 相同）。 */
function bestTier(r,override){
  let best=null;
  for(const rec of r.REC){
    const K=(override&&override.LEAGUE_K&&override.LEAGUE_K[rec.lg]&&override.LEAGUE_K[rec.lg][rec.posKey])
      ||((ECON.LEAGUE_K[rec.lg]||{})[rec.posKey])||[1,1];
    const hk=(override&&override.HOF_TH_K&&override.HOF_TH_K[rec.lg]&&override.HOF_TH_K[rec.lg][rec.posKey])
      ??(((ECON.HOF_TH_K[rec.lg]||{})[rec.posKey])??1);
    const sc=rec.cs*K[0]+rec.hs*K[1];
    const hofTh=rec.th[0]*rec.pk*hk;
    const i=sc>=hofTh?0:sc>=rec.th[1]*rec.pk?1:sc>=rec.th[2]*rec.pk?2:sc>=rec.th[3]*rec.pk?3:4;
    if(!best||i<best.i||(i===best.i&&sc>best.sc))best={i,sc,hofTh,lg:rec.lg,posKey:rec.posKey};
  }
  return best;
}
const laneOf=r=>r.lane;
const lanes=[...new Set(rows.map(laneOf))];

function report(title,filter,override){
  console.log('\n══ '+title+' ══');
  console.log('　路線      n     名人堂    明星    每日    邊緣    過客   中位分/門檻');
  for(const ln of lanes){
    const g=rows.filter(r=>laneOf(r)===ln&&filter(r));
    if(!g.length)continue;
    const t=g.map(r=>bestTier(r,override)).filter(Boolean);
    const c=[0,0,0,0,0]; t.forEach(x=>c[x.i]++);
    const ratios=t.map(x=>x.sc/x.hofTh).sort((a,b)=>a-b);
    const med=ratios.length?ratios[ratios.length>>1].toFixed(2):'—';
    console.log('　'+ln.padEnd(6)+String(g.length).padStart(6)+
      c.map(n=>pct(n,t.length).padStart(8)).join('')+med.padStart(10));
  }
}

const anyone=()=>true;
/* 「曾經解鎖過天才」，不是「退休當下還有天才」——二刀流的天才會在強制轉回時被收回，
   用退休當下的狀態篩，會只剩下 10% 撐到最後的人，樣本整個偏掉。 */
const genius=r=>r.geniusEver||r.traits.includes('genius');
report('① 全部樣本（母體權重抽樣）',anyone);
report('② 只看拿到「天才」的（二刀流一律有天才，這才是對等比較）',genius);

/* 二刀流的兩個常數怎麼解：先固定 Khonor（榮譽端跟同聯盟的打者同尺），
   再二分搜尋 Kbase，讓二刀流的名人堂率對上目標。 */
function twRate(kbase,khonor,hk,filter=genius){
  const ov={LEAGUE_K:{},HOF_TH_K:{}};
  for(const lg of ['CPBL','NPB','MLB']){
    ov.LEAGUE_K[lg]={TW:[kbase[lg],khonor[lg]]};
    ov.HOF_TH_K[lg]={TW:hk[lg]};
  }
  const g=rows.filter(r=>laneOf(r)==='TW'&&filter(r));
  const t=g.map(r=>bestTier(r,ov)).filter(Boolean);
  const c=[0,0,0,0,0]; t.forEach(x=>c[x.i]++);
  return {n:t.length,hof:c[0]/t.length,star:(c[0]+c[1])/t.length,dist:c.map(n=>+(n/t.length*100).toFixed(1))};
}
/* 三個聯盟不能各解各的:tierOf 取「最好的一份履歷」，把其他聯盟壓到 0 解出來的值
   合起來用會超標。改成固定一組跨聯盟的「形狀」，只解一個整體倍率。
   形狀取同聯盟投手與打者的平均——二刀流的分數就是這兩份相加，而 P/H 之間的
   聯盟關係是先前校準過的，不該在這裡重新發明。 */
function twShape(LK){
  const kb={},kh={};
  for(const lg of ['CPBL','NPB','MLB']){
    const P=LK[lg].P, H=LK[lg].H;
    kb[lg]=+((P[0]+H[0])/2).toFixed(4);
    kh[lg]=+((P[1]+H[1])/2).toFixed(4);
  }
  return {kb,kh};
}
function scale(kb,m){ const o={}; for(const k in kb)o[k]=+(kb[k]*m).toFixed(3); return o; }
function solve(target,kb0,khonor,hk,filter=genius){
  let lo=0.02,hi=8;
  for(let i=0;i<50;i++){
    const m=(lo+hi)/2;
    if(twRate(scale(kb0,m),khonor,hk,filter).hof>target)hi=m; else lo=m;
  }
  return (lo+hi)/2;
}
export {rows,bestTier,twRate,solve,report,genius,anyone};

if(process.env.SOLVE){
  const hk={CPBL:1,NPB:1,MLB:1};
  const {kb:shape,kh:khonor}=twShape(ECON.LEAGUE_K);
  console.log('\n══ 反解：形狀＝同聯盟投手與打者的平均，只解一個整體倍率 ══');
  console.log('　形狀 Kbase ',JSON.stringify(shape));
  console.log('　Khonor    ',JSON.stringify(khonor));
  console.log('\n　目標  倍率     解出的 Kbase                                        名人堂  明星以上  五級分布');
  for(const target of (process.env.TARGETS||'0.12,0.15,0.18,0.20,0.25').split(',').map(Number)){
    const m=solve(target,shape,khonor,hk);
    const kb=scale(shape,m);
    const r=twRate(kb,khonor,hk);
    console.log('　'+(target*100).toFixed(0)+'%'+m.toFixed(3).padStart(8)+'  '+
      JSON.stringify(kb).padEnd(48)+(r.hof*100).toFixed(1)+'%'+(r.star*100).toFixed(1).padStart(9)+'%   '+r.dist.join(' / '));
  }
}
