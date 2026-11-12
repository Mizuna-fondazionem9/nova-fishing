import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES, SPECIES_BY_ID, BIOME_IDS, Rng, rollSpecimen, priceOf, bulkOf, fightStats, makeBiteScript, judgeHook,
  makeCombatParams, Combat, replayCombat, simulateBot, BOTS, gearOf, zeroLevels, upgradeCost, UPGRADES, UPGRADE_KEYS,
  gearTier, newSave, migrateSave, applyCatch, opSell, opUpgrade, opBuyNet, opRepair, opKeep, opRelease, applyDamage,
  applyShipwreck, evalTrophies, dailyChallenges, bumpDaily, cargoBulk, holdFree, startPort, nearestPort, NETS,
  type Levels, type Species, type Specimen, type Silhouette,
} from '../packages/shared/src/index';

const SEED = 20261111;
const sp = (id: string): Species => SPECIES_BY_ID[id];
const fish = (id: string, kg: number, uid: string): Specimen => {
  const s: Specimen = { uid, sp: id, len: 30, kg, size: 0, color: 0, tough: false, lvl: 1, value: 0, at: 0, biome: 'coastal' };
  s.value = priceOf(s);
  return s;
};
const rodLevels = (n: number): Levels => {
  const up = zeroLevels();
  for (const k of ['rodPower', 'rodRes', 'line', 'reel', 'recovery', 'precision'] as const) up[k] = n;
  return up;
};
function winRate(id: string, level: number, bot: keyof typeof BOTS, n = 250): { win: number; secs: number; max: number } {
  const rod = gearOf(rodLevels(level)).rod;
  const rng = new Rng(99 + level);
  let wins = 0;
  let secs = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const s = sp(id);
    const len = s.lmin + (s.lmax - s.lmin) * Math.pow(rng.next(), 1.5);
    const r = simulateBot(makeCombatParams(fightStats(s, { len, tough: false, lvl: 1 }), rod, rng.int(1, 1e9)), BOTS[bot], rng);
    if (r.win) wins++;
    secs += r.seconds;
    max = Math.max(max, r.seconds);
  }
  return { win: wins / n, secs: secs / n, max };
}

// ---------- Espèces ----------

test('espèces : au moins 50, identifiants uniques, tous les biomes et silhouettes couverts', () => {
  assert.ok(SPECIES.length >= 50, `${SPECIES.length} espèces`);
  assert.equal(new Set(SPECIES.map((s) => s.id)).size, SPECIES.length);
  for (const b of BIOME_IDS) assert.ok(SPECIES.filter((s) => s.biomes.includes(b)).length >= 6, `biome pauvre : ${b}`);
  for (const sil of ['small', 'long', 'massive', 'shark', 'ray', 'cephalo', 'giant'] as Silhouette[])
    assert.ok(SPECIES.some((s) => s.sil === sil), `silhouette absente : ${sil}`);
  for (let r = 0; r <= 5; r++) assert.ok(SPECIES.some((s) => s.rarity === r), `rareté absente : ${r}`);
  for (const s of SPECIES) {
    assert.match(s.id, /^[a-z_]+$/);
    assert.ok(s.name && s.desc.length > 10);
    assert.ok(s.lmin < s.lmax && s.kgMax > 0 && s.value >= 1 && s.tier >= 1 && s.dmin < s.dmax);
    assert.ok(s.biomes.every((b) => BIOME_IDS.includes(b)));
  }
});

// ---------- Spécimens et prix ----------

test('spécimens : variantes bornées et cohérentes avec l’espèce', () => {
  const rng = new Rng(7);
  const s = sp('bar');
  const sizes = [0, 0, 0, 0, 0, 0];
  let colored = 0;
  for (let i = 0; i < 20000; i++) {
    const f = rollSpecimen(rng, s, 1 + (i % 40), 'coastal', 0, `u${i}`);
    sizes[f.size]++;
    if (f.color) colored++;
    assert.ok(f.size >= 0 && f.size <= 5 && f.color >= 0 && f.color <= 7);
    const min = f.size === 4 ? s.lmin * 0.45 : s.lmin;
    const max = f.size === 5 ? s.lmax * 1.65 : f.size === 4 ? s.lmin * 0.75 : s.lmax * 1.5;
    assert.ok(f.len >= min - 0.051 && f.len <= max + 0.051);
    assert.ok(f.kg > 0 && f.kg <= s.kgMax * 1.65 ** 3 * 1.11);
    assert.ok(Number.isSafeInteger(f.value) && f.value >= 1);
    assert.equal(f.sp, s.id);
  }
  assert.ok(sizes[0] > 16000 && sizes[1] > 500 && sizes[2] > 50 && sizes[3] < 80);
  assert.ok(sizes[4] > 400 && sizes[4] < 1000 && sizes[5] > 0 && sizes[5] < 30);
  assert.ok(colored > 600 && colored < 1200);
});

