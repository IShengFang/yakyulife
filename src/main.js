import {SEED, setSeed, seedInit} from './core/rng.js?v=2.0.2';
import {S, setS, newState} from './core/state.js?v=2.0.2';
import {APP_VER} from './config.js?v=2.0.2';
import {POSN} from './data/abilities.js?v=2.0.2';
import {LV} from './data/teams.js?v=2.0.2';
import {$, card, modalClose, actToggleSync} from './ui/dom.js?v=2.0.2';
import {THEME_KEY, BIG_KEY, applyTheme, applyMobileUI, applyBigText, updDispSum} from './ui/prefs.js?v=2.0.2';
import {allocFullClose} from './ui/alloc.js?v=2.0.2';
import {TL, resetTL, renderTimeline, tlScrollTo} from './ui/timeline.js?v=2.0.2';
import {startYear} from './flow/phases.js?v=2.0.2';

/* ================= 開場設定 ================= */
/* iOS Safari zoom guards. Pinch: Safari ignores maximum-scale/user-scalable, so the
   WebKit-only gesture events are cancelled (other browsers honor the viewport meta).
   Double-tap: touch-action:manipulation should cover it, but iOS still zooms on fast
   taps in places (observed on device during point allocation), so a tap landing
   within 350ms of the previous one is swallowed and replayed as a synthetic click:
   tapping keeps working at any speed while the zoom gesture never forms. Drags are
   exempt (finger travel over 12px), so scrolling and flicks are unaffected. */
['gesturestart','gesturechange'].forEach(t=>document.addEventListener(t,e=>e.preventDefault()));
(function(){
  let last=0,sx=0,sy=0,drag=false;
  document.addEventListener('touchstart',e=>{ const t=e.touches[0];
    if(e.touches.length===1&&t){ sx=t.clientX; sy=t.clientY; drag=false; } else drag=true;
  },{passive:true});
  document.addEventListener('touchmove',e=>{ const t=e.touches[0];
    if(t&&(Math.abs(t.clientX-sx)>12||Math.abs(t.clientY-sy)>12))drag=true;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    const now=Date.now(), fast=now-last<350; last=now;
    if(!fast||drag||e.changedTouches.length!==1||!e.cancelable)return;
    const t=e.changedTouches[0], el=document.elementFromPoint(t.clientX,t.clientY);
    /* form fields keep native behavior (focus/caret need the default action) */
    if(el&&/^(INPUT|TEXTAREA|SELECT|LABEL)$/.test(el.tagName))return;
    e.preventDefault();
    if(el)el.click();
  },{passive:false});
})();
(function(){ const t=document.getElementById('act-toggle');
  /* actToggleSync owns the button's contents (the shared chevron): writing the label here
     would replace the icon element it just built */
  if(t)t.onclick=()=>{ document.getElementById('act').classList.toggle('collapsed'); actToggleSync(); };
})();
(function(){ /* theme init + timeline click delegation */
  try{ applyMobileUI(localStorage.getItem('yakyu-mobile-ui')==='1'); }catch(e){}
  document.querySelectorAll('#seg-ui button').forEach(b=>b.onclick=()=>applyMobileUI(b.dataset.u==='1'));
  try{ applyBigText(localStorage.getItem(BIG_KEY)==='1'); }catch(e){}
  document.querySelectorAll('#seg-big button').forEach(b=>b.onclick=()=>applyBigText(b.dataset.b==='1'));
  const afc=$('af-close'); if(afc)afc.onclick=allocFullClose;
  /* the layout entry appears and disappears at the breakpoint, so the summary re-syncs on resize */
  window.addEventListener('resize',updDispSum);
  /* Slide the panel open and shut. ::details-content only interpolates with
     interpolate-size, which is Chromium-only, so Firefox and Safari saw it snap; the Web
     Animations API works everywhere. While collapsing, `open` has to stay set until the
     animation ends or the content would vanish on the first frame. Reduced motion is
     checked here because the global *{transition:none} rule cannot match a pseudo-element. */
  (function(){ const det=document.getElementById('fld-display'); if(!det)return;
    const body=document.getElementById('disp-body'), sum=det.querySelector('summary');
    if(!body||!sum)return; let anim=null;
    const sync=on=>{ body.hidden=!on; sum.setAttribute('aria-expanded',on?'true':'false'); };
    const focusPref=()=>{ (body.querySelector('#seg-theme button.on')||body.querySelector('button'))?.focus(); };
    sync(det.open);
    det.addEventListener('toggle',()=>{ if(!anim)sync(det.open); });
    sum.addEventListener('click',ev=>{
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      ev.preventDefault();
      if(anim){ anim.cancel(); anim=null; }
      const opening=!det.open;
      if(opening){ det.open=true; sync(true); }
      const h=body.getBoundingClientRect().height;
      body.style.overflow='hidden';
      anim=body.animate({height:opening?['0px',h+'px']:[h+'px','0px'],
        opacity:opening?[0,1]:[1,0]},{duration:280,easing:'ease'});
      anim.onfinish=()=>{ body.style.overflow=''; anim=null; if(!opening){ det.open=false; sync(false); } };
    });
    sum.addEventListener('keydown',ev=>{
      if(ev.key!=='Enter'&&ev.key!==' ')return;
      const opening=!det.open;
      ev.preventDefault(); sum.click();
      if(opening)setTimeout(focusPref,matchMedia('(prefers-reduced-motion: reduce)').matches?0:300);
    }); })();
  let t='a'; try{t=localStorage.getItem(THEME_KEY)||'a';}catch(e){}
  document.querySelectorAll('#seg-theme button').forEach(b=>b.onclick=()=>applyTheme(b.dataset.t));
  applyTheme(t);
  ['tl-list','tl-strip'].forEach(id=>{ const el=$(id);
    if(el)el.onclick=ev=>{ const n=ev.target.closest('[data-i]'); if(n)tlScrollTo(TL[+n.dataset.i]); };
    if(el)el.onkeydown=ev=>{ if(ev.key!=='Enter'&&ev.key!==' ')return;
      const n=ev.target.closest('[data-i]'); if(!n)return;
      ev.preventDefault(); tlScrollTo(TL[+n.dataset.i]); }; });
  const md=$('modal'); if(md)md.onclick=ev=>{ if(ev.target===md)modalClose(); };
  document.addEventListener('keydown',ev=>{ if(ev.key==='Escape'){ modalClose(); allocFullClose(); } });
})();
let selPos='P';
/* 姓名與背號都留空時的預設球員。TW 有自己的一組——原本沒有，
   二刀流會掉到下面那組隨機的野手名字（藥帝士／黃鎖頭），跟身分完全對不上。
   背號 17 是二刀流的那個號碼。 */
