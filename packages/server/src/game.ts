// Service de jeu : c'est ICI que se décident captures, gains, achats et dégâts.
// Le client affiche et anime ; il ne fixe jamais lui-même une récompense.
import { randomInt, randomUUID } from 'node:crypto';
import {
  Rng, tileAt, isLand, portInRange, spawnShadows, speciesForShadow, slotOf, rollSpecimen, fightStats, makeBiteScript,
  judgeHook, makeCombatParams, replayCombat, gearOf, applyCatch, noteBiome, evalTrophies, bumpDaily, dailyChallenges,
  dayKey, opSell, opUpgrade, opBuyNet, opRepair, opKeep, opRelease, applyDamage, holdFree, bulkOf, regionBonus,
  SPECIES, SPECIES_BY_ID, HOSTILES, HOSTILE_BY_ID, BIOMES, NETS, NET_COOLDOWN_MS, NET_DISTANCE, RARITY_WEIGHT,
  MAX_COMBAT_TICKS, TICK_HZ, CHUNK, UPGRADE_BY_KEY,
  type Save, type Specimen, type Species, type BiteScript, type CombatParams, type Shadow, type UpgradeKey, type Op,
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
}

interface ActiveEncounter {
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
      notes.push(`🏆 Trophée débloqué : ${t.name}`);
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
    const g = gearOf(save.up);
    const allowed = g.speed * Math.min(dt, 120) * 1.25 + 2;
    save.syncAt = now;
    if (dist > allowed || isLand(this.seed, Math.floor(x), Math.floor(y))) return false;
    save.x = x;
    save.y = y;
    save.stats.dist = Math.round((save.stats.dist + dist) * 100) / 100;
    const tile = tileAt(this.seed, Math.floor(x), Math.floor(y));
    if (!save.stats.biomes.includes(tile.biome)) {
      noteBiome(save, tile.biome);
      notes.push(`🧭 Nouveau biome découvert : ${BIOMES[tile.biome].name}`);
    }
    const port = portInRange(this.seed, x, y);
    if (port) {
      save.lastPort = port.id;
      if (!save.stats.ports.includes(port.id)) {
        if (save.stats.ports.length < 500) save.stats.ports.push(port.id);
        notes.push(`⚓ Nouveau port : ${port.name}`);
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
    const pool = SPECIES.filter((s) => s.sil === 'small' && s.rarity <= 1 && s.tier <= net.maxTier && s.biomes.includes(tile.biome));
    if (!pool.length) return [];
    const rng = new Rng(this.randomSeed());
    const population = spawnShadows(this.seed, Math.floor(save.x / CHUNK), Math.floor(save.y / CHUNK), slotOf(now)).length;
    const count = 1 + (rng.chance(0.15 * population) ? 1 : 0) + (rng.chance(0.1 * (net.yield - 1)) ? 1 : 0);
    const got: Specimen[] = [];
    for (let i = 0; i < count; i++) {
      const sp = rng.weighted(pool, pool.map((s) => RARITY_WEIGHT[s.rarity]));
      const spec = rollSpecimen(rng, sp, 1, tile.biome, now, randomUUID());
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
    if (got.length) notes.push(`🕸️ Filet relevé : ${got.map((s) => SPECIES_BY_ID[s.sp].name).join(', ')}`);
    return got;
  }

  private rollEncounter(playerId: string, save: Save): Encounter | undefined {
    const now = this.now();
    if (this.encounters.has(playerId) || this.fishing.has(playerId)) return;
    if (now - (this.lastEncounter.get(playerId) ?? 0) < 90_000 && !this.forceEncounter) return;
    if (portInRange(this.seed, save.x, save.y)) return;
    const tile = tileAt(this.seed, Math.floor(save.x), Math.floor(save.y));
    const danger = BIOMES[tile.biome].danger;
    const pool = HOSTILES.filter((h) => h.biomes.includes(tile.biome));
    const rng = new Rng(this.randomSeed());
    const p = 0.035 * danger * Math.min(2, 0.6 + tile.level / 10);
    if (!this.forceEncounter && (!pool.length || !rng.chance(p))) return;
    const h = pool.length ? rng.pick(pool) : HOSTILES[0];
    this.forceEncounter = false;
    const e: ActiveEncounter = { id: randomUUID(), kind: h.id, expires: now + (h.persist + 20) * 1000, hits: 0, lastHit: 0 };
    this.encounters.set(playerId, e);
    this.lastEncounter.set(playerId, now);
    return { id: e.id, kind: h.id, angle: rng.range(0, Math.PI * 2), dist: 15 };
  }

  async sync(playerId: string, x: number, y: number): Promise<SyncResponse> {
    let encounter: Encounter | undefined;
    return this.store.withSave(playerId, (save, tx) => {
      const notes: string[] = [];
      let corrected = false;
      let netted: Specimen[] = [];
      if (!this.fishing.has(playerId)) {
        corrected = !this.move(save, x, y, notes);
        if (!corrected) {
          netted = this.haulNet(save, notes);
          encounter = this.rollEncounter(playerId, save);
        }
      }
      this.finish(save, tx, notes);
      return { ...this.mutation(save, notes), corrected, encounter, netted };
    });
  }

  // ---------- Pêche ----------

  async cast(playerId: string, key: string, x: number, y: number): Promise<CastResponse> {
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
      if (!this.move(save, x, y, [])) throw new HttpError(409, 'Position du bateau refusée.');
      if (save.consumed.includes(key)) throw new HttpError(409, 'Ce poisson est déjà parti.');
      if (Math.hypot(shadow.x - save.x, shadow.y - save.y) > CAST_RANGE + CAST_SLACK) throw new HttpError(409, 'Trop loin pour lancer.');
      const rng = new Rng(this.randomSeed());
      const pick = speciesForShadow(rng, this.seed, shadow);
      if (!pick) throw new HttpError(409, 'Rien ne mord ici.');
      const spec = rollSpecimen(rng, pick.sp, pick.tile.level, pick.tile.biome, now, randomUUID());
      const script = makeBiteScript(rng, pick.sp, gearOf(save.up).rod.reel);
      const s: FishingSession = { sid: randomUUID(), key, sp: pick.sp, spec, script, createdAt: this.now(), state: 'wait', hookAt: 0, combat: null };
      return s;
    });
    this.fishing.set(playerId, session);
    return { sid: session.sid, script: session.script };
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
      const save = (await this.store.getPlayer(playerId))!.save;
      s.state = 'fight';
      s.hookAt = now;
      s.combat = makeCombatParams(fightStats(s.sp, s.spec), gearOf(save.up).rod, this.randomSeed());
      return { verdict, combat: s.combat };
    }
    this.fishing.delete(playerId);
    const save = await this.store.withSave(playerId, (sv) => {
      if (verdict !== 'none') {
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
      if (!Number.isInteger(t) || t < prev || t > MAX_COMBAT_TICKS) throw new HttpError(400, 'Résultat de combat invalide.');
      prev = t;
    }
    const realMs = now - s.hookAt;
    const simMs = ((end as number) / TICK_HZ) * 1000;
    // Contrôles de plausibilité : un combat ne peut pas avoir duré moins longtemps « en vrai » que dans la simulation,
    // ni être rendu des minutes après sa fin.
    const tooFast = simMs > realMs + 750;
    const tooLate = realMs > simMs + 45_000;
    const replay = replayCombat(s.combat!, taps as number[], end as number);
    const win = replay.state === 'win' && !tooFast && !tooLate;

    return this.store.withSave(playerId, (save, tx) => {
      const notes: string[] = [];
      this.consume(save, s.key);
      if (!win) {
        save.stats.escaped++;
        if (tooFast) notes.push('Combat refusé : durée incohérente.');
        return { ...this.mutation(save, notes), outcome: 'lose' as const };
      }
      const r = applyCatch(save, s.spec, replay.crits, now);
      noteBiome(save, s.spec.biome);
      for (const c of bumpDaily(save, { kind: 'catch', sp: s.sp, kg: s.spec.kg, biome: s.spec.biome }, now))
        notes.push(`✅ Défi réussi : ${c.label} (+${c.reward} pièces)`);
      if (s.sp.rarity >= 4) tx.reward(`capture:${s.sp.id}`, 'capture', { species: s.sp.id, name: s.sp.name, kg: s.spec.kg, rarity: s.sp.rarity });
      if (!r.stored) notes.push('Cale pleine : le poisson a été relâché après la photo.');
      this.finish(save, tx, notes);
      return { ...this.mutation(save, notes), outcome: 'win' as const, specimen: s.spec, stored: r.stored, record: r.record, first: r.first };
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
      const damage = Math.round(HOSTILE_BY_ID[e.kind].damage * (1 + 0.3 * regionBonus(tile.level)));
      const { wrecked } = applyDamage(save, damage, this.seed);
      if (wrecked) {
        this.encounters.delete(playerId);
        this.fishing.delete(playerId);
        save.syncAt = now;
        notes.push('💥 Naufrage ! La cargaison est perdue, vous êtes remorqué au port le plus proche.');
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

  sell(playerId: string, uids: string[] | 'all', from: 'cargo' | 'aquarium'): Promise<Mutation> {
    return this.atPort(playerId, (save, notes) => {
      const r = opSell(save, uids, from);
      if (r.ok) {
        notes.push(`💰 ${r.count} poisson${r.count > 1 ? 's' : ''} vendu${r.count > 1 ? 's' : ''} : +${r.gain} pièces`);
        for (const c of bumpDaily(save, { kind: 'sell', gain: r.gain }, this.now())) notes.push(`✅ Défi réussi : ${c.label} (+${c.reward} pièces)`);
      }
      return r;
    });
  }

  upgrade(playerId: string, key: string): Promise<Mutation> {
    return this.atPort(playerId, (save, notes) => {
      if (!Object.hasOwn(UPGRADE_BY_KEY, key)) return { ok: false, error: 'Amélioration inconnue.' };
      const r = opUpgrade(save, key as UpgradeKey);
      if (r.ok) notes.push(`🔧 ${UPGRADE_BY_KEY[key as UpgradeKey].name} : niveau ${r.level}`);
      return r;
    });
  }

  buyNet(playerId: string, tier: number): Promise<Mutation> {
    return this.atPort(playerId, (save, notes) => {
      const r = opBuyNet(save, tier);
      if (r.ok) notes.push(`🕸️ ${NETS[tier]!.name} acheté et équipé`);
      return r;
    });
  }

  repair(playerId: string): Promise<Mutation> {
    return this.atPort(playerId, (save, notes) => {
      const r = opRepair(save);
      if (r.ok) notes.push(`🛠️ Coque réparée : +${r.repaired} PC pour ${r.cost} pièces`);
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
