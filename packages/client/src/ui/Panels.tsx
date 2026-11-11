import { useMemo, useState, type ReactNode } from 'react';
import {
  BIOMES, BIOME_IDS, NETS, RARITY_COLORS, SILHOUETTE_NAMES, SPECIES, TROPHIES, UPGRADES,
  bulkOf, cargoBulk, dayKey, depthMeters, gearOf, gearTier, priceOf, upgradeCost,
  type Specimen, type Species, type UpgradeDef,
} from '../../../shared/src/index';
import { useStore, setState, getState, portOp, api, serverNow, toast, BASE } from '../store';
import { setSound, sfx } from '../game/audio';
import { rt, Modal, Bar, Coins, FishIcon, Rarity, Tags, speciesOf, fmt, fmt1, fmtKg, fmtLen } from './common';

/** Empêche les doubles clics pendant qu'une requête est en cours (le serveur protège aussi de son côté). */
function useBusy(): [boolean, (fn: () => Promise<unknown>) => void] {
  const [busy, setBusy] = useState(false);
  return [busy, (fn) => {
    if (busy) return;
    setBusy(true);
    void fn().finally(() => setBusy(false));
  }];
}

function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={id === value} className={id === value ? 'on' : ''} onClick={() => { sfx('click'); onChange(id); }}>{label}</button>
      ))}
    </div>
  );
}

/** Titre de section : petit, en capitales, avec un compteur éventuel à droite. */
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="block">
      <h3><span>{title}</span>{aside !== undefined && <small>{aside}</small>}</h3>
      {children}
    </section>
  );
}

function FishRow({ f, children }: { f: Specimen; children?: ReactNode }) {
  const sp = speciesOf(f);
  return (
    <div className="fishrow">
      <div className="pic"><FishIcon sp={sp} color={f.color} scale={2} /></div>
      <div className="info">
        <div className="name"><b style={{ color: RARITY_COLORS[sp.rarity] }}>{sp.name}</b><Tags f={f} /></div>
        <div className="meta">
          <span>{fmtKg(f.kg)}</span><span>{fmtLen(f.len)}</span><span>Encombrement {bulkOf(f.kg)}</span>
        </div>
      </div>
      <div className="price"><Coins n={priceOf(f)} /></div>
      <div className="actions">{children}</div>
    </div>
  );
}

// ---------- Port ----------

function UpgradeRow({ u }: { u: UpgradeDef }) {
  const save = useStore((s) => s.save)!;
  const [busy, run] = useBusy();
  const lvl = save.up[u.key] ?? 0;
  const max = lvl >= u.max;
  const cost = upgradeCost(u.key, lvl);
  const locked = u.key === 'nets' && save.net === 0;
  return (
    <div className="uprow">
      <div className="info">
        <div className="name"><b>{u.name}</b><span className="lvl">Niveau {lvl}</span></div>
        <p>{u.desc}</p>
        <div className="eff">{u.fmt(u.effect(lvl))}{!max && <><i className="arrow" aria-label="devient" /><b>{u.fmt(u.effect(lvl + 1))}</b></>}</div>
      </div>
      <button className="buy" data-testid={`up-${u.key}`} disabled={busy || max || locked || save.coins < cost} onClick={() => run(async () => { if (await portOp('/api/port/upgrade', { key: u.key })) sfx('coin'); })}>
        {max ? 'Maximum' : locked ? 'Filet requis' : <><span className="over">Améliorer</span><Coins n={cost} /></>}
      </button>
    </div>
  );
}

function SellTab() {
  const save = useStore((s) => s.save)!;
  const [busy, run] = useBusy();
  const total = save.cargo.reduce((a, f) => a + priceOf(f), 0);
  const g = gearOf(save.up);
  const aquaFull = save.aquarium.length >= g.aquarium;
  if (!save.cargo.length) return <p className="empty">La cale est vide. Les poissons capturés apparaîtront ici.</p>;
  return (
    <Section title="Cale" aside={`${cargoBulk(save)} / ${g.hold} unités`}>
      <button className="big wide" data-testid="sell-all" disabled={busy} onClick={() => run(async () => { if (await portOp('/api/port/sell', { uids: 'all' })) sfx('coin'); })}>
        Tout vendre <Coins n={total} />
      </button>
      {save.cargo.map((f) => (
        <FishRow key={f.uid} f={f}>
          <button disabled={busy} onClick={() => run(async () => { if (await portOp('/api/port/sell', { uids: [f.uid] })) sfx('coin'); })}>Vendre</button>
          <button data-testid="keep" disabled={busy || aquaFull} title={aquaFull ? 'Aquarium plein' : 'Exposer dans l’aquarium'} onClick={() => run(() => portOp('/api/port/keep', { uid: f.uid }))}>Garder</button>
        </FishRow>
      ))}
    </Section>
  );
}