const DEFAULT_PLAYERS={P:{name:'有有子',jersey:11},IF:{name:'抹茶多',jersey:13},TW:{name:'大骨湯',jersey:17}};
const DEFAULT_PLAYER_PAIRS=[
  DEFAULT_PLAYERS.P,DEFAULT_PLAYERS.IF,{name:'藥帝士',jersey:23},{name:'黃鎖頭',jersey:22}
];
function defaultPlayer(pos){
  if(DEFAULT_PLAYERS[pos])return DEFAULT_PLAYERS[pos];
  return DEFAULT_PLAYER_PAIRS[2+Math.floor(Math.random()*2)];
}
const PLAYER_NAME_KEY='yakyu-player-name';
const PLAYER_JERSEY_KEY='yakyu-player-jersey';
/* 第一次進入保持空白；玩家開始過生涯後，重新整理或重新開始時帶回上次輸入。 */
try{
  $('in-name').value=(localStorage.getItem(PLAYER_NAME_KEY)||'').slice(0,10);
  $('in-number').value=(localStorage.getItem(PLAYER_JERSEY_KEY)||'').slice(0,2);
}catch(e){}
$('seed-show').value=SEED;
$('seed-re').onclick=e=>{e.preventDefault();setSeed(Math.random().toString(36).slice(2,10));$('seed-show').value=SEED;};
function bindPosSeg(){
  document.querySelectorAll('#seg-pos button').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('#seg-pos button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); selPos=b.dataset.v;
  });
}
bindPosSeg();
/* 二刀流入口:標題連點 7 下開啟，再連點 7 下關掉(也可以直接重整——刻意不寫 localStorage，
   見 docs/twoway-design.md §6)。開啟時守位選單只剩「二刀流」，不能改選其他守位:
   七下是一條給二刀流的捷徑，不是拿來刷天才給純投手／純野手用的後門。 */
