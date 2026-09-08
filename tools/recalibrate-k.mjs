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
const ECON_OLD=await import((process.env.OLDROOT||'/tmp/hlF')+'/data/economy.js');
const ECON_NEW=await import((process.env.NEWROOT||'/tmp/hlN')+'/data/economy.js');
const OLD=JSON.parse(fs.readFileSync(OLDF,'utf8')).map(r=>({lane:r.lane,REC:r.REC}));
const NEW=JSON.parse(fs.readFileSync(NEWF,'utf8')).map(r=>({lane:r.lane,REC:r.REC}));

const LANES=['TW','SP','SS','CF','1B','DH','C'];
const PK=['P','H','TW','TM','CJ','CT'];   /* TM = TIER_TH 下兩檔的倍率、CJ = 中職專屬折扣、CT = 中職自己的級距尺 */   /* CL 綁 P、TW 綁投打平均，見 apply() */

/* ── 中職折扣（CJ）與「留中職刷數據」 ──
   率值換成指數模型之後，一個練起來的球員留在中職會打出 60 轟 / ERA 0.86。
   量下去才發現這個洞在改動前就在：拒絕旅外、整段生涯只待中職的球員，
   名人堂率是旅外組的三倍（改動前 31.8% 對 10.0%，指數模型放大到 39.0% 對 10.3%）。
   原因是 LEAGUE_K 的中職係數跟日職幾乎一樣（H 是 1.812 對 1.776），
   等於「留在中職」沒有任何折算代價——而中職球季只有 120 場，counting stat 反而更容易
   靠一個超規格的球員刷爆。
   所以多解一個只作用在中職的折扣，並在成本裡加一條硬要求：
   留中職組的名人堂率必須明顯低於旅外組。目標訂在旅外的 0.62 倍
   （旅外 ~10% 對 留中職 ~6%；只看有天分的前 25%，旅外 ~28% 對 留中職 ~14%）。
   要留中職也可以，但那是一條比較難進名人堂的路，不是捷徑。

   光靠折扣會誤傷：中職的「明星／每日先發」也整片掉一級，但那些球員多半不是在刷數據，
   他們只是本來就沒有旅外的實力。所以折扣配一把中職自己的級距尺（CT）——
   名人堂那條線不動（折扣要在那裡生效），下面三檔往下調回來。
   TIER_TH 本來就是每個聯盟一組，v1.6.0 把三組統一成同一把尺；這裡讓中職重新分家，
   但只分下面三檔。
     GO=/tmp/go.json ST=/tmp/stay.json node tools/recalibrate-k.mjs ...      */
const GOF=process.env.GO, STF=process.env.ST;
const GO=GOF?JSON.parse(fs.readFileSync(GOF,'utf8')).map(r=>({REC:r.REC})):null;
const ST=STF?JSON.parse(fs.readFileSync(STF,'utf8')).map(r=>({REC:r.REC})):null;
const STAY_RATIO=Number(process.env.STAYR||0.62), WSTAY=Number(process.env.WSTAY||160);

/* tm = TIER_TH 下兩檔的倍率。只有兩個 K 參數的話，中段的「每日先發」會整片
   胖 4 個百分點修不掉——名人堂與明星對上了，代價是把人從邊緣擠進每日。
   下兩檔的門檻本來就是獨立的旋鈕，一起解才收得乾淨。 */
