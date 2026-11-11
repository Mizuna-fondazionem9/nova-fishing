import { BIOMES, NETS, cargoBulk, gearOf, gearTier, dayKey } from '../../../shared/src/index';
import { useStore, setState, serverNow, type Panel } from '../store';
import { sfx, unlockAudio } from '../game/audio';
import { rt, Bar, fmt } from './common';

const TOD = { aube: '🌅 Aube', jour: '☀️ Jour', crepuscule: '🌇 Crépuscule', nuit: '🌙 Nuit' };
const WEATHER = { clair: 'ciel clair', brume: '🌫️ brume', pluie: '🌧️ pluie', orage: '⛈️ orage' };

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
          {user?.avatar ? <img src={user.avatar} alt="" /> : <span className="avatar">⚓</span>}
          <b>{user?.name}</b>
        </div>
        <div className="coins" title="Pièces">🪙 <b data-testid="coins">{fmt(save.coins)}</b></div>
        <Bar value={save.hull} max={g.hullMax} color={hullRatio < 0.3 ? '#ff5a4a' : hullRatio < 0.6 ? '#f0b429' : '#6fe3a1'} label={`Coque ${Math.round(save.hull)} / ${g.hullMax}`} />
        <Bar value={bulk} max={g.hold} color={bulk >= g.hold ? '#ff5a4a' : '#5cc8ff'} label={`Cale ${bulk} / ${g.hold}`} />
        <div className="gearline">🎣 Canne ★{gearTier(g.rod).toFixed(1).replace('.', ',')} · {net ? `🕸️ ${net.name}` : 'sans filet'}</div>
      </div>

      <div className="card tr">
        {hud && (
          <>
            <b className={BIOMES[hud.biome].danger >= 0.4 ? 'hot' : ''}>{BIOMES[hud.biome].name}</b>
            <span>Niveau régional {hud.level.toFixed(1).replace('.', ',')}</span>
            <span>X {hud.x} · Y {hud.y}</span>
            <span>{TOD[hud.tod]} · {WEATHER[hud.weather]}</span>
          </>
        )}
        <div className="row">
          <button className="icon" onClick={open('map')} aria-label="Carte du monde" title="Carte (M)">🗺️</button>
          <button className="icon" onClick={() => rt.game?.changeZoom(1)} aria-label="Zoomer" title="Zoomer (+)">＋</button>
          <button className="icon" onClick={() => rt.game?.changeZoom(-1)} aria-label="Dézoomer" title="Dézoomer (-)">－</button>
        </div>
      </div>

      {!fishing && (
        <div className="context">
          {hud?.danger && <div className="alert">⚠ Créature hostile ! Éloignez-vous de sa trajectoire.</div>}
          {hud?.canCast && (
            <button className="big pulse" data-testid="cast" onClick={() => rt.game?.action()}>🎣 Lancer la ligne <kbd>Espace</kbd></button>
          )}
          {hud?.port && (
            <button className="big" data-testid="port" onClick={() => { sfx('port'); setState({ panel: 'port' }); }}>⚓ {hud.port.name}</button>
          )}
          {hud?.moving && dest && (
            <button onClick={() => rt.game?.cancelMove()}>✋ Annuler le cap ({Math.round(dest.x)}, {Math.round(dest.y)})</button>
          )}
          {hud && !hud.moving && !hud.canCast && !hud.port && !hud.danger && (
            <div className="tip">Touchez la mer pour naviguer. Approchez-vous d’une ombre, arrêtez-vous, puis lancez.</div>
          )}
        </div>
      )}

      {!fishing && (
        <nav className="nav">
          <button onClick={open('ship')}><i>📦</i><span>Cale</span></button>
          <button onClick={open('bestiary')}><i>📖</i><span>Bestiaire</span></button>
          <button onClick={open('aquarium')}><i>🐠</i><span>Aquarium</span></button>
          <button onClick={open('trophies')}><i>🏆</i><span>Trophées</span></button>
          <button onClick={open('daily')}><i>📅</i><span>Défis</span>{dailyLeft > 0 && <em>{dailyLeft}</em>}</button>
          <button onClick={open('settings')}><i>⚙️</i><span>Réglages</span></button>
        </nav>
      )}
    </div>
  );
}
