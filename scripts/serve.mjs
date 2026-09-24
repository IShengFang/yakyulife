import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon'};

export async function startServer({port=8124,base='/',host='127.0.0.1'}={}){
  if(!base.startsWith('/')||!base.endsWith('/'))throw new Error('base must start and end with /');
  const server=http.createServer(async(req,res)=>{
    let pathname;
    try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}
    catch{res.writeHead(400).end();return;}
    if(!pathname.startsWith(base)){res.writeHead(404).end();return;}
    const rel=pathname.slice(base.length)||'index.html';
    if(rel.split('/').includes('..')||rel.startsWith('.')||rel.includes('\\')){
      res.writeHead(403).end();return;
    }
    const file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{
      const stat=await fs.stat(file);
      if(!stat.isFile())throw new Error('not a file');
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream',
        'Content-Length':stat.size,'Cache-Control':'no-store'});
      const {createReadStream}=await import('node:fs');
      createReadStream(file).pipe(res);
    }catch{res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>server.once('error',reject).listen(port,host,resolve));
  return {server,url:`http://${host}:${server.address().port}${base}`};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {url}=await startServer({port:Number(process.env.PORT||8124),base:process.env.APP_BASE||'/'});
  process.stdout.write(`Serving ${url}\n`);
}
