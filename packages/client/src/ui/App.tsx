import { useEffect, useRef, useState } from 'react';
import { useStore, getState, setState, BASE } from '../store';
import { Game } from '../game/game';
import { rt } from './common';
import { Hud } from './Hud';
import { FishingOverlay, ResultModal } from './Fishing';
import { PortPanel, ShipPanel, BestiaryPanel, AquariumPanel, TrophiesPanel, DailyPanel, SettingsPanel } from './Panels';
import { MapPanel } from './Map';

function Loading({ text, pct }: { text: string; pct: number }) {
  return (
    <div className="screen loading">
      <h1 className="logo">NOVA <span>Fishing</span></h1>
      <div className="loadbar"><div style={{ width: `${Math.round(pct * 100)}%` }} /></div>
      <p>{text}</p>
    </div>
  );
}

function Login() {
  const err = useStore((s) => s.authError);
  const dev = useStore((s) => s.devAuth);
  const discord = useStore((s) => s.discord);
  const [name, setName] = useState('Testeur');
  return (
    <div className="screen login">
      <h1 className="logo">NOVA <span>Fishing</span></h1>
      <p className="tagline">Prenez la mer. Repérez les ombres. Ferrez au bon moment.</p>
      {err && <p className="error">{err}</p>}
      {discord ? (
        <a className="btn discord" href={`${BASE}/auth/discord/login`}>Se connecter avec Discord</a>
      ) : (
        <p className="error">La connexion Discord n’est pas encore configurée sur ce serveur.</p>
      )}
      {dev && (
        <form className="dev" onSubmit={(e) => { e.preventDefault(); location.href = `${BASE}/auth/dev/login?name=${encodeURIComponent(name)}`; }}>
          <small>Mode développement</small>
          <div className="row">
            <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-label="Nom du joueur de test" />
            <button type="submit">Entrer sans Discord</button>
          </div>
        </form>
      )}
      <p className="small">Votre progression est sauvegardée sur votre compte Discord.</p>
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  );
}

function GameView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [pct, setPct] = useState(0);
  const panel = useStore((s) => s.panel);
  const fade = useStore((s) => s.fade);
  useEffect(() => {
    let dead = false;
    const g = new Game(canvas.current!, getState().seed);
    rt.game = g;
    (window as unknown as { __nf: unknown }).__nf = { game: g, getState, setState };
    void g.preload((p) => !dead && setPct(p)).then(() => {
      if (dead) return;
      g.start();
      setReady(true);
    });
    return () => {
      dead = true;
      g.dispose();
      rt.game = null;
    };
  }, []);
  return (
    <>
      <canvas ref={canvas} className="world" />
      {ready && <Hud />}
      {ready && <FishingOverlay />}
      {panel === 'port' && <PortPanel />}
      {panel === 'ship' && <ShipPanel />}
      {panel === 'bestiary' && <BestiaryPanel />}
      {panel === 'aquarium' && <AquariumPanel />}
      {panel === 'trophies' && <TrophiesPanel />}
      {panel === 'daily' && <DailyPanel />}
      {panel === 'settings' && <SettingsPanel />}
      {panel === 'map' && <MapPanel />}
      <ResultModal />
      <div className={`fade ${fade ? 'on' : ''}`} />
      <div className={`cover ${ready ? 'gone' : ''}`}><Loading text="Génération de l’océan…" pct={0.4 + pct * 0.6} /></div>
    </>
  );
}

export function App() {
  const phase = useStore((s) => s.phase);
  const loadText = useStore((s) => s.loadText);
  const loadPct = useStore((s) => s.loadPct);
  return (
    <>
      {phase === 'loading' && <Loading text={loadText} pct={loadPct} />}
      {phase === 'login' && <Login />}
      {phase === 'game' && <GameView />}
      <Toasts />
    </>
  );
}
