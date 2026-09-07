/* 重解 LEAGUE_K，把生涯評價的級距分布拉回改動前的樣子。

   改成真實的聯盟環境之後，「聯盟最強 ÷ 聯盟平均」整個縮小了（那正是真實棒球的
   樣子），於是生涯原始分的離散程度跟著縮小：打者前 5% 的分數掉了約 12%，
   中位數幾乎沒動。級距門檻 TIER_TH 是絕對值，結果就是名人堂率整片下滑
   （指定打擊 12.3% → 7.7%）。生涯年數與升降級節奏都沒變，純粹是尺的問題。

   一個倍率救不回來：把 Kbase 拉高會讓中間的「明星」級距一起膨脹。
   所以兩個自由度一起解——
     sc = careerScore × Kbase + honorScore × Khonor
   honorScore 幾乎只有頂尖球員拿得到，所以 Khonor 專門抬尾巴、Kbase 抬全體。
   兩個一起解才能同時對上名人堂率與明星率。

     node tools/recalibrate-k.mjs /tmp/sea-old.json /tmp/tw-new.json
*/
import fs from 'node:fs';
const OLDF=process.argv[2]||'/tmp/sea-old.json';
const NEWF=process.argv[3]||'/tmp/tw-new.json';
const ECON_OLD=await import('/tmp/hlF/data/economy.js');
const ECON_NEW=await import('/tmp/hlN/data/economy.js');
const OLD=JSON.parse(fs.readFileSync(OLDF,'utf8')).map(r=>({lane:r.lane,REC:r.REC}));
const NEW=JSON.parse(fs.readFileSync(NEWF,'utf8')).map(r=>({lane:r.lane,REC:r.REC}));

const LANES=['TW','SP','SS','CF','1B','DH','C'];
const PK=['P','H','TW','TM'];   /* TM = TIER_TH 下兩檔的倍率 */   /* CL 綁 P、TW 綁投打平均，見 apply() */

/* tm = TIER_TH 下兩檔的倍率。只有兩個 K 參數的話，中段的「每日先發」會整片
   胖 4 個百分點修不掉——名人堂與明星對上了，代價是把人從邊緣擠進每日。
   下兩檔的門檻本來就是獨立的旋鈕，一起解才收得乾淨。 */
function best(r,LK,HK,tm){
  let b=null, m2=tm?tm[0]:1, m3=tm?tm[1]:1;
  for(const rec of r.REC){
    const K=(LK[rec.lg]||{})[rec.posKey]||[1,1];
    const hk=((HK[rec.lg]||{})[rec.posKey])??1;
    const sc=rec.cs*K[0]+rec.hs*K[1], th=rec.th[0]*rec.pk*hk;
    const i=sc>=th?0:sc>=rec.th[1]*rec.pk?1:sc>=rec.th[2]*rec.pk*m2?2:sc>=rec.th[3]*rec.pk*m3?3:4;
    if(!b||i<b.i||(i===b.i&&sc>b.sc))b={i,sc};
  }
  return b;
}
function dist(rows,LK,HK,tm){
  const out={};
  for(const ln of LANES){
    const g=rows.filter(r=>r.lane===ln); if(!g.length)continue;
    const c=[0,0,0,0,0]; let n=0;
    g.forEach(r=>{const t=best(r,LK,HK,tm); if(t){c[t.i]++;n++;}});
    out[ln]=c.map(x=>x/n);
  }
  return out;
}
/* 目標：改動前的分布 */
const TARGET=dist(OLD,ECON_OLD.LEAGUE_K,ECON_OLD.HOF_TH_K);

/* 參數：每個 posKey 一組 (a,b)，乘在原本的 Kbase / Khonor 上。
   三個聯盟共用同一組倍率——環境改動對三個聯盟的方向一致，
   分開解只會過擬合到樣本雜訊。 */
/* 結構限制，不讓解跑掉：
   · CL 沿用 P 的倍率——模擬裡被判成 CL 的球季太少，讓它自由只會擬合到雜訊。
   · TW 維持第 3 階段訂下的形狀「同聯盟投手與打者的平均」，只解兩個整體倍率。
     放它自由的話會解出 Kbase 比投手與打者都低的荒謬值（實測會，成本只差 5）。 */
