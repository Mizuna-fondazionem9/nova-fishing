/** Rebuild recommendations from successful, reasonably short ordinary fights. */
import { writeFileSync } from 'node:fs';
import { BIOME_IDS, BIOMES, FISHING_SECTORS, MAX_LEVEL } from '../packages/shared/src/index';
import { evaluateRodLevel, isComfortable, GUIDE_TARGET, GUIDE_SAMPLES, GUIDE_MAX_SECONDS, GUIDE_MAX_HITS } from './lib/rod-guide';
const bands=FISHING_SECTORS.map(({min,max})=>({min,max}));
const rows=[];
for(const band of bands) for(const biome of BIOME_IDS) {
 const recommended:Record<string,number|null>={};
 for(const skill of ['debutant','moyen'] as const) {
  recommended[skill]=null;
  for(let level=0;level<=MAX_LEVEL;level++) {
   if(isComfortable(evaluateRodLevel(biome,band.max,level,skill))) {recommended[skill]=level;break;}
  }
 }
 rows.push({biome,name:BIOMES[biome].name,...band,...recommended});
 console.log(biome,band.max,recommended);
}
writeFileSync('packages/shared/src/rod-guide.json',JSON.stringify({target:GUIDE_TARGET,
 samplesPerSpecies:GUIDE_SAMPLES,maxSeconds:GUIDE_MAX_SECONDS,maxSuccessfulHits:GUIDE_MAX_HITS,
 scope:'ordinary-per-species',bands,rows},null,2)+'\n');
