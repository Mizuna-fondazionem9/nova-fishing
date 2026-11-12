// Service de jeu : c'est ICI que se décident captures, gains, achats et dégâts.
// Le client affiche et anime ; il ne fixe jamais lui-même une récompense.
import { randomInt, randomUUID } from 'node:crypto';
import {
  Rng, tileAt, isLand, startPort, portInRange, spawnShadows, speciesForShadow, slotOf, rollSpecimen, fightStats, makeBiteScript,
  judgeHook, makeCombatParams, replayCombat, gearOf, applyCatch, noteBiome, evalTrophies, bumpDaily, dailyChallenges,
  dayKey, opSettleCatch, opSell, opUpgrade, opBuyNet, opRepair, opKeep, opRelease, applyDamage, holdFree, bulkOf, regionBonus, eligibleNetSpecies,
  SPECIES, SPECIES_BY_ID, HOSTILES, HOSTILE_BY_ID, BIOMES, NETS, NET_COOLDOWN_MS, NET_DISTANCE, RARITY_WEIGHT,
  adventureOf, adventurePortOp, nearbyLandmarks, landmarkById, discoverPoint, pointOp, chartOp, noteAdventureCatch,
  maritimeOp, nearbyTreasures, predatorForShadow, predatorKind, predatorCombatDamage, playerProgress, playerBonuses, HARPOON_LAUNCHER_PRICE, HARPOON_AMMO_PRICE, HARPOON_MAX_AMMO, priceOf,
  MAX_COMBAT_TICKS, TICK_HZ, CHUNK, UPGRADE_BY_KEY,
  type CombatTap, type Save, type Specimen, type Species, type BiteScript, type CombatParams, type Shadow, type UpgradeKey, type Op,
  type MeResponse, type Mutation, type SyncResponse, type CastResponse, type HookResponse, type ResolveResponse, type HitResponse, type Encounter,
} from '../../shared/src/index';
import { HttpError } from './http';
import type { Store, Tx } from './store';

export const CAST_RANGE = 8;
const CAST_SLACK = 3.5; // l'ombre se promène autour de son point d'attache

interface FishingSession {
  sid: string;
  key: string;
  sp: Species;
  spec: Specimen;
  script: BiteScript;
  createdAt: number;
  state: 'wait' | 'fight';
  hookAt: number;
  combat: CombatParams | null;
  harpoon?: boolean;
  damagePaid?: number;
}

interface ActiveEncounter {
  shadowKey?: string;
  speciesId?: string;
  x?: number; y?: number;
  id: string;
  kind: string;
  expires: number;
  hits: number;
  lastHit: number;
}

export interface GameOptions {
  seed: number;
  now?: () => number;
  /** Source d'aléa du serveur (remplaçable dans les tests). */
  randomSeed?: () => number;
}

export class Game {
  readonly seed: number;
  private now: () => number;
  private randomSeed: () => number;
  private fishing = new Map<string, FishingSession>();
  private encounters = new Map<string, ActiveEncounter>();
  private lastEncounter = new Map<string, number>();
  private lastCast = new Map<string, number>();
  /** Force une rencontre hostile au prochain point de synchronisation (tests uniquement). */
  forceEncounter = false;

  constructor(private store: Store, opts: GameOptions) {
    this.seed = opts.seed;
    this.now = opts.now ?? Date.now;
    this.randomSeed = opts.randomSeed ?? (() => randomInt(1, 2 ** 31 - 1));
  }

  /** Ménage périodique des sessions de pêche et rencontres abandonnées (pas de croissance mémoire illimitée). */
  sweep(): void {
    const now = this.now();
    for (const [k, s] of this.fishing) if (now - s.createdAt > 6 * 60_000) this.fishing.delete(k);
    for (const [k, e] of this.encounters) if (now > e.expires) this.encounters.delete(k);
    for (const [k, t] of this.lastEncounter) if (now - t > 600_000) this.lastEncounter.delete(k);
    for (const [k, t] of this.lastCast) if (now - t > 60_000) this.lastCast.delete(k);
  }

  private daily(save: Save): ReturnType<typeof dailyChallenges> {
    return dailyChallenges(dayKey(this.now()), Object.keys(save.bestiary).length);
  }

