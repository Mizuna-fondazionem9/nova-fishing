import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSave, applyCatch, opSettleCatch, cargoBulk, gearOf, priceOf, type Specimen } from '../packages/shared/src/index';
const fish=(uid:string,kg=1):Specimen=>({uid,sp:'bar',len:50,kg,size:0,color:0,tough:false,lvl:1,value:1,at:0,biome:'coastal'});
const full=()=>{const s=newSave(20261111,0);s.cargo=Array.from({length:20},(_,i)=>fish('old'+i));return s;};
test('a full hold preserves the verified catch and its bestiary progress until a choice is made',()=>{
 const s=full(),caught=fish('new',16);const result=applyCatch(s,caught,3,100);
 assert.equal(result.stored,false);assert.deepEqual(s.pendingCatch,caught);assert.equal(s.cargo.length,20);assert.equal(s.stats.caught,1);assert.equal(s.bestiary.bar.n,1);
 const before=JSON.stringify(s);
 for(const ids of [[],['old0'],['old0','old0'],['missing']]){
  assert.equal(opSettleCatch(s,'new','keep',ids).ok,false);assert.equal(JSON.stringify(s),before);
 }
 assert.equal(opSettleCatch(s,'new','keep',['old0','old1','old2','old3']).ok,true);
 assert.equal(s.pendingCatch,undefined);assert.ok(s.cargo.some(f=>f.uid==='new'));assert.equal(cargoBulk(s),gearOf(s.up).hold);
 assert.equal(s.stats.caught,1);assert.equal(s.bestiary.bar.n,1);assert.equal(opSettleCatch(s,'new','keep',[]).ok,false);
});
test('releasing the new catch leaves existing cargo and coins untouched',()=>{
 const s=full();applyCatch(s,fish('new',16),0,1);const cargo=JSON.stringify(s.cargo),coins=s.coins;
 assert.equal(opSettleCatch(s,'new','release',['old0']).ok,false);
 assert.equal(opSettleCatch(s,'new','release',[]).ok,true);
 assert.equal(JSON.stringify(s.cargo),cargo);assert.equal(s.coins,coins);assert.equal(s.pendingCatch,undefined);
});
test('a catch larger than the entire hold never causes cargo to be discarded',()=>{
 const s=full();applyCatch(s,fish('giant',900),0,1);const before=JSON.stringify(s);
 assert.equal(opSettleCatch(s,'giant','keep',s.cargo.map(f=>f.uid)).ok,false);assert.equal(JSON.stringify(s),before);
 assert.ok(priceOf(s.pendingCatch!)>0);
});
