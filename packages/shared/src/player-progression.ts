import type { Species } from './species';
export const PLAYER_MAX_LEVEL = 50;
/** XP required for the next level: ~17 starting catches, then a long-term progression. */
export const nextLevelXp = (level: number) => Math.round(400 + 120 * Math.pow(level,1.3));
export function playerProgress(xp = 0) {
  let remaining=Math.max(0,Math.floor(xp)),level=1;
  while(level<PLAYER_MAX_LEVEL && remaining>=nextLevelXp(level)){remaining-=nextLevelXp(level);level++;}
  return {level,current:level===PLAYER_MAX_LEVEL?0:remaining,next:level===PLAYER_MAX_LEVEL?0:nextLevelXp(level)};
}
export function playerBonuses(level: number) {
  const p=Math.max(0,Math.min(1,(level-1)/(PLAYER_MAX_LEVEL-1)));
  return {variants:1+2*p,rare:1+p,forgive:p/6,luckyCrit:p*.2};
}
export const catchXp = (sp: Species, regionalLevel=1, predator=false) =>
  Math.round((20+12*Math.pow(sp.tier,.65)+sp.rarity*25)*(1+Math.log1p(Math.max(0,regionalLevel-1))*.12)*(predator?1.35:1));