  /** Trophées + événements de récompense (module NovaBot), dans la transaction en cours. */
  private finish(save: Save, tx: Tx, notes: string[]): void {
    for (const t of evalTrophies(save, this.now())) {
      notes.push(`Trophée débloqué : ${t.name}`);
      tx.reward(`trophy:${t.id}`, 'trophy', { trophy: t.id, name: t.name });
    }
  }

  private mutation(save: Save, notes: string[]): Mutation {
    return { save, notes, daily: this.daily(save) };
  }

  private consume(save: Save, key: string): void {
    const slot = slotOf(this.now());
    save.consumed = save.consumed.filter((k) => Number(k.split(',')[2]) >= slot - 1);
    if (!save.consumed.includes(key)) save.consumed.push(key);
  }

  async me(playerId: string): Promise<MeResponse> {
    const p = await this.store.getPlayer(playerId);
    if (!p) throw new HttpError(401, 'Joueur introuvable.');
    // À la (re)connexion, l'horloge de déplacement repart de zéro : pas de « crédit de distance » accumulé hors ligne.
    const save = await this.store.withSave(playerId, (s) => {
      // Une nouvelle grande île peut recouvrir une ancienne position sauvegardée.
      // Replacer sur l'eau proche sans pénalité ni remise à zéro de progression.
      if(isLand(this.seed,Math.floor(s.x),Math.floor(s.y))) {
        let found=false;
        for(let radius=1;radius<=120&&!found;radius++) for(let i=0;i<16&&!found;i++) {
          const x=Math.floor(s.x+Math.cos(i*Math.PI/8)*radius)+0.5;
          const y=Math.floor(s.y+Math.sin(i*Math.PI/8)*radius)+0.5;
          if(!isLand(this.seed,Math.floor(x),Math.floor(y))) {s.x=x;s.y=y;found=true;}
        }
        if(!found) {const p=startPort(this.seed);s.x=p.x+0.5;s.y=p.y+0.5;}
      }
      s.syncAt = this.now();
      return s;
    });
    this.fishing.delete(playerId);
    return { user: { id: p.id, name: p.name, avatar: p.avatar }, save, seed: this.seed, now: this.now(), daily: this.daily(save) };
  }

  /** Valide un déplacement annoncé par le client. Renvoie false s'il est impossible (trop loin, sur terre). */
  private move(save: Save, x: number, y: number, notes: string[]): boolean {
    const now = this.now();
    const dt = Math.max(0, (now - save.syncAt) / 1000);
    const dist = Math.hypot(x - save.x, y - save.y);
    const g = gearOf(save.up,save.vessel,save.kit);
    const allowed = g.speed * Math.min(dt, 120) * 1.25 + 2;
    save.syncAt = now;
    if (dist > allowed || isLand(this.seed, Math.floor(x), Math.floor(y))) return false;
    save.x = x;
    save.y = y;
    save.stats.dist = Math.round((save.stats.dist + dist) * 100) / 100;
    const tile = tileAt(this.seed, Math.floor(x), Math.floor(y));
    if (!save.stats.biomes.includes(tile.biome)) {
      noteBiome(save, tile.biome);
      notes.push(`Nouveau biome découvert : ${BIOMES[tile.biome].name}`);
    }
    const port = portInRange(this.seed, x, y);
    if (port) {
      save.lastPort = port.id;
      if (!save.stats.ports.includes(port.id)) {
        if (save.stats.ports.length < 500) save.stats.ports.push(port.id);
        notes.push(`Nouveau port : ${port.name}`);
      }
    }
    if (save.net > 0 && dist > 0.2) save.netProgress += dist * g.netEff * NETS[save.net]!.yield;
    return true;
  }

