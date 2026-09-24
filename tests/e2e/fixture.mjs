import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {digest,runCareer} from './career-fixture.mjs';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
for(const pos of ['p','c','if','of','tw','convert']){
  const fixture=JSON.parse(await fs.readFile(new URL(`../fixtures/${pos}.json`,import.meta.url)));
  assert.equal(fixture.rulesVersion,'v2.0.11');
  const result=await runCareer(url,fixture);
  assert.deepEqual(result.years.map(x=>({year:x.year,digest:digest(x)})),fixture.yearDigests,
    `${pos} annual snapshots changed`);
  assert.equal(digest(result.final),fixture.finalDigest,`${pos} final snapshot changed`);
  process.stdout.write(`${fixture.pos}: ${fixture.actions.length} actions replayed\n`);
}
