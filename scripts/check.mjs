import {spawn} from 'node:child_process';

for(const name of ['test:static','test:unit','test:regression','test:e2e','test:pwa']){
  process.stdout.write(`\n> ${name}\n`);
  const code=await new Promise((resolve,reject)=>{
    const p=spawn('npm',['run',name],{stdio:'inherit',env:process.env});
    p.once('error',reject);p.once('close',resolve);
  });
  if(code!==0)process.exit(code||1);
}
