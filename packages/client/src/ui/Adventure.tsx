import { useEffect, useState } from 'react';
import {
  THEME_NAMES,
  newAdventure,
  nearbyLandmarks,
  landmarkById,
  POINT_LABELS,
  ventHot,
  STORY_TEXT,
  KIT_DEFS,
  BAITS,
  COLLECTIONS,
  collectionProgress,
  dayKey,
  type Landmark,
} from '../../../shared/src/index';
import { useStore, setState, serverNow, portOp } from '../store';
import { rt, Modal, Help, Coins, Bar, FishIcon, speciesOf } from './common';
import { sfx } from '../game/audio';

const ICONS = { wreck: '⚓', sanctuary: '◈', lagoon: '◌', vent: '♨' };
function useClock() {
  const [n, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((v) => v + 1), 500);
    return () => clearInterval(id);
  }, []);
  return n;
}
function useAction() {
  const [busy, set] = useState(false);
  const run = async (path: string, body: unknown) => {
    if (busy) return false;
    set(true);
    try {
      return await portOp(path, body);
    } finally {
      set(false);
    }
  };
  return { busy, run };
}
function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="adventure-heading">{children}</h3>;
}
export function Captaincy() {
  const save = useStore((s) => s.save)!;
  const a = save.adventure ?? newAdventure();
  const { busy, run } = useAction();
  const op = (action: string, value: string) => void run('/api/port/adventure', { action, value });
  return <div className="adventure-section">
    <button className="journal-link" onClick={()=>setState({panel:'journal',journalTab:'contracts',landmarkId:null})}>Contrats et réputation → Journal de bord</button>

        <>
          <Heading>Matériel spécialisé</Heading>
          <Help label="Choisir un montage">
            Un seul montage équipé. Les avantages ont un coût ; la canne et ses
            améliorations restent conservées.
          </Help>
          {KIT_DEFS.map((k) => (
            <article className="uprow" key={k.id}>
              <div className="info">
                <b>{k.name}</b>
                <p>{k.desc}</p>
              </div>
              <button
                disabled={busy || (save.kit ?? 'standard') === k.id}
                onClick={() => op('kit', k.id)}
              >
                {(save.kit ?? 'standard') === k.id ? (
                  'Équipé'
                ) : a.kits.includes(k.id) ? (
                  'Équiper'
                ) : (
                  <Coins n={k.price} />
                )}
              </button>
            </article>
          ))}
          <Heading>Appâts</Heading>
          <Help label="Utiliser les appâts">
            Une unité consommée par lancer. Un appât ne change pas la silhouette
            visée et ne garantit aucune espèce.
          </Help>
          <button
            disabled={busy || !a.bait}
            onClick={() => op('bait-select', 'none')}
          >
            Pêcher sans appât
          </button>
          {BAITS.map((b) => (
            <article className="contract-card" key={b.id}>
              <div>
                <b>
                  {b.name} · {a.baits[b.id] ?? 0} en réserve
                </b>
                <p>{b.desc}</p>
              </div>
              <div className="row">
                <button
                  disabled={
                    busy || save.coins < b.price || (a.baits[b.id] ?? 0) >= 20
                  }
                  onClick={() => op('bait-buy', b.id)}
                >
                  Acheter <Coins n={b.price} />
                </button>
                <button
                  aria-pressed={a.bait === b.id}
                  disabled={busy || (a.baits[b.id] ?? 0) === 0}
                  onClick={() => op('bait-select', b.id)}
                >
                  {a.bait === b.id ? 'Sélectionné' : 'Utiliser'}
                </button>
              </div>
            </article>
          ))}
        </>
</div>;
}

