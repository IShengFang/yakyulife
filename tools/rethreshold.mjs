/* 門檻的百分位對齊。

   改聯盟環境常數之後，所有寫死的絕對門檻（獎項的 TH 表、季末評等、降級免疫、
   生涯評價的聯盟平均參考值）全部失準。純比例換算對 ERA/OPS 有效，但對全壘打會失效：
   新環境的「聯盟最強 ÷ 聯盟平均」從 8.2 倍縮到 3.6 倍——那才是真實棒球的樣子——
   所以同一個比例會變成打不到的數字。

   正確的作法是對齊「百分位」而不是「比例」：先量舊門檻在舊母體裡卡在第幾百分位，
   再去新母體裡找同一個百分位的值。這樣「多少比例的球季達得到這個門檻」不變，
   獎項的稀有度、升降級的節奏、名人堂的難度就都被保住。

     SEASONS=1 N=400 node tools/sim-twoway.mjs /tmp/hlOld /tmp/sea-old.json
     SEASONS=1 N=400 node tools/sim-twoway.mjs /tmp/hlNew /tmp/sea-new.json
     node tools/rethreshold.mjs /tmp/sea-old.json /tmp/sea-new.json
*/
import fs from 'node:fs';
const OLD=process.argv[2]||'/tmp/sea-old.json';
const NEW=process.argv[3]||'/tmp/sea-new.json';
const load=f=>JSON.parse(fs.readFileSync(f,'utf8')).flatMap(r=>r.seasons||[]);
const A=load(OLD), B=load(NEW);

const LG={CPBL1:{b:'CPBL',g:120},NPB1:{b:'NPB',g:143},MLB:{b:'MLB',g:162}};
const bucket=s=>LG[s.lv]?LG[s.lv].b:null;
const gOf=s=>LG[s.lv]?LG[s.lv].g:120;

/* 資格門檻：拿來當母體的球季必須是「有資格競爭這個獎」的球季。 */
const Q={
  sp:   s=>s.role==='SP'&&s.IP>=gOf(s)*(+process.env.IPGATE||1.0),                 /* 規定投球局數 */
  spHalf:s=>s.role==='SP'&&s.IP>=gOf(s)*0.5,
  relief:s=>s.role!=='SP'&&s.GP>=gOf(s)*0.25,
  cl:   s=>s.role==='CL'&&s.GP>=40,
  bat:  s=>s.PA>=gOf(s)*(+process.env.PAGATE||3.6),                            /* 規定打席 */
  batLo:s=>s.PA>=gOf(s)*2.0,
  pitLo:s=>s.IP>=gOf(s)*0.22&&s.era!=null,
};
const val={
  era:s=>s.era, whip:s=>s.whip, so:s=>s.SO, w:s=>s.W, sv:s=>s.SV, hld:s=>s.HLD, ip:s=>s.IP,
  avg:s=>s.avg, hr:s=>s.HR, rbi:s=>s.RBI, obp:s=>s.obp, sb:s=>s.SB,
  ops:s=>(s.obp!=null&&s.AB>0)?s.obp+slg(s):null,
};
/* slgOf 的複製品——傾印檔沒有存二壘打，用同一個估法還原。 */
function slg(s){ const nonHR=Math.max(0,s.H-s.HR), d2=Math.round(nonHR*0.22), d3=Math.round(nonHR*0.03);
  return (Math.max(0,nonHR-d2-d3)+d2*2+d3*3+s.HR*4)/s.AB; }