  /** Relevé de filet : seulement de petits poissons communs ou peu communs, rendement et cadence bornés. */
  private haulNet(save: Save, notes: string[]): Specimen[] {
    const now = this.now();
    const net = NETS[save.net];
    if (!net || save.netProgress < NET_DISTANCE || now - save.netAt < NET_COOLDOWN_MS) return [];
    save.netProgress = 0;
    save.netAt = now;
    const tile = tileAt(this.seed, Math.floor(save.x), Math.floor(save.y));
    const pool = eligibleNetSpecies(save.net, save.up, tile.biome, tile.level);
    if (!pool.length) return [];
    const rng = new Rng(this.randomSeed());
    const population = spawnShadows(this.seed, Math.floor(save.x / CHUNK), Math.floor(save.y / CHUNK), slotOf(now)).length;
    const count = 1 + (rng.chance(0.15 * population) ? 1 : 0) + (rng.chance(0.1 * (net.yield - 1)) ? 1 : 0);
    const got: Specimen[] = [];
    for (let i = 0; i < count; i++) {
      const sp = rng.weighted(pool, pool.map((s) => RARITY_WEIGHT[s.rarity]));
      const spec = rollSpecimen(rng, sp, tile.level, tile.biome, now, randomUUID());
      if (bulkOf(spec.kg) > holdFree(save)) break;
      save.cargo.push(spec);
      const e = (save.bestiary[sp.id] ??= { n: 0, maxLen: 0, maxKg: 0, first: now, biomes: [] });
      e.n++;
      e.maxLen = Math.max(e.maxLen, spec.len);
      e.maxKg = Math.max(e.maxKg, spec.kg);
      if (!e.biomes.includes(tile.biome)) e.biomes.push(tile.biome);
      save.stats.netted++;
      got.push(spec);
    }
    if (got.length) notes.push(`Filet relevé : ${got.map((s) => SPECIES_BY_ID[s.sp].name).join(', ')}`);
    return got;
  }

