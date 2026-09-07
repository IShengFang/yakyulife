import {LV, envWhip, envLeagueOps} from './teams.js?v=1.5.12';
/* ================= 「怎樣算一個好球季」的門檻 =================

   這些數字原本散在 awards.js（TH 表）、season.js（pitchGrade／batGrade）與
   phases.js（降級免疫）三個檔案裡，而且全是絕對值：ERA 2.80、OPS .850、
   全壘打 20 支。在舊版那沒問題，因為舊版三個聯盟的平均球季長得一模一樣
   （ERA 都是 4.32、OPS 都是 .64）。改成真實的聯盟環境之後，同一個絕對數字
   在不同聯盟代表完全不同的水準，整組必須重訂。

   ── 怎麼重訂的 ──
   不是憑感覺重猜，也不是等比例換算。等比例對 ERA/OPS 有效，但對全壘打會失效：
   新環境的「聯盟最強 ÷ 聯盟平均」從 8.2 倍縮到 3.6 倍（那才是真實棒球的樣子），
   同一個比例會變成打不到的數字。

   所以用的是「保住分布」：拿 17,500 段完整生涯（新舊各一份、同一組亂數種子）
   跑出來的每一個職業球季，對每一個門檻去解一組新值，讓
     · 獎項：整個母體的「平均得獎機率」與第 90／99 百分位的機率都對回舊版
     · 其他：達成該門檻的球季比例對回舊版
   工具是 tools/rethreshold.mjs（FIT=1 跑獎項那一段）。擬合誤差都在 0.5 個
   百分點以內。也就是說：獎項的稀有度、升降級的節奏、名人堂的難度全部沒有變，
   變的只是成績單上的數字終於像那個聯盟該有的樣子。

   ── 為什麼有些門檻看起來很極端 ──
   大聯盟的全壘打王下限是 48 支、打點王 139 分，比真實世界的年度王還高。
   那是對的：模擬母體裡「打滿規定打席的大聯盟球季」全是倖存者——能站穩大聯盟的
   本來就是強打者，所以他們自己的分布就偏高。門檻是拿來算「你這一季贏過場外那個
   看不見的聯盟的機率」，錨點必須是這群人而不是全聯盟平均。

   ── 二軍與小聯盟 ──
   沒有真實資料可擬合，所以繼承母聯盟的「比值」（門檻 ÷ 該聯盟環境值），
   再乘上該層級自己的環境。這樣一個 2A 的好球季跟一個大聯盟的好球季，
   相對各自的聯盟是同一件事。 */

/* 每個層級屬於哪個母聯盟（比值從那裡繼承）。 */
const PARENT={CPBL2:'CPBL',CPBL1:'CPBL',NPB2:'NPB',NPB1:'NPB',
  R:'MLB',A1:'MLB',A2:'MLB',A3:'MLB',MLB:'MLB'};

/* ── 獎項門檻 [必不得獎下限, 必得獎上限] ──
   sv / hld / w 沒有重擬合：它們來自出賽數與勝率，跟率值環境無關，分布沒有變。 */
export const AWARD_TH={
  CPBL:{ g:120, era:[3.22,2.29], eraK:[3.10,2.13], sv:[22,35], hld:[18,30],
         so:[120,159], w:[10,16], avg:[0.282,0.326], hr:[19,28], rbi:[71,95], obp:[0.349,0.395] },
  NPB: { g:143, era:[2.43,1.34], eraK:[2.26,1.18], sv:[22,35], hld:[18,30],
         so:[141,191], w:[10,16], avg:[0.269,0.317], hr:[30,45], rbi:[94,133], obp:[0.340,0.388] },
  MLB: { g:162, era:[3.12,2.08], eraK:[2.97,1.97], sv:[22,35], hld:[18,30],
         so:[221,270], w:[14,20], avg:[0.280,0.332], hr:[48,59], rbi:[139,169], obp:[0.345,0.405] },
};

/* ── 三個母聯盟的比值 ──
   全部是「擬合出來的絕對門檻 ÷ 該聯盟的環境值」。ERA 除以聯盟 ERA、
   WHIP 除以聯盟 WHIP、OPS 除以聯盟 OPS、全壘打除以「聯盟平均打者打滿一季的支數」。 */
