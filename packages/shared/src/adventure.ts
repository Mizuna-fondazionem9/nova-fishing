import { hashN, Rng } from './rng';
import { tileAt, getPort, portInRange, type BiomeId } from './world';
import { SPECIES, SPECIES_BY_ID } from './species';
import { gearOf } from './gear';
import { rollSpecimen, priceOf, type Specimen } from './fish';
import {
  dayKey,
  applyCatch,
  holdFree,
  cargoBulk,
  type Save,
  type Op,
} from './save';

export type PointKind = 'wreck' | 'sanctuary' | 'lagoon' | 'vent';
export interface Landmark {
  id: string;
  x: number;
  y: number;
  kind: PointKind;
  name: string;
  text: string;
  biome: BiomeId;
}
export interface PointVisit {
  point: Landmark;
  at: number;
  day?: string;
  compartments?: number[];
  trapDay?: string;
}
export interface Contract {
  id: string;
  port: string;
  day: string;
  kind: 'delivery' | 'photo' | 'explore';
  label: string;
  goal: number;
  species?: string;
  reward: number;
  rep: number;
  progress: number;
  baseline: number;
  acceptedAt: number;
}
export interface Adventure {
  points: Record<string, PointVisit>;
  reputation: Record<string, number>;
  active: Contract[];
  completed: string[];
  fragments: number;
  runes: number;
  story: number;
  storySites: string[];
  chart?: Landmark;
  lootDay: string;
  lootCount: number;
  trapDay: string;
  traps: number;
  bait?: string;
  baits: Record<string, number>;
  kits: string[];
  rewards: string[];
  aquarium: { name: string; theme: string; featured?: string };
}
export const newAdventure = (): Adventure => ({
  points: {},
  reputation: {},
  active: [],
  completed: [],
  fragments: 0,
  runes: 0,
  story: 0,
  storySites: [],
  lootDay: '',
  lootCount: 0,
  trapDay: '',
  traps: 0,
  baits: {},
  kits: ['standard'],
  rewards: [],
  aquarium: { name: 'Mon jardin marin', theme: 'sand' },
});
export const adventureOf = (s: Save): Adventure =>
  (s.adventure ??= newAdventure());