function apply(par){
  const LK={};
  for(const lg of ['CPBL','NPB','MLB']){
    const B=ECON_NEW.LEAGUE_K[lg];
    const P=[B.P[0]*par.P[0],B.P[1]*par.P[1]];
    const H=[B.H[0]*par.H[0],B.H[1]*par.H[1]];
    const CL=[B.CL[0]*par.P[0],B.CL[1]*par.P[1]];
    const TW=[(P[0]+H[0])/2*par.TW[0],(P[1]+H[1])/2*par.TW[1]];
    LK[lg]={P,H,CL,TW};
  }
  return LK;
}
/* 成本：名人堂率權重最高（那是玩家最在意的一個數字），其餘級距一起看。 */
const W=[6,3,1.5,1,1];
function cost(par){
  const D=dist(NEW,apply(par),ECON_NEW.HOF_TH_K,par.TM);
  let c=0;
  for(const ln of LANES){
    if(!D[ln]||!TARGET[ln])continue;
    for(let i=0;i<5;i++)c+=W[i]*Math.pow((D[ln][i]-TARGET[ln][i])*100,2);
  }
  return c;
}
/* 座標下降 ＋ 多起點：單起點會停在局部解（實測成本 196 對 多起點的 110）。 */
function descend(init){
  let par=JSON.parse(JSON.stringify(init)), step=0.30, cur=cost(par);
  for(let iter=0;iter<400&&step>0.0008;iter++){
    let improved=false;
    for(const pk of PK)for(const j of [0,1]){
      for(const d of [step,-step]){
        const t=JSON.parse(JSON.stringify(par));
        t[pk][j]=Math.max(0.15,Math.min(6,t[pk][j]*(1+d)));
        const c=cost(t);
        if(c<cur-1e-9){ par=t; cur=c; improved=true; }
      }
    }
    if(!improved)step*=0.62;
  }
  return {par,cur};
}
let par=null,cur=Infinity;
const starts=[[1,1],[1,1.5],[0.9,2],[1.1,1.2],[0.8,2.5],[1,3],[0.785,1],[0.7,1.8]];
for(const s0 of starts){
  const init={}; PK.forEach(k=>init[k]=[s0[0],s0[1]]);
  const r=descend(init);
  if(r.cur<cur){ cur=r.cur; par=r.par; }
}
console.log('成本（越小越接近改動前）',cur.toFixed(1));
console.log('\n倍率  posKey  Kbase×  Khonor×');
for(const pk of PK)console.log('      ',pk.padEnd(6),par[pk][0].toFixed(4).padStart(7),par[pk][1].toFixed(4).padStart(8));
console.log('\nTIER_TH 下兩檔倍率  每日',par.TM[0].toFixed(4),' 邊緣',par.TM[1].toFixed(4));
console.log('新的 TIER_TH：');
for(const lg of ['CPBL','NPB','MLB']){ const t=ECON_NEW.TIER_TH[lg];
  console.log(`  ${lg}: [${t[0]},${t[1]},${Math.round(t[2]*par.TM[0])},${Math.round(t[3]*par.TM[1])}],`); }

const LK=apply(par);
console.log('\n新的 LEAGUE_K：');
for(const lg of ['CPBL','NPB','MLB']){
  const parts=Object.keys(LK[lg]).map(pk=>`${pk}:[${LK[lg][pk][0].toFixed(3)},${LK[lg][pk][1].toFixed(3)}]`);
  console.log(`  ${lg}: {${parts.join(',')}},`);
}
const D=dist(NEW,LK,ECON_NEW.HOF_TH_K,par.TM);
console.log('\n路線   名人堂 目標→解出    明星以上 目標→解出    每日 目標→解出');
for(const ln of LANES){
  if(!D[ln])continue;
  const a=TARGET[ln],b=D[ln];
  const f=(x,y)=>`${(x*100).toFixed(1)}→${(y*100).toFixed(1)}`.padStart(13);
  console.log(ln.padEnd(6),f(a[0],b[0]),f(a[0]+a[1],b[0]+b[1]),f(a[2],b[2]));
}