test('prix : déterministes, croissants avec le poids, majorés par les variantes', () => {
  const a = fish('bar', 3, 'a');
  assert.equal(priceOf(a), priceOf({ ...a }));
  assert.ok(priceOf({ ...a, kg: 6 }) > priceOf(a));
  assert.ok(priceOf({ ...a, color: 3 }) > priceOf(a) * 2.5);
  assert.ok(priceOf({ ...a, tough: true }) > priceOf(a));
  assert.ok(priceOf({ ...a, size: 3 }) > priceOf({ ...a, size: 1 }));
  assert.ok(priceOf({ ...a, kg: 1e9 }) <= sp('bar').value * 6 * 1.1, 'le prix doit être borné');
  assert.ok(priceOf(fish('leviathan', 20000, 'l')) > priceOf(fish('sardine', 0.1, 's')) * 500);
  assert.equal(priceOf({ ...a, sp: 'inconnu' }), 0);
});

// ---------- Touche ----------

test('touche : scénario ordonné, feintes avant la morsure, ferrage jugé', () => {
  const rng = new Rng(3);
  let ignored = 0;
  let feints = 0;
  for (let i = 0; i < 400; i++) {
    const s = SPECIES[i % SPECIES.length];
    const sc = makeBiteScript(rng, s, 1);
    for (let j = 1; j < sc.events.length; j++) assert.ok(sc.events[j].t > sc.events[j - 1].t);
    assert.equal(sc.events[0].kind, 'approach');
    assert.ok(sc.end <= 30000);
    if (sc.biteAt === null) {
      ignored++;
      assert.equal(sc.events.at(-1)!.kind, 'leave');
      assert.equal(judgeHook(sc, 5000), 'none');
    } else {
      assert.equal(sc.events.at(-1)!.kind, 'bite');
      assert.ok(sc.window >= 380 && sc.window <= 1300);
      feints += sc.events.filter((e) => e.kind === 'feint').length;
      assert.equal(judgeHook(sc, sc.biteAt - 1), 'early');
      assert.equal(judgeHook(sc, sc.biteAt + sc.window / 2), 'ok');
      assert.equal(judgeHook(sc, sc.biteAt + sc.window + 1), 'late');
    }
  }
  assert.ok(ignored > 10 && ignored < 150 && feints > 20);
});

// ---------- Combat ----------

const starter = gearOf(zeroLevels()).rod;
const params = (id: string, seed = 42) => makeCombatParams(fightStats(sp(id), { len: 40, tough: false, lvl: 1 }), starter, seed);

test('combat : la rejouabilité serveur donne exactement le résultat du client', () => {
  const rng = new Rng(11);
  for (const id of ['sardine', 'bar', 'barracuda', 'seiche', 'espadon', 'leviathan']) {
    for (const bot of ['debutant', 'expert', 'parfait'] as const) {
      const p = JSON.parse(JSON.stringify(params(id, rng.int(1, 1e9)))); // comme après un aller-retour réseau
      const live = simulateBot(p, BOTS[bot], rng);
      const end = Math.round(live.seconds * 60);
      const rep = replayCombat(p, live.taps, end);
      assert.equal(rep.state, live.win ? 'win' : 'lose');
      assert.equal(rep.tick, end);
    }
  }
});

