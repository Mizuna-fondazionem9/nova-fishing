import { VESSELS, PAINTS, gearOf } from './gear';
import { hashN, Rng } from './rng';
import { getPort, tileAt, CELL } from './world';
import { SPECIES } from './species';
import { rollSpecimen, priceOf, bulkOf } from './fish';
import { dayKey, applyCatch, holdFree, cargoBulk, type Save, type Op } from './save';
export const CAT_PRICE = 1500;
export const CAT_INTERVAL = 15*60_000;
export const CAT_MAX = 6;
export const catReady = (s: Save, now: number) => s.cat ? Math.min(CAT_MAX, Math.max(0, Math.floor((now-s.cat.at)/CAT_INTERVAL))) : 0;

/** Opérations exécutées uniquement dans la transaction du port côté serveur. */
export function maritimeOp(s: Save, action: string, value: string, port: string, now: number, seed: number): Op<{ message: string }> {
  const fail = (error: string) => ({ok:false as const,error});
  if (action==='vessel') {
    const model = VESSELS.find(v=>v.id===value);
    if (!model) return fail('Bateau inconnu.');
    const owned = s.vessels ?? ['skiff'];
    if (cargoBulk(s)>gearOf(s.up,model.id,s.kit).hold) return fail('Vendez une partie de la cale avant de choisir ce bateau.');
    if (!owned.includes(value) && s.coins<model.price) return fail('Pas assez de pièces.');
    const ratio=s.hull/gearOf(s.up,s.vessel,s.kit).hullMax;
    if (!owned.includes(value)) { s.coins-=model.price; owned.push(value); }
    s.vessels=owned; s.vessel=value;
    s.hull=Math.min(gearOf(s.up,value,s.kit).hullMax,Math.floor(ratio*gearOf(s.up,value,s.kit).hullMax));
    return {ok:true,message:`${model.name} équipé.`};
  }
  if (action==='paint') {
    const paint=Number(value);
    if (!Number.isInteger(paint) || paint<0 || paint>=PAINTS.length) return fail('Couleur inconnue.');
    const owned=s.paints ?? [0];
    if (!owned.includes(paint)) {
      if (s.coins<350) return fail('Cette peinture coûte 350 pièces.');
      s.coins-=350; owned.push(paint);
    }
    s.paints=owned; s.paint=paint;
    return {ok:true,message:'Peinture appliquée.'};
  }
  if (action==='cat-buy') {
    if (s.cat) return fail('Vous avez déjà un chat pêcheur.');
    if (s.coins<CAT_PRICE) return fail('Le chat pêcheur coûte 1 500 pièces.');
    s.coins-=CAT_PRICE; s.cat={port,at:now,sequence:0};
    return {ok:true,message:'Votre chat pêche désormais sur ce quai : une petite prise toutes les 15 minutes, six en réserve au maximum.'};
  }
  if (!s.cat) return fail('Adoptez d’abord un chat pêcheur.');
  if (action==='cat-move') {
    if (s.cat.port===port) return fail('Votre chat est déjà ici.');
    if (catReady(s,now)>0) return fail('Récupérez ses prises au port précédent avant de le déplacer.');
    s.cat.port=port; s.cat.at=now;
    return {ok:true,message:'Le chat rejoint ce quai. Sa prochaine prise sera prête dans 15 minutes.'};
  }
  if (action==='cat-claim') {
    if (s.cat.port!==port) return fail('Rejoignez le port où travaille votre chat pour récupérer ses prises.');
    const count=catReady(s,now);
    if (!count) return fail('Aucune prise prête pour le moment.');
    const pool=SPECIES.filter(sp=>sp.sil==='small' && sp.rarity<=1 && sp.tier<=2.6 && sp.biomes.includes('coastal') && !sp.ancient && sp.shape!=='shell');
    let got=0;
    for (let i=0;i<count;i++) {
      const rng=new Rng(hashN(seed,s.cat.sequence,s.cat.at,99));
      const sp=pool[rng.int(0,pool.length-1)];
      const spec=rollSpecimen(rng,sp,1,'coastal',now,`cat-${s.cat.at}-${s.cat.sequence}`);
      spec.kg=Math.min(0.5,spec.kg); spec.len=Math.min(spec.len,sp.lmax*0.6); spec.size=0; spec.color=0; spec.tough=false; delete spec.trait; spec.value=priceOf(spec);
      if (bulkOf(spec.kg)>holdFree(s)) break;
      applyCatch(s,spec,0,now); s.cat.sequence++; got++;
    }
    if (!got) return fail('La cale est pleine : les prises restent au quai.');
    // Une réserve plafonnée ne peut pas être vidée plusieurs fois à la même date.
    s.cat.at=now-(count-got)*CAT_INTERVAL;
    return {ok:true,message:`${got} petites prises du chat rangées dans la cale.`};
  }
  return fail('Action inconnue.');
}

export interface Treasure { id:string; x:number; y:number; coins:number; }
export function treasureAt(seed:number,cx:number,cy:number,now:number): Treasure | null {
  const day=dayKey(now);
  const p=getPort(seed,cx,cy);
  const rng=new Rng(hashN(seed,cx,cy,Number(day.replaceAll('-','')),884));
  for(let i=0;i<12;i++) {
    const x=p.x+rng.range(-45,45),y=p.y+rng.range(-45,45);
    if (!tileAt(seed,Math.floor(x),Math.floor(y)).land && Math.hypot(x-p.x,y-p.y)>12)
      return {id:`${day}:${cx}:${cy}`,x,y,coins:rng.int(200,300)};
  }
  return null;
}
export function nearbyTreasures(seed:number,x:number,y:number,now:number): Treasure[] {
  const out:Treasure[]=[];
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
    const t=treasureAt(seed,Math.floor(x/CELL)+dx,Math.floor(y/CELL)+dy,now);
    if(t) out.push(t);
  }
  return out;
}
