import { useEffect, useRef, useState } from 'react';
import { RARITY_COLORS, SILHOUETTE_NAMES, bulkOf } from '../../../shared/src/index';
import { useStore, setState } from '../store';
import { sfx, unlockAudio } from '../game/audio';
import { comboColor, comboTier, comboWord } from '../game/combo';
import { rt, Coins, FishIcon, Rarity, Tags, speciesOf, fmtKg, fmtLen } from './common';

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
  const combo = useRef<HTMLDivElement>(null);
  const comboNum = useRef<HTMLElement>(null);
  const comboLabel = useRef<HTMLElement>(null);
  useEffect(() => {
    let raf = 0;
    let lastPop = 0;
    /** Rejoue une animation CSS sur un élément (il faut retirer la classe, forcer un recalcul, la remettre). */
    const replay = (el: HTMLElement, cls: string): void => {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    };
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

        // Série de critiques : couleur et intensité par palier, sur la jauge comme sur le compteur.
        const tier = comboTier(c.streak);
        const color = comboColor(c.streak);
        const g = wrap.current!;
        g.style.setProperty('--combo', color);
        g.className = `gauge ${c.streak >= 7 ? 'rainbow' : ''} ${c.rush > 0 ? 'rush' : c.warn ? 'warn' : ''} ${tier ? `s${tier}` : ''} ${g.classList.contains('pop') ? 'pop' : ''}`;
        const box = combo.current!;
        if (f.combo) {
          box.style.setProperty('--combo', color);
          box.style.setProperty('--lvl', String(tier));
          comboNum.current!.classList.toggle('rainbow-text', c.streak >= 7);
          comboNum.current!.textContent = `×${f.combo.n}`;
          comboLabel.current!.textContent = comboWord(f.combo.n);
          box.classList.add('on');
          if (f.combo.at !== lastPop) {
            lastPop = f.combo.at;
            replay(box, 'pop');
            replay(g, 'pop');
          }
        } else box.classList.remove('on');

        const left = f.fightT0 - performance.now();
        count.current!.textContent = left > 0 ? (left > 700 ? 'Prêt…' : 'Combattez !') : c.rush > 0 ? 'Il s’emballe !' : c.warn ? 'Attention…' : '';
        const fl = f.flash;
        const age = fl ? performance.now() - fl.at : 9999;
        const el = flash.current!;
        el.textContent = fl && age < 650 ? fl.text : '';
        el.className = `flash ${fl?.kind ?? ''}`;
        el.style.opacity = String(Math.max(0, 1 - age / 650));
        el.style.color = fl?.kind === 'crit' && tier ? color : '';
        el.style.transform = `scale(${fl?.kind === 'crit' ? 1 + 0.12 * Math.min(c.streak, 6) : 1})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fight">
      <div className="combo" ref={combo} aria-hidden="true">
        <b ref={comboNum} />
        <small ref={comboLabel} />
      </div>
      <div className="flash" ref={flash} />
      <div className="count" ref={count} />
      <div className="meters">
        <label>Fatigue du poisson</label>
        <div className="bar"><div ref={fishBar} style={{ background: '#5cc8ff' }} /></div>
        <label>Résistance de la ligne</label>
        <div className="bar"><div ref={lineBar} /></div>
      </div>
      <div className="gauge" ref={wrap}>
        <div className="zone" ref={zone} />
        <div className="crit" ref={crit} />
        <div className="cursor" ref={cursor} />
      </div>
      <p className="hint">
        <span className="touch-only">Touchez l’écran</span>
        <span className="pc-only">Cliquez ou appuyez sur <kbd>Espace</kbd></span>
        {' '}quand le curseur traverse la zone verte — le centre doré est critique.
      </p>
    </div>
  );
}

/** Carré de réflexes : coordonnées normalisées transmises au moteur puis rejouées côté serveur. */
function CrabGauge() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(v => v + 1), 32);
    return () => clearInterval(id);
  }, []);
  const f = rt.game?.fish;
  const c = f?.combat;
  if (!f || !c) return null;
  const target = { id:c.targetId, x:c.targetX, y:c.targetY, radius:c.targetRadius };
  const ready = f.stage === 'fight' && c.tick >= c.targetAt && c.state === 'run';
  const perfect = (c.tick - c.targetAt) * 1000 / 60 <= c.perfectMs;
  return <div className="fight crab-fight" data-frame={frame}>
    <div className={`crab-streak ${c.streak >= 7 ? 'rainbow-text' : ''}`} aria-live="polite">{c.streak > 0 ? `CRITIQUE ×${c.streak}` : '🦀 Attrapez les crabes'}</div>
    <p className="hint">Touchez chaque cercle dès son apparition. Parfait : {Math.round(c.perfectMs)} ms.</p>
    <div className="meters"><label>Fatigue du crabe</label><div className="bar"><div style={{ width: `${100*c.fish/c.p.stamina}%`, background: '#5cc8ff' }} /></div><label>Résistance de la ligne</label><div className="bar"><div style={{ width: `${100*c.line/c.p.line}%`, background: '#6fe3a1' }} /></div></div>
    <div className={`crab-board ${c.streak >= 7 ? 'rainbow' : ''}`} data-testid="crab-board" onPointerDown={e => {
      e.preventDefault(); e.stopPropagation(); unlockAudio();
      // Masquer immédiatement la cible validée, sans attendre le prochain rendu.
      const shown = e.currentTarget.querySelector<HTMLElement>('.crab-target');
      const r = e.currentTarget.getBoundingClientRect();
      rt.game?.tapFight((e.clientX-r.left)/r.width, (e.clientY-r.top)/r.height);
      if (shown && (c.targetId !== target.id || c.state !== 'run')) shown.style.visibility = 'hidden';
    }}>
      {f.stage === 'countdown' && <span className="crab-ready">Prêt…</span>}
      {ready && <button key={target.id} className={`crab-target ${perfect ? 'perfect' : ''}`} aria-label="Attraper le crabe" style={{ left: `${target.x*100}%`, top: `${target.y*100}%`, width: `${target.radius*200}%`, height: `${target.radius*200}%` }} onClick={e => {
        if (e.detail === 0) { unlockAudio(); rt.game?.tapFight(target.x,target.y); }
      }}><span>🦀</span></button>}
    </div>
    <div className="crab-feedback" role="status">{f.flash && performance.now()-f.flash.at < 650 ? f.flash.text : c.streak >= 2 ? `COMBO ×${c.streak}` : 'Visez vite et juste !'}</div>
  </div>;
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
              Ferrer <kbd>Espace</kbd>
            </button>
            <button disabled={stage === 'hooking'} onClick={() => void rt.game?.reelIn()}>Remonter la ligne</button>
          </div>
        </div>
      )}
      {(stage === 'countdown' || stage === 'fight' || stage === 'resolving') && (rt.game?.fish?.combat?.p.mode === 'crab' ? <CrabGauge /> : <Gauge />)}
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
            <h3 className="species">{speciesOf(f).name}</h3>
            <p className="tags"><Rarity r={speciesOf(f).rarity} /> <Tags f={f} /></p>
            <p className="badges">
              {r.first && <span className="tag green">Nouvelle espèce</span>}
              {r.record && <span className="tag gold">Record de poids</span>}
            </p>
            <dl className="facts">
              <div><dt>Poids</dt><dd>{fmtKg(f.kg)}</dd></div>
              <div><dt>Longueur</dt><dd>{fmtLen(f.len)}</dd></div>
              <div><dt>Valeur</dt><dd><Coins n={f.value} /></dd></div>
              <div><dt>Encombrement</dt><dd>{bulkOf(f.kg)} unités</dd></div>
            </dl>
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
        {r.stats && (
          <dl className="facts tally">
            <div><dt>Critiques</dt><dd>{r.stats.crits}</dd></div>
            <div><dt>Réussis</dt><dd>{r.stats.hits}</dd></div>
            <div><dt>Ratés</dt><dd>{r.stats.misses}</dd></div>
            <div><dt>Durée</dt><dd>{r.stats.seconds.toFixed(1).replace('.', ',')} s</dd></div>
          </dl>
        )}
        <button className="big" onClick={close}>Continuer</button>
      </div>
    </div>
  );
}
