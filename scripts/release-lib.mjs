import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.webmanifest':'application/manifest+json','.json':'application/json',
  '.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
export async function walk(root){
  const result=[];
  for(const entry of await fs.readdir(root,{withFileTypes:true})){
    if(entry.isDirectory())result.push(...(await walk(path.join(root,entry.name))).map(x=>entry.name+'/'+x));
    else result.push(entry.name);
  }
  return result.sort();
}

// The graph includes literal dynamic imports, DOM assets, CSS URLs and manifest icons.
// Nonliteral imports must be explicitly handled here before they enter the runtime.
export function references(file,body){
  let refs=[];
  if(file.endsWith('.js')){
    refs=[...body.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
    refs.push(...[...body.matchAll(/['"](assets\/[^'"<>\s]+)['"]/g)].map(m=>'/'+m[1]));
    if(/\bimport\s*\(\s*[^'"\s]/.test(body))throw new Error(`Nonliteral import: ${file}`);
  }else if(file.endsWith('.html')){
    refs=[...body.matchAll(/<(?:script|img|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]);
  }else if(file.endsWith('.css')||file.endsWith('.svg')){
    refs=[...body.matchAll(/url\(\s*['"]?([^\s)'"#]+)(?:#[^)'"\s]*)?['"]?\s*\)/g)].map(m=>m[1]);
  }else if(file.endsWith('.webmanifest'))refs=JSON.parse(body).icons.map(x=>x.src);
  return refs.filter(x=>!x.startsWith('#')&&!/^(?:data:|https?:)/.test(x));
}

export async function inventory(root){
  const urls=new Set();
  const files=(await walk(root)).filter(f=>mime[path.extname(f)]&&!['sw.js','precache.json'].includes(f));
  const visit=async url=>{
    if(urls.has(url))return;
    urls.add(url);
    const file=url.split('?')[0];
    if(!files.includes(file))throw new Error(`Missing runtime asset: ${url}`);
    const body=await fs.readFile(path.join(root,file),'utf8');
    for(const ref of references(file,body)){
      const parsed=new URL(ref,new URL(url,'https://artifact.invalid/'));
      await visit(parsed.pathname.slice(1)+parsed.search);
    }
  };
  for(const file of files)await visit(file);
  return Promise.all([...urls].sort().map(async url=>{
    const file=url.split('?')[0],bytes=await fs.readFile(path.join(root,file));
    return {url,size:bytes.length,sha256:sha256(bytes),mime:mime[path.extname(file)]};
  }));
}