test('combat : la ligne s’use même avec un jeu parfait, et casse sans rien faire', () => {
  const p = params('bar');
  const c = new Combat(p);
  for (let i = 0; i < 120; i++) c.step();
  assert.ok(c.line < p.line, 'usure passive absente');
  const idle = replayCombat(p, [], 1e9);
  assert.equal(idle.state, 'lose');
  assert.ok(idle.tick <= 125 * 60, `combat interminable : ${idle.tick / 60}s`);
  const rng = new Rng(1);
  const perfect = simulateBot(params('sardine'), BOTS.parfait, rng);
  assert.ok(perfect.win);
  const c2 = new Combat(params('sardine'));
  for (const t of perfect.taps) {
    assert.equal(typeof t, 'number');
    while (c2.tick < (t as number)) c2.step();
    c2.tap();
  }
  assert.ok(c2.line < params('sardine').line);
});

test('combat : échec = forte tension, critique > réussite normale, anti-matraquage', () => {
  const p = params('bar');
  const c = new Combat(p);
  c.zoneC = c.pos > 0.5 ? 0.15 : 0.85; // zone loin du curseur
  const before = c.line;
  assert.equal(c.tap(), 'miss');
  assert.ok(Math.abs(before - c.line - p.missTension) < 1e-9);
  assert.ok(p.missTension > p.drain * 3, 'un échec doit coûter bien plus que l’usure passive');
  assert.equal(c.tap(), 'locked', 'un second appui immédiat doit être ignoré');

  const hit = new Combat(p);
  hit.zoneC = hit.pos + p.zone * 0.4;
  assert.equal(hit.tap(), 'hit');
  const crit = new Combat(p);
  crit.zoneC = crit.pos;
  assert.equal(crit.tap(), 'crit');
  assert.ok(p.stamina - crit.fish > (p.stamina - hit.fish) * 1.5);
  assert.ok(p.crit < 0.5, 'la zone critique doit être plus étroite que la zone normale');
});

test('combat : les quatre profils de curseur restent dans la jauge et diffèrent', () => {
  const traces: string[] = [];
  for (const id of ['sardine', 'orphie', 'seiche', 'espadon']) {
    const c = new Combat(params(id, 5));
    let tr = '';
    for (let i = 0; i < 300 && c.state === 'run'; i++) {
      c.step();
      assert.ok(c.pos >= 0 && c.pos <= 1);
      if (i % 20 === 0) tr += c.pos.toFixed(2);
    }
    traces.push(c.p.profile + tr);
  }
  assert.deepEqual(traces.map((t) => t.replace(/[\d.]+$/, '')).sort(), ['accel', 'erratic', 'oscillating', 'regular']);
  assert.equal(new Set(traces).size, 4);
});

// ---------- Équilibrage (joueurs simulés) ----------

test('équilibrage : canne de départ — débutant, moyen, excellent', () => {
  const g = gearTier(starter);
  assert.ok(winRate('sardine', 0, 'debutant').win >= 0.85, 'un débutant doit réussir les sardines');
  assert.ok(winRate('bar', 0, 'moyen').win >= 0.5, 'un joueur moyen doit pouvoir prendre un bar');
  assert.ok(winRate('bar', 0, 'debutant').win < winRate('bar', 0, 'expert').win - 0.3, 'l’habileté doit compter');
  // Un excellent joueur capture nettement au-dessus de son matériel (cabillaud : 2,5 fois le niveau de la canne).
  assert.ok(sp('cabillaud').tier / g >= 2.4);
  assert.ok(winRate('cabillaud', 0, 'expert').win >= 0.35);
});

test('équilibrage : la canne de départ ne capture aucune créature de haut niveau, même en jeu parfait', () => {
  for (const s of SPECIES.filter((x) => x.rarity >= 4 || x.tier >= 10))
    assert.equal(winRate(s.id, 0, 'parfait', 80).win, 0, `${s.id} capturable avec la canne de départ`);
  // Quelques améliorations ne suffisent pas non plus pour les légendaires et les mythiques.
  for (const s of SPECIES.filter((x) => x.rarity >= 4))
    assert.equal(winRate(s.id, 3, 'parfait', 80).win, 0, `${s.id} capturable au niveau 3`);
});