function best(r,LK,HK,tm,ct){
  let b=null, m2=tm?tm[0]:1, m3=tm?tm[1]:1;
  for(const rec of r.REC){
    const K=(LK[rec.lg]||{})[rec.posKey]||[1,1];
    const hk=((HK[rec.lg]||{})[rec.posKey])??1;
    const c1=(ct&&rec.lg==='CPBL')?ct[0]:1, c2=(ct&&rec.lg==='CPBL')?ct[1]:1;
    const sc=rec.cs*K[0]+rec.hs*K[1], th=rec.th[0]*rec.pk*hk;
    const i=sc>=th?0:sc>=rec.th[1]*rec.pk*c1?1:sc>=rec.th[2]*rec.pk*m2*c2?2:sc>=rec.th[3]*rec.pk*m3*c2?3:4;
    if(!b||i<b.i||(i===b.i&&sc>b.sc))b={i,sc};
  }
  return b;
}
function dist(rows,LK,HK,tm,ct){
  const out={};
  for(const ln of LANES){
    const g=rows.filter(r=>r.lane===ln); if(!g.length)continue;
    const c=[0,0,0,0,0]; let n=0;
    g.forEach(r=>{const t=best(r,LK,HK,tm,ct); if(t){c[t.i]++;n++;}});
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
/* 倍率的上下界。放到 0.15~6 會解出「投手的 Khonor 砍到 0.13」這種數字——
   分布是對上了，代價是拿獎對投手的生涯評價幾乎失效，那不是我們要的。
   夾在 0.55~2.2 讓解必須靠 Kbase 與 TIER_TH 去修，拿獎的份量守住。 */
const LO=Number(process.env.LO||0.55), HI=Number(process.env.HI||2.2);
function apply(par){
  const LK={};
  for(const lg of ['CPBL','NPB','MLB']){
    const B=ECON_NEW.LEAGUE_K[lg];
    const cj=lg==='CPBL'?par.CJ[0]:1;      /* CJ 只作用在中職，第二格不用 */
    const P=[B.P[0]*par.P[0]*cj,B.P[1]*par.P[1]*cj];
    const H=[B.H[0]*par.H[0]*cj,B.H[1]*par.H[1]*cj];
    const CL=[B.CL[0]*par.P[0]*cj,B.CL[1]*par.P[1]*cj];
    const TW=[(P[0]+H[0])/2*par.TW[0],(P[1]+H[1])/2*par.TW[1]];
    LK[lg]={P,H,CL,TW};
  }
  return LK;
}
/* 成本：名人堂率權重最高（那是玩家最在意的一個數字），其餘級距一起看。 */
const W=[6,3,1.5,1,1];
const hofRate=(rows,LK,tm,ct)=>{let k=0,n=0;
  rows.forEach(r=>{const t=best(r,LK,ECON_NEW.HOF_TH_K,tm,ct); if(t){n++; if(t.i===0)k++;}});
  return n?k/n:0;};
function cost(par){
  const LK=apply(par);
  const D=dist(NEW,LK,ECON_NEW.HOF_TH_K,par.TM,par.CT);
  let c=0;
  for(const ln of LANES){
    if(!D[ln]||!TARGET[ln])continue;
    for(let i=0;i<5;i++)c+=W[i]*Math.pow((D[ln][i]-TARGET[ln][i])*100,2);
  }
  /* 留中職要明顯差於旅外，但不能是零。兩側都罰：只罰單側的話，解會直接把中職的
     名人堂率壓到 0.9%——那等於宣告「這輩子不出國就別想進名人堂」，
     對一個台灣球員模擬器來說是另一種錯。目標是旅外的 0.62 倍（約 10% 對 6%）。 */
  if(GO&&ST){
    const g=hofRate(GO,LK,par.TM,par.CT), s=hofRate(ST,LK,par.TM,par.CT);
    const d=(s-g*STAY_RATIO)*100;
    c+=WSTAY*d*d;
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
        const lo=(pk==='CJ')?0.20:(pk==='CT'?0.35:LO), hi=(pk==='CJ')?1.2:(pk==='CT'?1.6:HI);
        t[pk][j]=Math.max(lo,Math.min(hi,t[pk][j]*(1+d)));
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
console.log('中職自己的級距尺  明星×',par.CT[0].toFixed(4),' 每日/邊緣×',par.CT[1].toFixed(4));
console.log('新的 TIER_TH：');
for(const lg of ['CPBL','NPB','MLB']){ const t=ECON_NEW.TIER_TH[lg];
  const c1=lg==='CPBL'?par.CT[0]:1, c2=lg==='CPBL'?par.CT[1]:1;
  console.log(`  ${lg}: [${t[0]},${Math.round(t[1]*c1)},${Math.round(t[2]*par.TM[0]*c2)},${Math.round(t[3]*par.TM[1]*c2)}],`); }

const LK=apply(par);
console.log('\n新的 LEAGUE_K：');
for(const lg of ['CPBL','NPB','MLB']){
  const parts=Object.keys(LK[lg]).map(pk=>`${pk}:[${LK[lg][pk][0].toFixed(3)},${LK[lg][pk][1].toFixed(3)}]`);
  console.log(`  ${lg}: {${parts.join(',')}},`);
}
const D=dist(NEW,LK,ECON_NEW.HOF_TH_K,par.TM,par.CT);
if(GO&&ST)console.log('\n旅外 名人堂',(hofRate(GO,LK,par.TM,par.CT)*100).toFixed(1)+'%',
  '　只留中職 名人堂',(hofRate(ST,LK,par.TM,par.CT)*100).toFixed(1)+'%');
console.log('\n路線   名人堂 目標→解出    明星以上 目標→解出    每日 目標→解出');
for(const ln of LANES){
  if(!D[ln])continue;
  const a=TARGET[ln],b=D[ln];
  const f=(x,y)=>`${(x*100).toFixed(1)}→${(y*100).toFixed(1)}`.padStart(13);
  console.log(ln.padEnd(6),f(a[0],b[0]),f(a[0]+a[1],b[0]+b[1]),f(a[2],b[2]));
}