const RATIO={
  /* 季末評等（投手）：3＝壓倒性、2＝穩定先發、1＝及格 */
  CPBL:{ era3:0.686, era2:0.777, era2w:0.806, whip2:0.812, era1:0.887,
         ops3:1.173, ops3h:1.128, hr3:2.00, ops2:1.081, ops1:0.953,
         keepEra:0.868, keepWhip:0.884, keepOps:1.048, keepHr:1.41, keepRbi:1.096,
         asAvg:1.035, asOps:1.081, asHr:1.76, asEraSP:0.893, asEraRP:0.681,
         mvpEra:0.903, mvpOps:1.159, boyOps:[1.196,1.357], clEra:0.440 },
  NPB: { era3:0.581, era2:0.754, era2w:0.811, whip2:0.792, era1:0.930,
         ops3:1.226, ops3h:1.171, hr3:2.65, ops2:1.115, ops1:0.985,
         keepEra:0.897, keepWhip:0.909, keepOps:1.079, keepHr:1.57, keepRbi:1.307,
         asAvg:1.045, asOps:1.115, asHr:1.86, asEraSP:0.913, asEraRP:0.636,
         mvpEra:0.884, mvpOps:1.205, boyOps:[1.262,1.452], clEra:0.382 },
  MLB: { era3:0.508, era2:0.692, era2w:0.751, whip2:0.749, era1:0.938,
         ops3:1.261, ops3h:1.191, hr3:2.14, ops2:1.135, ops1:0.999,
         keepEra:0.894, keepWhip:0.877, keepOps:1.093, keepHr:1.17, keepRbi:1.166,
         asAvg:1.045, asOps:1.135, asHr:1.36, asEraSP:0.851, asEraRP:0.743,
         mvpEra:0.677, mvpOps:1.239, boyOps:[1.284,1.522], clEra:0.508 },
};

/* 該層級「聯盟平均的打者打滿一季」會打出多少支全壘打／多少打點。
   全壘打門檻用它當分母，這樣同一個比值在 120 場與 162 場的聯盟都說得通。 */
export function fullSeasonHR(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env;
  return E.hr*((L.g||120)*4.25*0.88);
}
export function fullSeasonRBI(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env, ab=(L.g||120)*4.25*0.88;
  const hr=E.hr*ab, h=E.avg*ab;
  return hr*2.1+(h-hr)*0.30;   /* 與 simSeason 的打點公式同式 */
}
function R(lv){ return RATIO[PARENT[lv]||'CPBL']; }

/* ── 季末評等的門檻（投手） ── */
export function pitchTh(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env, r=R(lv), w=envWhip(E);
  return {era3:E.era*r.era3, era2:E.era*r.era2, era2w:E.era*r.era2w,
    whip2:w*r.whip2, era1:E.era*r.era1};
}
/* ── 季末評等的門檻（打者） ── */
export function batTh(lv){
  const L=LV[lv]||LV.CPBL1, o=envLeagueOps(L.env), r=R(lv);
  return {ops3:o*r.ops3, ops3h:o*r.ops3h, hr3:Math.round(fullSeasonHR(lv)*r.hr3),
    ops2:o*r.ops2, ops1:o*r.ops1};
}
/* ── 降級免疫：這一季夠不夠好到不該被下放 ── */
export function keepTh(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env, r=R(lv);
  return {era:E.era*r.keepEra, whip:envWhip(E)*r.keepWhip, ops:envLeagueOps(E)*r.keepOps,
    hr:Math.round(fullSeasonHR(lv)*r.keepHr), rbi:Math.round(fullSeasonRBI(lv)*r.keepRbi)};
}
/* ── 明星賽入選、MVP 資格、年度打者、終結者 ── */
export function starTh(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env, r=R(lv), o=envLeagueOps(E);
  return {avg:E.avg*r.asAvg, ops:o*r.asOps, hr:Math.round(fullSeasonHR(lv)*r.asHr),
    eraSP:E.era*r.asEraSP, eraRP:E.era*r.asEraRP,
    mvpEra:E.era*r.mvpEra, mvpOps:o*r.mvpOps,
    boyOps:[o*r.boyOps[0],o*r.boyOps[1]], clEra:E.era*r.clEra};
}
