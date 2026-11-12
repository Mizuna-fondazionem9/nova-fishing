import { mountAquarium } from '../public-aquarium';
import '../aquarium.css';
import { Captaincy, AquariumWorkshop } from './Adventure';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KIT_DEFS, BAITS, VESSELS, PAINTS, CAT_PRICE, catReady, getPort,
  TRAIT_NAMES, type SpecimenTrait, COLOR_NAMES, SIZE_NAMES, BIOMES, BIOME_IDS, NETS, RARITY_COLORS, SILHOUETTE_NAMES, SPECIES, TROPHIES, UPGRADES,
  bulkOf, cargoBulk, dayKey, fishingAdvice, depthMeters, gearOf, gearTier, priceOf, upgradeCost,
  type Specimen, type Species, type UpgradeDef,
} from '../../../shared/src/index';
import { useStore, setState, getState, portOp, api, serverNow, toast, BASE } from '../store';
import { setSound, sfx, unlockAudio, testAudio } from '../game/audio';
import { rt, Modal, Bar, Coins, FishIcon, BoatIcon, Rarity, Tags, speciesOf, fmt, fmt1, fmtKg, fmtLen } from './common';

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
          <span>{fmtKg(f.kg)}</span><span>{fmtLen(f.len)}</span><span>{bulkOf(f.kg)} unités de cale</span><span>{fmt(Math.round(priceOf(f) / bulkOf(f.kg)))} pièces / unité</span>
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
  const g = gearOf(save.up,save.vessel,save.kit);
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
  const g = gearOf(save.up,save.vessel,save.kit);
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

function MaritimeTab() {
  const save=useStore(s=>s.save)!;
  const hud=useStore(s=>s.hud);
  const seed=useStore(s=>s.seed);
  const [busy,run]=useBusy();
  const [,refresh]=useState(0);
  useEffect(()=>{const id=setInterval(()=>refresh(v=>v+1),1000);return()=>clearInterval(id);},[]);
  const action=(action:string,value='')=>run(()=>portOp('/api/port/maritime',{action,value}));
  const ready=catReady(save,serverNow());
  const nextCat=save.cat ? Math.max(0,15-Math.floor((serverNow()-save.cat.at)/60000)) : 15;
  return <>
    <Section title="Chat pêcheur">
      <p className="note">Une petite prise toutes les 15 minutes, jusqu’à six en réserve. Le chat travaille au quai où il est installé, même hors connexion.</p>
      {!save.cat ? <button disabled={busy || save.coins<CAT_PRICE} onClick={()=>action('cat-buy')}>Adopter · <Coins n={CAT_PRICE}/></button> : <>
        <p>🐈 Au port {getPort(seed,...save.cat.port.split(':').map(Number) as [number,number]).name} · {ready} / 6 prises prêtes.{ready===0 ? ` Prochaine prise dans ${nextCat} min.` : ''}</p>
        {save.cat.port===hud?.port?.id ? <button disabled={busy || ready===0} onClick={()=>action('cat-claim')}>Récupérer les prises</button> : <button disabled={busy || ready>0} onClick={()=>action('cat-move')}>Installer le chat à ce quai</button>}
        {ready>0 && save.cat.port!==hud?.port?.id && <p className="note">Récupérez ses prises au port précédent avant de le déplacer.</p>}
      </>}
    </Section>
    <Section title="Choisir son bateau">
      {VESSELS.map(v=><div className="uprow" key={v.id}><BoatIcon model={v.id} paint={save.paint ?? 0}/><div className="info"><b>{v.name}</b><p>{v.desc}</p><small>Vitesse ×{v.speed} · Cale ×{v.hold} · Coque ×{v.hull}</small></div><button disabled={busy || (save.vessel ?? 'skiff')===v.id || (!(save.vessels ?? ['skiff']).includes(v.id) && save.coins<v.price)} onClick={()=>action('vessel',v.id)}>{(save.vessel ?? 'skiff')===v.id?'Équipé':(save.vessels ?? ['skiff']).includes(v.id)?'Équiper':<Coins n={v.price}/>}</button></div>)}
    </Section>
    <Section title="Peinture">
      <div className="paint-grid">{PAINTS.map((color,i)=><button key={color} aria-label={`Peinture ${i+1}`} aria-pressed={(save.paint ?? 0)===i} disabled={busy} onClick={()=>action('paint',String(i))}><span style={{background:color,width:26,height:22,borderRadius:4}}/>{(save.paints ?? [0]).includes(i)?'Possédée':'350 pièces'}</button>)}</div>
    </Section>

  </>;
}