  private rollEncounter(playerId: string, save: Save): Encounter | undefined {
    const now = this.now();
    const active=this.encounters.get(playerId);
    if(active && now<active.expires && active.x!==undefined && Math.hypot(active.x-save.x,active.y!-save.y)<=20 && !save.consumed.includes(active.shadowKey??''))return {id:active.id,kind:active.kind,shadowKey:active.shadowKey,speciesId:active.speciesId,x:active.x,y:active.y,angle:0,dist:8};
    if(active)this.encounters.delete(playerId);
    if (this.fishing.has(playerId)) return;
    if (now - (this.lastEncounter.get(playerId) ?? 0) < 8_000 && !this.forceEncounter) return;
    if (portInRange(this.seed, save.x, save.y)) return;
    const tile = tileAt(this.seed, Math.floor(save.x), Math.floor(save.y));
    const cx=Math.floor(save.x/CHUNK),cy=Math.floor(save.y/CHUNK);
    const targets: Shadow[]=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)targets.push(...spawnShadows(this.seed,cx+dx,cy+dy,slotOf(now)));
    const target=targets.filter(sh=>!save.consumed.includes(sh.key)&&predatorForShadow(sh)&&Math.hypot(sh.x-save.x,sh.y-save.y)<=11).sort((a,b)=>Math.hypot(a.x-save.x,a.y-save.y)-Math.hypot(b.x-save.x,b.y-save.y))[0];
    // The legacy forced test encounter is retained only through the explicit test hook.
    if(!target && !this.forceEncounter)return;
    const sp=target?predatorForShadow(target)!:undefined;
    const kind=sp?predatorKind(sp):HOSTILES[0].id;
    this.forceEncounter=false;
    const x=target?.x??save.x+8,y=target?.y??save.y;
    const e:ActiveEncounter={id:randomUUID(),kind,shadowKey:target?.key,speciesId:sp?.id,x,y,expires:now+35000,hits:0,lastHit:0};
    this.encounters.set(playerId,e);this.lastEncounter.set(playerId,now);
    return {id:e.id,kind,shadowKey:e.shadowKey,speciesId:e.speciesId,x,y,angle:Math.atan2(y-save.y,x-save.x),dist:Math.hypot(x-save.x,y-save.y)};
  }

  async sync(playerId: string, x: number, y: number): Promise<SyncResponse> {
    let encounter: Encounter | undefined;
    return this.store.withSave(playerId, (save, tx) => {
      const notes: string[] = [];
      let corrected = false;
      let netted: Specimen[] = [];
      if (!this.fishing.has(playerId) && !save.pendingCatch) {
        corrected = !this.move(save, x, y, notes);
        if (!corrected) {
          netted = this.haulNet(save, notes);
          encounter = this.rollEncounter(playerId, save);
          for(const p of nearbyLandmarks(this.seed,save.x,save.y))if(Math.hypot(p.x-save.x,p.y-save.y)<20)notes.push(...discoverPoint(save,p,this.now()));
        }
      }
      if (save.pendingCatch) corrected = true;
      this.finish(save, tx, notes);
      return { ...this.mutation(save, notes), corrected, encounter, netted };
    });
  }

  // ---------- Pêche ----------

  async cast(playerId: string, key: string, x: number, y: number, tool = 'rod'): Promise<CastResponse> {
    const now = this.now();
    const m = /^(-?\d{1,7}),(-?\d{1,7}),(\d{1,9}),(\d)$/.exec(key);
    if (!m) throw new HttpError(400, 'Cible invalide.');
    const [cx, cy, slot, idx] = m.slice(1).map(Number);
    const cur = slotOf(now);
    if (slot !== cur && slot !== cur - 1) throw new HttpError(409, 'Cette ombre a disparu.');
    const old = this.fishing.get(playerId);
    if (old && now - old.createdAt < 45_000) throw new HttpError(409, 'Une ligne est déjà à l’eau.');
    if (now - (this.lastCast.get(playerId) ?? 0) < 700) throw new HttpError(429, 'Doucement, moussaillon.');
    this.lastCast.set(playerId, now);
    this.fishing.delete(playerId);

    const shadow: Shadow | undefined = spawnShadows(this.seed, cx, cy, slot).find((s) => s.idx === idx);
    if (!shadow) throw new HttpError(409, 'Cette ombre n’existe pas.');
    const session = await this.store.withSave(playerId, (save) => {
      if (save.pendingCatch) throw new HttpError(409, 'Choisis d’abord quoi faire de la prise en attente.');
      if (!this.move(save, x, y, [])) throw new HttpError(409, 'Position du bateau refusée.');
      if (save.consumed.includes(key)) throw new HttpError(409, 'Ce poisson est déjà parti.');
      const predator=predatorForShadow(shadow);
      if(predator && tool!=='harpoon') throw new HttpError(409,'Prédateur dangereux : utilise un harpon à corde.');
      if(!predator && tool==='harpoon') throw new HttpError(400,'Le harpon est réservé aux prédateurs dangereux.');
      if(predator && (!save.harpoonOwned || save.harpoons<1)) throw new HttpError(409,'Achète un lance-harpon et des recharges au port.');
      if (Math.hypot(shadow.x - save.x, shadow.y - save.y) > (predator ? 22 : CAST_RANGE + CAST_SLACK)) throw new HttpError(409, 'Trop loin pour lancer.');
      const rng = new Rng(this.randomSeed());
      const a=adventureOf(save);
      const bait=a.bait && (a.baits[a.bait]??0)>0 ? a.bait : 'none';
      const bonuses=playerBonuses(playerProgress(save.xp).level);
      const pick = speciesForShadow(rng, this.seed, shadow,bait,bonuses.rare);
      if (!pick) throw new HttpError(409, 'Rien ne mord ici.');
      const lagoon=nearbyLandmarks(this.seed,shadow.x,shadow.y).some(p=>p.kind==='lagoon'&&Math.hypot(p.x-shadow.x,p.y-shadow.y)<18);
      const spec = rollSpecimen(rng, pick.sp, pick.tile.level, pick.tile.biome, now, randomUUID(),lagoon?2:1,bonuses.variants);
      if(predator){spec.predator=true;spec.value=priceOf(spec);save.harpoons--;this.encounters.delete(playerId);}
      if(bait!=='none'&&!predator)a.baits[bait]--;
      let script = makeBiteScript(rng, pick.sp, gearOf(save.up,save.vessel,save.kit).rod.reel);
      if(predator){const at=rng.int(1400,2300);script={events:[{t:at,kind:'bite'}],biteAt:at,window:450,end:at+950};}
      if(bait==='gentle'&&!predator) {
        script.window=Math.round(script.window*1.15);
        // Un départ sans morsure est parfois transformé en vraie touche.
        if(script.biteAt===null && rng.chance(0.65)) {
          script.events=script.events.filter(e=>e.kind!=='leave');script.biteAt=script.end;script.window=950;script.events.push({t:script.biteAt,kind:'bite'});script.end+=2150;
        }
      }
      const s: FishingSession = { sid: randomUUID(), key, harpoon:!!predator, sp: pick.sp, spec, script, createdAt: this.now(), state: 'wait', hookAt: 0, combat: null };
      return s;
    });
    this.fishing.set(playerId, session);
    return { sid: session.sid, script: session.script, harpoon:session.harpoon, save: (await this.store.getPlayer(playerId))!.save };
  }

  private session(playerId: string, sid: string, state: 'wait' | 'fight'): FishingSession {
    const s = this.fishing.get(playerId);
    if (!s || s.sid !== sid) throw new HttpError(409, 'Session de pêche inconnue ou expirée.');
    if (s.state !== state) throw new HttpError(409, 'Étape de pêche inattendue.');
    return s;
  }

  async hook(playerId: string, sid: string, elapsed: number): Promise<HookResponse> {
    const s = this.session(playerId, sid, 'wait');
    const now = this.now();
    const server = now - s.createdAt;
    // Le chronomètre du client démarre après réception de la réponse : il ne peut pas être en avance sur le serveur,
    // ni en retard de plus que la latence + l'animation du lancer.
    const e = Math.min(server + 300, Math.max(server - 4000, elapsed));
    const verdict = judgeHook(s.script, e);
    if (verdict === 'ok') {
      s.state = 'fight';
      let hookWrecked=false;
      const save = await this.store.withSave(playerId,sv=>{if(s.harpoon){const hit=predatorCombatDamage(s.sp);s.damagePaid=hit;hookWrecked=applyDamage(sv,hit,this.seed).wrecked;}return sv;});
      if(hookWrecked){this.fishing.delete(playerId);return {verdict:'none',save,wrecked:true};}
      s.hookAt = now;
      s.combat = makeCombatParams(fightStats(s.sp, s.spec), gearOf(save.up,save.vessel,save.kit).rod, this.randomSeed());
      const bonuses=playerBonuses(playerProgress(save.xp).level);
      s.combat.forgive=bonuses.forgive;s.combat.luckyCrit=bonuses.luckyCrit;
      if(s.harpoon){s.combat.hostileDamage=predatorCombatDamage(s.sp);s.combat.hull=save.hull+(s.damagePaid??0);}
      if (s.sp.sil === 'crab') { s.combat.mode = 'crab'; s.combat.crabPrecision = gearOf(save.up,save.vessel,save.kit).rod.precision; s.combat.aggr = 0; }
      return { verdict, combat: s.combat, save };
    }
    this.fishing.delete(playerId);
    const save = await this.store.withSave(playerId, (sv) => {
      if (verdict !== 'none' && !s.harpoon) {
        this.consume(sv, s.key);
        sv.stats.escaped++;
      }
      return sv;
    });
    return { verdict, save };
  }

  /** Abandon d'une attente (le joueur remonte sa ligne, ou a laissé passer la morsure). */
  async cancel(playerId: string, sid: string): Promise<Mutation> {
    const s = this.fishing.get(playerId);
    if (!s || s.sid !== sid) throw new HttpError(409, 'Session de pêche inconnue ou expirée.');
    this.fishing.delete(playerId);
    const missed = s.state === 'fight' || (s.script.biteAt !== null && this.now() - s.createdAt > s.script.biteAt + s.script.window);
    const save = await this.store.withSave(playerId, (sv) => {
      if (missed) {
        this.consume(sv, s.key);
        sv.stats.escaped++;
      }
      return sv;
    });
    return this.mutation(save, []);
  }

  async resolve(playerId: string, sid: string, taps: unknown, end: unknown): Promise<ResolveResponse> {
    const s = this.session(playerId, sid, 'fight');
    this.fishing.delete(playerId); // usage unique : une session ne peut être résolue qu'une fois
    const now = this.now();
    if (!Array.isArray(taps) || taps.length > 4000 || !Number.isInteger(end) || (end as number) < 0 || (end as number) > MAX_COMBAT_TICKS)
      throw new HttpError(400, 'Résultat de combat invalide.');
    let prev = 0;
    for (const t of taps) {
      const crab = s.combat?.mode === 'crab';
      const tick = crab && t && typeof t === 'object' ? t.tick : t;
      if (!Number.isInteger(tick) || tick < prev || tick > (end as number) ||
          (crab && (!t || typeof t !== 'object' || !Number.isFinite(t.x) || !Number.isFinite(t.y) || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1)) ||
          (!crab && typeof t !== 'number')) throw new HttpError(400, 'Résultat de combat invalide.');
      prev = tick;
    }
    const realMs = now - s.hookAt;
    const simMs = ((end as number) / TICK_HZ) * 1000;
    // Contrôles de plausibilité : un combat ne peut pas avoir duré moins longtemps « en vrai » que dans la simulation,
    // ni être rendu des minutes après sa fin.
    const tooFast = simMs > realMs + 750;
    const tooLate = realMs > simMs + 45_000;
    const replay = replayCombat(s.combat!, taps as CombatTap[], end as number);
    const win = replay.state === 'win' && !tooFast && !tooLate;

    return this.store.withSave(playerId, (save, tx) => {
      const notes: string[] = [];
      if (save.pendingCatch) throw new HttpError(409, 'Une prise attend déjà ton choix.');
      this.consume(save, s.key);
      const hullHit=s.harpoon?Math.max(0,replay.hullDamage-(s.damagePaid??0)):0;
      const wrecked=hullHit>0?applyDamage(save,hullHit,this.seed).wrecked:false;
      if(hullHit>0)notes.push(`Le prédateur inflige ${hullHit} dégâts supplémentaires à la coque.`);
      if (!win || wrecked) {
        save.stats.escaped++;
        if (tooFast) notes.push('Combat refusé : durée incohérente.');
        return { ...this.mutation(save, notes), outcome: 'lose' as const };
      }
      const oldLevel=playerProgress(save.xp).level;
      const r = applyCatch(save, s.spec, replay.crits, now);
      const newLevel=playerProgress(save.xp).level;
      if(newLevel>oldLevel)notes.push(`Niveau ${newLevel} atteint ! Tes bonus de chance augmentent.`);
      noteBiome(save, s.spec.biome);
      noteAdventureCatch(save,s.spec,now);
      for (const c of bumpDaily(save, { kind: 'catch', sp: s.sp, kg: s.spec.kg, biome: s.spec.biome }, now))
        notes.push(`Défi réussi : ${c.label} (+${c.reward} pièces)`);
      if (s.sp.rarity >= 4) tx.reward(`capture:${s.sp.id}`, 'capture', { species: s.sp.id, name: s.sp.name, kg: s.spec.kg, rarity: s.sp.rarity });
      if (!r.stored) notes.push('Cale pleine : ta prise est en attente. Choisis les poissons à relâcher pour la garder.');
      this.finish(save, tx, notes);
      return { ...this.mutation(save, notes), outcome: 'win' as const, specimen: s.spec, stored: r.stored, record: r.record, first: r.first };
    });
  }

  async settleCatch(playerId: string, uid: string, action: unknown, releaseUids: unknown): Promise<Mutation> {
    if ((action !== 'keep' && action !== 'release') || !Array.isArray(releaseUids) || releaseUids.length > 1000 ||
        releaseUids.some(id => typeof id !== 'string' || id.length > 40)) throw new HttpError(400, 'Choix de cargaison invalide.');
    return this.store.withSave(playerId, (save, tx) => {
      const result = opSettleCatch(save, uid, action, releaseUids as string[]);
      if (!result.ok) throw new HttpError(409, result.error);
      const notes = [action === 'keep' ? 'Nouvelle prise rangée dans la cale.' : 'Nouvelle prise relâchée.'];
      this.finish(save, tx, notes);
      return this.mutation(save, notes);
    });
  }

  // ---------- Créatures hostiles ----------

  async encounterHit(playerId: string, id: string): Promise<HitResponse> {
    const e = this.encounters.get(playerId);
    const now = this.now();
    if (!e || e.id !== id || now > e.expires) throw new HttpError(409, 'Rencontre terminée.');
    if (now - e.lastHit < 2000 || e.hits >= 8) throw new HttpError(429, 'Attaque trop rapprochée.');
    e.lastHit = now;
    e.hits++;
    return this.store.withSave(playerId, (save, tx) => {
      const notes: string[] = [];
      const tile = tileAt(this.seed, Math.floor(save.x), Math.floor(save.y));
      if(this.fishing.has(playerId)||save.pendingCatch)throw new HttpError(409,'Cette créature est déjà engagée.');
      if(e.x!==undefined && Math.hypot(e.x-save.x,e.y!-save.y)>20)throw new HttpError(409,'La créature a abandonné la poursuite.');
      const damage = e.speciesId?predatorCombatDamage(SPECIES_BY_ID[e.speciesId]):Math.round(HOSTILE_BY_ID[e.kind].damage * (1 + 0.3 * regionBonus(tile.level)));
      const { wrecked } = applyDamage(save, damage, this.seed);
      if (wrecked) {
        this.encounters.delete(playerId);
        this.fishing.delete(playerId);
        save.syncAt = now;
        notes.push('Naufrage ! La cargaison est perdue, vous êtes remorqué au port le plus proche.');
      }
      this.finish(save, tx, notes);
      return { ...this.mutation(save, notes), wrecked, damage };
    });
  }

  async encounterEnd(playerId: string, id: string): Promise<{ ok: true }> {
    const e = this.encounters.get(playerId);
    if (e && e.id === id) this.encounters.delete(playerId);
    return { ok: true };
  }

  // ---------- Port ----------

  private async atPort(playerId: string, op: (save: Save, notes: string[]) => Op<object>): Promise<Mutation> {
    return this.store.withSave(playerId, (save, tx) => {
      if (this.fishing.has(playerId)) throw new HttpError(409, 'Impossible pendant la pêche.');
      if (!portInRange(this.seed, save.x, save.y)) throw new HttpError(409, 'Vous devez être à quai dans un port.');
      const notes: string[] = [];
      const r = op(save, notes);
      if (!r.ok) throw new HttpError(400, r.error); // l'exception annule toute la transaction
      this.finish(save, tx, notes);
      return this.mutation(save, notes);
    });
  }

  adventureAction(playerId:string,action:string,value:string):Promise<Mutation> {
    return this.atPort(playerId,(save,notes)=>{
      const port=portInRange(this.seed,save.x,save.y)!;
      const r=adventurePortOp(save,action,value,port.id,this.now(),this.seed);
      if(r.ok)notes.push(r.message);return r;
    });
  }

  async landmarkAction(playerId:string,id:string,action:string,value:string):Promise<Mutation> {
    const now=this.now();
    if(this.fishing.has(playerId)||(this.encounters.get(playerId)?.expires??0)>now)throw new HttpError(409,'Terminez la pêche ou éloignez-vous de la créature hostile.');
    return this.store.withSave(playerId,(save,tx)=>{
      const p=landmarkById(this.seed,id);
      if(action!=='chart'&&(!p||Math.hypot(p.x-save.x,p.y-save.y)>8))throw new HttpError(409,'Approchez-vous du lieu pour agir.');
      const r=action==='chart'?chartOp(save,this.seed):pointOp(save,p!,action,value,now,this.seed);
      if(!r.ok)throw new HttpError(400,r.error);
      const notes=[r.message];this.finish(save,tx,notes);return this.mutation(save,notes);
    });
  }

  maritime(playerId:string, action:string, value:string): Promise<Mutation> {
    return this.atPort(playerId,(save,notes)=> {
      const port=portInRange(this.seed,save.x,save.y)!;
      const r=maritimeOp(save,action,value,port.id,this.now(),this.seed);
      if(r.ok) notes.push(r.message);
      return r;
    });
  }

  async openTreasure(playerId:string,id:string): Promise<Mutation> {
    if(this.fishing.has(playerId) || this.encounters.has(playerId)) throw new HttpError(409,'Impossible pendant une pêche ou une attaque.');
    return this.store.withSave(playerId,(save,tx)=> {
      const now=this.now();
      const treasure=nearbyTreasures(this.seed,save.x,save.y,now).find(t=>t.id===id);
      if(!treasure || Math.hypot(treasure.x-save.x,treasure.y-save.y)>5) throw new HttpError(409,'Approchez-vous du coffre.');
      const claims=save.treasures ?? [];
      if(claims.includes(id)) throw new HttpError(409,'Ce coffre est déjà ouvert.');
      save.treasures=claims.filter(k=>k.slice(0,10)>=dayKey(now-86400000));
      save.treasures.push(id); save.coins+=treasure.coins; save.stats.earned+=treasure.coins;
      const notes=[`Trésor ouvert : +${treasure.coins} pièces !`];
      this.finish(save,tx,notes); return this.mutation(save,notes);
    });
  }

  harpoonShop(playerId:string, action:unknown, count:unknown):Promise<Mutation>{
    return this.atPort(playerId,(save,notes)=>{
      if(action==='launcher'){
        if(save.harpoonOwned)return {ok:false,error:'Lance-harpon déjà possédé.'};
        if(save.coins<HARPOON_LAUNCHER_PRICE)return {ok:false,error:'Pièces insuffisantes.'};
        save.coins-=HARPOON_LAUNCHER_PRICE;save.harpoonOwned=true;notes.push('Lance-harpon à corde acheté.');return {ok:true};
      }
      if(action!=='ammo'||!Number.isInteger(count)||(count as number)<1||(count as number)>20)return {ok:false,error:'Quantité de harpons invalide.'};
      if(!save.harpoonOwned)return {ok:false,error:'Achète d’abord un lance-harpon.'};
      if(save.harpoons+(count as number)>HARPOON_MAX_AMMO)return {ok:false,error:'Réserve de harpons pleine.'};
      const cost=(count as number)*HARPOON_AMMO_PRICE;
      if(save.coins<cost)return {ok:false,error:'Pièces insuffisantes.'};
      save.coins-=cost;save.harpoons+=count as number;notes.push(`${count} recharge(s) de harpon achetée(s).`);return {ok:true};
    });
  }

  sell(playerId: string, uids: string[] | 'all', from: 'cargo' | 'aquarium'): Promise<Mutation> {
    return this.atPort(playerId, (save, notes) => {
      const r = opSell(save, uids, from);
      if (r.ok) {
        notes.push(`${r.count} poisson${r.count > 1 ? 's' : ''} vendu${r.count > 1 ? 's' : ''} : +${r.gain} pièces`);
        for (const c of bumpDaily(save, { kind: 'sell', gain: r.gain }, this.now())) notes.push(`Défi réussi : ${c.label} (+${c.reward} pièces)`);
      }
      return r;
    });
  }

  upgrade(playerId: string, key: string): Promise<Mutation> {
    return this.atPort(playerId, (save, notes) => {
      if (!Object.hasOwn(UPGRADE_BY_KEY, key)) return { ok: false, error: 'Amélioration inconnue.' };
      const r = opUpgrade(save, key as UpgradeKey);
      if (r.ok) notes.push(`${UPGRADE_BY_KEY[key as UpgradeKey].name} : niveau ${r.level}`);
      return r;
    });
  }

  buyNet(playerId: string, tier: number): Promise<Mutation> {
    return this.atPort(playerId, (save, notes) => {
      const r = opBuyNet(save, tier);
      if (r.ok) notes.push(`${NETS[tier]!.name} acheté et équipé`);
      return r;
    });
  }

  repair(playerId: string): Promise<Mutation> {
    return this.atPort(playerId, (save, notes) => {
      const r = opRepair(save);
      if (r.ok) notes.push(`Coque réparée : +${r.repaired} PC pour ${r.cost} pièces`);
      return r;
    });
  }

  keep(playerId: string, uid: string): Promise<Mutation> {
    return this.atPort(playerId, (save) => opKeep(save, uid));
  }

  /** Relâcher un poisson est permis partout (cela ne rapporte rien). */
  async release(playerId: string, uid: string, from: 'cargo' | 'aquarium'): Promise<Mutation> {
    return this.store.withSave(playerId, (save) => {
      const r = opRelease(save, uid, from);
      if (!r.ok) throw new HttpError(400, r.error);
      return this.mutation(save, []);
    });
  }
}
