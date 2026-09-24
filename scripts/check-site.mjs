import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventory,walk} from './release-lib.mjs';
import {expectedToken} from './version-policy.mjs';

export async function checkSite(root){
  const release=JSON.parse(await fs.readFile(path.join(root,'precache.json')));
  assert.deepEqual(await inventory(root),release.resources,'Artifact differs from precache manifest');
  assert.ok(release.resources.every(x=>x.size>0&&x.sha256.length===64));
  for(const entry of release.resources){
    const url=new URL(entry.url,'https://artifact.invalid/');
    if(!url.search)continue;
    if(url.searchParams.has('v'))assert.equal(url.searchParams.get('v'),expectedToken(url.pathname.slice(1)),entry.url);
    assert.equal(url.searchParams.get('build'),release.buildId,entry.url);
    assert.equal([...url.searchParams].length,url.searchParams.has('v')?2:1,entry.url);
  }
  const worker=await fs.readFile(path.join(root,'sw.js'),'utf8');
  assert.ok(worker.includes(JSON.stringify(release)),'Worker and manifest differ');
  const allowed=new Set(['index.html','manifest.webmanifest','CNAME','og.png','assets','css','src','sw.js','precache.json']);
  for(const file of await walk(root))assert.ok(allowed.has(file.split('/')[0]),`Unexpected published file ${file}`);
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.webmanifest')));
  for(const key of ['id','scope','start_url'])assert.equal(manifest[key],'./');
  for(const icon of manifest.icons){
    const bytes=await fs.readFile(path.join(root,icon.src.split('?')[0]));
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);
    assert.equal(icon.purpose,'any','Maskable icons require a reviewed safe area');
  }
  console.log(`Artifact verified: ${release.buildId}, ${release.resources.length} complete URLs`);
  return release;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  await checkSite(path.resolve(process.env.SITE_ROOT||'_site'));