function pool(data,lg,q){ return data.filter(s=>bucket(s)===lg&&Q[q](s)); }
/* 舊門檻在舊母體裡的達成率 */
function rate(data,lg,q,k,dir,th){
  const p=pool(data,lg,q).map(val[k]).filter(v=>v!=null&&Number.isFinite(v));
  if(!p.length)return null;
  const n=p.filter(v=>dir==='low'?v<=th:v>=th).length;
  return {rate:n/p.length,n:p.length};
}
/* 新母體裡達成率相同的那個值 */
function atRate(data,lg,q,k,dir,r){
  const p=pool(data,lg,q).map(val[k]).filter(v=>v!=null&&Number.isFinite(v)).sort((a,b)=>a-b);
  if(!p.length)return null;
  const i=dir==='low'?Math.min(p.length-1,Math.max(0,Math.round(r*p.length)-1))
                     :Math.min(p.length-1,Math.max(0,Math.round((1-r)*p.length)));
  return p[i];
}
const R3=v=>v==null?'—':(Math.abs(v)<10?v.toFixed(3):v.toFixed(0));
const R2=v=>v==null?'—':(Math.abs(v)<10?v.toFixed(2):Math.round(v));

/* [標籤, 資格母體, 欄位, 方向, {聯盟:舊門檻}] */
const T=[
  ['獎項 era 下限',      'sp','era','low', {CPBL:2.90,NPB:2.90,MLB:3.50}],
  ['獎項 era 保送',      'sp','era','low', {CPBL:1.90,NPB:1.90,MLB:2.40}],
  ['防禦率王 下限',      'sp','era','low', {CPBL:2.80,NPB:2.80,MLB:3.40}],
  ['防禦率王 保送',      'sp','era','low', {CPBL:1.60,NPB:1.60,MLB:2.25}],
  ['三振 下限',          'sp','so','high',{CPBL:130,NPB:132,MLB:175}],
  ['三振 保送',          'sp','so','high',{CPBL:180,NPB:183,MLB:240}],
  ['勝投 下限',          'sp','w','high', {CPBL:10,NPB:10,MLB:14}],
  ['勝投 保送',          'sp','w','high', {CPBL:16,NPB:16,MLB:20}],
  ['救援 下限',          'cl','sv','high',{CPBL:22,NPB:22,MLB:22}],
  ['救援 保送',          'cl','sv','high',{CPBL:35,NPB:35,MLB:35}],
  ['打擊率 下限',        'bat','avg','high',{CPBL:0.300,NPB:0.300,MLB:0.300}],
  ['打擊率 保送',        'bat','avg','high',{CPBL:0.360,NPB:0.360,MLB:0.360}],
  ['上壘率 下限',        'bat','obp','high',{CPBL:0.370,NPB:0.370,MLB:0.370}],
  ['上壘率 保送',        'bat','obp','high',{CPBL:0.430,NPB:0.430,MLB:0.430}],
  ['全壘打 下限',        'bat','hr','high',{CPBL:20,NPB:24,MLB:27}],
  ['全壘打 保送',        'bat','hr','high',{CPBL:32,NPB:38,MLB:43}],
  ['打點 下限',          'bat','rbi','high',{CPBL:75,NPB:90,MLB:100}],
  ['打點 保送',          'bat','rbi','high',{CPBL:105,NPB:125,MLB:140}],
  ['── 季末評等（投）',  'pitLo','era','low',{CPBL:2.80,NPB:2.80,MLB:2.80}],
  ['評等2 era',          'pitLo','era','low',{CPBL:3.50,NPB:3.50,MLB:3.50}],
  ['評等2 whip',         'pitLo','whip','low',{CPBL:1.15,NPB:1.15,MLB:1.15}],
  ['評等2 era(配 whip)', 'pitLo','era','low',{CPBL:3.75,NPB:3.75,MLB:3.75}],
  ['評等1 era',          'pitLo','era','low',{CPBL:4.35,NPB:4.35,MLB:4.35}],
  ['── 季末評等（打）',  'batLo','ops','high',{CPBL:0.850,NPB:0.850,MLB:0.850}],
  ['評等3 ops(配 HR)',   'batLo','ops','high',{CPBL:0.800,NPB:0.800,MLB:0.800}],
  ['評等3 HR',           'batLo','hr','high',{CPBL:18,NPB:22,MLB:25}],
  ['評等2 ops',          'batLo','ops','high',{CPBL:0.750,NPB:0.750,MLB:0.750}],
  ['評等1 ops',          'batLo','ops','high',{CPBL:0.650,NPB:0.650,MLB:0.650}],
  ['── 降級免疫 era',    'pitLo','era','low',{CPBL:4.20,NPB:4.20,MLB:4.20}],
  ['降級免疫 whip',      'pitLo','whip','low',{CPBL:1.35,NPB:1.35,MLB:1.35}],
  ['降級免疫 ops',       'batLo','ops','high',{CPBL:0.720,NPB:0.720,MLB:0.720}],
  ['降級免疫 HR',        'batLo','hr','high',{CPBL:12,NPB:12,MLB:12}],
  ['降級免疫 RBI',       'batLo','rbi','high',{CPBL:55,NPB:70,MLB:70}],
  ['── 明星賽 avg',      'batLo','avg','high',{CPBL:0.260,NPB:0.260,MLB:0.260}],
  ['明星賽 ops',         'batLo','ops','high',{CPBL:0.750,NPB:0.750,MLB:0.750}],
  ['明星賽 HR',          'batLo','hr','high',{CPBL:15,NPB:15,MLB:15}],
  ['明星賽 era(先發)',   'spHalf','era','low',{CPBL:4.00,NPB:4.00,MLB:4.00}],
  ['明星賽 era(後援)',   'relief','era','low',{CPBL:3.80,NPB:3.80,MLB:3.80}],
  ['── MVP era',         'sp','era','low', {CPBL:3.20,NPB:3.20,MLB:3.20}],
  ['MVP ops',            'bat','ops','high',{CPBL:0.850,NPB:0.850,MLB:0.850}],
  ['年度打者 ops 下限',  'bat','ops','high',{CPBL:0.900,NPB:0.900,MLB:0.900}],
  ['年度打者 ops 保送',  'bat','ops','high',{CPBL:1.050,NPB:1.050,MLB:1.050}],
  ['── 終結者 era',      'cl','era','low', {CPBL:2.20,NPB:2.20,MLB:2.20}],
];

