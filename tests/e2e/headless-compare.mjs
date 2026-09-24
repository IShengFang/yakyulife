import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yakyulife-headless-'));
try{
  const build=spawnSync(process.execPath,['tools/build-headless.mjs',temp],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr||build.stdout);
  await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}\n');
  await import(pathToFileURL(path.join(temp,'shim.js')).href);
  const st=await import(pathToFileURL(path.join(temp,'core/state.js')).href);
  const rng=await import(pathToFileURL(path.join(temp,'core/rng.js')).href);
  const phases=await import(pathToFileURL(path.join(temp,'flow/phases.js')).href);
  const timeline=await import(pathToFileURL(path.join(temp,'ui/timeline.js')).href);
  const {LV}=await import(pathToFileURL(path.join(temp,'data/teams.js')).href);
  const {POS_AB}=await import(pathToFileURL(path.join(temp,'data/abilities.js')).href);
  for(const id of ['p','c','if','of','tw','convert']){
    const f=JSON.parse(await fs.readFile(new URL('../fixtures/'+id+'.json',import.meta.url)));
    let at=0;
    const next=kind=>{
      while(f.actions[at]?.[0]==='d')at++;
      const a=f.actions[at++];
      assert.equal(a?.[0],kind,id+' action '+at+': '+JSON.stringify(a));
      return a;
    };
    globalThis.__autoChoose=(title,opts)=>{
      if(st.S.done)return;
      const a=next('c');
      assert.ok(a[2]<opts.length,id+': option index out of range');
      opts[a[2]].f();
    };
    globalThis.__autoAlloc=()=>{
      let a=next('a');
      if(f.actions[at]?.[0]==='u'){
        at++;a=next('a');
      }
      const key=POS_AB[st.S.pos][a[1]];
      assert.ok(key,id+': allocation index out of range');
      return key;
    };
    rng.setSeed(f.seed);rng.seedInit(f.seed);
    st.setS(st.newState(f.name,f.jersey,f.pos,null));
    st.S.teamName=function(){
      if(!this.orgTeam)return '';
      if(this.lv==='MLB')return this.orgTeam;
      if(LV[this.lv].org==='MiLB')return this.orgTeam+({R:'新人聯盟',A1:'1A',A2:'2A',A3:'3A'}[this.lv]);
      if(this.lv==='CPBL1'||this.lv==='NPB1')return this.orgTeam;
      return this.orgTeam+'二軍';
    };
    timeline.resetTL();phases.startYear();
    assert.ok(st.S.done,id+': headless career did not retire');
    while(f.actions[at]?.[0]==='d')at++;
    assert.equal(at,f.actions.length,id+': unconsumed browser actions');
    const actual={year:st.S.year,age:st.S.age,pos:st.S.pos,twOrigin:st.S.twOrigin,
      stats:st.S.stats,salary:st.S.salary,honors:st.S.honors,
      ab:st.S.ab,pot:st.S.pot,log:st.S.log};
    const {ending,...expected}=f.finalSummary;
    assert.deepEqual(actual,expected,id+': headless model differs from browser');
    process.stdout.write(id+': browser and headless models agree\n');
  }
}finally{
  delete globalThis.__autoChoose;delete globalThis.__autoAlloc;
  await fs.rm(temp,{recursive:true,force:true});
}
