import { useEffect, useRef, type ReactNode } from 'react';
import { SPECIES_BY_ID, RARITY_NAMES, RARITY_COLORS, SIZE_NAMES, COLOR_NAMES, TRAIT_NAMES, type Species, type Specimen } from '../../../shared/src/index';
import { fishSprite, boatSprite } from '../game/sprites';
import { setState, useStore } from '../store';
import { sfx } from '../game/audio';
import type { Game } from '../game/game';

/** Instance du moteur, partagée avec l'interface. */
export const rt: { game: Game | null } = { game: null };

export const fmt = (n: number): string => Math.round(n).toLocaleString('fr-FR');
export const fmtKg = (kg: number): string => (kg >= 1000 ? `${(kg / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} t` : kg >= 10 ? `${kg.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg` : kg >= 1 ? `${kg.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg` : `${Math.round(kg * 1000)} g`);
export const fmtLen = (cm: number): string => (cm >= 100 ? `${(cm / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m` : `${cm.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} cm`);
/** Nombre à une décimale, à la française : 1,6. */
export const fmt1 = (n: number): string => n.toFixed(1).replace('.', ',');

/** Une somme en pièces : pastille dorée dessinée en CSS (pas d'emoji) suivie du montant. */
export function Coins({ n, testid }: { n: number; testid?: string }) {
  return (
    <span className="coins">
      <i className="coin" aria-hidden="true" />
      <b data-testid={testid}>{fmt(n)}</b>
      <span className="sr">pièces</span>
    </span>
  );
}

export function FishIcon({ sp, color = 0, scale = 2, animate = false, hidden = false, fit = false, contain = false }: { sp: Species; color?: number; scale?: number; animate?: boolean; hidden?: boolean; fit?: boolean; contain?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const gfx = useStore((s) => s.gfx);
  useEffect(() => {
    const c = ref.current!;
    let frame = 0;
    const draw = (): void => {
      const s = fishSprite(sp, color, frame);
      let x = 0, y = 0, w = s.width, h = s.height;
      if (fit) {
        const pixels = s.getContext('2d')!.getImageData(0, 0, w, h).data;
        let left = w, top = h, right = -1, bottom = -1;
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
          if (pixels[(py * w + px) * 4 + 3] > 0) { left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py); }
        }
        if (right >= left) { x = left; y = top; w = right - left + 1; h = bottom - top + 1; }
      }
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(s, x, y, w, h, 0, 0, w, h);
      if (hidden) {
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#4a5580';
        ctx.fillRect(0, 0, c.width, c.height);
      }
      const factor = fit ? Math.min((sp.shape === 'crab' ? 76 : 132) / w, (sp.shape === 'crab' ? 38 : 62) / h) : sp.shape === 'crab' ? Math.min(scale,2.5) : scale;
      c.style.width = `${w * factor}px`;
      c.style.height = `${h * factor}px`;
    };
    const resize = (): void => {
      if (!contain) return;
      const host = c.parentElement;
      if (!host || !c.width || !c.height) return;
      const factor = Math.min(scale, Math.max(1, host.clientWidth - 32) / c.width, 160 / c.height);
      c.style.width = `${c.width * factor}px`;
      c.style.height = `${c.height * factor}px`;
    };
    const observer = contain ? new ResizeObserver(resize) : null;
    if (observer && c.parentElement) observer.observe(c.parentElement);
    draw(); resize();
    if (!animate) return () => observer?.disconnect();
    const id = setInterval(() => {
      frame++;
      draw(); resize();
    }, 380);
    return () => { clearInterval(id); observer?.disconnect(); };
  }, [sp, color, scale, animate, hidden, gfx, fit, contain]);
  return <canvas ref={ref} className="pix" />;
}

export function BoatIcon({model,paint=0}:{model:string;paint?:number}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const s=boatSprite(0,model,paint),c=ref.current!;
    c.width=s.width;c.height=s.height;
    c.getContext('2d')!.drawImage(s,0,0);
  },[model,paint]);
  return <canvas ref={ref} className="pix boat-preview" aria-label="Aperçu du bateau"/>;
}

export function Rarity({ r }: { r: number }) {
  return <span className="rarity" style={{ color: RARITY_COLORS[r], borderColor: RARITY_COLORS[r] }}>{RARITY_NAMES[r]}</span>;
}

/** Étiquettes de variante d'un spécimen : taille exceptionnelle, couleur rare, coriace. */
export function Tags({ f }: { f: Specimen }) {
  return (
    <>
      {f.size > 0 && <span className="tag gold">{SIZE_NAMES[f.size]}</span>}
      {f.color > 0 && <span className="tag violet">{COLOR_NAMES[f.color]}</span>}
      {f.tough && <span className="tag red">Coriace</span>}
      {f.trait && <span className="tag green">{TRAIT_NAMES[f.trait]}</span>}
    </>
  );
}

export const speciesOf = (f: Specimen): Species => SPECIES_BY_ID[f.sp];

/**
 * Fenêtre. `top` est une zone fixe sous le titre (solde, onglets) : elle ne défile pas avec le contenu,
 * ce qui garde les onglets visibles en permanence, y compris sur un petit écran.
 */
export function Modal({ title, children, top, wide = false, onClose }: { title: string; children: ReactNode; top?: ReactNode; wide?: boolean; onClose?: () => void }) {
  const close = (): void => {
    sfx('click');
    (onClose ?? (() => setState({ panel: null })))();
  };
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon close" onClick={close} aria-label="Fermer" />
        </header>
        {top && <div className="top">{top}</div>}
        <div className="body">{children}</div>
      </div>
    </div>
  );
}

/** Jauge horizontale. Le texte éventuel est affiché à droite de la barre, jamais par-dessus. */
export function Bar({ value, max, color, label }: { value: number; max: number; color: string; label?: string }) {
  return (
    <div className={`meter ${label ? 'labelled' : ''}`}>
      <div className="bar"><div style={{ width: `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`, background: color }} /></div>
      {label && <span className="num">{label}</span>}
    </div>
  );
}
