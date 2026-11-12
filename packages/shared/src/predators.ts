import { SPECIES, type Species } from './species';
import { Rng,hashN } from './rng';
import type { BiomeId } from './world';
export const HARPOON_LAUNCHER_PRICE=1200;
export const HARPOON_AMMO_PRICE=25;
export const HARPOON_MAX_AMMO=99;
/** Only selected existing species: peaceful sharks/cephalopods remain ordinary catches. */
export function isPredatorSpecies(sp: Species): boolean {
  return (sp.shape==='shark'&&sp.aggr>=.6)||(['serpent','squid'].includes(sp.shape)&&sp.aggr>=.65);
}
export function predatorForShadow(sh:{seed:number;sil:string;biome:BiomeId;depth:number}): Species | undefined {
  if(hashN(sh.seed,4931)%5!==0)return;
  const candidates=SPECIES.filter(sp=>isPredatorSpecies(sp)&&sp.sil===sh.sil&&sp.biomes.includes(sh.biome)&&sh.depth>=sp.dmin-.05&&sh.depth<=sp.dmax+.05);
  if(!candidates.length)return;
  return candidates[new Rng(hashN(sh.seed,2717)).int(0,candidates.length-1)];
}
export const predatorKind = (sp: Species) => sp.shape==='shark'?'maraudeur':sp.shape==='squid'?'calmar_furieux':'serpent_de_mer';
export const predatorCombatDamage = (sp: Species) => Math.max(2,Math.min(5,Math.round(sp.tier/7)));
