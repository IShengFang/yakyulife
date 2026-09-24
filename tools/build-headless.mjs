/* 從 src/ 產出一份可以在 node 裡跑的無畫面副本，供離線模擬校準使用。
     node tools/build-headless.mjs [輸出目錄]      預設 /tmp/hl
   做三件事：
     ① 把 import 的 ?v=x.y.z 拿掉（node 的 ESM 不吃這種快取破壞參數）
     ② CRLF → LF
     ③ 在 UI 的進入點注入 __autoChoose / __autoAlloc 掛鉤，讓模擬程式接管所有選擇
   遊戲邏輯一行都不改；每次改完 src/ 重跑一次即可。 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SRC=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','src');
const OUT=process.argv[2]||'/tmp/hl';

const SHIM=`/* 無畫面環境:只提供遊戲程式碼會碰到的最小 DOM 介面。 */
globalThis.location={search:'',pathname:'/',href:''};
/* querySelector 與 getElementById 一律回傳另一個 stub，不回 null——遊戲的 UI 程式碼
   到處都是 $('log').appendChild(...) 這種寫法，回 null 會在引退結算那一步整段炸掉，
   而那是生涯數據已經算完、只差畫面的地方。回 stub 讓它安靜地寫進虛空。 */
const el=()=>({style:{},className:'',textContent:'',innerHTML:'',value:'',children:[],hidden:false,
  classList:{add(){},remove(){},toggle(){},contains:()=>false},
  appendChild(){},insertBefore(){},removeChild(){},remove(){},
  querySelector:()=>el(),querySelectorAll:()=>[],closest:()=>el(),
  setAttribute(){},getAttribute:()=>null,removeAttribute(){},addEventListener(){},
  scrollIntoView(){},focus(){},click(){},
  getBoundingClientRect:()=>({top:0,left:0,width:0,height:0,bottom:0,right:0})});
globalThis.document={body:el(),documentElement:el(),getElementById:()=>el(),createElement:el,
  querySelectorAll:()=>[],querySelector:()=>el(),addEventListener(){},createElementNS:el};
globalThis.getComputedStyle=()=>({getPropertyValue:()=>''});
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.window={scrollTo(){},addEventListener(){},removeEventListener(){},
  location:globalThis.location,matchMedia:globalThis.matchMedia,innerWidth:1280,innerHeight:800};
globalThis.requestAnimationFrame=()=>0;
globalThis.setInterval=()=>0; globalThis.clearInterval=()=>{};
globalThis.history={replaceState(){}};
`;

/* 掛鉤:[檔案, 原文, 取代] —— 每一條都必須剛好命中一次，命不中就中止，
   免得 src/ 改版之後產出一份「看起來能跑、其實沒接管」的副本。 */
const HOOKS=[
  ['ui/dom.js','export function card(cls,title,html){',
              'export function card(cls,title,html){ if(globalThis.__autoChoose)return;'],
  ['ui/dom.js','export function divider(t){',
              'export function divider(t){ if(globalThis.__autoChoose)return;'],
  ['ui/dom.js','export function actClear(){',
              'export function actClear(){ if(globalThis.__autoChoose)return;'],
  ['ui/dom.js','export function choose(title,opts){',
              'export function choose(title,opts){ if(globalThis.__autoChoose)return globalThis.__autoChoose(title,opts);'],
  ['ui/dom.js','export function board(phase){',
              'export function board(phase){ if(globalThis.__autoChoose)return;'],
  /* renderTimeline 會把整條 TL 重畫成字串，而且每一個遊戲年度都呼叫一次。
     shim 的 getElementById 回 stub(truthy)，所以它在無畫面環境也會整段跑，
     於是模擬速度隨著累積年數平方衰減。純畫面工作，直接短路。 */
  ['ui/timeline.js','export function renderTimeline(){',
                   'export function renderTimeline(){ if(globalThis.__autoChoose)return;'],
  ['ui/alloc.js','export function allocFullClose(){',
                'export function allocFullClose(){ if(globalThis.__autoAlloc)return;'],
  ['ui/alloc.js','export function clearAlloc(){',
                'export function clearAlloc(){ if(globalThis.__autoAlloc)return;'],
  ['ui/alloc.js','export function allocUI(mode,label,done){',
`export function allocUI(mode,label,done){
  if(globalThis.__autoAlloc){
    const isDice=!!(mode&&mode.dice);
    const units=isDice?mode.dice.slice():Array(Math.max(0,(mode&&mode.pool)||0)).fill(1);
    const touched={};
    units.forEach(v=>{ const k=globalThis.__autoAlloc(v,isDice); if(!k)return;
      addAb(k,v); touched[k]=(touched[k]||0)+v; });
    allocDone(touched,isDice); return done();
  }`],
];

function walk(dir,base=''){
  const out=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const rel=base?base+'/'+e.name:e.name;
    if(e.isDirectory())out.push(...walk(path.join(dir,e.name),rel));
    else if(e.name.endsWith('.js'))out.push(rel);
  }
  return out;
}

fs.rmSync(OUT,{recursive:true,force:true});
fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,'shim.js'),SHIM);

const files=walk(SRC);
const bodies=new Map();
for(const rel of files){
  let s=fs.readFileSync(path.join(SRC,rel),'utf8').replace(/\r\n/g,'\n').replace(/\?v=[0-9.]+/g,'');
  bodies.set(rel,s);
}
for(const [rel,find,repl] of HOOKS){
  const s=bodies.get(rel);
  if(s===undefined)throw new Error('掛鉤指向不存在的檔案：'+rel);
  const n=s.split(find).length-1;
  if(n!==1)throw new Error(`掛鉤在 ${rel} 命中 ${n} 次（需要剛好 1 次）：${find.slice(0,50)}`);
  bodies.set(rel,s.replace(find,repl));
}
for(const [rel,s] of bodies){
  const dest=path.join(OUT,rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,s);
}
console.log(`已產出 ${files.length} 個檔案到 ${OUT}（含 shim.js），掛鉤 ${HOOKS.length} 條全部命中。`);
