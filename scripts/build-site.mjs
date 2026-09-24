import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {inventory,walk} from './release-lib.mjs';
import {CORE_TOKEN,ENTRY_TOKEN} from './version-policy.mjs';

const source=fileURLToPath(new URL('../',import.meta.url));
export async function buildSite(out=path.join(source,'_site')){
  out=path.resolve(out);
  if(out===path.resolve(source)||path.resolve(source).startsWith(out+path.sep))throw new Error('Unsafe output directory');
  // Never delete an arbitrary directory supplied by a caller.
  await fs.mkdir(out,{recursive:true});
  if((await fs.readdir(out)).length)throw new Error(`Build destination must be empty: ${out}`);
  const buildId=randomUUID();
  const versionURL=url=>{
    if(/^(?:[a-z]+:|#)/i.test(url))return url;
    const parsed=new URL(url,'https://artifact.invalid/');
    const token=parsed.searchParams.get('v');
    if(token&&![CORE_TOKEN,ENTRY_TOKEN].includes(token))throw new Error('Unknown version token: '+url);
    const [beforeHash,fragment]=url.split('#');
    return beforeHash+(beforeHash.includes('?')?'&':'?')+'build='+buildId+(fragment?'#'+fragment:'');
  };
  for(const name of ['index.html','manifest.webmanifest','CNAME','og.png','assets','css','src'])
    await fs.cp(path.join(source,name),path.join(out,name),{recursive:true});
  await fs.writeFile(path.join(out,'src/pwa-build.js'),`export const BUILD_ID = ${JSON.stringify(buildId)};\n`);
  // Unique URLs let retiring clients finish loading their own immutable bytes, even
  // across the tiny interval between the last client vote and worker activation.
  for(const file of await walk(out)){
    if(!/\.(?:js|html|css|webmanifest)$/.test(file))continue;
    let body=await fs.readFile(path.join(out,file),'utf8');
    if(file.endsWith('.js')){
      body=body.replace(/(['"])([^'"\s]+\?v=[^'"\s]+)\1/g,(_,quote,url)=>quote+versionURL(url)+quote);
      body=body.replace(/(['"])(assets\/[^'"\s]+)\1/g,(_,quote,url)=>quote+versionURL(url)+quote);
    }
    if(file.endsWith('.css'))body=body.replace(/url\(\s*(['"]?)([^\s)'"#]+(?:#[^)'"\s]*)?)\1\s*\)/g,
      (_,quote,url)=>'url('+quote+versionURL(url)+quote+')');
    if(file==='index.html'){
      body=body.replace(/(<(?:script|img|link)\b[^>]*?\b(?:src|href)=["'])([^"']+)(["'])/g,
        (_,prefix,url,quote)=>prefix+versionURL(url)+quote);
      body=body.replace('<head>',`<head>\n<meta name="yakyulife-build" content="${buildId}">`);
    }
    if(file.endsWith('.webmanifest')){
      const manifest=JSON.parse(body);
      manifest.icons.forEach(icon=>{icon.src=versionURL(icon.src);});
      body=JSON.stringify(manifest,null,2)+'\n';
    }
    await fs.writeFile(path.join(out,file),body);
  }
  const appVersion=(await fs.readFile(path.join(out,'src/config.js'),'utf8')).match(/APP_VER='([^']+)'/)[1];
  const release={buildId,appVersion,resources:await inventory(out)};
  await fs.writeFile(path.join(out,'precache.json'),JSON.stringify(release,null,2)+'\n');
  const template=await fs.readFile(path.join(source,'sw.js'),'utf8');
  await fs.writeFile(path.join(out,'sw.js'),template.replace('/* RELEASE_DATA */ null',JSON.stringify(release)));
  return release;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  // Only this fixed, ignored build directory is disposable.
  await fs.rm(path.join(source,'_site'),{recursive:true,force:true});
  const release=await buildSite();
  console.log(`Built ${release.buildId}: ${release.resources.length} precache URLs`);
}