function YardTab() {
  const save = useStore((s) => s.save)!;
  const [busy, run] = useBusy();
  const g = gearOf(save.up);
  const missing = Math.max(0, g.hullMax - save.hull);
  const cost = Math.ceil(missing * g.repairCost);
  return (
    <>
      <Section title="Réparations">
        <div className="uprow">
          <div className="info">
            <div className="name"><b>Coque</b></div>
            <Bar value={save.hull} max={g.hullMax} color="#6fe3a1" label={`${Math.round(save.hull)} / ${g.hullMax}`} />
            <p>{missing > 0 ? 'Réparation partielle si vous n’avez pas assez de pièces.' : 'La coque est en parfait état.'}</p>
          </div>
          <button className="buy" disabled={busy || missing <= 0 || save.coins < g.repairCost} onClick={() => run(() => portOp('/api/port/repair'))}>
            {missing > 0 ? <><span className="over">Réparer</span><Coins n={cost} /></> : 'Intacte'}
          </button>
        </div>
      </Section>
      <Section title="Bateau">
        {UPGRADES.filter((u) => u.group === 'boat').map((u) => <UpgradeRow key={u.key} u={u} />)}
      </Section>
      <Section title="Filets">
        <p className="note">Un filet capture tout seul de petits poissons communs pendant que vous naviguez. Jamais les grosses pièces.</p>
        {NETS.map((n, i) => n && (
          <div className="uprow" key={i}>
            <div className="info"><div className="name"><b>{n.name}</b></div><p>{n.desc}</p></div>
            <button className="buy" disabled={busy || save.net >= i || save.net !== i - 1 || save.coins < n.price} onClick={() => run(async () => { if (await portOp('/api/port/buy-net', { tier: i })) sfx('coin'); })}>
              {save.net >= i ? 'Possédé' : <><span className="over">Acheter</span><Coins n={n.price} /></>}
            </button>
          </div>
        ))}
      </Section>
    </>
  );
}

function AquariumList({ atPort }: { atPort: boolean }) {
  const save = useStore((s) => s.save)!;
  const [busy, run] = useBusy();
  if (!save.aquarium.length) return <p className="empty">Aucun poisson exposé. Au port, choisissez « Garder » sur une prise de votre cale.</p>;
  return (
    <>
      {save.aquarium.map((f) => (
        <FishRow key={f.uid} f={f}>
          {atPort && <button disabled={busy} onClick={() => run(() => portOp('/api/port/sell', { uids: [f.uid], from: 'aquarium' }))}>Vendre</button>}
          <button disabled={busy} onClick={() => run(() => portOp('/api/release', { uid: f.uid, from: 'aquarium' }))}>Relâcher</button>
        </FishRow>
      ))}
    </>
  );
}

export function PortPanel() {
  const hud = useStore((s) => s.hud);
  const save = useStore((s) => s.save)!;
  const [tab, setTab] = useState<'sell' | 'yard' | 'rod' | 'aqua'>('sell');
  if (!hud?.port) {
    return <Modal title="Port"><p className="empty">Vous avez quitté le quai. Revenez à l’arrêt près du ponton pour accéder au port.</p></Modal>;
  }
  return (
    <Modal
      title={hud.port.name}
      wide
      top={
        <>
          <div className="balance"><span className="k">Votre bourse</span><Coins n={save.coins} /></div>
          <Tabs tabs={[['sell', 'Criée'], ['yard', 'Chantier'], ['rod', 'Atelier'], ['aqua', 'Aquarium']]} value={tab} onChange={setTab} />
        </>
      }
    >
      {tab === 'sell' && <SellTab />}
      {tab === 'yard' && <YardTab />}
      {tab === 'rod' && (
        <Section title="Canne à pêche">
          {UPGRADES.filter((u) => u.group === 'rod').map((u) => <UpgradeRow key={u.key} u={u} />)}
        </Section>
      )}
      {tab === 'aqua' && (
        <>
          <Section title="Bassins">
            {UPGRADES.filter((u) => u.group === 'aquarium').map((u) => <UpgradeRow key={u.key} u={u} />)}
          </Section>
          <Section title="Poissons exposés" aside={`${save.aquarium.length} / ${gearOf(save.up).aquarium}`}>
            <AquariumList atPort />
          </Section>
        </>
      )}
    </Modal>
  );
}