test('équilibrage : la progression ouvre les créatures puissantes, durées de combat raisonnables', () => {
  assert.ok(winRate('thon_rouge', 15, 'expert').win >= 0.3);
  assert.ok(winRate('thon_rouge', 40, 'moyen').win >= 0.3);
  const lev = winRate('leviathan', 150, 'expert', 120);
  assert.ok(lev.win >= 0.5, `léviathan au niveau 150 : ${lev.win}`);
  for (const [id, level] of [['sardine', 0], ['bar', 0], ['merou', 15], ['thon_rouge', 40], ['leviathan', 150]] as const) {
    const r = winRate(id, level, 'moyen', 150);
    assert.ok(r.secs >= 3 && r.secs <= 75, `${id} : ${r.secs.toFixed(1)} s en moyenne`);
    assert.ok(r.max <= 240);
  }
});

// ---------- Améliorations ----------

test('améliorations : coûts croissants, rendements décroissants, aucun dépassement numérique', () => {
  let grand = 0;
  for (const u of UPGRADES) {
    let prev = 0;
    for (let n = 0; n < u.max; n++) {
      const c = upgradeCost(u.key, n);
      assert.ok(Number.isSafeInteger(c) && c > prev, `${u.key} niveau ${n}`);
      prev = c;
      grand += c;
      const e0 = u.effect(n);
      const e1 = u.effect(n + 1);
      assert.ok(Number.isFinite(e1));
      if (u.key === 'repair') assert.ok(e1 < e0);
      else assert.ok(e1 >= e0, `${u.key} doit progresser`);
    }
    assert.ok(prev < 1e9);
  }
  assert.ok(Number.isSafeInteger(grand));
  const speed = UPGRADES.find((u) => u.key === 'speed')!;
  assert.ok(speed.effect(1) - speed.effect(0) > (speed.effect(101) - speed.effect(100)) * 5, 'rendement décroissant attendu');
  assert.ok(speed.effect(200) < 13, 'vitesse plafonnée en douceur');
  const g = gearOf(zeroLevels());
  assert.deepEqual([g.rod.power, g.rod.resistance, g.rod.line, g.hullMax, g.hold], [10, 10, 100, 100, 20]);
  assert.equal(UPGRADE_KEYS.length, 13);
});

// ---------- Sauvegarde et opérations économiques ----------

test('sauvegarde : départ au port, migration tolérante', () => {
  const s = newSave(SEED, 1000);
  const p = startPort(SEED);
  assert.deepEqual([s.x, s.y, s.lastPort], [p.x + 0.5, p.y + 0.5, p.id]);
  const old = migrateSave({ coins: 77, up: { speed: 3 }, cargo: [fish('bar', 2, 'x'), fish('espece_supprimee', 1, 'y')] }, SEED, 5);
  assert.equal(old.coins, 77);
  assert.equal(old.up.speed, 3);
  assert.equal(old.up.rodPower, 0);
  assert.equal(old.cargo.length, 1);
  assert.deepEqual(migrateSave(null, SEED, 5).stats.caught, 0);
});

test('cale : capacité respectée, le bestiaire progresse même cale pleine', () => {
  const s = newSave(SEED, 0);
  assert.equal(bulkOf(0.2), 1);
  assert.equal(bulkOf(25), 5);
  assert.equal(bulkOf(1e6), 40);
  let stored = 0;
  for (let i = 0; i < 12; i++) if (applyCatch(s, fish('bar', 9, `b${i}`), 0, i).stored) stored++;
  assert.equal(stored, 6); // 20 unités / 3 par poisson de 9 kg
  assert.ok(cargoBulk(s) <= gearOf(s.up).hold && holdFree(s) >= 0);
  assert.equal(s.bestiary.bar.n, 12);
  assert.equal(s.stats.caught, 12);
  const big = applyCatch(s, fish('bar', 12, 'rec'), 0, 99);
  assert.ok(big.record && !big.first);
});

test('vente : prix recalculés côté serveur, pas de double vente', () => {
  const s = newSave(SEED, 0);
  const a = fish('bar', 3, 'a');
  const b = fish('sardine', 0.1, 'b');
  a.value = 999999; // valeur trafiquée : doit être ignorée
  s.cargo.push(a, b);
  const coins = s.coins;
  assert.equal(opSell(s, ['zzz']).ok, false);
  assert.equal(opSell(s, ['a', 'a']).ok, false);
  const r = opSell(s, ['a']);
  assert.ok(r.ok && r.gain === priceOf(a) && r.gain < 1000);
  assert.equal(s.coins, coins + priceOf(a));
  assert.equal(opSell(s, ['a']).ok, false, 'double vente refusée');
  const all = opSell(s, 'all');
  assert.ok(all.ok && all.count === 1);
  assert.equal(opSell(s, 'all').ok, false);
  assert.equal(s.stats.sold, 2);
});

