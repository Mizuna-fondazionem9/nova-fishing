import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LEVEL, effectiveUpgradeLevel, gearOf, zeroLevels, newSave, migrateSave, opUpgrade, UPGRADE_BY_KEY } from '../packages/shared/src/index';
import guide from '../packages/shared/src/rod-guide.json';

test('50 levels reach previous endgame strength, early levels remain useful and buying at cap changes nothing',()=>{
 assert.equal(MAX_LEVEL,50);assert.equal(effectiveUpgradeLevel(50),200);
 for(let n=0;n<50;n++)assert.ok(effectiveUpgradeLevel(n+1)>effectiveUpgradeLevel(n));
 const up=zeroLevels();up.rodPower=50;
 assert.equal(gearOf(up).rod.power,10*(1+.18*Math.pow(200,.7)));
 const save=newSave(20261111,0);save.up.rodPower=50;save.coins=1e9;
 assert.equal(opUpgrade(save,'rodPower').ok,false);assert.equal(save.coins,1e9);
 assert.equal(UPGRADE_BY_KEY.aquarium.max,30);
});
test('legacy upgrades retain their strength, cargo and coins; conversion is idempotent',()=>{
 for(const n of [0,8,50,51,100,150,200]){
  const old=newSave(20261111,0);old.v=4;old.coins=12345;old.up.rodPower=n;old.up.rodRes=n;old.up.aquarium=17;
  const save=migrateSave(old,20261111,100);
  assert.ok(save.up.rodPower<=50);assert.ok(gearOf(save.up).rod.power>=10*(1+.18*Math.pow(n,.7)));
  assert.equal(save.coins,12345);assert.equal(save.up.aquarium,17);
  assert.deepEqual(migrateSave(save,20261111,100).up,save.up);
 }
});
test('guide covers all biomes and regional bands, using bounded upgrade levels and conservative beginner advice',()=>{
 assert.equal(guide.rows.length,48);
 for(const row of guide.rows){
  for(const n of [row.debutant,row.moyen])assert.ok(n===null||(Number.isInteger(n)&&n>=0&&n<=50));
  if(row.debutant!==null&&row.moyen!==null)assert.ok(row.debutant>=row.moyen);
 }
 const coast=guide.rows.find(r=>r.biome==='coastal'&&r.min===1)!;
 const abyss=guide.rows.find(r=>r.biome==='abyss'&&r.min===1)!;
 assert.ok(coast.debutant!==null&&coast.debutant<=5);assert.ok(abyss.debutant===null||abyss.debutant>coast.debutant);
});