export const POINT_LABELS: Record<PointKind, string> = {
  wreck: 'Épave',
  sanctuary: 'Sanctuaire',
  lagoon: 'Lagon',
  vent: 'Source volcanique',
};
const STORIES: Record<PointKind, [string, string][]> = {
  wreck: [
    [
      'La Dernière Aube',
      'La cloche du navire dépasse de l’eau. Son équipage cartographiait des courants inconnus.',
    ],
    [
      'Le Courlis noir',
      'Des caisses scellées reposent sous un mât brisé. Un contrebandier y avait caché ses routes.',
    ],
    [
      'L’Étoile de sel',
      'Un ancien bateau de pêche, abandonné avec ses carnets et ses derniers espoirs.',
    ],
  ],
  sanctuary: [
    [
      'Les Veilleurs',
      'Trois colonnes se répondent au rythme des vagues. Leurs inscriptions sont incomplètes.',
    ],
    [
      'Le Chœur englouti',
      'Des pierres accordées par la mer semblent garder une mémoire ancienne.',
    ],
    [
      'La Porte des marées',
      'Une arche érodée porte le même symbole que vos fragments d’inscription.',
    ],
  ],
  lagoon: [
    [
      'Le Jardin turquoise',
      'Une anse protégée par les terres voisines. Les petites ombres y cherchent refuge.',
    ],
    [
      'La Vasque de jade',
      'L’eau paraît immobile entre les reliefs, et chaque reflet semble plus vif.',
    ],
    [
      'Le Repos des écailles',
      'Un abri naturel où les prises colorées se rassemblent.',
    ],
  ],
  vent: [
    [
      'Le Souffle rouge',
      'Le fond pulse de chaleur. Attendez l’accalmie pour examiner ses dépôts.',
    ],
    [
      'Les Fumerolles',
      'Des bulles soufrées montent par vagues. Leur rythme annonce les poussées de chaleur.',
    ],
    [
      'Le Cœur de braise',
      'Une lueur rouge monte du fond. Des fragments anciens s’accrochent aux roches.',
    ],
  ],
};
const pointCache = new Map<string, Landmark | null>();
/** Vérifier une ouverture réelle pour les lagons, sans modifier les côtes. */
function openLagoon(seed: number, x: number, y: number): boolean {
  const queue: Array<[number, number]> = [[Math.floor(x), Math.floor(y)]];
  const seen = new Set<string>();
  let i = 0;
  while (i < queue.length && i < 1600) {
    const [tx, ty] = queue[i++],
      key = `${tx}:${ty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (Math.abs(tx - x) > 24 || Math.abs(ty - y) > 24) continue;
    const t = tileAt(seed, tx, ty);
    if (t.land) continue;
    if (t.shore > 0.85 && t.depth > 0.28 && t.biome !== 'river') return true;
    queue.push([tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1]);
  }
  return false;
}
export function landmarkAt(
  seed: number,
  cx: number,
  cy: number,
): Landmark | null {
  const id = `${cx}:${cy}`,
    key = `${seed}:${id}`;
  if (pointCache.has(key)) return pointCache.get(key)!;
  const rng = new Rng(hashN(seed, cx, cy, 914));
  if (rng.next() > 0.68) {
    pointCache.set(key, null);
    return null;
  }
  let kind: PointKind = (['wreck', 'sanctuary', 'lagoon', 'vent'] as const)[
    rng.int(0, 3)
  ];
  let point: Landmark | null = null;
  for (let i = 0; i < 28; i++) {
    const x = cx * 320 + rng.range(60, 260),
      y = cy * 320 + rng.range(60, 260);
    const t = tileAt(seed, Math.floor(x), Math.floor(y));
    if (t.land) continue;
    const port = getPort(seed, Math.floor(x / 160), Math.floor(y / 160));
    if (Math.hypot(x - port.x, y - port.y) < 24) continue;
    if (kind === 'vent' && t.biome !== 'volcanic') {
      if (i < 20) continue;
      kind = 'wreck';
    }
    if (kind === 'lagoon') {
      let land = 0;
      for (let n = 0; n < 8; n++)
        if (
          tileAt(
            seed,
            Math.floor(x + Math.cos((n * Math.PI) / 4) * 12),
            Math.floor(y + Math.sin((n * Math.PI) / 4) * 12),
          ).land
        )
          land++;
      if (land < 2 || land > 6 || !openLagoon(seed, x, y)) continue;
    }
    const story = STORIES[kind][rng.int(0, 2)];
    point = { id, x, y, kind, name: story[0], text: story[1], biome: t.biome };
    break;
  }
  if (pointCache.size > 2000) pointCache.clear();
  pointCache.set(key, point);
  return point;
}
export function nearbyLandmarks(
  seed: number,
  x: number,
  y: number,
): Landmark[] {
  const out: Landmark[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const p = landmarkAt(
        seed,
        Math.floor(x / 320) + dx,
        Math.floor(y / 320) + dy,
      );
      if (p) out.push(p);
    }
  return out;
}
export function landmarkById(seed: number, id: string): Landmark | null {
  const m = /^(-?\d{1,7}):(-?\d{1,7})$/.exec(id);
  return m ? landmarkAt(seed, Number(m[1]), Number(m[2])) : null;
}
export const ventHot = (p: Landmark, now: number): boolean =>
  (now + (hashN(p.x, p.y, 55) % 20000)) % 20000 < 6000;
export function discoverPoint(s: Save, p: Landmark, now: number): string[] {
  const a = adventureOf(s);
  if (a.points[p.id]) return [];
  a.points[p.id] = { point: p, at: now };
  a.runes++;
  s.coins += 75;
  s.stats.earned += 75;
  if (a.chart?.id === p.id) delete a.chart;
  return [`Lieu découvert : ${p.name} (+75 pièces, un fragment d’inscription)`];
}
export function portContracts(
  seed: number,
  port: string,
  now: number,
): Contract[] {
  const day = dayKey(now),
    rng = new Rng(
      hashN(
        seed,
        ...port.split(':').map(Number),
        Number(day.replaceAll('-', '')),
        81,
      ),
    );
  const pool = SPECIES.filter(
    (s) =>
      s.biomes.includes('coastal') &&
      s.rarity <= 1 &&
      s.tier <= 2.6 &&
      !s.ancient,
  );
  const sp = pool[rng.int(0, pool.length - 1)];
  return [
    {
      kind: 'delivery',
      label: `Livrer 3 prises : ${sp.name.toLowerCase()}`,
      species: sp.id,
      goal: 3,
      reward: 220,
      rep: 20,
    },
    {
      kind: 'photo',
      label: 'Consigner une prise manuelle de 2 kg',
      goal: 2,
      reward: 260,
      rep: 25,
    },
    {
      kind: 'explore',
      label: 'Découvrir deux nouveaux lieux remarquables',
      goal: 2,
      reward: 350,
      rep: 35,
    },
  ].map((c, i) => ({
    ...c,
    id: `${day}:${port}:${i}`,
    port,
    day,
    progress: 0,
    baseline: 0,
    acceptedAt: 0,
  })) as Contract[];
}
export function contractProgress(s: Save, c: Contract): number {
  if (c.kind === 'delivery')
    return s.cargo.filter((f) => f.sp === c.species).length;
  if (c.kind === 'explore')
    return Math.max(
      0,
      Object.keys(s.adventure?.points ?? {}).length - c.baseline,
    );
  return c.progress;
}
export function noteAdventureCatch(s: Save, spec: Specimen, now: number): void {
  const a = adventureOf(s);
  for (const c of a.active)
    if (c.day === dayKey(now) && c.kind === 'photo' && now >= c.acceptedAt)
      c.progress = Math.max(c.progress, spec.kg);
}
export const KIT_DEFS = [
  {
    id: 'standard',
    name: 'Matériel polyvalent',
    price: 0,
    desc: 'Aucun modificateur.',
  },
  {
    id: 'river',
    name: 'Montage de précision',
    price: 1200,
    desc: 'Précision +0,04 ; puissance −8 %. Utile aux crabes et aux petites prises.',
  },
  {
    id: 'abyss',
    name: 'Ligne des profondeurs',
    price: 2200,
    desc: 'Résistance +18 % ; puissance −10 %.',
  },
  {
    id: 'cage',
    name: 'Casier de lagon',
    price: 1600,
    desc: 'Permet de relever les coquillages dans les lagons ; cale −10 %.',
  },
] as const;
export const BAITS = [
  {
    id: 'glimmer',
    name: 'Appât scintillant',
    price: 60,
    desc: 'Favorise les espèces rares parmi celles de la silhouette visée.',
  },
  {
    id: 'gentle',
    name: 'Appât discret',
    price: 35,
    desc: 'Limite les départs sans morsure ; fenêtre de ferrage +15 %.',
  },
] as const;
export const THEME_NAMES: Record<string, string> = {
  sand: 'Sable doux',
  ruins: 'Ruines englouties',
  ice: 'Glaces du Nord',
  aurora: 'Aurores marines',
  coral: 'Jardin de nacre',
  harbor: 'Souvenirs du port',
  ancient: 'Jardin des Anciens',
};
export const COLLECTIONS = [
  {
    id: 'ancient',
    name: 'Mémoire du monde',
    goal: 3,
    desc: 'Trois espèces préhistoriques découvertes.',
    theme: 'ruins',
  },
  {
    id: 'polar',
    name: 'Éclats du Nord',
    goal: 5,
    desc: 'Cinq espèces des eaux polaires découvertes.',
    theme: 'ice',
  },
  {
    id: 'rainbow',
    name: 'Écailles précieuses',
    goal: 5,
    desc: 'Cinq espèces découvertes avec une couleur rare.',
    theme: 'aurora',
  },
  {
    id: 'shells',
    name: 'Cabinet de nacre',
    goal: 4,
    desc: 'Quatre espèces de coquillages découvertes.',
    theme: 'coral',
  },
] as const;
export function collectionProgress(s: Save, id: string): number {
  return SPECIES.filter(
    (sp) =>
      s.bestiary[sp.id] &&
      (id === 'ancient'
        ? sp.ancient
        : id === 'polar'
          ? sp.biomes.includes('polar')
          : id === 'shells'
            ? sp.shape === 'shell'
            : s.bestiary[sp.id].variants?.some((v) => v.color > 0) ||
              [...s.cargo, ...s.aquarium].some(
                (f) => f.sp === sp.id && f.color > 0,
              )),
  ).length;
}
const fail = (error: string): Op<{ message: string }> => ({ ok: false, error });
export function adventurePortOp(
  s: Save,
  action: string,
  value: string,
  port: string,
  now: number,
  seed: number,
): Op<{ message: string }> {
  const a = adventureOf(s),
    day = dayKey(now);
  a.active = a.active.filter((c) => c.day === day);
  a.completed = a.completed.filter(
    (k) => k.slice(0, 10) >= dayKey(now - 7 * 86400000),
  );
  if (action === 'accept') {
    const c = portContracts(seed, port, now).find((c) => c.id === value);
    if (
      !c ||
      a.active.some((v) => v.id === value) ||
      a.completed.includes(value)
    )
      return fail('Contrat indisponible.');
    if (a.active.length >= 3) return fail('Trois contrats actifs au maximum.');
    if (a.completed.filter((k) => k.startsWith(day)).length >= 6)
      return fail('Six contrats rémunérés par jour au maximum.');
    c.acceptedAt = now;
    c.baseline = Object.keys(a.points).length;
    a.active.push(c);
    return { ok: true, message: 'Contrat accepté. Il expire à minuit UTC.' };
  }
  if (action === 'complete') {
    const c = a.active.find((c) => c.id === value && c.port === port);
    if (!c || a.completed.includes(value) || contractProgress(s, c) < c.goal)
      return fail('Contrat incomplet ou mauvais port.');
    if (a.completed.filter((k) => k.startsWith(day)).length >= 6)
      return fail('Limite quotidienne de contrats atteinte.');
    if (c.kind === 'delivery') {
      let left = c.goal;
      s.cargo = s.cargo.filter((f) => {
        if (f.sp === c.species && left > 0) {
          left--;
          return false;
        }
        return true;
      });
    }
    a.active = a.active.filter((v) => v.id !== value);
    a.completed.push(value);
    s.coins += c.reward;
    s.stats.earned += c.reward;
    a.reputation[port] = (a.reputation[port] ?? 0) + c.rep;
    if (a.reputation[port] >= 100 && !a.rewards.includes('harbor')) {
      a.rewards.push('harbor');
      a.baits.glimmer = Math.min(20, (a.baits.glimmer ?? 0) + 3);
    }
    return {
      ok: true,
      message: `Contrat terminé : +${c.reward} pièces et +${c.rep} réputation au port.`,
    };
  }
  if (action === 'abandon') {
    a.active = a.active.filter((c) => c.id !== value);
    return { ok: true, message: 'Contrat abandonné.' };
  }
  if (action === 'kit') {
    const kit = KIT_DEFS.find((k) => k.id === value);
    if (!kit) return fail('Matériel inconnu.');
    if (!a.kits.includes(value)) {
      if (s.coins < kit.price) return fail('Pas assez de pièces.');
    }
    if (cargoBulk(s) > gearOf(s.up, s.vessel, value).hold)
      return fail('Libérez la cale avant d’équiper ce matériel.');
    if (!a.kits.includes(value)) {
      s.coins -= kit.price;
      a.kits.push(value);
    }
    s.kit = value;
    return { ok: true, message: `${kit.name} équipé.` };
  }
  if (action === 'bait-buy') {
    const b = BAITS.find((b) => b.id === value);
    if (!b) return fail('Appât inconnu.');
    if ((a.baits[value] ?? 0) >= 20)
      return fail('Réserve limitée à 20 unités par appât.');
    if (s.coins < b.price) return fail('Pas assez de pièces.');
    s.coins -= b.price;
    a.baits[value] = (a.baits[value] ?? 0) + 1;
    return {
      ok: true,
      message:
        'Appât acheté. Une unité sera consommée à chaque lancer avec cet appât sélectionné.',
    };
  }
  if (action === 'bait-select') {
    if (value !== 'none' && !BAITS.some((b) => b.id === value))
      return fail('Appât inconnu.');
    a.bait = value === 'none' ? undefined : value;
    return { ok: true, message: 'Appât sélectionné.' };
  }
  if (action === 'collection') {
    const c = COLLECTIONS.find((c) => c.id === value);
    if (
      !c ||
      collectionProgress(s, value) < c.goal ||
      a.rewards.includes(value)
    )
      return fail('Collection incomplète ou déjà récompensée.');
    a.rewards.push(value);
    return {
      ok: true,
      message: `Collection achevée : décor « ${THEME_NAMES[c.theme]} » débloqué !`,
    };
  }
  if (action === 'aquarium-theme') {
    const allowed = [
      'sand',
      ...(a.rewards.includes('harbor') ? ['harbor'] : []),
      ...COLLECTIONS.filter((c) => a.rewards.includes(c.id)).map(
        (c) => c.theme,
      ),
      ...(a.story >= 3 ? ['ancient'] : []),
    ];
    if (!allowed.includes(value)) return fail('Décor non débloqué.');
    a.aquarium.theme = value;
    return { ok: true, message: 'Décor du bassin modifié.' };
  }
  if (action === 'aquarium-name') {
    if (value.trim().length < 1 || value.length > 30)
      return fail('Choisissez un nom de 1 à 30 caractères.');
    a.aquarium.name = value.trim();
    return { ok: true, message: 'Aquarium renommé.' };
  }
  if (action === 'featured') {
    if (!s.aquarium.some((f) => f.uid === value))
      return fail('Poisson absent de l’aquarium.');
    a.aquarium.featured = value;
    return { ok: true, message: 'Prise mise à l’honneur.' };
  }
  return fail('Action inconnue.');
}
export const STORY_TEXT = [
  'Les colonnes racontent que des navigateurs ont suivi une mer qui changeait de couleur.',
  'Ils ont caché leurs routes dans les épaves, afin que seuls les curieux retrouvent le chemin.',
  'Le dernier texte remercie ceux qui prennent le temps d’observer : la mer ne leur appartenait pas, ils en étaient les gardiens. Le décor des Anciens est débloqué.',
];
export function pointOp(
  s: Save,
  p: Landmark,
  action: string,
  value: string,
  now: number,
  seed: number,
): Op<{ message: string }> {
  const a = adventureOf(s),
    day = dayKey(now);
  discoverPoint(s, p, now);
  const visit = a.points[p.id];
  if (action === 'inspect')
    return { ok: true, message: `${p.name} : ${p.text}` };
  if (action === 'loot') {
    if (p.kind !== 'wreck') return fail('Aucune cale à fouiller ici.');
    const compartment = Number(value);
    if (![0, 1, 2].includes(compartment)) return fail('Compartiment inconnu.');
    if (visit.day !== day) {
      visit.day = day;
      visit.compartments = [];
    }
    if (visit.compartments?.includes(compartment))
      return fail('Ce compartiment a déjà été fouillé aujourd’hui.');
    if (a.lootDay !== day) {
      a.lootDay = day;
      a.lootCount = 0;
    }
    if (a.lootCount >= 6)
      return fail('Six fouilles rémunérées par jour au maximum.');
    visit.compartments ??= [];
    visit.compartments.push(compartment);
    a.lootCount++;
    const coins =
      55 +
      (hashN(seed, p.x, p.y, compartment, Number(day.replaceAll('-', ''))) %
        31);
    a.fragments++;
    s.coins += coins;
    s.stats.earned += coins;
    return {
      ok: true,
      message: `Compartiment exploré : +${coins} pièces et un fragment de carte.`,
    };
  }
  if (action === 'decipher') {
    if (p.kind !== 'sanctuary' || a.story >= 3)
      return fail('Aucune inscription à déchiffrer.');
    if (a.storySites.includes(p.id))
      return fail('Cherchez un autre sanctuaire pour compléter l’histoire.');
    if (a.runes < 1)
      return fail(
        'Découvrez un nouveau lieu pour recueillir un fragment d’inscription.',
      );
    a.runes--;
    a.storySites.push(p.id);
    const text = STORY_TEXT[a.story];
    a.story++;
    return { ok: true, message: text };
  }
  if (action === 'sample') {
    if (p.kind !== 'vent') return fail('Aucune source ici.');
    if (ventHot(p, now))
      return fail(
        'La source est en éruption. Attendez que les bulles retombent.',
      );
    if (visit.day === day)
      return fail('Ce dépôt a déjà été prélevé aujourd’hui.');
    visit.day = day;
    a.fragments++;
    return {
      ok: true,
      message:
        'Pendant l’accalmie, vous retrouvez un fragment de carte dans les dépôts.',
    };
  }
  if (action === 'trap') {
    if (p.kind !== 'lagoon' || s.kit !== 'cage')
      return fail('Équipez un casier de lagon au port.');
    if (visit.trapDay === day)
      return fail('Laissez le lagon se renouveler jusqu’à demain.');
    if (a.trapDay !== day) {
      a.trapDay = day;
      a.traps = 0;
    }
    if (a.traps >= 3)
      return fail('Trois relevés de casier par jour au maximum.');
    if (holdFree(s) < 2)
      return fail('Libérez au moins deux unités dans la cale.');
    const rng = new Rng(hashN(seed, p.x, p.y, now, 902));
    const pool = SPECIES.filter(
      (sp) =>
        (sp.shape === 'shell' || sp.shape === 'shrimp') &&
        sp.biomes.includes(p.biome),
    );
    if (!pool.length)
      return fail('Ce lagon n’a pas de population adaptée au casier.');
    const sp = pool[rng.int(0, pool.length - 1)];
    for (let i = 0; i < 2; i++) {
      const f = rollSpecimen(
        rng,
        sp,
        1,
        p.biome,
        now,
        `trap-${p.id}-${now}-${i}`,
      );
      f.kg = Math.min(0.5, f.kg);
      f.size = 0;
      f.color = 0;
      f.tough = false;
      f.value = priceOf(f);
      applyCatch(s, f, 0, now);
    }
    visit.trapDay = day;
    a.traps++;
    return {
      ok: true,
      message:
        'Le casier remonte deux coquillages. Le lagon peut maintenant se reposer.',
    };
  }
  return fail('Action indisponible ici.');
}
export function chartOp(s: Save, seed: number): Op<{ message: string }> {
  const a = adventureOf(s);
  if (a.chart) return fail('Vous avez déjà une carte à suivre.');
  if (a.fragments < 3)
    return fail('Trois fragments de carte sont nécessaires.');
  let target: Landmark | undefined;
  for (let ring = 0; ring <= 4 && !target; ring++)
    for (let dy = -ring; dy <= ring && !target; dy++)
      for (let dx = -ring; dx <= ring && !target; dx++) {
        const p = landmarkAt(
          seed,
          Math.floor(s.x / 320) + dx,
          Math.floor(s.y / 320) + dy,
        );
        if (p && !a.points[p.id]) target = p;
      }
  if (!target)
    return fail(
      'Aucun nouveau lieu à révéler dans cette région. Explorez plus loin.',
    );
  a.fragments -= 3;
  a.chart = target;
  return {
    ok: true,
    message: `Carte reconstituée : ${target.name}, coordonnées ${Math.round(target.x)}, ${Math.round(target.y)}.`,
  };
}
