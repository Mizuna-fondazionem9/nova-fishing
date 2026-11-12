/** Rebuild the guide from real combat simulations. Rare/trophy catches are intentionally excluded. */
import { writeFileSync } from 'node:fs';
import { SPECIES, BIOME_IDS, BIOMES, Rng, rollSpecimen, gearOf, zeroLevels, fightStats, makeCombatParams, simulateBot, BOTS } from '../packages/shared/src/index';
const bands=[{min:1,max:3},{min:4,max:8},{min:9,max:15},{min:16,max:30}];
const rows=[];
for(const band of bands) for(const biome of BIOME_IDS) {
 const pool=SPECIES.filter(s=>s.biomes.includes(biome)&&s.rarity<=1&&s.sil!=='crab'&&!s.ancient);
 const recommended:Record<string,number|null>={};
 for(const skill of ['debutant','moyen'] as const) {
  recommended[skill]=null;
  for(let level=0;level<=50;level++) {
   const up=zeroLevels();for(const k of ['rodPower','rodRes','line','reel','recovery','precision'] as const)up[k]=level;
   let wins=0,total=0;
   for(const sp of pool) for(let i=0;i<20;i++) {
    const rng=new Rng(9100+i*997+sp.id.length*17),spec=rollSpecimen(rng,sp,band.max,biome,0,'guide');
    const result=simulateBot(makeCombatParams(fightStats(sp,spec),gearOf(up).rod,11000+i*61),BOTS[skill],new Rng(7000+i*67));
    wins+=+result.win;total++;
   }
   if(total&&wins/total>=.75) {recommended[skill]=level;break;}
  }
 }
 rows.push({biome,name:BIOMES[biome].name,...band,...recommended});
 console.log(biome,band.max,recommended);
}
writeFileSync('packages/shared/src/rod-guide.json',JSON.stringify({target:.75,samplesPerSpecies:20,bands,rows},null,2)+'\n');
