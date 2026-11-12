import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES_BY_ID, Rng, rollSpecimen, priceOf, bulkOf, encounterTier, fightStats, zeroLevels, gearOf, makeCombatParams, simulateBot, BOTS, upgradeCost, opSell, newSave } from '../packages/shared/src/index';

test('distant catches demand stronger gear and pay more for the same hold space',()=>{
 const sp=SPECIES_BY_ID.poisson_hachette;
 const local=rollSpecimen(new Rng(91),sp,1,'deep',0,'near');
 const remote={...local,lvl:14};
 assert.ok(encounterTier(sp,14,'deep')>encounterTier(sp,1,'deep'));
 assert.ok(fightStats(sp,remote).power>fightStats(sp,local).power*1.5);
 assert.ok(priceOf(remote)/bulkOf(remote.kg)>priceOf(local)/bulkOf(local.kg)*1.5);
 let starter=0,upgraded=0;const rng=new Rng(191),up=zeroLevels();
 for(const k of ['rodPower','rodRes','line','reel','precision','recovery'] as const)up[k]=25;
 for(let i=0;i<100;i++) {
  const params=fightStats(sp,remote),seed=rng.int(1,1e8);
  starter+=+simulateBot(makeCombatParams(params,gearOf(zeroLevels()).rod,seed),BOTS.parfait,new Rng(seed)).win;
  upgraded+=+simulateBot(makeCombatParams(params,gearOf(up).rod,seed),BOTS.expert,new Rng(seed)).win;
 }
 assert.equal(starter,0);assert.ok(upgraded>=70,`upgraded success ${upgraded}%`);
});
test('large catches earn a minimum per unit of hold, with distinct rarity and variant premiums',()=>{
 for(const [id,biome] of [['cabillaud','temperate'],['thon_jaune','tropical'],['requin_fantome','mystic']] as const) {
  const sp=SPECIES_BY_ID[id];for(let i=0;i<200;i++){
   const f=rollSpecimen(new Rng(100+i),sp,8,biome,0,''+i);
   const normal={...f,size:0,color:0,tough:false,trait:undefined};
   const min=12*Math.pow(encounterTier(sp,8,biome),1.25)*.79;
   assert.ok(priceOf(normal)/bulkOf(f.kg)>=min,`${id} undervalued`);
   assert.ok(priceOf({...normal,color:3})>=priceOf(normal)*2.9);
  }
 }
});
test('existing cargo receives the new server price exactly once; next upgrades remain bounded and increasing',()=>{
 const save=newSave(20261111,0),f=rollSpecimen(new Rng(1),SPECIES_BY_ID.cabillaud,5,'temperate',0,'old');
 f.value=1;save.cargo=[f];const before=save.coins,result=opSell(save,'all','cargo');
 assert.ok(result.ok);if(result.ok)assert.equal(result.gain,priceOf(f));
 assert.equal(save.coins,before+priceOf(f));assert.equal(opSell(save,'all','cargo').ok,false);
 assert.equal(upgradeCost('rodPower',0),60);
 for(const level of [5,15,40,100,199]) {
  assert.ok(upgradeCost('rodPower',level)>upgradeCost('rodPower',level-1));
  assert.ok(upgradeCost('rodPower',level)<60*Math.pow(level+1,1.85)*(1+level/40));
 }
});
