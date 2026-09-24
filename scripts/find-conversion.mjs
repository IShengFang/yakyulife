import {chromium} from 'playwright';
import {startServer} from './serve.mjs';
import {runCareer} from '../tests/e2e/career-fixture.mjs';

const {server,url}=await startServer({port:0});
const browser=await chromium.launch({headless:true});
try{
  for(let i=0;i<200;i++){
    const seed=`phase0-convert-${i}`;
    const result=await runCareer(url,{seed,name:'轉入測試',jersey:18,pos:'P'},true,{browser,probe:true});
    if(result.sawConversion){process.stdout.write(`Found conversion seed: ${seed}\n`);break;}
    if(i%20===19)process.stdout.write(`Checked ${i+1} seeds\n`);
    if(i===199)throw new Error('No conversion offer in 200 seeds');
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
