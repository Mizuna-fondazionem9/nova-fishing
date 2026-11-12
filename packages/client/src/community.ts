import './rod-guide.css';
import { renderRodGuide } from './rod-guide';
import './aquarium.css';
// Vitrine publique du Hub : mêmes sprites et catalogue que le jeu, lectures seules.
import { fishSprite, boatSprite } from './game/sprites';
import { mountAquarium } from './public-aquarium';
import {
  SPECIES_BY_ID,
  SIZE_NAMES,
  COLOR_NAMES,
  TRAIT_NAMES,
  RARITY_COLORS,
  VESSELS,
  THEME_NAMES,
  type SpecimenTrait,
} from '../../shared/src/index';

type Summary = {
  id: string;
  name: string;
  avatar: string | null;
  coins: number;
  caught: number;
  aquariumCount: number;
};
type Fish = {
  sp: string;
  len: number;
  kg: number;
  size: number;
  color: number;
  tough: boolean;
  trait?: SpecimenTrait;
  featured: boolean;
};
type Profile = Summary & {
  joinedAt: number;
  vessel: string;
  paint: number;
  stats: {
    caught: number;
    sold: number;
    earned: number;
    crits: number;
    maxKg: number;
    species: number;
    biomes: number;
    trophies: number;
    netted: number;
  };
  aquarium: { name: string; theme: string; fish: Fish[] };
};
const aquariumStyles = document.createElement('link');
aquariumStyles.rel = 'stylesheet';
aquariumStyles.href = new URL('./community.css', import.meta.url).href;
document.head.append(aquariumStyles);
const guide = document.getElementById('fishing-rod-guide');
if (guide) renderRodGuide(guide);
const root = document.getElementById('fishing-community');
const apiBase = new URL('./api/public/', import.meta.url);
const fmt = (n: number) =>
  n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function link(text: string, url: string, cls = ''): HTMLAnchorElement {
  const a = el('a', cls, text);
  a.href = url;
  return a;
}
function profileUrl(id: string): string {
  return '/nova-fishing/joueurs/' + encodeURIComponent(id);
}
async function api<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(path, apiBase);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok)
    throw new Error(
      res.status === 404
        ? 'Ce pêcheur est introuvable.'
        : res.status === 429
          ? 'Trop de consultations. Réessaie dans un instant.'
          : 'La capitainerie est momentanément indisponible. Réessaie dans un instant.',
    );
  return res.json();
}
function avatar(p: Summary): HTMLElement {
  const box = el(
    'span',
    'angler-avatar',
    p.name.slice(0, 1).toLocaleUpperCase('fr'),
  );
  if (p.avatar) {
    try {
      const url = new URL(p.avatar);
      if (
        url.protocol === 'https:' &&
        ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
      ) {
        const img = el('img');
        img.src = url.href;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => img.remove());
        box.append(img);
      }
    } catch {
      /* avatar absent */
    }
  }
  return box;
}
function sprite(
  source: HTMLCanvasElement,
  label: string,
  maxW = 120,
  maxH = 64,
): HTMLCanvasElement {
  const c = el('canvas', 'public-sprite');
  c.width = source.width;
  c.height = source.height;
  c.getContext('2d')!.drawImage(source, 0, 0);
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', label);
  const scale = Math.min(maxW / source.width, maxH / source.height, 3);
  c.style.width = `${source.width * scale}px`;
  c.style.height = `${source.height * scale}px`;
  return c;
}
function metric(label: string, value: string): HTMLElement {
  const d = el('div');
  d.append(el('dt', '', label), el('dd', '', value));
  return d;
}
function status(text: string, failed = false): HTMLElement {
  const p = el(
    'p',
    failed ? 'community-status failed' : 'community-status',
    text,
  );
  p.setAttribute('role', 'status');
  return p;
}
function errorBox(error: unknown, retry: () => void): HTMLElement {
  const box = el('div', 'community-empty');
  box.append(
    status(
      error instanceof Error
        ? error.message
        : 'Impossible de charger cette page.',
      true,
    ),
  );
  const b = el('button', 'bouton fantome', 'Réessayer');
  b.type = 'button';
  b.onclick = retry;
  box.append(b);
  return box;
}
async function leaderboard(host: HTMLElement): Promise<void> {
  const form = el('form', 'angler-search');
  form.setAttribute('role', 'search');
  const input = el('input');
  input.type = 'search';
  input.maxLength = 80;
  input.placeholder = 'Chercher un pêcheur…';
  input.setAttribute('aria-label', 'Pseudo du pêcheur');
  const submit = el('button', 'bouton fantome', 'Rechercher');
  submit.type = 'submit';
  form.append(input, submit);
  const list = el('div', 'angler-list');
  list.setAttribute('aria-live', 'polite');
  const pagination = el('div', 'community-pagination');
  pagination.setAttribute('aria-label', 'Pages du classement');
  const prev = el('button', 'bouton fantome', '← Précédent'),
    next = el('button', 'bouton fantome', 'Suivant →'),
    page = el('span');
  prev.type = next.type = 'button';
  pagination.append(prev, page, next);
  host.replaceChildren(form, list, pagination);
  let offset = 0,
    query = '',
    loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    submit.disabled = prev.disabled = next.disabled = true;
    list.setAttribute('aria-busy', 'true');
    list.replaceChildren(status('Les registres du port s’ouvrent…'));
    let more = false;
    try {
      const data = await api<{
        players: Summary[];
        hasMore: boolean;
        ranked: boolean;
      }>('leaderboard', { offset: String(offset), q: query });
      more = data.hasMore;
      list.replaceChildren();
      if (!data.players.length)
        list.append(
          status(
            query
              ? 'Aucun pêcheur ne correspond à ce pseudo.'
              : 'Le registre est encore vide. La première fortune sera peut-être la tienne.',
          ),
        );
      for (const [i, p] of data.players.entries()) {
        const row = link('', profileUrl(p.id), 'angler-row');
        row.setAttribute(
          'aria-label',
          `${p.name}, ${fmt(p.coins)} pièces, visiter le profil et l’aquarium`,
        );
        const rank = el(
          'span',
          'angler-rank',
          data.ranked ? String(offset + i + 1).padStart(2, '0') : '·',
        );
        const who = el('span', 'angler-who');
        who.append(
          el('b', '', p.name),
          el(
            'small',
            '',
            `${fmt(p.caught)} prises · ${p.aquariumCount} pensionnaires`,
          ),
        );
        const wealth = el('span', 'angler-wealth');
        wealth.append(el('b', '', fmt(p.coins)), el('small', '', 'pièces'));
        row.append(
          rank,
          avatar(p),
          who,
          wealth,
          el('span', 'angler-arrow', '↗'),
        );
        list.append(row);
      }
      page.textContent = `Page ${Math.floor(offset / 24) + 1}`;
    } catch (error) {
      list.replaceChildren(errorBox(error, () => void load()));
      page.textContent = '';
    } finally {
      loading = false;
      submit.disabled = false;
      prev.disabled = offset === 0;
      next.disabled = !more;
      list.removeAttribute('aria-busy');
    }
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    query = input.value.trim();
    offset = 0;
    void load();
  };
  prev.onclick = () => {
    if (!loading) {
      offset = Math.max(0, offset - 24);
      void load();
    }
  };
  next.onclick = () => {
    if (!loading) {
      offset += 24;
      void load();
    }
  };
  await load();
}
async function profile(host: HTMLElement, id: string): Promise<void> {
  host.setAttribute('aria-busy', 'true');
  host.replaceChildren(status('Le jardin marin se dévoile…'));
  try {
    const p = await api<Profile>('profile', { id });
    document.title = `${p.name} · Aquarium · Nova Fishing`;
    const hero = el('div', 'angler-profile');
    const identity = el('div', 'angler-identity'),
      heading = el('div');
    heading.append(
      el('p', 'surtitre', 'Carnet de pêcheur'),
      el('h1', '', p.name),
    );
    const joined = new Date(p.joinedAt).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    heading.append(el('p', '', `En mer depuis ${joined}`));
    identity.append(avatar(p), heading);
    const vessel = el('div', 'public-vessel');
    vessel.append(
      sprite(boatSprite(0, p.vessel, p.paint), 'Bateau de ' + p.name, 140, 90),
      el(
        'span',
        '',
        VESSELS.find((v) => v.id === p.vessel)?.name ?? 'Barque Nova',
      ),
    );
    hero.append(identity, vessel);
    const stats = el('dl', 'public-stats');
    for (const [label, value] of [
      ['Fortune actuelle', fmt(p.coins) + ' pièces'],
      ['Prises', fmt(p.stats.caught)],
      ['Espèces découvertes', fmt(p.stats.species)],
      ['Coups critiques', fmt(p.stats.crits)],
      [
        'Record de poids',
        p.stats.maxKg.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) +
          ' kg',
      ],
      ['Trophées', fmt(p.stats.trophies)],
      ['Gains cumulés', fmt(p.stats.earned) + ' pièces'],
      ['Biomes visités', fmt(p.stats.biomes)],
    ])
      stats.append(metric(label, value));
    const tankSection = el('section', 'public-aquarium');
    const top = el('div', 'community-title');
    top.append(
      el('h2', '', p.aquarium.name),
      el(
        'span',
        '',
        `${p.aquarium.fish.length} pensionnaires · ${THEME_NAMES[p.aquarium.theme] ?? THEME_NAMES.sand}`,
      ),
    );
    tankSection.append(top);
    const theme = p.aquarium.theme in THEME_NAMES ? p.aquarium.theme : 'sand';
    const tank = el('div', 'nova-aquarium');
    tank.setAttribute('aria-label', 'Aquarium de ' + p.name);
    mountAquarium(tank, theme, p.aquarium.fish);
    if (!p.aquarium.fish.length)
      tank.append(
        el(
          'p',
          'aquarium-empty',
          'Ce jardin marin attend encore ses premiers pensionnaires.',
        ),
      );
    tankSection.append(
      tank,
      el(
        'p',
        'community-note',
        'Les poissons exposés sont les véritables spécimens conservés par ce joueur.',
      ),
    );
    const collection = el('div', 'public-fish-grid');
    for (const f of p.aquarium.fish) {
      const sp = SPECIES_BY_ID[f.sp];
      if (!sp) continue;
      const card = el('article', 'public-fish-card');
      card.style.setProperty('--fish-rarity', RARITY_COLORS[sp.rarity]);
      card.append(
        sprite(fishSprite(sp, f.color), sp.name),
        el('h3', '', sp.name),
      );
      const variants = [
        SIZE_NAMES[f.size],
        COLOR_NAMES[f.color],
        f.tough ? 'Coriace' : '',
        f.trait ? TRAIT_NAMES[f.trait] : '',
      ].filter(Boolean);
      card.append(
        el('p', 'fish-variants', variants.join(' · ') || 'Forme naturelle'),
      );
      card.append(
        el(
          'p',
          '',
          `${f.len.toLocaleString('fr-FR')} cm · ${f.kg.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} kg`,
        ),
      );
      if (f.featured)
        card.append(el('span', 'featured-badge', 'Pièce maîtresse'));
      collection.append(card);
    }
    tankSection.append(collection);
    const share = el('button', 'bouton fantome', 'Copier le lien du profil');
    share.type = 'button';
    share.onclick = async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        share.textContent = 'Lien copié';
      } catch {
        share.textContent = 'Copie l’adresse dans la barre du navigateur';
      }
    };
    host.replaceChildren(hero, stats, share, tankSection);
  } catch (error) {
    host.replaceChildren(errorBox(error, () => void profile(host, id)));
  } finally {
    host.removeAttribute('aria-busy');
  }
}
if (root) {
  const id = root.dataset.profile;
  if (id) void profile(root, id);
  else void leaderboard(root);
}
