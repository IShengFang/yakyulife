import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inventory} from '../../scripts/release-lib.mjs';
import {buildSite} from '../../scripts/build-site.mjs';
import {checkSite} from '../../scripts/check-site.mjs';

test('precache graph preserves versioned dynamic imports and rejects missing dependencies',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yakyulife-graph-'));
  try{
    await fs.mkdir(path.join(dir,'src'));
    await fs.writeFile(path.join(dir,'index.html'),'<script type="module" src="src/main.js?v=entry"></script>');
    await fs.writeFile(path.join(dir,'src/main.js'),"export const later=()=>import('./later.js?v=core');");
    await assert.rejects(inventory(dir),/Missing runtime asset: src\/later.js\?v=core/);
    await fs.writeFile(path.join(dir,'src/later.js'),'export const value=1;');
    const list=await inventory(dir);
    assert.ok(list.some(e=>e.url==='src/main.js?v=entry'));
    assert.ok(list.some(e=>e.url==='src/later.js?v=core'));
    await fs.writeFile(path.join(dir,'src/main.js'),'export const later=url=>import(url);');
    await assert.rejects(inventory(dir),/Nonliteral import/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('artifact checker rejects altered bytes, unexpected published files and mismatched worker',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yakyulife-artifact-'));
  try{
    const release=await buildSite(dir);
    await checkSite(dir);
    const config=path.join(dir,'src/config.js'),original=await fs.readFile(config);
    const changed=Buffer.from(original);changed[0]^=1;
    await fs.writeFile(config,changed);
    await assert.rejects(checkSite(dir),/Artifact differs/);
    await fs.writeFile(config,original);
    await fs.writeFile(path.join(dir,'PLAN.md'),'Must not be published');
    await assert.rejects(checkSite(dir),/Unexpected published file/);
    await fs.rm(path.join(dir,'PLAN.md'));
    const worker=path.join(dir,'sw.js');
    await fs.writeFile(worker,(await fs.readFile(worker,'utf8')).replace(release.buildId,'wrong-build'));
    await assert.rejects(checkSite(dir),/Worker and manifest differ/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
