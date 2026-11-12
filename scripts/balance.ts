// Outil de réglage : `npm run balance`. Affiche les statistiques du monde et les taux de capture simulés.
import {
  tileAt, startPort, BIOME_IDS, SPECIES, fightStats, makeCombatParams, simulateBot, BOTS, Rng, gearOf, zeroLevels,
  upgradeCost, UPGRADE_KEYS, type Levels, type Species,
} from '../packages/shared/src/index';

const seed = Number(process.env.WORLD_SEED ?? 20261111);

function world(): void {
  const o = startPort(seed);
  for (const radius of [200, 800, 2500]) {
    const counts: Record<string, number> = { land: 0 };
    for (const b of BIOME_IDS) counts[b] = 0;
    let n = 0;
    const step = Math.max(2, Math.round(radius / 150));
    for (let y = -radius; y <= radius; y += step)
      for (let x = -radius; x <= radius; x += step) {
        const t = tileAt(seed, o.x + x, o.y + y);
        counts[t.land ? 'land' : t.biome]++;
        n++;
      }
    console.log(`Rayon ${radius} :`, Object.entries(counts).map(([k, v]) => `${k} ${((v / n) * 100).toFixed(1)}%`).join(' | '));
  }
}

function rodAt(level: number): Levels {
  const up = zeroLevels();
  for (const k of ['rodPower', 'rodRes', 'line', 'reel', 'recovery', 'precision'] as const) up[k] = level;
  return up;
}

function rate(sp: Species, level: number, bot: keyof typeof BOTS, n = 300): { win: number; secs: number } {
  const rod = gearOf(rodAt(level)).rod;
  const rng = new Rng(1234 + level * 7);
  let wins = 0;
  let secs = 0;
  for (let i = 0; i < n; i++) {
    const len = sp.lmin + (sp.lmax - sp.lmin) * Math.pow(rng.next(), 1.5);
    const p = makeCombatParams(fightStats(sp, { len, tough: false, lvl: 1 }), rod, rng.int(1, 1e9));
    const r = simulateBot(p, BOTS[bot], rng);
    if (r.win) wins++;
    secs += r.seconds;
  }
  return { win: wins / n, secs: secs / n };
}

function combat(): void {
  const picks = ['sardine', 'maquereau', 'bar', 'lieu', 'cabillaud', 'congre', 'barracuda', 'merou', 'espadon', 'thon_rouge', 'requin_groenland', 'calmar_geant', 'requin_fantome', 'leviathan'];
  for (const level of [0, 5, 15, 30, 50]) {
    console.log(`\nCanne niveau ${level} — taux de capture (durée moyenne en s)`);
    console.log('espèce'.padEnd(18), 'tier'.padEnd(5), ...Object.keys(BOTS).map((b) => b.padEnd(14)));
    for (const id of picks) {
      const sp = SPECIES.find((s) => s.id === id)!;
      const cells = (Object.keys(BOTS) as (keyof typeof BOTS)[]).map((b) => {
        const r = rate(sp, level, b);
        return `${(r.win * 100).toFixed(0).padStart(3)}% (${r.secs.toFixed(0)}s)`.padEnd(14);
      });
      console.log(sp.id.padEnd(18), String(sp.tier).padEnd(5), ...cells);
    }
  }
}

function costs(): void {
  console.log('\nCoût cumulé pour monter TOUTES les améliorations au niveau n :');
  for (const n of [5, 10, 20, 35, 50]) {
    let total = 0;
    for (const k of UPGRADE_KEYS) for (let i = 0; i < Math.min(n, k === 'aquarium' ? 30 : 50); i++) total += upgradeCost(k, i);
    console.log(`  niveau ${n} : ${total.toLocaleString('fr-FR')} pièces`);
  }
}

world();
combat();
costs();