console.log('門檻                  聯盟   舊值   達成率   →  新值    (母體 n)');
for(const [label,q,k,dir,olds] of T){
  for(const lg of ['CPBL','NPB','MLB']){
    const r=rate(A,lg,q,k,dir,olds[lg]);
    if(!r){ console.log(`${label.padEnd(20)} ${lg.padEnd(5)} ${R2(olds[lg])}   （舊母體無樣本）`); continue; }
    const nv=atRate(B,lg,q,k,dir,r.rate);
    console.log(`${label.padEnd(20)} ${lg.padEnd(5)} ${String(R3(olds[lg])).padStart(6)} ${(r.rate*100).toFixed(1).padStart(6)}%  →  ${String(R3(nv)).padStart(6)}   (n=${r.n})`);
  }
}

/* ── 第二階段：對齊「得獎機率的分布」而不是只對齊兩個端點 ──
   awardP() 是在 [下限, 保送] 之間線性內插的，只把兩個端點的達成率對上還不夠：
   新舊母體在這兩點之間的形狀不一樣，同一個「相對水準」的球季會拿到不同的機率。
   所以這裡直接以「整個母體的平均得獎機率」與「第 90 百分位的得獎機率」為目標，
   在新母體的分位數上二維搜尋一組 (下限, 保送)。 */