test('achats : coût débité, fonds insuffisants et plafonds refusés', () => {
  const s = newSave(SEED, 0);
  s.coins = 59;
  assert.equal(opUpgrade(s, 'rodPower').ok, false);
  s.coins = 60;
  const r = opUpgrade(s, 'rodPower');
  assert.ok(r.ok && r.cost === 60 && r.level === 1);
  assert.equal(s.coins, 0);
  assert.equal(opUpgrade(s, 'inconnu' as never).ok, false);
  s.coins = 1e9;
  s.up.aquarium = 30;
  assert.equal(opUpgrade(s, 'aquarium').ok, false);
  assert.equal(opUpgrade(s, 'nets').ok, false, 'pas de maillage sans filet');
  assert.equal(opBuyNet(s, 2).ok, false);
  assert.equal(opBuyNet(s, 1.5).ok, false);
  assert.ok(opBuyNet(s, 1).ok);
  assert.equal(s.coins, 1e9 - NETS[1]!.price);
  assert.equal(opBuyNet(s, 1).ok, false);
  assert.ok(opUpgrade(s, 'nets').ok);
  const hull = s.hull;
  assert.ok(opUpgrade(s, 'hull').ok);
  assert.ok(s.hull > hull, 'la coque gagnée est créditée');
});

test('réparation, aquarium, naufrage', () => {
  const s = newSave(SEED, 0);
  assert.equal(opRepair(s).ok, false);
  s.hull = 40;
  s.coins = 30;
  const r = opRepair(s);
  assert.ok(r.ok && r.repaired === 15 && s.coins === 0 && s.hull === 55);
  s.cargo.push(fish('bar', 2, 'k1'), fish('bar', 2, 'k2'), fish('bar', 2, 'k3'), fish('bar', 2, 'k4'), fish('bar', 2, 'k5'));
  for (const u of ['k1', 'k2', 'k3', 'k4']) assert.ok(opKeep(s, u).ok);
  assert.equal(opKeep(s, 'k5').ok, false, 'aquarium plein');
  assert.equal(opKeep(s, 'k1').ok, false);
  assert.ok(opRelease(s, 'k1', 'aquarium').ok);
  assert.equal(s.aquarium.length, 3);
  s.up.rodPower = 4;
  s.bestiary.bar = { n: 3, maxLen: 50, maxKg: 2, first: 0, biomes: ['coastal'] };
  s.x += 300;
  s.y -= 200;
  assert.equal(applyDamage(s, 10, SEED).wrecked, false);
  const w = applyDamage(s, 1000, SEED);
  assert.ok(w.wrecked);
  const port = nearestPort(SEED, s.x, s.y);
  assert.deepEqual([s.x, s.y, s.lastPort], [port.x + 0.5, port.y + 0.5, port.id]);
  assert.equal(s.cargo.length, 0, 'cargaison perdue');
  assert.equal(s.aquarium.length, 3, 'aquarium conservé');
  assert.equal(s.up.rodPower, 4, 'améliorations conservées');
  assert.equal(s.bestiary.bar.n, 3, 'bestiaire conservé');
  assert.equal(s.hull, 40);
  assert.equal(s.stats.wrecks, 1);
  applyShipwreck(s, SEED);
  assert.equal(s.stats.wrecks, 2);
});

