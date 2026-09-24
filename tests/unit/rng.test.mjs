import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location={search:''};
const rng=await import('../../src/core/rng.js');

test('same seed reproduces the game RNG sequence',()=>{
  rng.seedInit('phase0-rng');
  const first=Array.from({length:20},()=>rng.R());
  rng.seedInit('phase0-rng');
  assert.deepEqual(Array.from({length:20},()=>rng.R()),first);
  assert.ok(first.every(x=>x>=0&&x<1));
});

test('different seeds produce different sequences',()=>{
  rng.seedInit('phase0-rng-a');const a=Array.from({length:5},()=>rng.R());
  rng.seedInit('phase0-rng-b');const b=Array.from({length:5},()=>rng.R());
  assert.notDeepEqual(a,b);
});
