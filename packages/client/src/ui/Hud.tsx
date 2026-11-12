import { BIOMES, NETS, cargoBulk, gearOf, gearTier, dayKey } from '../../../shared/src/index';
import { useStore, setState, serverNow, portOp, type Panel } from '../store';
import { sfx, unlockAudio } from '../game/audio';
import { rt, Bar, Coins, fmt1 } from './common';

const TOD = { aube: 'Aube', jour: 'Jour', crepuscule: 'Crépuscule', nuit: 'Nuit' };
const WEATHER = { clair: 'Ciel clair', brume: 'Brume', pluie: 'Pluie', orage: 'Orage' };

const open = (panel: Panel) => (): void => {
  unlockAudio();
  sfx('click');
  setState({ panel });
};

const NAV_ICONS = {
  journal: 'M4 3h15v18H4z M8 3v18 M12 8h4 M12 12h4 M12 16h3',
  ship: 'M4 9h16v11H4z M8 9V5h8v4 M4 13h16 M10 13v3h4v-3',
  bestiary: 'M12 5C8 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-5-1-9 1z M12 5v15',
  aquarium: 'M3 5h18v15H3z M3 9c3-3 6 3 9 0s6 3 9 0 M8 14c3-3 6-3 8 0-2 3-5 3-8 0z M8 14l-2-2v4z',
  trophies: 'M7 3h10v6a5 5 0 0 1-10 0z M7 5H3v3c0 3 2 4 5 4 M17 5h4v3c0 3-2 4-5 4 M12 14v6 M8 21h8',
  daily: 'M7 4h13v17H4V4h3 M8 2h8v5H8z M8 13l3 3 5-6',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
};
function NavIcon({ name }: { name: keyof typeof NAV_ICONS }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={NAV_ICONS[name]} /></svg>;
}

export function Hud() {
  const hidden=useStore(s=>s.hudHidden);
  const save = useStore((s) => s.save)!;
  const hud = useStore((s) => s.hud);
  const user = useStore((s) => s.user);
  const fishing = useStore((s) => s.fishing);
  const daily = useStore((s) => s.daily);
  const g = gearOf(save.up,save.vessel,save.kit);
  const bulk = cargoBulk(save);
  const dest = rt.game?.boat.dest ?? null;
  const net = NETS[save.net];
  const dailyLeft = daily.length - (save.daily.day === dayKey(serverNow()) ? save.daily.done.length : 0);
  const hullRatio = save.hull / g.hullMax;
  return (
    <div className={`hud ${hidden?'is-minimal':''}`}>
      <button className="hud-toggle" aria-label={hidden?'Afficher l’interface':'Masquer l’interface'} title={hidden?'Afficher l’interface':'Masquer l’interface'} aria-pressed={hidden} onClick={()=>setState({hudHidden:!hidden})}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>{hidden&&<path d="M3 3l18 18"/>}</svg></button>
      <div className="card tl">
        <div className="who">
          {user?.avatar ? <img src={user.avatar} alt="" /> : <span className="avatar">{(user?.name ?? '?').slice(0, 1).toUpperCase()}</span>}
          <b>{user?.name}</b>
        </div>
        <div className="purse"><Coins n={save.coins} testid="coins" /></div>
        <div className="stat">
          <span className="k">Coque</span>
          <Bar value={save.hull} max={g.hullMax} color={hullRatio < 0.3 ? '#ff5a4a' : hullRatio < 0.6 ? '#f0b429' : '#6fe3a1'} />
          <span className="v">{Math.round(save.hull)}<i>/{g.hullMax}</i></span>
        </div>
        <div className="stat">
          <span className="k">Cale</span>
          <Bar value={bulk} max={g.hold} color={bulk >= g.hold ? '#ff5a4a' : '#5cc8ff'} />
          <span className="v">{bulk}<i>/{g.hold}</i></span>
        </div>
        <div className="gearline">
          <span><span className="k">Canne</span> ★{fmt1(gearTier(g.rod))}</span>
          <span><span className="k">Filet</span> {net ? net.name.replace('Filet ', '') : 'aucun'}</span>
        </div>
      </div>

      <div className="card tr">
        {hud && (
          <>
            <b className={`biome ${BIOMES[hud.biome].danger >= 0.4 ? 'hot' : ''}`}>{BIOMES[hud.biome].name}</b>
            <span className="k level">Niveau {fmt1(hud.level)}</span>
            <span className="coords">X {hud.x} · Y {hud.y}</span>
            <span className="k">{TOD[hud.tod]} · {WEATHER[hud.weather]}</span>
          </>
        )}
        <div className="row">
          <button className="icon" onClick={open('map')} aria-label="Carte du monde" title="Carte (M)"><span aria-hidden="true">🗺️</span></button>
          <button className="icon" onClick={() => rt.game?.changeZoom(1)} aria-label="Zoomer" title="Zoomer (+)">+</button>
          <button className="icon" onClick={() => rt.game?.changeZoom(-1)} aria-label="Dézoomer" title="Dézoomer (-)">−</button>
        </div>
      </div>

      {!fishing && (
        <div className="context">
          {hud?.danger && <div className="alert">Créature hostile — éloignez-vous de sa trajectoire</div>}
          {hud?.landmark && !hud.danger && <button onClick={()=>setState({panel:'journal',landmarkId:hud.landmark!.id})}>Explorer · {hud.landmark.name}</button>}
          {hud?.treasure && !hud.danger && <button onClick={()=>void portOp('/api/treasure/open',{id:hud.treasure!.id})}>Ouvrir le coffre · {hud.treasure.coins} pièces</button>}
          {hud?.canCast && (
            <button className="big pulse" data-testid="cast" onClick={() => rt.game?.action()}>Lancer la ligne <kbd>Espace</kbd></button>
          )}
          {hud?.port && (
            <button className="big" data-testid="port" onClick={() => { sfx('port'); setState({ panel: 'port' }); }}>
              <span className="over">Entrer au port</span>{hud.port.name}
            </button>
          )}
          {hud?.moving && dest && (
            <button onClick={() => rt.game?.cancelMove()}>Annuler le cap <span className="num">{Math.round(dest.x)}, {Math.round(dest.y)}</span></button>
          )}
          {hud && !hud.moving && !hud.canCast && !hud.port && !hud.danger && (
            <div className="tip">Touchez la mer pour naviguer. Approchez-vous d’une ombre, arrêtez-vous, puis lancez.</div>
          )}
        </div>
      )}

      {!fishing && (
        <nav className="nav" aria-label="Carnet de bord">
          <button onClick={open('ship')}><NavIcon name="ship" /><span>Cale</span></button>
          <button onClick={open('bestiary')}><NavIcon name="bestiary" /><span>Bestiaire</span></button>
          <button onClick={open('aquarium')}><NavIcon name="aquarium" /><span>Aquarium</span></button>
          <button onClick={open('trophies')}><NavIcon name="trophies" /><span>Trophées</span></button>
          <button onClick={open('daily')}><NavIcon name="daily" /><span>Défis</span>{dailyLeft > 0 && <em>{dailyLeft}</em>}</button>
          <button onClick={()=>{setState({landmarkId:null});open('journal')();}}><NavIcon name="journal"/><span>Carnet</span></button>
          <button onClick={open('settings')}><NavIcon name="settings" /><span>Réglages</span></button>
        </nav>
      )}
    </div>
  );
}
