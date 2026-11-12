import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerProgress,playerBonuses,nextLevelXp,catchXp,PLAYER_MAX_LEVEL,SPECIES_BY_ID,SPECIES,predatorForShadow,isPredatorSpecies,Rng,rollSpecimen,priceOf,Combat,replayCombat,makeCombatParams,fightStats,gearOf,zeroLevels,newSave,applyCatch,migrateSave } from '../packages/shared/src/index';

test('player levels are slow, capped and bonuses reach useful but bounded maxima',()=>{
 assert.equal(playerProgress(0).level,1);assert.equal(playerProgress(nextLevelXp(1)-1).level,1);assert.equal(playerProgress(nextLevelXp(1)).level,2);
 let total=0;for(let i=1;i<PLAYER_MAX_LEVEL;i++)total+=nextLevelXp(i);
 assert.ok(total>400000);assert.equal(playerProgress(total).level,50);assert.equal(playerProgress(total*10).level,50);
 assert.deepEqual(playerBonuses(1),{variants:1,rare:1,forgive:0,luckyCrit:0});
 assert.deepEqual(playerBonuses(50),{variants:3,rare:2,forgive:1/6,luckyCrit:.2});
 assert.ok(catchXp(SPECIES_BY_ID.leviathan)>catchXp(SPECIES_BY_ID.sardine)*5);
});
test('active catch XP is granted even with a full hold, while old saves migrate only once',()=>{
 const s=newSave(20261111,0),sp=SPECIES_BY_ID.bar;
 s.cargo=Array.from({length:20},(_,i)=>rollSpecimen(new Rng(i+1),SPECIES_BY_ID.sardine,1,'coastal',0,'s'+i));
 const f=rollSpecimen(new Rng(2),sp,5,'coastal',0,'xp');applyCatch(s,f,0,1);
 assert.equal(s.xp,catchXp(sp,5));const copy=migrateSave(JSON.parse(JSON.stringify(s)),20261111,1);assert.equal(copy.xp,s.xp);
});
test('hostile creatures are stable existing species and pay a fixed risk premium, regardless of damage',()=>{
 let found=0;for(let seed=1;seed<200;seed++){
  const sh={seed,sil:'shark',biome:'tropical' as const,depth:.5};
  const p=predatorForShadow(sh);assert.equal(predatorForShadow(sh)?.id,p?.id);
  if(p){found++;assert.ok(SPECIES.includes(p)&&isPredatorSpecies(p));const f=rollSpecimen(new Rng(1),p,3,'tropical',0,'f');assert.ok(priceOf({...f,predator:true})>=priceOf(f)*1.3);}
 }assert.ok(found>10);assert.equal(isPredatorSpecies(SPECIES_BY_ID.requin_baleine),false);
});
test('hostiles damage the hull even with perfect inputs; misses and long fights cost more and replay exactly',()=>{
 const up=zeroLevels();for(const k of ['rodPower','rodRes','line','reel','recovery','precision'] as const)up[k]=50;
 const p={...makeCombatParams(fightStats(SPECIES_BY_ID.requin_tigre,{len:350,lvl:3,tough:false}),gearOf(up).rod,123),hostileDamage:3,hull:1000,stamina:100000,line:100000};
 const good=new Combat(p);assert.equal(good.hullDamage,3);
 for(let i=0;i<8*60;i++)good.step();assert.equal(good.hullDamage,6);
 const bad=new Combat(p);bad.zoneC=bad.pos>.5?.1:.9;bad.tap();assert.equal(bad.hullDamage,6);
 const raw=new Combat(p);raw.tap();const result=replayCombat(p,[0],0);assert.equal(result.hullDamage,raw.hullDamage);
 const long=new Combat(p);for(let i=0;i<40*60;i++)long.step();assert.ok(long.hullDamage>good.hullDamage);
});
test('luck is deterministic, never forgives more than two errors, and converts normal hits into criticals',()=>{
 const base={...makeCombatParams(fightStats(SPECIES_BY_ID.bar,{len:50,lvl:1,tough:false}),gearOf(zeroLevels()).rod,1),line:1e9,stamina:1e9,forgive:1/6,luckyCrit:.2};
 const a=new Combat(base),b=new Combat(base);
 for(let i=0;i<300;i++)for(const c of [a,b]){c.zoneC=c.pos>.5?.1:.9;c.tap();for(let t=0;t<6;t++)c.step();}
 assert.equal(a.forgiven,2);assert.equal(a.forgiven,b.forgiven);assert.equal(a.line,b.line);
 let converted=0;for(let seed=1;seed<=1000;seed++){const c=new Combat({...base,seed});c.pos=.5;c.zoneC=.5+base.zone*.3;c.tap();converted+=c.luckyCrits;}
 assert.ok(converted>140&&converted<260,`${converted}/1000 conversions`);
});
