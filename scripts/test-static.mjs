import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const config=await fs.readFile(path.join(root,'src/config.js'),'utf8');
assert.match(config,/APP_VER='v2\.0\.11'/);
const imports=[];
for(const dir of ['src']){
  const walk=async current=>{
    for(const entry of await fs.readdir(current,{withFileTypes:true})){
      const file=path.join(current,entry.name);
      if(entry.isDirectory())await walk(file);
      else if(file.endsWith('.js')){
        const body=await fs.readFile(file,'utf8');
        for(const match of body.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)){
          const [relative,query]=match[1].split('?');
          assert.equal(query,'v=2.0.11',`${file}: unexpected module version`);
          const target=path.resolve(path.dirname(file),relative);
          assert.ok(target.startsWith(root),`${file}: import escaped repository`);
          await fs.access(target);
          imports.push(target);
        }
      }
    }
  };
  await walk(path.join(root,dir));
}
for(const match of html.matchAll(/(?:href|src)="((?:assets|css|src)\/[^"?#]+)(?:\?([^"]+))?"/g)){
  await fs.access(path.join(root,match[1]));
  if(match[1]==='css/style.css'||match[1]==='src/main.js')
    assert.match(match[2]||'',/^v=2\.0\.11(?:-ui-complete)?$/);
}
const regression=(await fs.readdir(path.join(root,'tests'))).filter(x=>x.endsWith('.mjs'));
assert.equal(regression.length,24,'Phase 0 must retain the existing 24 regression tests');
const official=config.match(/OFFICIAL_URL='([^']+)'/)?.[1];
assert.equal(official,'https://ishengfang.github.io/yakyulife/');
assert.ok(html.includes(`<link rel="canonical" href="${official}">`));
assert.ok(html.includes(`<meta property="og:url" content="${official}">`));
for(const kind of ['property="og:image"','name="twitter:image"'])
  assert.ok(html.includes(`<meta ${kind} content="${official}og.png">`));
process.stdout.write(`Static check passed: ${imports.length} imports, ${regression.length} regressions\n`);