function setCourse(p: Landmark) {
  if (rt.game?.goTo(p.x, p.y)) setState({ panel: null });
}
export function ExplorationContent() {
  const save = useStore((s) => s.save)!,
    seed = useStore((s) => s.seed),
    hud = useStore((s) => s.hud),
    selected = useStore((s) => s.landmarkId);
  const a = save.adventure ?? newAdventure();
  useClock();
  const { busy, run } = useAction();
  const nearby = nearbyLandmarks(seed, save.x, save.y).filter(
    (p) => Math.hypot(p.x - save.x, p.y - save.y) < 50,
  );
  const point = selected ? landmarkById(seed, selected) : null;
  const act = async (action: string, value = '') => {
    await rt.game?.sync();
    if (await run('/api/landmark', { id: point?.id ?? 'none', action, value }))
      sfx('port');
  };
  if (point) {
    const visited = a.points[point.id],
      distance = Math.hypot(
        point.x - (hud?.x ?? save.x),
        point.y - (hud?.y ?? save.y),
      ),
      near = distance < 8 && !hud?.danger;
    const hot = point.kind === 'vent' && ventHot(point, serverNow());
    return (
      <Modal
        title={point.name}
        onClose={() => setState({ landmarkId: null })}
        wide
      >
        <div className={`landmark-art ${point.kind}`} aria-hidden="true">
          <span>{ICONS[point.kind]}</span>
          <small>{POINT_LABELS[point.kind]}</small>
        </div>
        <p className="landmark-description">{point.text}</p>
        <div className="row between">
          <span className="note">
            X {Math.round(point.x)} · Y {Math.round(point.y)} ·{' '}
            {Math.round(distance)} tuiles
          </span>
          <button onClick={() => setCourse(point)}>Tracer un cap</button>
        </div>
        {!near && (
          <p className="note">
            Approchez à moins de huit tuiles et terminez toute rencontre hostile
            pour explorer.
          </p>
        )}
        <button disabled={busy || !near} onClick={() => void act('inspect')}>
          {visited ? 'Examiner le lieu' : 'Découvrir le lieu'}
        </button>
        {point.kind === 'wreck' && (
          <>
            <Heading>Trois compartiments</Heading>
            <p className="note">
              Pièces et fragments de carte. Une fouille par compartiment et par
              jour, six fouilles rémunérées au total par jour.
            </p>
            <div className="adventure-tabs">
              {['Cabine', 'Soute', 'Cartothèque'].map((name, i) => (
                <button
                  key={name}
                  disabled={
                    busy ||
                    !near ||
                    (visited?.day === dayKey(serverNow()) &&
                      visited.compartments?.includes(i))
                  }
                  onClick={() => void act('loot', String(i))}
                >
                  {name}
                </button>
              ))}
            </div>
          </>
        )}
        {point.kind === 'sanctuary' && (
          <>
            <Heading>Les inscriptions des Veilleurs</Heading>
            <p className="note">
              Une inscription par sanctuaire. Chaque étape utilise un fragment
              recueilli en découvrant un lieu différent.
            </p>
            <button
              disabled={
                busy ||
                !near ||
                a.runes < 1 ||
                a.story >= 3 ||
                a.storySites.includes(point.id)
              }
              onClick={() => void act('decipher')}
            >
              Déchiffrer · {a.story} / 3
            </button>
          </>
        )}
        {point.kind === 'lagoon' && (
          <>
            <p className="note">
              Dans un rayon de dix-huit tuiles, les couleurs rares sont deux
              fois plus probables. Elles restent rares.
            </p>
            <button
              disabled={
                busy ||
                !near ||
                save.kit !== 'cage' ||
                visited?.trapDay === dayKey(serverNow())
              }
              onClick={() => void act('trap')}
            >
              Relever le casier · 2 petites prises
            </button>
            <p className="note">
              Montage casier requis. Un relevé par lagon et trois par jour au
              maximum.
            </p>
          </>
        )}
        {point.kind === 'vent' && (
          <>
            <p className={hot ? 'warn' : 'ok'} role="status">
              {hot
                ? '♨ Poussée de chaleur — attendez l’accalmie.'
                : 'Accalmie — les dépôts sont accessibles.'}
            </p>
            <button
              disabled={
                busy || !near || hot || visited?.day === dayKey(serverNow())
              }
              onClick={() => void act('sample')}
            >
              Examiner les dépôts · une fois par jour
            </button>
          </>
        )}
        {a.story > 0 && (
          <section className="lore-card">
            {STORY_TEXT.slice(0, a.story).map((t) => (
              <p key={t}>{t}</p>
            ))}
          </section>
        )}
      </Modal>
    );
  }
  const known = Object.values(a.points).sort((x, y) => y.at - x.at);
  return (
    <div className="exploration-content">

      <div className="expedition-summary">
        <span>
          <b>{known.length}</b> lieux découverts
        </span>
        <span>
          <b>{a.fragments}</b> fragments de carte
        </span>
        <span>
          <b>{a.runes}</b> inscriptions
        </span>
      </div>
      <button
        disabled={busy || a.fragments < 3 || !!a.chart}
        onClick={() => void act('chart')}
      >
        Reconstituer une carte · 3 fragments
      </button>
      {a.chart && (
        <article className="chart-card">
          <b>Destination révélée : {a.chart.name}</b>
          <p>
            X {Math.round(a.chart.x)} · Y {Math.round(a.chart.y)}
          </p>
          <button onClick={() => setCourse(a.chart!)}>Suivre la carte</button>
        </article>
      )}
      {nearby.some((p) => !a.points[p.id]) && (
        <>
          <Heading>Aperçus dans les parages</Heading>
          <div className="landmark-grid">
            {nearby
              .filter((p) => !a.points[p.id])
              .map((p) => (
                <PointCard key={p.id} p={p} />
              ))}
          </div>
        </>
      )}
      <Heading>Lieux découverts</Heading>
      {!known.length && (
        <p className="empty">
          Cherchez des mâts brisés, des colonnes, des anses abritées ou des
          fumerolles. Les découvertes s’inscrivent aussi sur la carte.
        </p>
      )}
      <div className="landmark-grid">
        {known.map((v) => (
          <PointCard key={v.point.id} p={v.point} />
        ))}
      </div>
      {a.story > 0 && (
        <section className="lore-card">
          <Heading>Histoire retrouvée · {a.story} / 3</Heading>
          {STORY_TEXT.slice(0, a.story).map((t) => (
            <p key={t}>{t}</p>
          ))}
        </section>
      )}
    </div>
  );
}
function PointCard({ p }: { p: Landmark }) {
  return (
    <button
      className={`point-card ${p.kind}`}
      onClick={() => setState({ landmarkId: p.id, journalTab: 'quests' })}
    >
      <span aria-hidden="true">{ICONS[p.kind]}</span>
      <b>{p.name}</b>
      <small>
        {POINT_LABELS[p.kind]} · {Math.round(p.x)}, {Math.round(p.y)}
      </small>
    </button>
  );
}
export function AquariumWorkshop() {
  const save = useStore((s) => s.save)!,
    hud = useStore((s) => s.hud),
    a = save.adventure ?? newAdventure();
  const [name, setName] = useState(a.aquarium.name);
  const { busy, run } = useAction();
  const op = (action: string, value: string) =>
    void run('/api/port/adventure', { action, value });
  const themes = [
    ['sand', 'Sable doux'],
    ...COLLECTIONS.filter((c) => a.rewards.includes(c.id)).map((c) => [
      c.theme,
      THEME_NAMES[c.theme],
    ]),
    ...(a.rewards.includes('harbor') ? [['harbor', 'Souvenirs du port']] : []),
    ...(a.story >= 3 ? [['ancient', 'Jardin des Anciens']] : []),
  ];
  return (
    <div className="adventure-section">
      <Heading>Votre aquarium</Heading>
      <Help label="Personnaliser le bassin">Renommage et décors au port. Les collections débloquent des décors permanents.</Help>
      <div className="aquarium-name">
        <input
          aria-label="Nom de l’aquarium"
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          disabled={busy || !hud?.port || !name.trim()}
          onClick={() => op('aquarium-name', name)}
        >
          Renommer
        </button>
      </div>
      <div className="theme-picker">
        {themes.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={a.aquarium.theme === id}
            disabled={busy || !hud?.port}
            onClick={() => op('aquarium-theme', id)}
          >
            {label}
          </button>
        ))}
      </div>
      <Heading>Collections</Heading>
      <div className="collection-grid">
        {COLLECTIONS.map((c) => (
          <article
            className={`collection-card ${a.rewards.includes(c.id) ? 'complete' : ''}`}
            key={c.id}
          >
            <b>{c.name}</b>
            <p>{c.desc}</p>
            <Bar
              value={collectionProgress(save, c.id)}
              max={c.goal}
              color="#c7a974"
              label={`${Math.min(c.goal, collectionProgress(save, c.id))} / ${c.goal}`}
            />
            <button
              disabled={
                busy ||
                !hud?.port ||
                a.rewards.includes(c.id) ||
                collectionProgress(save, c.id) < c.goal
              }
              onClick={() => op('collection', c.id)}
            >
              {a.rewards.includes(c.id)
                ? 'Décor débloqué'
                : 'Recevoir le décor au port'}
            </button>
          </article>
        ))}
      </div>
      {save.aquarium.length > 0 && (
        <>
          <Heading>Mettre une prise à l’honneur</Heading>
          <div className="featured-grid">
            {save.aquarium.map((f) => (
              <button
                key={f.uid}
                aria-pressed={a.aquarium.featured === f.uid}
                disabled={busy || !hud?.port}
                onClick={() => op('featured', f.uid)}
              >
                <FishIcon sp={speciesOf(f)} color={f.color} />
                <small>{speciesOf(f).name}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