test('trophées et défis : débloqués une seule fois, récompense bornée', () => {
  const s = newSave(SEED, 0);
  assert.equal(evalTrophies(s, 1).length, 0);
  applyCatch(s, fish('thon_rouge', 300, 't'), 2, 5);
  const got = evalTrophies(s, 10).map((t) => t.id);
  assert.ok(got.includes('premiere_prise') && got.includes('poids_50') && got.includes('david'));
  assert.equal(evalTrophies(s, 11).length, 0);
  assert.equal(s.trophies.premiere_prise, 10);

  const day = Date.UTC(2026, 10, 11, 12);
  assert.deepEqual(dailyChallenges('2026-11-11', 3), dailyChallenges('2026-11-11', 3));
  const ch = dailyChallenges('2026-11-11', 1);
  assert.equal(ch.length, 3);
  const coins = s.coins;
  let done = 0;
  for (let i = 0; i < 40; i++) done += bumpDaily(s, { kind: 'catch', sp: sp('bar'), kg: 5, biome: 'coastal' }, day).length;
  done += bumpDaily(s, { kind: 'sell', gain: 5000 }, day).length;
  assert.equal(done, 3);
  assert.equal(s.coins, coins + ch.reduce((a, c) => a + c.reward, 0));
  assert.equal(bumpDaily(s, { kind: 'sell', gain: 5000 }, day).length, 0, 'pas de double récompense');
  assert.equal(bumpDaily(s, { kind: 'sell', gain: 5000 }, day + 86400000).length >= 0, true);
  assert.equal(s.daily.day, '2026-11-12');
});

test('le bestiaire conserve les variantes uniques après vente et reprend les anciennes prises', () => {
  const s = newSave(SEED, 0);
  const a = { ...fish('bar', 9, 'variant-a'), color: 3, size: 1, tough: true };
  applyCatch(s, a, 0, 1);
  applyCatch(s, { ...a, uid: 'variant-b' }, 0, 2);
  assert.equal(s.bestiary.bar.variants?.length, 1);
  s.cargo = [];
  assert.deepEqual(s.bestiary.bar.variants, [{ color: 3, size: 1, tough: true }]);
  delete s.bestiary.bar.variants;
  s.aquarium.push(a);
  applyCatch(s, { ...a, uid: 'variant-c', color: 4 }, 0, 3);
  assert.deepEqual((s.bestiary.bar.variants as unknown as { color: number }[]).map(v => v.color), [3, 4]);
});


test('nouvelles variantes : prix et comportements distincts, anciennes prises compatibles', () => {
  const a = fish('bar', 3, 'a');
  const base = fightStats(sp(a.sp), a);
  const swift = fightStats(sp(a.sp), {...a, trait:'swift'});
  const armored = fightStats(sp(a.sp), {...a, trait:'armored'});
  const relentless = fightStats(sp(a.sp), {...a, trait:'relentless'});
  const cunning = fightStats(sp(a.sp), {...a, trait:'cunning'});
  assert.ok(swift.speed > base.speed && swift.stamina < base.stamina);
  assert.ok(armored.stamina > base.stamina && armored.speed < base.speed);
  assert.ok(relentless.power > base.power && relentless.stamina > base.stamina);
  assert.ok(cunning.zone < base.zone);
  for (const trait of ['swift','armored','relentless','cunning'] as const) assert.ok(priceOf({...a,trait}) > priceOf(a));
  for (const color of [5,6,7]) assert.ok(priceOf({...a,color}) > priceOf(a));
  assert.ok(priceOf({...a,size:5}) > priceOf({...a,size:3}));
  assert.ok(priceOf({...a,size:4}) < priceOf(a));
  assert.deepEqual(fightStats(sp(a.sp), a), fightStats(sp(a.sp), {...a,trait:undefined}));
});

test('anciens bateaux et variantes : migration sans perte et traits mémorisés après vente', () => {
  const old = {...newSave(SEED, 0), v:3, boatSize:1.15, coins:12345, paint:3, paints:[0,3]};
  const a = {...fish('bar', 3, 'a'), color:7, trait:'armored' as const};
  old.aquarium.push(a);
  const s = migrateSave(old, SEED, 2);
  assert.equal('boatSize' in s, false);
  assert.equal(s.v, 4);
  assert.equal(s.coins, 12345);
  assert.deepEqual(s.paints, [0,3]);
  assert.deepEqual(s.aquarium, [a]);
  applyCatch(s, {...a,uid:'b'}, 0, 3);
  applyCatch(s, {...a,uid:'c',trait:'swift'}, 0, 4);
  applyCatch(s, {...a,uid:'d',trait:'swift'}, 0, 5);
  s.cargo=[]; s.aquarium=[];
  assert.deepEqual(s.bestiary.bar.variants?.map(v=>v.trait), ['armored','swift']);
});
