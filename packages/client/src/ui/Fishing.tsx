import { useEffect, useRef } from 'react';
import { RARITY_COLORS, SILHOUETTE_NAMES, bulkOf } from '../../../shared/src/index';
import { useStore, setState } from '../store';
import { sfx } from '../game/audio';
import { rt, FishIcon, Rarity, Tags, speciesOf, fmt, fmtKg, fmtLen } from './common';

/** Jauge de combat : mise à jour image par image directement dans le DOM (pas de rendu React à 60 Hz). */
function Gauge() {
  const zone = useRef<HTMLDivElement>(null);
  const crit = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const fishBar = useRef<HTMLDivElement>(null);
  const lineBar = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const f = rt.game?.fish;
      const c = f?.combat;
      if (f && c) {
        const p = c.p;
        zone.current!.style.left = `${(c.zoneC - p.zone / 2) * 100}%`;
        zone.current!.style.width = `${p.zone * 100}%`;
        crit.current!.style.left = `${(c.zoneC - (p.zone * p.crit) / 2) * 100}%`;
        crit.current!.style.width = `${p.zone * p.crit * 100}%`;
        cursor.current!.style.left = `${c.pos * 100}%`;
        fishBar.current!.style.width = `${(c.fish / p.stamina) * 100}%`;
        const lr = c.line / p.line;
        lineBar.current!.style.width = `${lr * 100}%`;
        lineBar.current!.style.background = lr < 0.3 ? '#ff5a4a' : lr < 0.6 ? '#f0b429' : '#6fe3a1';
        wrap.current!.className = `gauge ${c.rush > 0 ? 'rush' : c.warn ? 'warn' : ''} ${c.lock > 0 ? 'locked' : ''}`;
        const left = f.fightT0 - performance.now();
        count.current!.textContent = left > 0 ? (left > 700 ? 'Prêt…' : 'Combattez !') : c.rush > 0 ? '⚠ Il s’emballe !' : c.warn ? '⚠ Attention…' : '';
        const fl = f.flash;
        const age = fl ? performance.now() - fl.at : 9999;
        flash.current!.textContent = fl && age < 600 ? fl.text : '';
        flash.current!.className = `flash ${fl?.kind ?? ''}`;
        flash.current!.style.opacity = String(Math.max(0, 1 - age / 600));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fight">
      <div className="flash" ref={flash} />
      <div className="count" ref={count} />
      <div className="meters">
        <label>🐟 Fatigue du poisson</label>
        <div className="bar"><div ref={fishBar} style={{ background: '#5cc8ff' }} /></div>
        <label>🧵 Résistance de la ligne</label>
        <div className="bar"><div ref={lineBar} /></div>
      </div>
      <div className="gauge" ref={wrap}>
        <div className="zone" ref={zone} />
        <div className="crit" ref={crit} />
        <div className="cursor" ref={cursor} />
      </div>
      <p className="hint">Touchez l’écran ou appuyez sur <kbd>Espace</kbd> quand le curseur traverse la zone verte — le centre doré est critique.</p>
    </div>
  );
}

export function FishingOverlay() {
  const stage = useStore((s) => s.fishing);
  if (!stage) return null;
  const sil = rt.game?.fish?.target.sh.sil;
  return (
    <div className="fishing">
      {(stage === 'casting' || stage === 'waiting' || stage === 'bitten' || stage === 'hooking') && (
        <div className="waitbox">
          <p className="hint">
            {stage === 'casting' && 'La ligne file…'}
            {stage === 'waiting' && <>Silhouette : <b>{sil ? SILHOUETTE_NAMES[sil] : '?'}</b>. Patience : attendez que le bouchon <b>plonge franchement</b>. Les petites secousses sont des feintes.</>}
            {stage === 'bitten' && <b className="bite">ÇA MORD ! FERREZ !</b>}
            {stage === 'hooking' && 'Ferrage…'}
          </p>
          <div className="row">
            <button className={`big ${stage === 'bitten' ? 'pulse' : ''}`} disabled={stage === 'casting' || stage === 'hooking'} onClick={() => rt.game?.action()}>
              🎣 Ferrer <kbd>Espace</kbd>
            </button>
            <button disabled={stage === 'hooking'} onClick={() => void rt.game?.reelIn()}>Remonter la ligne</button>
          </div>
        </div>
      )}
      {(stage === 'countdown' || stage === 'fight' || stage === 'resolving') && <Gauge />}
    </div>
  );
}

export function ResultModal() {
  const r = useStore((s) => s.result);
  useEffect(() => {
    if (!r) return;
    const key = (e: KeyboardEvent): void => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
        e.preventDefault();
        setState({ result: null });
      }
    };
    const id = setTimeout(() => window.addEventListener('keydown', key), 500);
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', key);
    };
  }, [r]);
  if (!r) return null;
  const close = (): void => {
    sfx('click');
    setState({ result: null });
  };
  const f = r.specimen;
  return (
    <div className="overlay">
      <div className="modal result">
        {r.outcome === 'win' && f ? (
          <>
            <h2 style={{ color: RARITY_COLORS[speciesOf(f).rarity] }}>Capture !</h2>
            <div className="showcase"><FishIcon sp={speciesOf(f)} color={f.color} scale={4} animate /></div>
            <h3>{speciesOf(f).name}</h3>
            <p className="tags"><Rarity r={speciesOf(f).rarity} /> <Tags f={f} /></p>
            <p className="badges">
              {r.first && <span className="tag green">✨ Nouvelle espèce !</span>}
              {r.record && <span className="tag gold">🏅 Nouveau record de poids !</span>}
            </p>
            <table className="facts">
              <tbody>
                <tr><th>Poids</th><td>{fmtKg(f.kg)}</td><th>Longueur</th><td>{fmtLen(f.len)}</td></tr>
                <tr><th>Valeur</th><td>🪙 {fmt(f.value)}</td><th>Encombrement</th><td>{bulkOf(f.kg)} unités</td></tr>
              </tbody>
            </table>
            <p className="desc">{speciesOf(f).desc}</p>
            {r.stored ? <p className="ok">Rangé dans la cale.</p> : <p className="warn">Cale pleine : relâché après la photo (le bestiaire en garde la trace).</p>}
          </>
        ) : (
          <>
            <h2 className="lost">Il s’est échappé…</h2>
            <p className="desc">{r.reason ?? 'Le poisson a eu le dernier mot.'}</p>
            <p className="desc">Astuce : chaque échec tend fortement la ligne. Mieux vaut laisser passer un tour que frapper hors zone.</p>
          </>
        )}
        {r.stats && <p className="small">Coups critiques {r.stats.crits} · réussis {r.stats.hits} · ratés {r.stats.misses} · {r.stats.seconds.toFixed(1)} s</p>}
        <button className="big" onClick={close}>Continuer</button>
      </div>
    </div>
  );
}