(()=>{
  const logo=$('logo-tap'), seg=$('seg-pos'); if(!logo||!seg)return;
  const segHTML=seg.innerHTML;                 /* 關掉時原樣還原四顆守位鈕 */
  let taps=0,last=0,prevPos=selPos;
  /* 不改 cursor——這是彩蛋，不該讓標題看起來可以點。只擋掉連點造成的文字反白。 */
  logo.style.userSelect='none'; logo.style.webkitUserSelect='none';
  const hintOff=()=>{ const h=document.getElementById('tw-hint'); if(h)h.remove(); };
  const hintOn=()=>{
    const field=seg.closest('.field'); if(!field||document.getElementById('tw-hint'))return;
    const hint=document.createElement('p');
    hint.id='tw-hint'; hint.className='seed-hint';
    hint.innerHTML='投打兼修。高中三年會覺醒天才，訓練骰保底五顆——但任一側跟不上層級水準就會被強制收斂成單刀，'+
      '投在另一側的點數不退還，天才也會一併失去。<b>再連點七下標題即可取消。</b>';
    field.appendChild(hint);
  };
  logo.addEventListener('click',()=>{
    const now=Date.now();
    taps=(now-last>1500)?1:taps+1; last=now;   /* 中斷超過 1.5 秒就重數，避免誤觸累積 */
    if(taps<7)return;
    taps=0;
    if(selPos==='TW'){                          /* 再七下:還原成原本選的守位 */
      selPos=prevPos; seg.innerHTML=segHTML; bindPosSeg();
      seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.v===selPos));
      hintOff(); return;
    }
    prevPos=selPos; selPos='TW';
    seg.innerHTML='<button data-v="TW" class="on">二刀流</button>';
    bindPosSeg(); hintOn();
  });
})();
$('btn-start').onclick=()=>{
  const sv=$('seed-show').value.trim(); if(sv)setSeed(sv); /* 玩家可直接輸入流水碼 */
  history.replaceState(null,'','?seed='+encodeURIComponent(SEED));
  seedInit(SEED);
  const enteredName=$('in-name').value.trim();
  const rawNo=$('in-number').value.trim();
  const useDefault=!enteredName&&!rawNo;
  let nm=enteredName,jersey=Number(rawNo);
  if(useDefault){
    const def=defaultPlayer(selPos);
    nm=def.name; jersey=def.jersey;
  }else{
    /* 只填其中一欄仍視為資料不完整，避免自訂姓名配到系統背號或反過來。 */
    if(!nm){
      $('in-name').setCustomValidity('請輸入球員姓名，或將姓名與背號都留空使用預設球員。');
      $('in-name').reportValidity(); return;
    }
    $('in-name').setCustomValidity('');
    if(rawNo===''||!Number.isInteger(jersey)||jersey<0||jersey>99){
      $('in-number').setCustomValidity('背號請輸入 0～99 的整數，或將姓名與背號都留空使用預設球員。');
      $('in-number').reportValidity(); return;
    }
  }
  $('in-name').setCustomValidity('');
  $('in-number').setCustomValidity('');
  if(!useDefault){
    try{
      localStorage.setItem(PLAYER_NAME_KEY,nm);
      localStorage.setItem(PLAYER_JERSEY_KEY,String(jersey));
    }catch(e){}
  }
  setS(newState(nm,jersey,selPos,null));
  S.teamName=function(){
    if(!this.orgTeam)return '';
    if(this.lv==='MLB')return this.orgTeam;
    if(LV[this.lv].org==='MiLB')return this.orgTeam+({R:'新人聯盟',A1:'1A',A2:'2A',A3:'3A'}[this.lv]);
    if(this.lv==='CPBL1'||this.lv==='NPB1')return this.orgTeam;
    return this.orgTeam+'二軍';
  };
  $('start').style.display='none';
  $('board').style.display=''; $('act').style.display='';
  resetTL(); renderTimeline();
  const ts=$('tl-seed'); if(ts)ts.textContent=SEED;
  card('info','球員誕生',`${S.year} 年春天，${POSN[S.pos]} <b class="hl">${S.name}</b> 加入 <b class="hl">${S.team}</b> 棒球隊。雄心壯志，野心勃勃，他的世界正要因為棒球展開。<br><span style="color:var(--dim);font-size:12px">提示：22 歲前累積擲出 5 次「6」可覺醒隱藏素質。</span>`);
  startYear();
};
/* ================= PWA installability: manifest built at runtime as a Blob; icons are
   assets/ files (the logo system ships file assets, so the single-file constraint is gone) ================= */
(function(){
  if(!/^https?:$/.test(location.protocol))return; /* keep file:// double-click usage untouched */
  try{
    const dir=location.origin+location.pathname.replace(/[^/]*$/,'');
    const mf={id:dir,name:document.title||'YaKyoLife - 棒球人生模擬器',short_name:'YaKyoLife',
      description:'從高中三大賽到名人堂，一場種子化的台灣棒球員生涯模擬。',
      lang:'zh-Hant',start_url:dir,scope:dir,display:'standalone',
      background_color:'#081510',theme_color:'#081510',
      icons:[{src:dir+'assets/app-icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
        {src:dir+'assets/app-icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
        {src:dir+'assets/app-icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
    const l=document.createElement('link'); l.rel='manifest';
    l.href=URL.createObjectURL(new Blob([JSON.stringify(mf)],{type:'application/manifest+json'}));
    document.head.appendChild(l);
  }catch(e){}
})();
(function(){ const vb=document.getElementById('ver-badge'); if(vb)vb.textContent=APP_VER;
  const tv=document.getElementById('tl-ver'); if(tv)tv.textContent=APP_VER;
  const gv=document.getElementById('game-ver'); if(gv)gv.textContent=APP_VER; })();
/* touch has no hover: tap the salary cell to reveal the full amount, tap again to close.
   Never dismisses on a timer — the user decides when it goes away. */
(function(){ const cell=document.getElementById('bd-sal-cell'); if(!cell)return;
  cell.addEventListener('click',()=>cell.classList.toggle('show'));
  /* on pointer devices :hover already governs the tip; make sure a stray click cannot
     leave it pinned open after the cursor has left the cell */
  if(window.matchMedia('(hover:hover)').matches)
    cell.addEventListener('mouseleave',()=>cell.classList.remove('show')); })();