// ---------- Cale et équipement (consultable partout) ----------

export function ShipPanel() {
  const save = useStore((s) => s.save)!;
  const [busy, run] = useBusy();
  const g = gearOf(save.up);
  return (
    <Modal title="Cale et équipement" wide>
      <Section title="Cale" aside={`${cargoBulk(save)} / ${g.hold} unités`}>
        {!save.cargo.length && <p className="empty">La cale est vide.</p>}
        {save.cargo.map((f) => (
          <FishRow key={f.uid} f={f}>
            <button disabled={busy} title="Remettre à l’eau pour libérer de la place" onClick={() => run(() => portOp('/api/release', { uid: f.uid, from: 'cargo' }))}>Relâcher</button>
          </FishRow>
        ))}
        <p className="note">La vente, les améliorations et l’aquarium se font au port. En cas de naufrage, la cale est perdue.</p>
      </Section>
      <Section title="Équipement">
        <dl className="facts">
          <div><dt>Canne</dt><dd>★{fmt1(gearTier(g.rod))}</dd></div>
          <div><dt>Puissance</dt><dd>{fmt1(g.rod.power)}</dd></div>
          <div><dt>Résistance</dt><dd>{fmt1(g.rod.resistance)}</dd></div>
          <div><dt>Ligne</dt><dd>{g.rod.line}</dd></div>
          <div><dt>Vitesse</dt><dd>{fmt1(g.speed)} tuiles/s</dd></div>
          <div><dt>Coque</dt><dd>{g.hullMax} PC</dd></div>
          <div><dt>Filet</dt><dd>{NETS[save.net]?.name ?? 'Aucun'}</dd></div>
          <div><dt>Aquarium</dt><dd>{g.aquarium} places</dd></div>
        </dl>
      </Section>
      <Section title="Niveaux d’amélioration">
        <div className="uplist">
          {UPGRADES.map((u) => <span key={u.key} className="chip">{u.name}<b>{save.up[u.key] ?? 0}</b></span>)}
        </div>
      </Section>
    </Modal>
  );
}

// ---------- Bestiaire ----------

function SpeciesCard({ sp, onPick }: { sp: Species; onPick: (s: Species) => void }) {
  const entry = useStore((s) => s.save!.bestiary[sp.id]);
  return (
    <button className={`spcard ${entry ? '' : 'unknown'}`} onClick={() => entry && onPick(sp)} disabled={!entry} style={entry ? { borderColor: RARITY_COLORS[sp.rarity] } : undefined}>
      <FishIcon sp={sp} scale={2} hidden={!entry} />
      <span>{entry ? sp.name : 'Inconnu'}</span>
      {entry && <small>×{entry.n}</small>}
    </button>
  );
}

export function BestiaryPanel() {
  const bestiary = useStore((s) => s.save!.bestiary);
  const [pick, setPick] = useState<Species | null>(null);
  const groups = useMemo(() => BIOME_IDS.map((b) => [b, SPECIES.filter((s) => s.biomes[0] === b)] as const), []);
  const known = Object.keys(bestiary).length;
  if (pick) {
    const e = bestiary[pick.id];
    return (
      <Modal title="Bestiaire" onClose={() => setPick(null)}>
        <div className="showcase"><FishIcon sp={pick} scale={4} animate /></div>
        <h3 className="species" style={{ color: RARITY_COLORS[pick.rarity] }}>{pick.name}</h3>
        <p className="tags"><Rarity r={pick.rarity} /><span className="tag">{SILHOUETTE_NAMES[pick.sil]}</span></p>
        <p className="desc">{pick.desc}</p>
        <dl className="facts">
          <div><dt>Captures</dt><dd>{e.n}</dd></div>
          <div><dt>Plus grand</dt><dd>{fmtLen(e.maxLen)}</dd></div>
          <div><dt>Poids record</dt><dd>{fmtKg(e.maxKg)}</dd></div>
          <div><dt>Profondeur</dt><dd>{depthMeters(pick.dmin)} à {depthMeters(pick.dmax)} m</dd></div>
          <div className="full"><dt>Biomes connus</dt><dd>{e.biomes.map((b) => BIOMES[b].name).join(', ')}</dd></div>
        </dl>
        <button className="big wide" onClick={() => setPick(null)}>Retour</button>
      </Modal>
    );
  }
  return (
    <Modal
      title="Bestiaire"
      wide
      top={<div className="balance"><span className="k">Espèces découvertes</span><b className="num">{known} / {SPECIES.length}</b><Bar value={known} max={SPECIES.length} color="#a05cf0" /></div>}
    >
      {groups.map(([b, list]) => (
        <Section key={b} title={BIOMES[b].name} aside={`${list.filter((s) => bestiary[s.id]).length} / ${list.length}`}>
          <div className="spgrid">{list.map((sp) => <SpeciesCard key={sp.id} sp={sp} onPick={setPick} />)}</div>
        </Section>
      ))}
    </Modal>
  );
}