function awardP(v,lo,hi,lower){
  if(lower?v>lo:v<lo)return 0;
  if(lower?v<=hi:v>=hi)return 100;
  const t=lower?(lo-v)/(lo-hi):(v-lo)/(hi-lo);
  return Math.max(25,Math.min(95,25+t*70));
}
function stats(vals,lo,hi,lower){
  const ps=vals.map(v=>awardP(v,lo,hi,lower)).sort((a,b)=>a-b);
  const mean=ps.reduce((a,b)=>a+b,0)/ps.length;
  return {mean,p90:ps[Math.floor(ps.length*0.90)],p99:ps[Math.floor(ps.length*0.99)]};
}
function fit(oldVals,newVals,lo,hi,lower){
  const tgt=stats(oldVals,lo,hi,lower);
  const s=newVals.slice().sort((a,b)=>a-b);
  const qv=q=>s[Math.min(s.length-1,Math.max(0,Math.round(q*(s.length-1))))];
  /* 分位距的比值：新舊母體的離散程度不同，門檻的寬度應該按這個比例縮放。
     沒有這一項的話，搜尋會塌到「一條很窄的帶子」——平均機率對得上，
     但每個人不是 0 分就是 100 分，級距整個不見了。 */
  const spread=v=>{const x=v.slice().sort((a,b)=>a-b);
    return x[Math.floor(x.length*0.90)]-x[Math.floor(x.length*0.10)];};
  const expRange=Math.abs(hi-lo)*(spread(newVals)/(spread(oldVals)||1));
  let best=null;
  const grid=[];
  for(let i=1;i<=99;i++)grid.push(qv(i/100));
  for(const L of grid)for(const H of grid){
    if(lower?!(H<L):!(H>L))continue;
    const st=stats(newVals,L,H,lower);
    const rng=Math.abs(H-L);
    const shape=expRange>0?Math.abs(rng/expRange-1):0;
    const cost=Math.abs(st.mean-tgt.mean)*1.0+Math.abs(st.p90-tgt.p90)*0.6
      +Math.abs(st.p99-tgt.p99)*0.3+shape*9;
    if(!best||cost<best.cost)best={lo:L,hi:H,cost,st};
  }
  return {tgt,best};
}
if(process.env.FIT){
  console.log('\n══ 得獎機率分布對齊（平均 p／p90／p99）══');
  const AW=[
    ['最佳投手 era','sp','era',true, {CPBL:[2.90,1.90],NPB:[2.90,1.90],MLB:[3.50,2.40]}],
    ['防禦率王','sp','era',true,     {CPBL:[2.80,1.60],NPB:[2.80,1.60],MLB:[3.40,2.25]}],
    ['三振王','sp','so',false,       {CPBL:[130,180],NPB:[132,183],MLB:[175,240]}],
    ['勝投王','sp','w',false,        {CPBL:[10,16],NPB:[10,16],MLB:[14,20]}],
    ['救援王','cl','sv',false,       {CPBL:[22,35],NPB:[22,35],MLB:[22,35]}],
    ['打擊王','bat','avg',false,     {CPBL:[0.300,0.360],NPB:[0.300,0.360],MLB:[0.300,0.360]}],
    ['上壘王','bat','obp',false,     {CPBL:[0.370,0.430],NPB:[0.370,0.430],MLB:[0.370,0.430]}],
    ['全壘打王','bat','hr',false,    {CPBL:[20,32],NPB:[24,38],MLB:[27,43]}],
    ['打點王','bat','rbi',false,     {CPBL:[75,105],NPB:[90,125],MLB:[100,140]}],
    ['年度打者 ops','bat','ops',false,{CPBL:[0.900,1.050],NPB:[0.900,1.050],MLB:[0.900,1.050]}],
  ];
  for(const [label,q,k,lower,olds] of AW){
    for(const lg of ['CPBL','NPB','MLB']){
      const ov=pool(A,lg,q).map(val[k]).filter(v=>v!=null&&Number.isFinite(v));
      const nv=pool(B,lg,q).map(val[k]).filter(v=>v!=null&&Number.isFinite(v));
      if(ov.length<20||nv.length<20){ console.log(`${label.padEnd(14)} ${lg.padEnd(5)} 樣本不足`); continue; }
      const {tgt,best}=fit(ov,nv,olds[lg][0],olds[lg][1],lower);
      const f=v=>Math.abs(v)<10?v.toFixed(3):Math.round(v);
      console.log(`${label.padEnd(14)} ${lg.padEnd(5)} 舊[${f(olds[lg][0])},${f(olds[lg][1])}] p=${tgt.mean.toFixed(1)}/${tgt.p90.toFixed(0)}/${tgt.p99.toFixed(0)}`+
        `  →  新[${f(best.lo)},${f(best.hi)}] p=${best.st.mean.toFixed(1)}/${best.st.p90.toFixed(0)}/${best.st.p99.toFixed(0)}`);
    }
  }
}