export function PortPanel() {
  const hud = useStore((s) => s.hud);
  const save = useStore((s) => s.save)!;
  const [tab, setTab] = useState<'sell' | 'yard' | 'rod' | 'aqua' | 'life' | 'captaincy'>('sell');
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
          <Tabs tabs={[['sell', 'Criée'], ['yard', 'Chantier'], ['rod', 'Atelier'], ['aqua', 'Aquarium'], ['life','Compagnon & flotte'], ['captaincy','Capitainerie']]} value={tab} onChange={setTab} />
        </>
      }
    >
      {tab === 'sell' && <SellTab />}
      {tab === 'life' && <MaritimeTab />}
      {tab === 'captaincy' && <Captaincy />}
      {tab === 'yard' && <YardTab />}
      {tab === 'rod' && (
        <Section title="Canne à pêche">
          {UPGRADES.filter((u) => u.group === 'rod').map((u) => <UpgradeRow key={u.key} u={u} />)}
        </Section>
      )}
      {tab === 'aqua' && (
        <>
          <AquariumWorkshop />
          <Section title="Bassins">
            {UPGRADES.filter((u) => u.group === 'aquarium').map((u) => <UpgradeRow key={u.key} u={u} />)}
          </Section>
          <Section title="Poissons exposés" aside={`${save.aquarium.length} / ${gearOf(save.up,save.vessel,save.kit).aquarium}`}>
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
  const hud = useStore(s => s.hud);
  const [skill, setSkill] = useState<'debutant' | 'moyen'>('debutant');
  const advice = hud ? fishingAdvice(save.up, hud.biome, hud.level, skill) : null;
  const g = gearOf(save.up,save.vessel,save.kit);
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
      {advice && hud && <section className={`zone-advice ${advice.state}`}>
        <h3>{BIOMES[hud.biome].name} · {advice.sector}</h3>
        <label>Repère pour <select value={skill} onChange={e => setSkill(e.target.value as 'debutant' | 'moyen')}><option value="debutant">Je débute / je rate souvent</option><option value="moyen">Je suis à l’aise avec la jauge</option></select></label>
        <b>{advice.title}</b>
        <p>{advice.target === null ? 'Cette zone reste très exigeante. Reviens vers les eaux proches du départ pour progresser plus tranquillement.' : `Pour les prises courantes, vise environ le niveau ${advice.target} sur tes six améliorations de canne.`}</p>
        <p>Ton amélioration la plus basse : <strong>{advice.weakest}, niveau {advice.minimum}</strong>. {advice.target !== null && advice.minimum < advice.target ? 'Renforce-la au port avant de t’aventurer plus loin.' : 'Les poissons rares et géants peuvent rester plus difficiles.'}</p>
      </section>}
      <Section title="Équipement">
        <dl className="facts">
          <div className="full"><dt>Montage</dt><dd>{KIT_DEFS.find(k=>k.id===(save.kit??'standard'))?.name}</dd></div>
          <div className="full"><dt>Appât</dt><dd>{BAITS.find(b=>b.id===save.adventure?.bait)?.name??'Aucun'}</dd></div>
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
      <p className="note"><a href="https://novabot-hub.fr/nova-fishing#guide-canne" target="_blank" rel="noreferrer">Quelle zone pour ma canne ? Consulter les niveaux conseillés ↗</a></p>
      <Section title="Niveaux d’amélioration">
        <div className="upgrade-groups">
          {([['boat', 'Bateau'], ['rod', 'Canne & ligne'], ['aquarium', 'Aquarium']] as const).map(([group, title]) => (
            <div className="upgrade-group" key={group}>
              <h4>{title}</h4>
              <div className="upgrade-levels">
                {UPGRADES.filter(u => u.group === group).map(u => {
                  const level = save.up[u.key] ?? 0;
                  return <div className={`upgrade-level ${level === u.max ? 'complete' : ''}`} key={u.key}>
                    <div className="upgrade-level-heading"><span>{u.name}</span><b>{level}<small> / {u.max}</small></b></div>
                    <div className="upgrade-meter" role="progressbar" aria-label={u.name} aria-valuemin={0} aria-valuemax={u.max} aria-valuenow={level}>
                      <span style={{ width: `${100 * level / u.max}%` }} />
                    </div>
                    <p>{u.fmt(u.effect(level))}</p>
                  </div>;
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </Modal>
  );
}

// ---------- Bestiaire ----------

function SpeciesCard({ sp, onPick }: { sp: Species; onPick: (s: Species) => void }) {
  const entry = useStore((s) => s.save!.bestiary[sp.id]);
  return (
    <button className={`spcard ${entry ? '' : 'unknown'}`} onClick={() => onPick(sp)} style={entry ? { borderColor: RARITY_COLORS[sp.rarity] } : undefined}>
      <div className="specimen-art"><FishIcon sp={sp} scale={3} hidden={!entry} fit /></div>
      <div className="sp-conditions">
        {sp.prefs.time && <span role="img" aria-label={`Moment favorable : ${sp.prefs.time}`} title={`Moment favorable : ${sp.prefs.time}`}>{({ aube: '🌅', jour: '☀️', crepuscule: '🌇', nuit: '🌙' } as Record<string, string>)[sp.prefs.time] ?? '🕒'}</span>}
        {sp.prefs.weather && <span role="img" aria-label={`Météo favorable : ${sp.prefs.weather}`} title={`Météo favorable : ${sp.prefs.weather}`}>{({ clair: '☀️', pluie: '🌧️', orage: '⛈️', brume: '🌫️', brouillard: '🌫️', nuageux: '☁️' } as Record<string, string>)[sp.prefs.weather] ?? '☁️'}</span>}
      </div>
      <div className="specimen-caption"><strong>{entry ? sp.name : '?????'}</strong>
      {entry && <small>×{entry.n}</small>}</div>
    </button>
  );
}

export function BestiaryPanel() {
  const save = useStore((s) => s.save)!;
  const bestiary = save.bestiary;
  const [color, setColor] = useState(0);
  const [trait,setTrait]=useState<SpecimenTrait|undefined>();
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState<Species | null>(null);
  const groups = useMemo(() => BIOME_IDS.map((b) => [b, SPECIES.filter((s) => s.biomes[0] === b)] as const), []);
  const known = Object.keys(bestiary).length;
  if (pick) {
    const e = bestiary[pick.id];
    const variants = [...(e?.variants ?? [])];
    for (const f of [...save.cargo, ...save.aquarium].filter(f => f.sp === pick.id)) {
      if (!variants.some(v => v.color === f.color && v.size === f.size && v.tough === f.tough && v.trait === f.trait)) variants.push(f);
    }
    return (
      <Modal title="Bestiaire" onClose={() => setPick(null)}>
        <div className="showcase"><FishIcon sp={pick} color={color} scale={4} animate hidden={!e} /></div>
        <h3 className="species" style={{ color: RARITY_COLORS[pick.rarity] }}>{e ? pick.name : 'Espèce à découvrir'}</h3>
        <p className="tags"><Rarity r={pick.rarity} /><span className="tag">{SILHOUETTE_NAMES[pick.sil]}</span>{trait&&<span className="tag green">{TRAIT_NAMES[trait]}</span>}</p>
        <p className="desc">{e ? pick.desc : 'Une silhouette manque encore à votre carnet. Voici où tenter votre chance.'}</p>
        <Section title="Quand lancer la ligne ?">
          <div className="conditions"><span>◷ {pick.prefs.time ? `Plus fréquent : ${pick.prefs.time}` : 'À toute heure'}</span><span>☁ {pick.prefs.weather ? `Météo favorable : ${pick.prefs.weather}` : 'Toute météo'}</span></div>
          <p className="note">Ces préférences augmentent les chances de rencontre. Aucune exclusivité horaire ou météo.</p>
        </Section>
        {e && <Section title="Variantes capturées" aside={`${variants.length} formes consignées`}>
          <div className="variant-grid">{variants.map((v, i) => <button key={i} aria-pressed={color === v.color && trait===v.trait} onClick={() => {setColor(v.color);setTrait(v.trait);}}><FishIcon sp={pick} color={v.color} /><b>{COLOR_NAMES[v.color] || 'Naturelle'}</b><small>{SIZE_NAMES[v.size] || 'Taille standard'}{v.tough ? ' · Coriace' : ''}{v.trait?` · ${TRAIT_NAMES[v.trait]}`:''}</small></button>)}</div>
          {!e.variants && <p className="note">Les anciennes prises vendues n’enregistraient pas leurs variantes. Vos prises conservées sont visibles ; les prochaines seront mémorisées définitivement.</p>}
        </Section>}
        <dl className="facts">
          <div><dt>Captures</dt><dd>{e?.n ?? 0}</dd></div>
          <div><dt>Plus grand</dt><dd>{e ? fmtLen(e.maxLen) : '—'}</dd></div>
          <div><dt>Poids record</dt><dd>{e ? fmtKg(e.maxKg) : '—'}</dd></div>
          <div><dt>Profondeur</dt><dd>{depthMeters(pick.dmin)} à {depthMeters(pick.dmax)} m</dd></div>
          <div className="full"><dt>Biomes connus</dt><dd>{(e?.biomes ?? pick.biomes).map((b) => BIOMES[b].name).join(', ')}</dd></div>
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
      <p className="journal-intro">Le carnet des marées <span>Chaque silhouette, une rencontre à venir.</span></p>
      <input className="search" aria-label="Rechercher une espèce découverte" placeholder="Rechercher une espèce découverte…" value={query} onChange={e => setQuery(e.target.value)} />
      {groups.map(([b, all]) => [b, all.filter(sp => !query || (bestiary[sp.id] && sp.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))))] as const).filter(([, list]) => list.length).map(([b, list]) => (
        <Section key={b} title={BIOMES[b].name} aside={`${list.filter((s) => bestiary[s.id]).length} / ${list.length}`}>
          <div className="spgrid">{list.map((sp) => <SpeciesCard key={sp.id} sp={sp} onPick={sp => { setColor(0); setTrait(undefined); setPick(sp); }} />)}</div>
        </Section>
      ))}
    </Modal>
  );
}

// ---------- Aquarium ----------

function Tank({ fish }: { fish: Specimen[] }) {
  const host = useRef<HTMLDivElement>(null);
  const theme = useStore(s => s.save?.adventure?.aquarium.theme) ?? 'sand';
  const featured = useStore(s => s.save?.adventure?.aquarium.featured);
  useEffect(() => {
    if (!host.current) return;
    return mountAquarium(host.current, theme, fish.map(f => ({ ...f, featured: f.uid === featured })));
  }, [fish, theme, featured]);
  return <div className="nova-aquarium" ref={host} aria-label="Aquarium et poissons exposés" />;
}

export function AquariumPanel() {
  const save = useStore((s) => s.save)!;
  const hud = useStore((s) => s.hud);
  const cap = gearOf(save.up,save.vessel,save.kit).aquarium;
  return (
    <Modal title={save.adventure?.aquarium.name??'Aquarium'} wide>
      <Tank fish={save.aquarium} />
      {save.aquarium.find(f=>f.uid===save.adventure?.aquarium.featured)&&<div className="featured-display"><span className="eyebrow">À l’honneur</span>{save.aquarium.filter(f=>f.uid===save.adventure?.aquarium.featured).map(f=><div key={f.uid}><FishIcon sp={speciesOf(f)} color={f.color} scale={3}/><b>{speciesOf(f).name}</b><small>{fmtKg(f.kg)} · {fmtLen(f.len)}</small></div>)}</div>}
      <AquariumWorkshop />
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
  const [audioResult, setAudioResult] = useState('');
  const [audioTesting, setAudioTesting] = useState(false);
  const checkAudio = async (reset = false) => {
    if (audioTesting) return;
    setAudioTesting(true);
    setAudioResult('Test en cours…');
    try { setAudioResult(await testAudio(reset)); }
    finally { setAudioTesting(false); }
  };
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
    if (on) { unlockAudio(); sfx('click'); }
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
      <div className="row">
        <button disabled={!sound || audioTesting} onClick={() => void checkAudio()}>♫ Tester le son</button>
        <button disabled={!sound || audioTesting} onClick={() => void checkAudio(true)}>Réinitialiser le son</button>
      </div>
      {audioResult && <p role="status" className="note">{audioResult}</p>}
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
