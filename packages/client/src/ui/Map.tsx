import { useEffect, useRef, useState } from 'react';
import { BIOMES, CELL, getPort, tileAt, type BiomeId, type Port } from '../../../shared/src/index';
import { useStore, getState, setState } from '../store';
import { rt, Modal } from './common';

const WATER: Record<BiomeId, [number, number, number]> = {
  river: [72,139,113],
  volcanic: [177,60,65], crystal: [94,199,213], spectral: [49,117,106],
  coastal: [78, 178, 196], tropical: [38, 150, 200], reef: [72, 206, 190], temperate: [44, 108, 170],
  polar: [150, 196, 222], deep: [24, 60, 124], abyss: [14, 22, 62], mystic: [98, 54, 150],
};
const SCALES = [2, 4, 8]; // tuiles par pixel de carte
const SIZE = 240; // pixels de carte (affichés agrandis, rendu net)

/** Carte du monde centrée sur le bateau. Dessinée par bandes, image après image, pour ne jamais figer le jeu. */
export function MapPanel() {
  const seed = useStore((s) => s.seed);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [si, setSi] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number; biome: string } | null>(null);
  const center = useRef({ x: rt.game?.boat.x ?? 0, y: rt.game?.boat.y ?? 0 });
  const scale = SCALES[si];

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE);
    const x0 = Math.floor(center.current.x - (SIZE * scale) / 2);
    const y0 = Math.floor(center.current.y - (SIZE * scale) / 2);
    let row = 0;
    let raf = 0;
    const overlay = (): void => {
      ctx.putImageData(img, 0, 0);
      const ports: Port[] = [];
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor((y0 + SIZE * scale) / CELL); cy++)
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor((x0 + SIZE * scale) / CELL); cx++) ports.push(getPort(seed, cx, cy));
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      for (const p of ports) {
        const px = Math.round((p.x - x0) / scale);
        const py = Math.round((p.y - y0) / scale);
        if (px < 2 || py < 2 || px > SIZE - 2 || py > SIZE - 2) continue;
        ctx.fillStyle = '#1a0f2e';
        ctx.fillRect(px - 2, py - 2, 5, 5);
        ctx.fillStyle = '#ffd86a';
        ctx.fillRect(px - 1, py - 1, 3, 3);
        if (scale <= 4) {
          ctx.fillStyle = 'rgba(8,10,20,0.75)';
          ctx.fillText(p.name, px + 1, py - 4);
          ctx.fillStyle = '#fff';
          ctx.fillText(p.name, px, py - 5);
        }
      }
      const a=getState().save?.adventure;
      for(const p of [...Object.values(a?.points??{}).map(v=>v.point),...(a?.chart?[a.chart]:[])]) {
        const px=(p.x-x0)/scale,py=(p.y-y0)/scale;
        if(px<0||py<0||px>SIZE||py>SIZE)continue;
        ctx.fillStyle=p.id===a?.chart?.id?'#ffb76e':'#9de5d6';ctx.fillRect(px-2,py-2,4,4);
      }
      const b = rt.game?.boat;
      if (b) {
        const bx = Math.round((b.x - x0) / scale);
        const by = Math.round((b.y - y0) / scale);
        if (b.dest) {
          ctx.strokeStyle = '#ffffff';
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(bx + 0.5, by + 0.5);
          ctx.lineTo((b.dest.x - x0) / scale, (b.dest.y - y0) / scale);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = '#1a0f2e';
        ctx.fillRect(bx - 3, by - 3, 7, 7);
        ctx.fillStyle = '#ff5cf0';
        ctx.fillRect(bx - 2, by - 2, 5, 5);
      }
    };
    const step = (): void => {
      const end = Math.min(SIZE, row + 24);
      for (; row < end; row++)
        for (let px = 0; px < SIZE; px++) {
          const t = tileAt(seed, x0 + px * scale, y0 + row * scale);
          let r: number, g: number, bl: number;
          if (t.land) [r, g, bl] = t.temp < 0.3 ? [236, 244, 250] : t.h < 0.012 ? [232, 214, 160] : [96, 160, 92];
          else {
            const k = 1 - t.depth * 0.35;
            [r, g, bl] = WATER[t.biome].map((v) => v * k) as [number, number, number];
          }
          const i = (row * SIZE + px) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = bl;
          img.data[i + 3] = 255;
        }
      overlay();
      if (row < SIZE) raf = requestAnimationFrame(step);
    };
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, SIZE, SIZE);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seed, scale]);

  const toWorld = (e: React.PointerEvent): { x: number; y: number } => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: Math.floor(center.current.x - (SIZE * scale) / 2 + ((e.clientX - r.left) / r.width) * SIZE * scale),
      y: Math.floor(center.current.y - (SIZE * scale) / 2 + ((e.clientY - r.top) / r.height) * SIZE * scale),
    };
  };
  const info = (e: React.PointerEvent): void => {
    const w = toWorld(e);
    const t = tileAt(seed, w.x, w.y);
    setHover({ ...w, biome: t.land ? 'Terre' : BIOMES[t.biome].name });
  };
  const go = (e: React.PointerEvent): void => {
    const w = toWorld(e);
    if (rt.game?.goTo(w.x + 0.5, w.y + 0.5)) setState({ panel: null });
  };

  return (
    <Modal title="Carte du monde" wide>
      <div className="row between">
        <span className="note num">{hover ? `X ${hover.x} · Y ${hover.y} — ${hover.biome}` : 'Touchez la carte pour fixer un cap.'}</span>
        <div className="row">
          <button className="icon" disabled={si === 0} onClick={() => setSi(si - 1)} aria-label="Zoomer la carte">+</button>
          <button className="icon" disabled={si === SCALES.length - 1} onClick={() => setSi(si + 1)} aria-label="Dézoomer la carte">−</button>
        </div>
      </div>
      <canvas ref={canvas} width={SIZE} height={SIZE} className="pix map" onPointerMove={info} onPointerDown={info} onPointerUp={go} />
      <div className="legend">
        {(Object.keys(WATER) as BiomeId[]).map((b) => (
          <span key={b}><i style={{ background: `rgb(${WATER[b].join(',')})` }} />{BIOMES[b].name}</span>
        ))}
        <span><i style={{ background: '#ffd86a' }} />Port</span>
        <span><i style={{ background: '#ff5cf0' }} />Vous</span>
        <span><i style={{ background: '#9de5d6' }} />Lieu découvert</span>
        <span><i style={{ background: '#ffb76e' }} />Carte reconstituée</span>
      </div>
      <button onClick={()=>setState({panel:'journal',landmarkId:null})}>Ouvrir le carnet d’exploration</button>
      <p className="note">Largeur affichée : {SIZE * scale} tuiles. Les très longs trajets se font en plusieurs caps.</p>
    </Modal>
  );
}