// ---------- Aquarium ----------

function Tank({ fish }: { fish: Specimen[] }) {
  return (
    <div className="tank">
      <div className="sand" />
      {fish.map((f, i) => {
        const sp = speciesOf(f);
        const big = sp.lmax > 400 ? 3 : sp.lmax > 120 ? 2.5 : 2;
        return (
          <div key={f.uid} className="swim" style={{ top: `${8 + ((i * 37) % 70)}%`, animationDuration: `${14 + ((i * 7) % 12)}s`, animationDelay: `${-((i * 5) % 20)}s` }} title={sp.name}>
            <FishIcon sp={sp} color={f.color} scale={big} animate />
          </div>
        );
      })}
      {[12, 30, 55, 78, 90].map((x, i) => <span key={x} className="bubble" style={{ left: `${x}%`, animationDelay: `${i * 1.3}s` }} />)}
    </div>
  );
}

export function AquariumPanel() {
  const save = useStore((s) => s.save)!;
  const hud = useStore((s) => s.hud);
  const cap = gearOf(save.up).aquarium;
  return (
    <Modal title="Aquarium" wide>
      <Tank fish={save.aquarium} />
      <Section title="Poissons exposés" aside={`${save.aquarium.length} / ${cap}`}>
        <AquariumList atPort={!!hud?.port} />
        <p className="note">Les bassins s’agrandissent au port, onglet Aquarium.</p>
      </Section>
    </Modal>
  );
}

// ---------- Trophées ----------

export function TrophiesPanel() {
  const save = useStore((s) => s.save)!;
  const got = TROPHIES.filter((t) => save.trophies[t.id]).length;
  const st = save.stats;
  return (
    <Modal
      title="Trophées"
      wide
      top={<div className="balance"><span className="k">Débloqués</span><b className="num">{got} / {TROPHIES.length}</b><Bar value={got} max={TROPHIES.length} color="#f0b429" /></div>}
    >
      <div className="trophies">
        {TROPHIES.map((t) => {
          const at = save.trophies[t.id];
          return (
            <div key={t.id} className={`trophy ${at ? 'got' : ''}`}>
              <i className="medal" aria-hidden="true" />
              <div>
                <b>{t.name}</b>
                <p>{t.desc}</p>
                {at && <small className="date">Obtenu le {new Date(at).toLocaleDateString('fr-FR')}</small>}
              </div>
            </div>
          );
        })}
      </div>
      <Section title="Statistiques">
        <dl className="facts">
          <div><dt>Captures</dt><dd>{fmt(st.caught)}</dd></div>
          <div><dt>Échappés</dt><dd>{fmt(st.escaped)}</dd></div>
          <div><dt>Vendus</dt><dd>{fmt(st.sold)}</dd></div>
          <div><dt>Gains</dt><dd><Coins n={st.earned} /></dd></div>
          <div><dt>Distance</dt><dd>{fmt(st.dist)} tuiles</dd></div>
          <div><dt>Naufrages</dt><dd>{st.wrecks}</dd></div>
          <div><dt>Plus gros poisson</dt><dd>{st.maxKg ? fmtKg(st.maxKg) : '—'}</dd></div>
          <div><dt>Coups critiques</dt><dd>{fmt(st.crits)}</dd></div>
          <div><dt>Biomes</dt><dd>{st.biomes.length} / {BIOME_IDS.length}</dd></div>
          <div><dt>Ports visités</dt><dd>{st.ports.length}</dd></div>
        </dl>
      </Section>
    </Modal>
  );
}

