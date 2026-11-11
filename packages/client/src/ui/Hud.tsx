import { BIOMES, NETS, cargoBulk, gearOf, gearTier, dayKey } from '../../../shared/src/index';
import { useStore, setState, serverNow, type Panel } from '../store';
import { sfx, unlockAudio } from '../game/audio';
import { rt, Bar, Coins, fmt1 } from './common';

const TOD = { aube: 'Aube', jour: 'Jour', crepuscule: 'Crépuscule', nuit: 'Nuit' };
const WEATHER = { clair: 'Ciel clair', brume: 'Brume', pluie: 'Pluie', orage: 'Orage' };

const open = (panel: Panel) => (): void => {
  unlockAudio();
  sfx('click');
  setState({ panel });
};

export function Hud() {
  const save = useStore((s) => s.save)!;
  const hud = useStore((s) => s.hud);
  const user = useStore((s) => s.user);
  const fishing = useStore((s) => s.fishing);
  const daily = useStore((s) => s.daily);
  const g = gearOf(save.up);
  const bulk = cargoBulk(save);
  const dest = rt.game?.boat.dest ?? null;
  const net = NETS[save.net];
  const dailyLeft = daily.length - (save.daily.day === dayKey(serverNow()) ? save.daily.done.length : 0);
  const hullRatio = save.hull / g.hullMax;
  return (
    <div className="hud">
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
          <button className="mini" onClick={open('map')} aria-label="Carte du monde" title="Carte (M)">Carte</button>
          <button className="icon" onClick={() => rt.game?.changeZoom(1)} aria-label="Zoomer" title="Zoomer (+)">+</button>
          <button className="icon" onClick={() => rt.game?.changeZoom(-1)} aria-label="Dézoomer" title="Dézoomer (-)">−</button>
        </div>
      </div>

      {!fishing && (
        <div className="context">
          {hud?.danger && <div className="alert">Créature hostile — éloignez-vous de sa trajectoire</div>}
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
        <nav className="nav">
          <button onClick={open('ship')}>Cale</button>
          <button onClick={open('bestiary')}>Bestiaire</button>
          <button onClick={open('aquarium')}>Aquarium</button>
          <button onClick={open('trophies')}>Trophées</button>
          <button onClick={open('daily')}>Défis{dailyLeft > 0 && <em>{dailyLeft}</em>}</button>
          <button onClick={open('settings')}>Réglages</button>
        </nav>
      )}
    </div>
  );
}
