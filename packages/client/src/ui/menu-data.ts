import { priceOf, bulkOf, SPECIES, BIOME_IDS, type Save, type Specimen } from '../../../shared/src/index';

/** View models only. Preserve specimen identities for the existing server actions. */
export function groupCargo(cargo: Specimen[]) {
  const groups = new Map<string, {sp:string;fish:Specimen[];bulk:number;value:number}>();
  for (const f of cargo) {
    let group=groups.get(f.sp);
    if(!group){group={sp:f.sp,fish:[],bulk:0,value:0};groups.set(f.sp,group);}
    group.fish.push(f);group.bulk+=bulkOf(f.kg);group.value+=priceOf(f);
  }
  return [...groups.values()];
}

/** Display progress toward existing achievements; unlocking remains server-owned. */
export function trophyProgress(s:Save,id:string):{value:number;max:number}|null {
  const st=s.stats;
  const metrics:Record<string,[number,number]>={
    premiere_prise:[st.caught,1],pecheur_10:[st.caught,10],pecheur_100:[st.caught,100],pecheur_1000:[st.caught,1000],
    explorateur_3:[st.biomes.length,3],explorateur_8:[st.biomes.length,BIOME_IDS.length],
    poids_50:[st.maxKg,50],poids_500:[st.maxKg,500],poids_5000:[st.maxKg,5000],
    legende:[st.legend,1],mythe:[st.myth,1],david:[st.underdog,2],goliath:[st.underdog,3],
    distance_5k:[st.dist,5000],distance_50k:[st.dist,50000],distance_500k:[st.dist,500000],
    bestiaire_10:[Object.keys(s.bestiary).length,10],bestiaire_30:[Object.keys(s.bestiary).length,30],bestiaire_complet:[Object.keys(s.bestiary).length,SPECIES.length],
    fortune_10k:[st.earned,10000],fortune_1m:[st.earned,1000000],naufrage:[st.wrecks,1],
  };
  const m=metrics[id];return m?{value:m[0],max:m[1]}:null;
}