// ---------- Défis du jour ----------

export function DailyPanel() {
  const save = useStore((s) => s.save)!;
  const daily = useStore((s) => s.daily);
  const today = save.daily.day === dayKey(serverNow());
  return (
    <Modal title="Défis du jour">
      <p className="note">Trois défis renouvelés chaque jour à minuit (UTC). La récompense grandit avec votre bestiaire.</p>
      {daily.map((c) => {
        const done = today && save.daily.done.includes(c.id);
        const prog = done ? c.goal : today ? save.daily.prog[c.id] ?? 0 : 0;
        return (
          <div key={c.id} className={`trophy ${done ? 'got' : ''}`}>
            <i className="medal" aria-hidden="true" />
            <div>
              <b>{c.label}</b>
              <Bar value={prog} max={c.goal} color="#a05cf0" label={`${Math.floor(prog)} / ${c.goal}`} />
              <div className="reward"><span className="k">{done ? 'Récompense reçue' : 'Récompense'}</span><Coins n={c.reward} /></div>
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

// ---------- Réglages ----------

export function SettingsPanel() {
  const sound = useStore((s) => s.sound);
  const user = useStore((s) => s.user);
  const hud = useStore((s) => s.hud);
  const seed = useStore((s) => s.seed);
  const toggle = (): void => {
    const on = !sound;
    setSound(on);
    setState({ sound: on });
    try {
      localStorage.setItem('nf_sound', on ? '1' : '0');
    } catch {
      /* stockage local indisponible : le réglage vaudra pour cette session */
    }
    if (on) sfx('click');
  };
  const logout = async (): Promise<void> => {
    try {
      await rt.game?.sync();
      await api('/api/logout', {});
      location.href = BASE + '/';
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <Modal title="Réglages">
      <div className="uprow">
        <div className="info"><div className="name"><b>Sons et ambiance</b></div><p>Vagues, touches, combats.</p></div>
        <button className="buy" data-testid="sound" onClick={toggle} aria-pressed={sound}>{sound ? 'Activés' : 'Coupés'}</button>
      </div>
      <div className="uprow">
        <div className="info">
          <div className="name"><b>Zoom</b></div>
          <p><span className="touch-only">Pincez à deux doigts.</span><span className="pc-only">Molette, ou touches + et −.</span></p>
        </div>
        <div className="row">
          <button className="icon" onClick={() => rt.game?.changeZoom(-1)} aria-label="Dézoomer">−</button>
          <button className="icon" onClick={() => rt.game?.changeZoom(1)} aria-label="Zoomer">+</button>
        </div>
      </div>
      <div className="uprow">
        <div className="info"><div className="name"><b>{user?.name}</b></div><p>Progression sauvegardée sur votre compte Discord.</p></div>
        <button className="buy" data-testid="logout" onClick={() => void logout()}>Se déconnecter</button>
      </div>
      <Section title="Commandes">
        <ul className="help">
          <li><b>Naviguer</b>Touchez ou cliquez la mer.<span className="pc-only"> <kbd>Échap</kbd> annule le cap.</span></li>
          <li><b>Pêcher</b>Arrêtez-vous près d’une ombre, puis <span className="pc-only"><kbd>Espace</kbd> ou </span>le bouton « Lancer la ligne ».</li>
          <li><b>Ferrer</b>Attendez que le bouchon plonge franchement, puis <span className="pc-only"><kbd>Espace</kbd> ou </span>le bouton « Ferrer ».</li>
          <li><b>Combattre</b>Frappez quand le curseur traverse la zone verte ; le centre doré est critique. Enchaînez les critiques pour faire monter le combo.</li>
          <li><b>Carte</b>Le bouton « Carte »<span className="pc-only"> ou la touche <kbd>M</kbd></span>. Touchez la carte pour fixer un cap.</li>
        </ul>
      </Section>
      <p className="note num">Monde n° {seed} · {hud?.fps ?? '—'} images/s · {getState().save ? `${Object.keys(getState().save!.bestiary).length} espèces` : ''}</p>
    </Modal>
  );
}
