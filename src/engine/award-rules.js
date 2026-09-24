/* 只有真正會進入 honorScore() 的個人獎項才算「生涯得分獎項」。
   獎項觸發與結算評分共用這個純函式，避免規則再次分岔。 */
export function isCareerScoringAward(award){
  return /(?:年度MVP|年度最佳投手|年度最佳打者|賽揚|投手三冠王|打擊三冠王|勝投王|防禦率王|三振王|救援王|中繼王|打擊王|全壘打王|盜壘王|打點王|上壘王|守備聖經|金手套)$/.test(String(award||''));
}

/* ── 獎項分組：通用／投手／打擊 ──
   原本全部擠在同一張清單裡，投手獎跟打擊獎混在一起。單刀球員還看得下去，
   二刀流的清單直接變成一團——他兩邊的獎都有。

   分法就照獎項本身屬於哪一邊：
     · 投手：勝投王／防禦率王／三振王／救援王／中繼王／投手三冠王／年度最佳投手
     · 打擊：打擊王／全壘打王／打點王／上壘王／盜壘王／打擊三冠王／年度最佳打者／金手套／守備聖經
     · 通用：其餘全部——年度MVP、二天一流（投打雙三冠，不屬於任何一邊）、新人王、
             總冠軍與日本一、明星賽、國際賽的名次與賽會MVP、學生時代的大賽冠軍
   金手套與守備聖經放進打擊那一組，是因為它們是「野手」的獎；投手金手套本遊戲沒有。

   放在這個檔案而不是 career.js：季末的年度獎項卡（engine/awards.js）也要用，
   而 career.js 拉進 awards.js 會兜出循環 import。這裡是葉子模組，誰都可以拿。 */
export const HONOR_GROUP_NAMES={all:'通用獎項',pit:'投手獎項',bat:'打擊獎項'};
export function honorSide(awd){
  const a=String(awd||'');
  if(/二天一流|年度MVP/.test(a))return 'all';        /* 二天一流是兩邊一起拿的，不歸給任何一邊 */
  if(/最佳投手|賽揚|勝投王|防禦率王|三振王|救援王|中繼王|投手三冠王/.test(a))return 'pit';
  if(/最佳打者|打擊王|全壘打王|打點王|上壘王|盜壘王|打擊三冠王|金手套|守備聖經/.test(a))return 'bat';
  return 'all';
}
/* 把一組獎項字串依投打分段，順序固定 通用 → 投手 → 打擊。空的那一段不回傳，
   所以純投手看到的還是兩段，跟以前一樣乾淨。 */
export function splitBySide(items,keyOf){
  const k=keyOf||(x=>x);
  return ['all','pit','bat']
    .map(g=>({key:g,name:HONOR_GROUP_NAMES[g],items:items.filter(x=>honorSide(k(x))===g)}))
    .filter(sec=>sec.items.length);
}
