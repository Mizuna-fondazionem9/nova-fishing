import { useMemo, useState, type ReactNode } from 'react';
import {
  BIOMES, BIOME_IDS, NETS, RARITY_COLORS, SILHOUETTE_NAMES, SPECIES, TROPHIES, UPGRADES,
  bulkOf, cargoBulk, dayKey, depthMeters, gearOf, gearTier, priceOf, upgradeCost,
  type Specimen, type Species, type UpgradeDef,
} from '../../../shared/src/index';
import { useStore, setState, getState, portOp, api, serverNow, toast, BASE } from '../store';
import { setSound, sfx } from '../game/audio';
import { rt, Modal, Bar, FishIcon, Rarity, Tags, speciesOf, fmt, fmtKg, fmtLen } from './common';

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

function FishRow({ f, children }: { f: Specimen; children?: ReactNode }) {
  const sp = speciesOf(f);
  return (
    <div className="fishrow">
      <div className="pic"><FishIcon sp={sp} color={f.color} scale={2} /></div>
      <div className="info">
        <b style={{ color: RARITY_COLORS[sp.rarity] }}>{sp.name}</b> <Tags f={f} />
        <small>{fmtKg(f.kg)} · {fmtLen(f.len)} · encombrement {bulkOf(f.kg)} · 🪙 {fmt(priceOf(f))}</small>
      </div>
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
        <b>{u.name}</b> <span className="lvl">niv. {lvl}</span>
        <small>{u.desc}</small>
        <small className="eff">{u.fmt(u.effect(lvl))}{!max && <> → <b>{u.fmt(u.effect(lvl + 1))}</b></>}</small>
      </div>
      <button data-testid={`up-${u.key}`} disabled={busy || max || locked || save.coins < cost} onClick={() => run(async () => { if (await portOp('/api/port/upgrade', { key: u.key })) sfx('coin'); })}>
        {max ? 'Maximum' : locked ? 'Filet requis' : <>🪙 {fmt(cost)}</>}
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
    <>
      <div className="row between">
        <span>Cale : {cargoBulk(save)} / {g.hold} unités</span>
        <button className="big" data-testid="sell-all" disabled={busy} onClick={() => run(async () => { if (await portOp('/api/port/sell', { uids: 'all' })) sfx('coin'); })}>Tout vendre · 🪙 {fmt(total)}</button>
      </div>
      {save.cargo.map((f) => (
        <FishRow key={f.uid} f={f}>
          <button disabled={busy} onClick={() => run(async () => { if (await portOp('/api/port/sell', { uids: [f.uid] })) sfx('coin'); })}>Vendre</button>
          <button data-testid="keep" disabled={busy || aquaFull} title={aquaFull ? 'Aquarium plein' : 'Exposer dans l’aquarium'} onClick={() => run(() => portOp('/api/port/keep', { uid: f.uid }))}>🐠 Garder</button>
        </FishRow>
      ))}
    </>
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
      <h3>Réparations</h3>
      <div className="uprow">
        <div className="info">
          <Bar value={save.hull} max={g.hullMax} color="#6fe3a1" label={`Coque ${Math.round(save.hull)} / ${g.hullMax}`} />
          <small>{missing > 0 ? `Remise à neuf : ${fmt(cost)} pièces (réparation partielle si vous n’avez pas assez).` : 'La coque est en parfait état.'}</small>
        </div>
        <button disabled={busy || missing <= 0 || save.coins < g.repairCost} onClick={() => run(() => portOp('/api/port/repair'))}>🛠️ Réparer</button>
      </div>
      <h3>Bateau</h3>
      {UPGRADES.filter((u) => u.group === 'boat').map((u) => <UpgradeRow key={u.key} u={u} />)}
      <h3>Filets</h3>
      <p className="small">Un filet capture tout seul de petits poissons communs pendant que vous naviguez (jamais les grosses pièces).</p>
      {NETS.map((n, i) => n && (
        <div className="uprow" key={i}>
          <div className="info"><b>{n.name}</b><small>{n.desc}</small></div>
          <button disabled={busy || save.net >= i || save.net !== i - 1 || save.coins < n.price} onClick={() => run(async () => { if (await portOp('/api/port/buy-net', { tier: i })) sfx('coin'); })}>
            {save.net >= i ? 'Possédé' : <>🪙 {fmt(n.price)}</>}
          </button>
        </div>
      ))}
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
    <Modal title={`⚓ ${hud.port.name}`} wide>
      <div className="row between"><span className="coins">🪙 <b>{fmt(save.coins)}</b></span></div>
      <Tabs tabs={[['sell', 'Criée'], ['yard', 'Chantier naval'], ['rod', 'Atelier de pêche'], ['aqua', 'Aquarium']]} value={tab} onChange={setTab} />
      {tab === 'sell' && <SellTab />}
      {tab === 'yard' && <YardTab />}
      {tab === 'rod' && UPGRADES.filter((u) => u.group === 'rod').map((u) => <UpgradeRow key={u.key} u={u} />)}
      {tab === 'aqua' && (
        <>
          {UPGRADES.filter((u) => u.group === 'aquarium').map((u) => <UpgradeRow key={u.key} u={u} />)}
          <AquariumList atPort />
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
    <Modal title="📦 Cale et équipement" wide>
      <h3>Cale — {cargoBulk(save)} / {g.hold} unités</h3>
      {!save.cargo.length && <p className="empty">La cale est vide.</p>}
      {save.cargo.map((f) => (
        <FishRow key={f.uid} f={f}>
          <button disabled={busy} title="Remettre à l’eau pour libérer de la place" onClick={() => run(() => portOp('/api/release', { uid: f.uid, from: 'cargo' }))}>Relâcher</button>
        </FishRow>
      ))}
      <p className="small">La vente, les améliorations et l’aquarium se font au port. En cas de naufrage, la cale est perdue.</p>
      <h3>Équipement</h3>
      <table className="facts">
        <tbody>
          <tr><th>Canne</th><td>★{gearTier(g.rod).toFixed(1).replace('.', ',')} (puissance {g.rod.power.toFixed(1)}, résistance {g.rod.resistance.toFixed(1)})</td></tr>
          <tr><th>Ligne</th><td>{g.rod.line} · moulinet ×{g.rod.reel.toFixed(2)}</td></tr>
          <tr><th>Bateau</th><td>{g.speed.toFixed(1)} tuiles/s · coque {g.hullMax} PC</td></tr>
          <tr><th>Filet</th><td>{NETS[save.net]?.name ?? 'Aucun'}</td></tr>
        </tbody>
      </table>
      <div className="uplist">
        {UPGRADES.map((u) => <span key={u.key} className="chip">{u.name} <b>{save.up[u.key] ?? 0}</b></span>)}
      </div>
    </Modal>
  );
}

// ---------- Bestiaire ----------

function SpeciesCard({ sp, onPick }: { sp: Species; onPick: (s: Species) => void }) {
  const entry = useStore((s) => s.save!.bestiary[sp.id]);
  return (
    <button className={`spcard ${entry ? '' : 'unknown'}`} onClick={() => entry && onPick(sp)} disabled={!entry} style={entry ? { borderColor: RARITY_COLORS[sp.rarity] } : undefined}>
      <FishIcon sp={sp} scale={2} hidden={!entry} />
      <span>{entry ? sp.name : '???'}</span>
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
      <Modal title="📖 Bestiaire" onClose={() => setPick(null)}>
        <div className="showcase"><FishIcon sp={pick} scale={4} animate /></div>
        <h3 style={{ color: RARITY_COLORS[pick.rarity] }}>{pick.name}</h3>
        <p className="tags"><Rarity r={pick.rarity} /> <span className="tag">{SILHOUETTE_NAMES[pick.sil]}</span></p>
        <p className="desc">{pick.desc}</p>
        <table className="facts">
          <tbody>
            <tr><th>Captures</th><td>{e.n}</td></tr>
            <tr><th>Plus grand spécimen</th><td>{fmtLen(e.maxLen)}</td></tr>
            <tr><th>Poids record</th><td>{fmtKg(e.maxKg)}</td></tr>
            <tr><th>Biomes connus</th><td>{e.biomes.map((b) => BIOMES[b].name).join(', ')}</td></tr>
            <tr><th>Profondeur</th><td>{depthMeters(pick.dmin)} à {depthMeters(pick.dmax)} m</td></tr>
          </tbody>
        </table>
        <button className="big" onClick={() => setPick(null)}>Retour</button>
      </Modal>
    );
  }
  return (
    <Modal title="📖 Bestiaire" wide>
      <p>Espèces découvertes : <b>{known}</b> / {SPECIES.length}</p>
      <Bar value={known} max={SPECIES.length} color="#a05cf0" />
      {groups.map(([b, list]) => (
        <section key={b}>
          <h3>{BIOMES[b].name} <small>{list.filter((s) => bestiary[s.id]).length} / {list.length}</small></h3>
          <div className="spgrid">{list.map((sp) => <SpeciesCard key={sp.id} sp={sp} onPick={setPick} />)}</div>
        </section>
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
    <Modal title="🐠 Aquarium" wide>
      <Tank fish={save.aquarium} />
      <p>Emplacements : <b>{save.aquarium.length}</b> / {cap} <span className="small">— agrandissable au port, onglet Aquarium.</span></p>
      <AquariumList atPort={!!hud?.port} />
    </Modal>
  );
}

// ---------- Trophées ----------

export function TrophiesPanel() {
  const save = useStore((s) => s.save)!;
  const got = TROPHIES.filter((t) => save.trophies[t.id]).length;
  const st = save.stats;
  return (
    <Modal title="🏆 Trophées" wide>
      <p>Débloqués : <b>{got}</b> / {TROPHIES.length}</p>
      <Bar value={got} max={TROPHIES.length} color="#f0b429" />
      <div className="trophies">
        {TROPHIES.map((t) => {
          const at = save.trophies[t.id];
          return (
            <div key={t.id} className={`trophy ${at ? 'got' : ''}`}>
              <i>{at ? '🏆' : '🔒'}</i>
              <div><b>{t.name}</b><small>{t.desc}</small>{at && <small className="date">Obtenu le {new Date(at).toLocaleDateString('fr-FR')}</small>}</div>
            </div>
          );
        })}
      </div>
      <h3>Statistiques</h3>
      <table className="facts">
        <tbody>
          <tr><th>Poissons capturés</th><td>{fmt(st.caught)}</td><th>Échappés</th><td>{fmt(st.escaped)}</td></tr>
          <tr><th>Vendus</th><td>{fmt(st.sold)}</td><th>Gains</th><td>🪙 {fmt(st.earned)}</td></tr>
          <tr><th>Distance</th><td>{fmt(st.dist)} tuiles</td><th>Naufrages</th><td>{st.wrecks}</td></tr>
          <tr><th>Plus gros poisson</th><td>{st.maxKg ? fmtKg(st.maxKg) : '—'}</td><th>Coups critiques</th><td>{fmt(st.crits)}</td></tr>
          <tr><th>Biomes</th><td>{st.biomes.length} / {BIOME_IDS.length}</td><th>Ports visités</th><td>{st.ports.length}</td></tr>
        </tbody>
      </table>
    </Modal>
  );
}

// ---------- Défis du jour ----------

export function DailyPanel() {
  const save = useStore((s) => s.save)!;
  const daily = useStore((s) => s.daily);
  const today = save.daily.day === dayKey(serverNow());
  return (
    <Modal title="📅 Défis du jour">
      <p className="small">Trois défis renouvelés chaque jour à minuit (UTC). La récompense grandit avec votre bestiaire.</p>
      {daily.map((c) => {
        const done = today && save.daily.done.includes(c.id);
        const prog = done ? c.goal : today ? save.daily.prog[c.id] ?? 0 : 0;
        return (
          <div key={c.id} className={`trophy ${done ? 'got' : ''}`}>
            <i>{done ? '✅' : '🎯'}</i>
            <div>
              <b>{c.label}</b>
              <Bar value={prog} max={c.goal} color="#a05cf0" label={`${Math.floor(prog)} / ${c.goal}`} />
              <small>Récompense : 🪙 {fmt(c.reward)}</small>
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
      toast('⚠️ ' + (e as Error).message);
    }
  };
  return (
    <Modal title="⚙️ Réglages">
      <div className="uprow">
        <div className="info"><b>Sons et ambiance</b><small>Vagues, touches, combats.</small></div>
        <button data-testid="sound" onClick={toggle} aria-pressed={sound}>{sound ? '🔊 Activés' : '🔇 Coupés'}</button>
      </div>
      <div className="uprow">
        <div className="info"><b>Zoom</b><small>Molette, pincement à deux doigts, ou touches + et −.</small></div>
        <div className="row">
          <button className="icon" onClick={() => rt.game?.changeZoom(-1)}>－</button>
          <button className="icon" onClick={() => rt.game?.changeZoom(1)}>＋</button>
        </div>
      </div>
      <div className="uprow">
        <div className="info"><b>{user?.name}</b><small>Progression sauvegardée sur votre compte Discord.</small></div>
        <button data-testid="logout" onClick={() => void logout()}>Se déconnecter</button>
      </div>
      <h3>Commandes</h3>
      <ul className="help">
        <li><b>Naviguer</b> : touchez ou cliquez la mer. <kbd>Échap</kbd> annule le cap.</li>
        <li><b>Pêcher</b> : arrêtez-vous près d’une ombre, puis <kbd>Espace</kbd> ou le bouton « Lancer ».</li>
        <li><b>Ferrer</b> : attendez que le bouchon plonge franchement, puis <kbd>Espace</kbd> ou touchez l’écran.</li>
        <li><b>Combat</b> : frappez quand le curseur traverse la zone verte ; le centre doré est critique.</li>
        <li><b>Carte</b> : <kbd>M</kbd>. Touchez la carte pour fixer un cap.</li>
      </ul>
      <p className="small">Monde n° {seed} · {hud?.fps ?? '—'} images/s · {getState().save ? `${Object.keys(getState().save!.bestiary).length} espèces` : ''}</p>
    </Modal>
  );
}
