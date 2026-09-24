import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {startServer} from './serve.mjs';

const mode=process.argv[2];
const root=fileURLToPath(new URL('../',import.meta.url));
let files=[];
if(mode==='regression')files=(await fs.readdir(path.join(root,'tests')))
  .filter(x=>x.endsWith('.mjs')).sort().map(x=>`tests/${x}`);
else if(mode==='e2e')files=['tests/e2e/smoke.mjs','tests/e2e/paths.mjs',
  'tests/e2e/fixture.mjs','tests/e2e/headless-compare.mjs'];
else throw new Error(`Unknown test group: ${mode}`);
if(!files.length)throw new Error(`No ${mode} tests found`);

const local=process.env.YAKYOLIFE_URL?null:await startServer({port:0,base:process.env.APP_BASE||'/'});
const url=process.env.YAKYOLIFE_URL||local.url;
let failed=0;
try{
  for(const file of files){
    const chunks=[];
    const code=await new Promise((resolve,reject)=>{
      const p=spawn(process.execPath,[file],{cwd:root,env:{...process.env,YAKYOLIFE_URL:url},
        stdio:['ignore','pipe','pipe']});
      p.stdout.on('data',x=>chunks.push(x));p.stderr.on('data',x=>chunks.push(x));
      p.once('error',reject);p.once('close',resolve);
    });
    const output=Buffer.concat(chunks).toString().trim();
    process.stdout.write(`${code===0?'PASS':'FAIL'} ${file}\n`);
    if(code!==0){failed++;process.stderr.write(`${output}\n`);}
  }
}finally{if(local)await new Promise(resolve=>local.server.close(resolve));}
process.stdout.write(`${files.length-failed}/${files.length} ${mode} tests passed\n`);
if(failed)process.exitCode=1;
