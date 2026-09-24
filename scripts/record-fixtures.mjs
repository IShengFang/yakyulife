import fs from 'node:fs/promises';
import {startServer} from './serve.mjs';
import {digest,runCareer} from '../tests/e2e/career-fixture.mjs';

const cases=[
  {seed:'phase0-p',name:'基準投手',jersey:11,pos:'P'},
  {seed:'phase0-c',name:'基準捕手',jersey:12,pos:'C'},
  {seed:'phase0-if',name:'基準內野',jersey:13,pos:'IF'},
  {seed:'phase0-of',name:'基準外野',jersey:14,pos:'OF'},
  {seed:'phase0-tw',name:'基準二刀',jersey:17,pos:'TW'},
  {id:'convert',seed:'phase0-convert-8',name:'轉入測試',jersey:18,pos:'P',conversion:true},
];
const {server,url}=await startServer({port:0});
try{
  for(const fixture of cases){
    const result=await runCareer(url,fixture,true);
    const output={rulesVersion:'v2.0.11',...fixture,
      actions:result.actions,yearDigests:result.years.map(x=>({year:x.year,digest:digest(x)})),
      finalDigest:digest(result.final),finalSummary:{year:result.final.year,age:result.final.age,
        pos:result.final.pos,twOrigin:result.final.twOrigin,stats:result.final.stats,
        salary:result.final.salary,honors:result.final.honors,ab:result.final.ab,
        pot:result.final.pot,log:result.final.log,ending:result.final.ending}};
    await fs.mkdir('tests/fixtures',{recursive:true});
    await fs.writeFile(`tests/fixtures/${fixture.id||fixture.pos.toLowerCase()}.json`,JSON.stringify(output,null,2)+'\n');
    process.stdout.write(`${fixture.id||fixture.pos}: ${result.actions.length} actions, ${result.years.length} years\n`);
  }
}finally{await new Promise(resolve=>server.close(resolve));}
