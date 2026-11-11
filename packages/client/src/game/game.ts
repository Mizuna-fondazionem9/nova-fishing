// Moteur du jeu : boucle, caméra, navigation, ombres, pêche, créatures hostiles, météo, rendu Canvas 2D.
// Le rendu se fait à la résolution « pixel art » puis est agrandi sans lissage par le navigateur.
import {
  TILE, CHUNK, CELL, Rng, hash2, clamp, tileAt, getPort, portInRange, daylight, timeOfDay, weatherAt, spawnShadows, slotOf,
  findPath, gearOf, Combat, HOSTILE_BY_ID,
  type Pt, type Shadow, type BiteScript, type Port, type Weather, type Hostile, type Silhouette,
  type CastResponse, type HookResponse, type ResolveResponse, type SyncResponse, type HitResponse, type Mutation, type Encounter,
} from '../../../shared/src/index';
import { Terrain, CHUNK_PX } from './terrain';
import { boatSprite, shadowFrames, getDecor, resetSprites, SHADOW_FRAMES } from './sprites';
import { comboColor, comboTier } from './combo';
import { sfx, setAmbience, unlockAudio, pauseAudio } from './audio';
import { getState, setState, toast, api, applyMutation, serverNow, type FishStage } from '../store';

const ZOOMS = [1.5, 2, 3, 4];
export const CAST_RANGE = 8;
const SPEED: Record<Silhouette, number> = { crab: 0.45, small: 1.3, long: 1, massive: 0.55, shark: 0.9, ray: 0.6, cephalo: 0.7, giant: 0.35 };

interface ShadowView {
  sh: Shadow;
  x: number;
  y: number;
  angle: number;
  tx: number;
  ty: number;
  wait: number;
  rng: Rng;
  born: number;
  /** > 0 : le poisson fuit (secondes restantes). */
  flee: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'wake' | 'ring' | 'splash' | 'spark' | 'ray';
  color?: string;
  size?: number;
}

export interface Fishing {
  stage: FishStage;
  target: ShadowView;
  bx: number;
  by: number;
  castT: number;
  splashed: boolean;
  ready: boolean;
  sid: string;
  script: BiteScript | null;
  t0: number;
  evIdx: number;
  dip: number;
  dipUntil: number;
  combat: Combat | null;
  taps: (number | { tick: number; x: number; y: number })[];
  fightT0: number;
  flash: { text: string; kind: string; at: number } | null;
  /** Série de critiques en cours (à partir de 2), et l'instant du dernier coup pour rejouer l'animation. */
  combo: { n: number; at: number } | null;
}

interface HostileState {
  id: string;
  kind: Hostile;
  x: number;
  y: number;
  angle: number;
  mode: 'stalk' | 'tele' | 'charge' | 'recover' | 'leave';
  t: number;
  elapsed: number;
  hitDone: boolean;
}

const angDiff = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class Game {
  readonly terrain: Terrain;
  private ctx: CanvasRenderingContext2D;
  private zoomIdx: number;
  private vw = 320;
  private vh = 180;
  boat = { x: 0, y: 0, angle: Math.PI / 2, speed: 0, path: [] as Pt[], dest: null as Pt | null };
  private cam = { x: 0, y: 0 };
  private time = 0;
  private last = 0;
  private raf = 0;
  private views = new Map<string, ShadowView[]>();
  fish: Fishing | null = null;
  hostile: HostileState | null = null;
  private particles: Particle[] = [];
  private rain: { x: number; y: number }[] = [];
  private light = 1;
  private weather: Weather = 'clair';
  private lightning = 0;
  private nextBolt = 8;
  private shake = 0;
  private hiddenAt = 0;
  /** Décalage vertical de la caméra pendant la pêche (pixels d'art), recalculé 4 fois par seconde. */
  private inset = 0;
  private insetTimer = 0;
  /** Voile de couleur bref sur tout l'écran (combo). */
  private pulse = { a: 0, color: '#ffe14a' };
  private envTimer = 0;
  private hudTimer = 0;
  private syncTimer = 0;
  private syncing = false;
  private lastSync = { x: 0, y: 0 };
  private wasMoving = false;
  private frames = 0;
  private fpsAt = 0;
  private fps = 60;
  private pointers = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  private pinch = 0;
  private disposers: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, readonly seed: number) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.terrain = new Terrain(seed);
    this.zoomIdx = window.innerWidth < 760 ? 1 : 2;
    const s = getState().save!;
    this.boat.x = this.lastSync.x = s.x;
    this.boat.y = this.lastSync.y = s.y;
    this.cam.x = s.x * TILE;
    this.cam.y = s.y * TILE;
    this.resize();
    this.bind();
  }

  // ---------- Cycle de vie ----------

  /** Génère les chunks autour du bateau avant d'afficher le jeu (chargement progressif). */
  async preload(progress: (pct: number) => void): Promise<void> {
    const cx = Math.floor(this.boat.x / CHUNK);
    const cy = Math.floor(this.boat.y / CHUNK);
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        this.terrain.build(cx + dx, cy + dy);
        progress(++n / 9);
        await new Promise((r) => setTimeout(r, 0));
      }
  }

  start(): void {
    this.last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.update(dt, now);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers) d();
  }

  private on<K extends keyof WindowEventMap>(target: Window | HTMLElement | Document, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  private get zoom(): number {
    return ZOOMS[this.zoomIdx];
  }

  resize = (): void => {
    const z = this.zoom;
    this.vw = Math.ceil(window.innerWidth / z);
    this.vh = Math.ceil(window.innerHeight / z);
    this.canvas.width = this.vw;
    this.canvas.height = this.vh;
    this.canvas.style.width = `${this.vw * z}px`;
    this.canvas.style.height = `${this.vh * z}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.rain = Array.from({ length: 110 }, () => ({ x: Math.random() * this.vw, y: Math.random() * this.vh }));
  };

  changeZoom(dir: number): void {
    const i = clamp(this.zoomIdx + dir, 0, ZOOMS.length - 1);
    if (i !== this.zoomIdx) {
      this.zoomIdx = i;
      this.resize();
    }
  }

  // ---------- Entrées ----------

  private bind(): void {
    this.on(window, 'resize', this.resize);
    this.on(this.canvas, 'pointerdown', (e: PointerEvent) => {
      unlockAudio();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    this.on(this.canvas, 'pointermove', (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) p.moved = true;
      if (this.pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch && d > this.pinch * 1.25) {
          this.changeZoom(1);
          this.pinch = d;
        } else if (this.pinch && d < this.pinch * 0.8) {
          this.changeZoom(-1);
          this.pinch = d;
        }
      }
    });
    const up = (e: PointerEvent): void => {
      const p = this.pointers.get(e.pointerId);
      const multi = this.pointers.size > 1;
      this.pointers.delete(e.pointerId);
      if (!p || multi || p.moved || e.type === 'pointercancel') return;
      const r = this.canvas.getBoundingClientRect();
      const w = this.toWorld((e.clientX - r.left) / this.zoom, (e.clientY - r.top) / this.zoom);
      this.tap(w.x, w.y);
    };
    this.on(this.canvas, 'pointerup', up);
    this.on(this.canvas, 'pointercancel', up);
    this.on(this.canvas, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.changeZoom(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    this.on(this.canvas, 'contextmenu', (e: Event) => e.preventDefault());
    this.on(window, 'keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const st = getState();
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat && !st.panel && !st.result) this.action();
      } else if (e.code === 'Escape') {
        if (st.panel) setState({ panel: null });
        else if (this.fish) void this.reelIn();
        else this.cancelMove();
      } else if (e.key === '+' || e.key === '=') this.changeZoom(1);
      else if (e.key === '-') this.changeZoom(-1);
      else if (e.key.toLowerCase() === 'm' && !this.fish) setState({ panel: st.panel === 'map' ? null : 'map' });
    });
    this.on(document, 'visibilitychange', () => {
      if (document.hidden) {
        // Arrière-plan : on sauvegarde la position et on coupe le son.
        this.hiddenAt = performance.now();
        void this.sync(true);
        pauseAudio(true);
        return;
      }
      pauseAudio(false);
      // Retour : sur téléphone, le navigateur a pu vider les images gardées en mémoire (terrain, bateau, ombres).
      // On les redessine si c'est le cas, ou par précaution après une absence de plus de 5 secondes.
      const away = performance.now() - this.hiddenAt;
      if (away > 5000 || this.terrain.imagesLost()) this.restoreGraphics();
      setTimeout(() => this.terrain.imagesLost() && this.restoreGraphics(), 600);
    });
    this.on(this.canvas, 'contextrestored', () => this.restoreGraphics());
  }

  /** Redessine tout ce qui était gardé en mémoire : chunks, sprites, et les réglages du canevas principal. */
  private restoreGraphics(): void {
    resetSprites();
    this.terrain.clearImages();
    this.resize();
    this.terrain.build(Math.floor(this.cam.x / CHUNK_PX), Math.floor(this.cam.y / CHUNK_PX));
    setState({ gfx: getState().gfx + 1 });
  }

  private toWorld(ax: number, ay: number): Pt {
    return { x: (ax + Math.round(this.cam.x - this.vw / 2)) / TILE, y: (ay + Math.round(this.cam.y - this.vh / 2)) / TILE };
  }

  /** Toucher / clic dans le monde. */
  private tap(x: number, y: number): void {
    if (getState().panel || getState().result) return;
    if (this.fish) return this.action();
    const hit = this.shadowAt(x, y);
    if (hit) {
      const d = Math.hypot(hit.sh.x - this.boat.x, hit.sh.y - this.boat.y);
      if (d <= CAST_RANGE && this.boat.speed < 0.6) return void this.cast(hit);
      // Trop loin : on s'approche et on s'arrête à bonne distance.
      const a = Math.atan2(this.boat.y - hit.sh.y, this.boat.x - hit.sh.x);
      if (this.goTo(hit.sh.x + Math.cos(a) * 4.5, hit.sh.y + Math.sin(a) * 4.5)) return;
    }
    for (const p of this.portsNear(x, y)) if (Math.hypot(p.ix - x, p.iy - y) < p.r + 2 || Math.hypot(p.x - x, p.y - y) < 3) return void this.goTo(p.x + 0.5, p.y + 0.5);
    this.goTo(x, y);
  }

  /** Bouton principal / barre d'espace : ferrer, frapper, ou lancer. */
  action(): void {
    unlockAudio();
    const f = this.fish;
    if (f) {
      if (f.stage === 'waiting' || f.stage === 'bitten') void this.hook();
      else if (f.stage === 'fight') this.tapFight();
    } else if (this.castTarget()) void this.cast();
  }

  goTo(x: number, y: number): boolean {
    if (this.fish) return false;
    const path = findPath(this.terrain.blocked, this.boat.x, this.boat.y, x, y, 30000);
    if (!path || !path.length) {
      toast('Destination inaccessible.');
      return false;
    }
    this.boat.path = path;
    this.boat.dest = path[path.length - 1];
    return true;
  }

  cancelMove(): void {
    this.boat.path = [];
    this.boat.dest = null;
  }

  private portsNear(x: number, y: number): Port[] {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const out: Port[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(getPort(this.seed, cx + dx, cy + dy));
    return out;
  }

  // ---------- Mise à jour ----------

  private update(dt: number, now: number): void {
    this.time += dt;
    this.terrain.frame++;
    this.updateBoat(dt);
    // Caméra : suit le bateau en douceur ; pendant la pêche, cadre aussi le bouchon.
    let fx = this.boat.x;
    let fy = this.boat.y;
    if (this.fish) {
      fx = (fx + this.fish.bx) / 2;
      fy = (fy + this.fish.by) / 2;
    }
    // Le panneau de pêche couvre le bas de l'écran (un tiers sur téléphone) : on vise le milieu de la zone
    // restée libre, sinon le poisson et le bouchon peuvent se retrouver cachés derrière le panneau.
    let shiftY = 0;
    if (this.fish) {
      if ((this.insetTimer -= dt) <= 0) {
        this.insetTimer = 0.25;
        const panel = document.querySelector('.fishing')?.getBoundingClientRect();
        const bottom = panel ? window.innerHeight - panel.top : 0;
        let top = 0;
        if (window.innerWidth < 760) for (const el of document.querySelectorAll('.hud .card')) top = Math.max(top, el.getBoundingClientRect().bottom);
        this.inset = (bottom - top) / 2 / this.zoom;
      }
      shiftY = this.inset;
    }
    const k = 1 - Math.exp(-dt * 5);
    this.cam.x += (fx * TILE - this.cam.x) * k;
    this.cam.y += (fy * TILE + shiftY - this.cam.y) * k;
    this.updateShadows(dt);
    this.updateFishing(dt, now);
    this.updateHostile(dt);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
    this.particles = this.particles.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.pulse.a *= Math.exp(-dt * 7);
    this.lightning = Math.max(0, this.lightning - dt * 3);

    if ((this.envTimer -= dt) <= 0) {
      this.envTimer = 1;
      const t = serverNow();
      this.light = daylight(t);
      this.weather = weatherAt(this.seed, t, this.boat.x, this.boat.y);
      setAmbience(this.weather === 'orage' ? 1 : this.weather === 'pluie' ? 0.6 : 0);
    }
    if (this.weather === 'orage' && (this.nextBolt -= dt) <= 0) {
      this.nextBolt = 5 + Math.random() * 9;
      this.lightning = 1;
      sfx('thunder');
    }

    const moving = this.boat.speed > 0.05;
    if (this.wasMoving && !moving) void this.sync(); // arrêt : le serveur doit connaître la position (port, pêche)
    this.wasMoving = moving;
    if ((this.syncTimer += dt) > 8) void this.sync();

    this.frames++;
    if (now - this.fpsAt > 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.fpsAt = now;
    }
    if ((this.hudTimer -= dt) <= 0) {
      this.hudTimer = 0.25;
      const tile = tileAt(this.seed, Math.floor(this.boat.x), Math.floor(this.boat.y));
      setState({
        hud: {
          biome: tile.biome, x: Math.round(this.boat.x), y: Math.round(this.boat.y), level: tile.level,
          port: this.boat.speed < 0.5 ? portInRange(this.seed, this.boat.x, this.boat.y) : null,
          moving: this.boat.path.length > 0, canCast: !this.fish && !this.hostile && !!this.castTarget(),
          tod: timeOfDay(serverNow()), weather: this.weather, danger: !!this.hostile, fps: this.fps,
        },
      });
    }
    this.buildOneChunk();
  }

  private updateBoat(dt: number): void {
    const b = this.boat;
    const save = getState().save;
    if (!save) return;
    const g = gearOf(save.up);
    let target = 0;
    if (b.path.length && !this.fish) {
      const wp = b.path[0];
      const dx = wp.x - b.x;
      const dy = wp.y - b.y;
      const d = Math.hypot(dx, dy);
      const final = b.path.length === 1;
      if (d < (final ? 0.15 : 0.7)) {
        b.path.shift();
        if (!b.path.length) b.dest = null;
      } else {
        const diff = angDiff(Math.atan2(dy, dx), b.angle);
        const turn = (2.4 + g.accel * 0.15) * dt;
        b.angle += clamp(diff, -turn, turn);
        let rem = d;
        for (let i = 0; i < b.path.length - 1; i++) rem += Math.hypot(b.path[i + 1].x - b.path[i].x, b.path[i + 1].y - b.path[i].y);
        const align = Math.max(0, Math.cos(diff));
        target = Math.min(g.speed * (0.2 + 0.8 * align * align), Math.sqrt(2 * g.accel * rem) + 0.35);
        if (final && d < 0.8) b.angle += clamp(diff, -6 * dt, 6 * dt); // accostage : on pivote franchement
      }
    }
    if (b.speed < target) b.speed = Math.min(target, b.speed + g.accel * dt);
    else b.speed = Math.max(target, b.speed - g.accel * 1.8 * dt);
    if (b.speed > 0.01) {
      const nx = b.x + Math.cos(b.angle) * b.speed * dt;
      const ny = b.y + Math.sin(b.angle) * b.speed * dt;
      if (this.terrain.isLand(Math.floor(nx), Math.floor(ny))) {
        b.speed = 0;
        this.cancelMove();
      } else {
        b.x = nx;
        b.y = ny;
        if (Math.random() < b.speed * dt * 6) {
          const a = b.angle + Math.PI + (Math.random() - 0.5) * 0.9;
          this.particles.push({ x: b.x - Math.cos(b.angle) * 0.7, y: b.y - Math.sin(b.angle) * 0.7, vx: Math.cos(a) * 0.5, vy: Math.sin(a) * 0.5, life: 0.9, max: 0.9, kind: 'wake' });
        }
      }
    }
  }

  // ---------- Ombres ----------

  private viewsFor(cx: number, cy: number, slot: number): ShadowView[] {
    const key = `${cx},${cy},${slot}`;
    let v = this.views.get(key);
    if (!v) {
      v = spawnShadows(this.seed, cx, cy, slot).map((sh) => ({ sh, x: sh.x, y: sh.y, angle: (sh.seed % 628) / 100, tx: sh.x, ty: sh.y, wait: 0, rng: new Rng(sh.seed), born: this.time, flee: 0 }));
      this.views.set(key, v);
    }
    return v;
  }

  /** Ombres actives : seulement les chunks voisins du bateau (jamais « tout l'océan »). */
  private activeViews(): ShadowView[] {
    const slot = slotOf(serverNow());
    const cx = Math.floor(this.boat.x / CHUNK);
    const cy = Math.floor(this.boat.y / CHUNK);
    const consumed = getState().save?.consumed ?? [];
    const out: ShadowView[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) for (const v of this.viewsFor(cx + dx, cy + dy, slot)) if (v.flee > 0 || !consumed.includes(v.sh.key)) out.push(v);
    // Le poisson au bout de la ligne reste visible quoi qu'il arrive : les ombres sont redistribuées toutes les
    // 5 minutes, et sans cette ligne la cible disparaissait de l'écran si le changement tombait en pleine pêche.
    const target = this.fish?.target;
    if (target && !out.includes(target)) out.push(target);
    if (this.views.size > 40)
      for (const key of this.views.keys()) {
        const [kx, ky, ks] = key.split(',').map(Number);
        if (ks < slot || Math.abs(kx - cx) > 2 || Math.abs(ky - cy) > 2) this.views.delete(key);
      }
    return out;
  }

  /** Vrai si une ombre peut nager en ligne droite jusqu'à (x1, y1) sans toucher ni frôler la terre. */
  private clearWater(x0: number, y0: number, x1: number, y1: number): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5));
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      if (this.terrain.blocked(Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }

  private updateShadows(dt: number): void {
    for (const v of this.activeViews()) {
      if (this.fish?.target === v) continue;
      const sp = SPEED[v.sh.sil] * (v.flee > 0 ? 3 : 1);
      if (v.flee > 0) v.flee -= dt;
      const dx = v.tx - v.x;
      const dy = v.ty - v.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.15) {
        if ((v.wait -= dt) <= 0) {
          // Nouvelle destination autour du point d'attache : on n'en retient une que si le trajet reste en pleine eau.
          v.wait = 0.4;
          for (let essai = 0; essai < 6; essai++) {
            const a = v.rng.next() * Math.PI * 2;
            const r = (v.sh.sil === 'giant' ? 3 : 2.2) * Math.sqrt(v.rng.next());
            const tx = v.sh.x + Math.cos(a) * r;
            const ty = v.sh.y + Math.sin(a) * r;
            if (!this.clearWater(v.x, v.y, tx, ty)) continue;
            v.tx = tx;
            v.ty = ty;
            v.wait = v.sh.sil === 'small' ? v.rng.next() * 0.6 : 0.5 + v.rng.next() * 2.5;
            break;
          }
        }
      } else {
        v.angle += clamp(angDiff(Math.atan2(dy, dx), v.angle), -3 * dt, 3 * dt);
        const pulse = v.sh.sil === 'cephalo' ? 0.4 + Math.max(0, Math.sin(this.time * 3 + v.sh.seed)) : 1;
        const nx = v.x + Math.cos(v.angle) * sp * pulse * dt;
        const ny = v.y + Math.sin(v.angle) * sp * pulse * dt;
        // Garde-fou : un virage large ne doit jamais faire passer l'ombre sur la terre.
        if (this.terrain.blocked(Math.floor(nx), Math.floor(ny))) {
          v.tx = v.x;
          v.ty = v.y;
          v.wait = 0.2;
        } else {
          v.x = nx;
          v.y = ny;
        }
      }
    }
  }

  private shadowAt(x: number, y: number): ShadowView | null {
    let best: ShadowView | null = null;
    let bd = 1.8;
    for (const v of this.activeViews()) {
      const d = Math.hypot(v.x - x, v.y - y);
      if (d < bd && v.flee <= 0) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** Ombre la plus proche à portée de lancer, bateau à l'arrêt. */
  castTarget(): ShadowView | null {
    if (this.boat.speed > 0.6) return null;
    let best: ShadowView | null = null;
    let bd = CAST_RANGE;
    for (const v of this.activeViews()) {
      const d = Math.hypot(v.sh.x - this.boat.x, v.sh.y - this.boat.y);
      if (d < bd && v.flee <= 0) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  // ---------- Pêche ----------

  private stage(s: FishStage): void {
    if (this.fish) this.fish.stage = s;
    setState({ fishing: s });
  }

  private endFishing(flee = true): void {
    if (this.fish && flee) {
      // Le poisson file à l'opposé du bateau, aussi loin que l'eau libre le permet (jamais à travers une île).
      const v = this.fish.target;
      v.flee = 2.5;
      const a = Math.atan2(v.y - this.boat.y, v.x - this.boat.x);
      let dist = 9;
      while (dist > 0 && !this.clearWater(v.x, v.y, v.x + Math.cos(a) * dist, v.y + Math.sin(a) * dist)) dist -= 1;
      v.tx = v.x + Math.cos(a) * dist;
      v.ty = v.y + Math.sin(a) * dist;
    }
    this.fish = null;
    setState({ fishing: null });
  }

  async cast(view?: ShadowView): Promise<void> {
    if (this.fish) return;
    if (this.hostile) return toast('Une créature rôde : impossible de pêcher !');
    const target = view ?? this.castTarget();
    if (!target) return;
    this.cancelMove();
    this.boat.speed = 0;
    const f: Fishing = {
      stage: 'casting', target, bx: target.x, by: target.y, castT: 0, splashed: false, ready: false, sid: '', script: null, t0: 0,
      evIdx: 0, dip: 0, dipUntil: 0, combat: null, taps: [], fightT0: 0, flash: null, combo: null,
    };
    this.fish = f;
    this.stage('casting');
    sfx('cast');
    try {
      const r = await api<CastResponse>('/api/fishing/cast', { shadow: target.sh.key, x: this.boat.x, y: this.boat.y });
      if (this.fish !== f) return;
      this.syncTimer = 0;
      this.lastSync = { x: this.boat.x, y: this.boat.y };
      f.sid = r.sid;
      f.script = r.script;
      f.ready = true;
    } catch (e) {
      if (this.fish === f) {
        this.endFishing(false);
        toast((e as Error).message);
      }
    }
  }

  private ring(x: number, y: number, life = 0.8, color?: string, size?: number): void {
    this.particles.push({ x, y, vx: 0, vy: 0, life, max: life, kind: 'ring', color, size });
  }

  private updateFishing(dt: number, now: number): void {
    const f = this.fish;
    if (!f) return;
    const v = f.target;
    if (f.stage === 'casting') {
      f.castT = Math.min(1, f.castT + dt / 0.6);
      if (f.castT >= 1 && !f.splashed) {
        f.splashed = true;
        sfx('splash');
        this.ring(f.bx, f.by);
      }
      if (f.castT >= 1 && f.ready) {
        f.t0 = now;
        this.stage('waiting');
      }
      return;
    }
    if (now > f.dipUntil && f.stage === 'waiting') f.dip = Math.max(0, f.dip - dt * 4);
    if ((f.stage === 'waiting' || f.stage === 'bitten') && f.script) {
      const el = now - f.t0;
      while (f.evIdx < f.script.events.length && f.script.events[f.evIdx].t <= el) {
        const ev = f.script.events[f.evIdx++];
        if (ev.kind === 'nibble') {
          f.dip = 0.3;
          f.dipUntil = now + 160;
          sfx('nibble');
          this.ring(f.bx, f.by, 0.5);
        } else if (ev.kind === 'feint') {
          f.dip = 0.62;
          f.dipUntil = now + 260;
          sfx('nibble');
          this.ring(f.bx, f.by, 0.7);
        } else if (ev.kind === 'bite') {
          f.dip = 1;
          f.dipUntil = now + 99999;
          sfx('bite');
          this.ring(f.bx, f.by, 1);
          this.stage('bitten');
        } else if (ev.kind === 'leave') {
          toast('Le poisson s’est désintéressé de l’appât.');
          void this.reelIn(true);
          return;
        }
      }
      // Le poisson tourne autour du bouchon une fois « approché ».
      const approached = f.evIdx > 0;
      const a = this.time * 1.4 + v.sh.seed;
      const r = approached ? (f.stage === 'bitten' ? 0.2 : 0.9 - f.dip * 0.7) : 2.4;
      const gx = f.bx + Math.cos(a) * r;
      const gy = f.by + Math.sin(a) * r;
      v.angle += clamp(angDiff(Math.atan2(gy - v.y, gx - v.x), v.angle), -5 * dt, 5 * dt);
      v.x += (gx - v.x) * Math.min(1, dt * 2.5);
      v.y += (gy - v.y) * Math.min(1, dt * 2.5);
      if (el > f.script.end + 300) {
        toast('Trop tard… il a filé avec l’appât.');
        void this.reelIn(true);
      }
      return;
    }
    if (f.stage === 'countdown' && now >= f.fightT0) this.stage('fight');
    if ((f.stage === 'fight' || f.stage === 'countdown') && f.combat) {
      const c = f.combat;
      if (f.stage === 'fight') {
        const targetTick = Math.floor((now - f.fightT0) * 0.06);
        let guard = 30000;
        while (c.state === 'run' && c.tick < targetTick && guard-- > 0) c.step();
      }
      // Le poisson se débat autour du point d'accroche.
      const wild = c.rush > 0 ? 2.2 : 1;
      const a = this.time * 3.2 * wild + v.sh.seed;
      const r = 0.8 + 0.5 * Math.sin(this.time * 2.1) + (c.rush > 0 ? 0.6 : 0);
      f.bx += (v.sh.x + Math.cos(a * 0.37) * 1.2 - f.bx) * dt * 2;
      f.by += (v.sh.y + Math.sin(a * 0.29) * 1.2 - f.by) * dt * 2;
      v.x = f.bx + Math.cos(a) * r * 0.5;
      v.y = f.by + Math.sin(a) * r * 0.5;
      v.angle = a + Math.PI / 2;
      if (Math.random() < dt * (c.rush > 0 ? 14 : 4)) this.particles.push({ x: f.bx, y: f.by, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.5, life: 0.4, max: 0.4, kind: 'splash' });
      if (c.state !== 'run' && f.stage === 'fight') void this.finishFight();
    }
  }

  private async hook(): Promise<void> {
    const f = this.fish;
    if (!f || (f.stage !== 'waiting' && f.stage !== 'bitten')) return;
    const elapsed = Math.round(performance.now() - f.t0);
    this.stage('hooking');
    try {
      const r = await api<HookResponse>('/api/fishing/hook', { sid: f.sid, elapsed });
      if (this.fish !== f) return;
      if (r.verdict === 'ok' && r.combat) {
        f.combat = new Combat(r.combat);
        f.fightT0 = performance.now() + 1100;
        f.dip = 1;
        sfx('hit');
        this.stage('countdown');
        return;
      }
      if (r.save) setState({ save: r.save });
      sfx('miss');
      toast(r.verdict === 'early' ? 'Ferré trop tôt ! Le poisson a pris peur.' : r.verdict === 'late' ? 'Ferré trop tard… il a recraché l’hameçon.' : 'Rien au bout de la ligne : ce n’était pas une touche.');
      this.endFishing(r.verdict !== 'none');
    } catch (e) {
      if (this.fish === f) {
        this.endFishing(false);
        toast((e as Error).message);
      }
    }
  }

  tapFight(x?: number, y?: number): void {
    const f = this.fish;
    if (!f?.combat || f.stage !== 'fight') return;
    const c = f.combat;
    const tick = c.tick;
    const r = c.tap(x, y);
    if (r === 'locked') return;
    f.taps.push(c.p.mode === 'crab' ? { tick, x: x!, y: y! } : tick);
    // Série de coups critiques : 1 pour un critique isolé, puis 2, 3... tant qu'ils s'enchaînent.
    const streak = r === 'crit' ? c.streak : 0;
    const text = r === 'crit' ? (streak >= 2 ? `CRITIQUE ×${streak} !` : 'CRITIQUE !') : r === 'hit' ? 'Touché !' : 'Raté !';
    f.flash = { text, kind: r, at: performance.now() };
    f.combo = streak >= 2 ? { n: streak, at: performance.now() } : null;
    sfx(r, streak);
    if (r === 'miss') {
      this.shake = 0.5;
      return;
    }
    const burst = (n: number, kind: 'splash' | 'spark' | 'ray', speed: number, life: number, color: string, size: number): void => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.45 + Math.random() * 0.55);
        this.particles.push({ x: f.bx, y: f.by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, kind, color, size });
      }
    };
    burst(r === 'crit' ? 10 : 4, 'splash', 2, 0.45, '#ffffff', 1);
    const tier = comboTier(streak);
    if (!tier) return;
    // Combo : éclats de peinture, traits de vitesse, ondes colorées et voile de couleur sur l'écran.
    // Tout grandit avec le palier (2 à 6) et prend sa couleur.
    const color = comboColor(streak);
    burst(8 + 6 * tier, 'spark', 2.5 + tier * 0.9, 0.5 + tier * 0.07, color, tier >= 4 ? 3 : 2);
    burst(4 + 2 * tier, 'spark', 1.5 + tier * 0.5, 0.4, '#ffffff', 2);
    burst(6 + 2 * tier, 'ray', 7 + tier * 1.5, 0.22 + tier * 0.02, color, 1);
    this.ring(f.bx, f.by, 0.5 + tier * 0.1, color, 1 + tier * 0.4);
    if (tier >= 3) this.ring(f.bx, f.by, 0.9 + tier * 0.08, '#ffffff', 1.4 + tier * 0.5);
    this.pulse = { a: 0.1 + tier * 0.04, color };
    if (tier >= 4) this.shake = Math.max(this.shake, 0.12 + tier * 0.02);
  }

  private async finishFight(): Promise<void> {
    const f = this.fish;
    if (!f?.combat) return;
    const c = f.combat;
    this.stage('resolving');
    try {
      const r = await api<ResolveResponse>('/api/fishing/resolve', { sid: f.sid, taps: f.taps, end: c.tick });
      applyMutation(r);
      sfx(r.outcome === 'win' ? 'win' : 'lose');
      setState({
        result: {
          outcome: r.outcome, specimen: r.specimen, stored: r.stored, record: r.record, first: r.first,
          reason: r.outcome === 'lose' ? (c.state === 'win' ? 'Le serveur n’a pas validé ce combat.' : 'La ligne a cassé !') : undefined,
          stats: { crits: c.crits, hits: c.hits, misses: c.misses, seconds: c.tick / 60 },
        },
      });
    } catch (e) {
      toast((e as Error).message);
    }
    if (this.fish === f) this.endFishing(true);
  }

  /** Remonter la ligne (bouton, Échap, ou fin automatique du scénario). */
  async reelIn(auto = false): Promise<void> {
    const f = this.fish;
    if (!f) return;
    if (f.stage === 'fight' || f.stage === 'countdown' || f.stage === 'resolving' || f.stage === 'hooking') {
      if (!auto) toast('Impossible de lâcher la ligne en plein combat !');
      return;
    }
    this.endFishing(auto);
    if (!f.sid) return;
    try {
      applyMutation(await api<Mutation>('/api/fishing/cancel', { sid: f.sid }));
    } catch {
      /* session déjà close côté serveur */
    }
  }

  // ---------- Créatures hostiles ----------

  private startEncounter(e: Encounter): void {
    const kind = HOSTILE_BY_ID[e.kind];
    if (!kind || this.hostile) return;
    this.hostile = { id: e.id, kind, x: this.boat.x + Math.cos(e.angle) * e.dist, y: this.boat.y + Math.sin(e.angle) * e.dist, angle: e.angle + Math.PI, mode: 'stalk', t: 0, elapsed: 0, hitDone: false };
    sfx('alarm');
    toast(`${kind.name} en approche ! Esquivez ses charges ou rejoignez un port.`, 6000);
  }

  private updateHostile(dt: number): void {
    const h = this.hostile;
    if (!h) return;
    const b = this.boat;
    h.elapsed += dt;
    h.t -= dt;
    const dx = b.x - h.x;
    const dy = b.y - h.y;
    const d = Math.hypot(dx, dy);
    const move = (speed: number): void => {
      const nx = h.x + Math.cos(h.angle) * speed * dt;
      const ny = h.y + Math.sin(h.angle) * speed * dt;
      if (!this.terrain.isLand(Math.floor(nx), Math.floor(ny))) {
        h.x = nx;
        h.y = ny;
      }
    };
    if (h.mode !== 'leave' && h.mode !== 'charge' && (h.elapsed > h.kind.persist || d > 26 || portInRange(this.seed, b.x, b.y))) {
      h.mode = 'leave';
      h.t = 3.5;
      toast('La créature abandonne la poursuite.');
      void api('/api/encounter/end', { id: h.id }).catch(() => undefined);
    }
    if (h.mode === 'stalk') {
      h.angle += clamp(angDiff(Math.atan2(dy, dx), h.angle), -2.5 * dt, 2.5 * dt);
      move(h.kind.speed);
      if (d < 5.5) {
        // Attaque télégraphiée : la direction est figée maintenant, la charge part dans une seconde.
        h.mode = 'tele';
        h.t = 1;
        h.angle = Math.atan2(dy + Math.sin(b.angle) * b.speed * 0.4, dx + Math.cos(b.angle) * b.speed * 0.4);
        sfx('alarm');
      }
    } else if (h.mode === 'tele') {
      if (h.t <= 0) {
        h.mode = 'charge';
        h.t = 0.75;
        h.hitDone = false;
      }
    } else if (h.mode === 'charge') {
      move(h.kind.speed * 2.6);
      if (!h.hitDone && d < 1.15) {
        h.hitDone = true;
        this.shake = 1;
        sfx('crash');
        void this.takeHit(h.id);
      }
      if (h.t <= 0) {
        h.mode = 'recover';
        h.t = 1.7;
      }
    } else if (h.mode === 'recover') {
      move(h.kind.speed * 0.35);
      if (h.t <= 0) h.mode = 'stalk';
    } else if (h.mode === 'leave') {
      h.angle += clamp(angDiff(Math.atan2(-dy, -dx), h.angle), -3 * dt, 3 * dt);
      move(h.kind.speed);
      if (h.t <= 0) this.hostile = null;
    }
  }

  private async takeHit(id: string): Promise<void> {
    try {
      const r = await api<HitResponse>('/api/encounter/hit', { id });
      applyMutation(r);
      toast(`Coque touchée : −${r.damage} PC`);
      if (r.wrecked) {
        setState({ fade: true });
        this.hostile = null;
        if (this.fish) this.endFishing(false);
        setTimeout(() => {
          this.teleport(r.save.x, r.save.y);
          setState({ fade: false });
        }, 700);
      }
    } catch {
      /* attaque refusée par le serveur (cadence) : pas de dégât */
    }
  }

  private teleport(x: number, y: number): void {
    this.boat.x = this.lastSync.x = x;
    this.boat.y = this.lastSync.y = y;
    this.boat.speed = 0;
    this.cancelMove();
    this.cam.x = x * TILE;
    this.cam.y = y * TILE;
  }

  // ---------- Synchronisation ----------

  /** Envoie la position au serveur (qui la valide) ; reçoit filets, rencontres, corrections. */
  async sync(keepalive = false): Promise<void> {
    if (this.syncing || getState().phase !== 'game') return;
    this.syncTimer = 0;
    if (this.fish) return;
    this.syncing = true;
    const sent = { x: this.boat.x, y: this.boat.y };
    try {
      const r = await api<SyncResponse>('/api/sync', sent, { keepalive });
      applyMutation(r);
      if (r.corrected) {
        this.teleport(r.save.x, r.save.y);
        toast('Position rétablie par le serveur.');
      } else this.lastSync = sent;
      if (r.encounter) this.startEncounter(r.encounter);
      if (r.netted?.length) sfx('coin');
    } catch {
      /* hors ligne : on réessaiera au prochain cycle */
    } finally {
      this.syncing = false;
    }
  }

  // ---------- Chunks ----------

  private visibleChunks(margin: number): [number, number, number, number] {
    const ox = this.cam.x - this.vw / 2;
    const oy = this.cam.y - this.vh / 2;
    return [Math.floor(ox / CHUNK_PX) - margin, Math.floor(oy / CHUNK_PX) - margin, Math.floor((ox + this.vw) / CHUNK_PX) + margin, Math.floor((oy + this.vh) / CHUNK_PX) + margin];
  }

  /** Au plus un chunk généré par image : pas de saccade, chargement progressif autour de la caméra. */
  private buildOneChunk(): void {
    const [x0, y0, x1, y1] = this.visibleChunks(1);
    const ccx = this.cam.x / CHUNK_PX - 0.5;
    const ccy = this.cam.y / CHUNK_PX - 0.5;
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        if (this.terrain.peek(cx, cy)) continue;
        const d = Math.hypot(cx - ccx, cy - ccy);
        if (d < bd) {
          bd = d;
          best = [cx, cy];
        }
      }
    if (best) this.terrain.build(best[0], best[1]);
  }

  // ---------- Rendu ----------

  private render(): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false; // remis à chaque image : un contexte restauré par le navigateur repart lissé
    const { vw, vh } = this;
    const sx = this.shake > 0 ? Math.round((Math.random() - 0.5) * 6 * this.shake) : 0;
    const sy = this.shake > 0 ? Math.round((Math.random() - 0.5) * 6 * this.shake) : 0;
    const ox = Math.round(this.cam.x - vw / 2) + sx;
    const oy = Math.round(this.cam.y - vh / 2) + sy;
    const X = (tx: number): number => Math.round(tx * TILE - ox);
    const Y = (ty: number): number => Math.round(ty * TILE - oy);
    const t = this.time;
    const dec = getDecor();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1c4a70';
    ctx.fillRect(0, 0, vw, vh);
    const [cx0, cy0, cx1, cy1] = this.visibleChunks(0);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.terrain.peek(cx, cy);
        if (!c) continue;
        const px = cx * CHUNK_PX - ox;
        const py = cy * CHUNK_PX - oy;
        ctx.drawImage(c.canvas, px, py);
        // Reflets de vagues (tuiles d'eau tirées au sort, animées en décalé)
        ctx.fillStyle = '#e8fbff';
        const tx0 = Math.max(0, Math.floor(-px / TILE));
        const ty0 = Math.max(0, Math.floor(-py / TILE));
        const tx1 = Math.min(CHUNK - 1, Math.floor((vw - px) / TILE));
        const ty1 = Math.min(CHUNK - 1, Math.floor((vh - py) / TILE));
        for (let ty = ty0; ty <= ty1; ty++)
          for (let tx = tx0; tx <= tx1; tx++) {
            if (c.land[ty * CHUNK + tx]) continue;
            const h = hash2(this.seed + 3, cx * CHUNK + tx, cy * CHUNK + ty);
            if (h % 9 !== 0) continue;
            const ph = (t * 0.45 + (h >>> 8) / 16777216) % 1;
            if (ph > 0.55) continue;
            ctx.globalAlpha = Math.sin((ph / 0.55) * Math.PI) * 0.42;
            const wx = px + tx * TILE + ((h >>> 4) % 9) + Math.round(ph * 5);
            const wy = py + ty * TILE + ((h >>> 12) % 12);
            ctx.fillRect(wx, wy, 5, 1);
            ctx.fillRect(wx + 2, wy + 1, 4, 1);
          }
        // Écume qui scintille le long du rivage
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < c.foam.length; i += 2) {
          const fx = c.foam[i] + px;
          const fy = c.foam[i + 1] + py;
          if (fx < -2 || fy < -2 || fx > vw || fy > vh) continue;
          const a = Math.sin(t * 2.2 + ((i * 37) % 97)) * 0.5 + 0.35;
          if (a <= 0.1) continue;
          ctx.globalAlpha = Math.min(0.9, a);
          ctx.fillRect(fx, fy, 2, 1);
        }
        ctx.globalAlpha = 1;
      }

    // Ombres des poissons
    const drawShadows = (deepOnly = false): void => {
    const views = this.activeViews();
    for (const v of views) {
      const deep = v.sh.biome === 'deep' || v.sh.biome === 'abyss';
      if (deepOnly !== deep) continue;
      const px = X(v.x);
      const py = Y(v.y);
      if (px < -50 || py < -50 || px > vw + 50 || py > vh + 50) continue;
      const frames = shadowFrames(v.sh.sil,deep);
      const fast = this.fish?.target === v && (this.fish.stage === 'fight' || this.fish.stage === 'countdown');
      const fr = frames[Math.floor(t * (fast ? 16 : 5 + SPEED[v.sh.sil] * 4) + v.sh.seed) % SHADOW_FRAMES];
      const scale = v.sh.sil === 'giant' ? 0.9 + v.sh.size * 0.5 : 0.8 + v.sh.size * 0.45;
      const alpha = (deep ? 0.65 : clamp(0.5 - v.sh.depth * 0.2, 0.25, 0.5)) * Math.min(1, (t - v.born) * 0.8 + 0.05) * (v.flee > 0 ? Math.min(1, v.flee) : 1);
      const n = v.sh.school;
      for (let i = 0; i < n; i++) {
        const oa = i * 2.4 + t * 0.6;
        const ddx = i ? Math.cos(oa) * (5 + i * 2) : 0;
        const ddy = i ? Math.sin(oa * 1.3) * (4 + i * 2) : 0;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(px + Math.round(ddx), py + Math.round(ddy));
        ctx.rotate(v.angle);
        ctx.scale(scale, scale);
        ctx.drawImage(fr, -fr.width / 2, -fr.height / 2);
        ctx.restore();
      }
    }

    };
    drawShadows();

    // Ports : ponton, cabane, phare, nom
    const lights: [number, number][] = [];
    for (const p of this.portsNear(this.cam.x / TILE, this.cam.y / TILE)) {
      const px = X(p.x + 0.5);
      const py = Y(p.y);
      if (px < -80 || py < -120 || px > vw + 80 || py > vh + 120) continue;
      ctx.drawImage(dec.pier, px - 6, py - 36);
      ctx.drawImage(dec.hut, X(p.ix - 2.2), Y(p.iy + 0.6) - 13);
      const lx = X(p.ix + 1.9);
      const ly = Y(p.iy - 0.6);
      ctx.drawImage(dec.lighthouse, lx - 5, ly - 22);
      ctx.drawImage(dec.flag, px + 6, py - 44 + Math.round(Math.sin(t * 3) * 0.6));
      lights.push([lx, ly - 18]);
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,16,32,0.75)';
      const w = ctx.measureText(p.name).width + 6;
      ctx.fillRect(Math.round(px - w / 2), py - 60, Math.round(w), 10);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(p.name, px, py - 52);
    }

    // Cap : route et marqueur de destination
    const b = this.boat;
    if (b.dest) {
      ctx.fillStyle = '#ffffff';
      let prev: Pt = b;
      for (const wp of b.path) {
        const d = Math.hypot(wp.x - prev.x, wp.y - prev.y);
        for (let s = 1; s < d; s += 1.2) {
          ctx.globalAlpha = 0.35;
          ctx.fillRect(X(prev.x + ((wp.x - prev.x) * s) / d), Y(prev.y + ((wp.y - prev.y) * s) / d), 2, 2);
        }
        prev = wp;
      }
      const r = 5 + Math.round(Math.sin(t * 5) * 1.5);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffe14a';
      ctx.lineWidth = 1;
      ctx.strokeRect(X(b.dest.x) - r + 0.5, Y(b.dest.y) - r + 0.5, r * 2, r * 2);
      ctx.fillStyle = '#ffe14a';
      ctx.fillRect(X(b.dest.x) - 1, Y(b.dest.y) - 1, 2, 2);
      ctx.globalAlpha = 1;
    }

    // Anneau de portée quand un lancer est possible
    if (!this.fish && b.speed < 0.6) {
      const target = this.castTarget();
      if (target) {
        ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.25;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(X(target.x), Y(target.y), 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Particules (sillage, ronds dans l'eau, éclaboussures)
    for (const p of this.particles) {
      const k = p.life / p.max;
      const px = X(p.x);
      const py = Y(p.y);
      if (p.kind === 'ring') {
        const s = p.size ?? 1;
        ctx.globalAlpha = k * 0.85;
        ctx.strokeStyle = p.color ?? '#ffffff';
        ctx.lineWidth = s > 1.5 ? 2 : 1;
        ctx.beginPath();
        ctx.ellipse(px, py, (1 - k) * 12 * s + 2, (1 - k) * 7 * s + 1, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      } else if (p.kind === 'ray') {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color ?? '#ffffff';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(X(p.x - p.vx * 0.07), Y(p.y - p.vy * 0.07));
        ctx.stroke();
      } else {
        const s = p.size ?? (p.kind === 'splash' ? 1 : 2);
        ctx.globalAlpha = k * (p.kind === 'wake' ? 0.6 : 0.95);
        ctx.fillStyle = p.color ?? '#ffffff';
        ctx.fillRect(px, py, s, Math.max(2, s));
      }
    }
    ctx.globalAlpha = 1;

    // Ligne et bouchon
    const f = this.fish;
    if (f) {
      const rodX = X(b.x + Math.cos(b.angle) * 0.6);
      const rodY = Y(b.y + Math.sin(b.angle) * 0.6) - 4;
      let bx = X(f.bx);
      let by = Y(f.by);
      if (f.stage === 'casting') {
        const k = f.castT;
        bx = Math.round(rodX + (bx - rodX) * k);
        by = Math.round(rodY + (by - rodY) * k - Math.sin(k * Math.PI) * 26);
      }
      const taut = f.stage === 'fight' || f.stage === 'countdown' || f.stage === 'resolving';
      ctx.strokeStyle = taut && f.combat && f.combat.line / f.combat.p.line < 0.3 ? '#ff6a5a' : '#f4f4f4';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(rodX + 0.5, rodY + 0.5);
      ctx.quadraticCurveTo((rodX + bx) / 2, (rodY + by) / 2 + (taut ? 0 : 7), bx + 0.5, by + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const bob = f.stage === 'casting' ? 0 : Math.round(Math.sin(t * 3) * 0.8);
      const sink = Math.round(f.dip * 4);
      if (f.dip < 0.95) {
        ctx.drawImage(dec.bobber, 0, 0, 5, 5 - Math.min(4, sink), bx - 2, by - 3 + bob + sink, 5, 5 - Math.min(4, sink));
      }
      if (f.stage === 'bitten') ctx.drawImage(dec.alert, bx - 2, by - 18 + Math.round(Math.sin(t * 20) * 1.5));
    }

    // Créature hostile
    const h = this.hostile;
    if (h) {
      const hx = X(h.x);
      const hy = Y(h.y);
      if (h.mode === 'tele') {
        ctx.strokeStyle = '#ff3b30';
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 22);
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.cos(h.angle) * 11 * TILE, hy + Math.sin(h.angle) * 11 * TILE);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.drawImage(dec.alert, hx - 2, hy - 24);
      }
      const kind: Silhouette = h.kind.id === 'calmar_furieux' ? 'cephalo' : h.kind.id === 'serpent_de_mer' ? 'long' : 'shark';
      const frames = shadowFrames(kind);
      const fr = frames[Math.floor(t * (h.mode === 'charge' ? 18 : 8)) % SHADOW_FRAMES];
      const sc = kind === 'shark' ? 1.5 : kind === 'long' ? 2.4 : 2.2;
      ctx.save();
      ctx.globalAlpha = h.mode === 'leave' ? Math.max(0, h.t / 3.5) * 0.8 : 0.82;
      ctx.translate(hx, hy);
      ctx.rotate(h.angle);
      ctx.scale(sc, sc);
      ctx.drawImage(fr, -fr.width / 2, -fr.height / 2);
      ctx.restore();
      if (kind === 'shark') ctx.drawImage(dec.fin, hx - 4, hy - 7);
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(hx + Math.round(Math.cos(h.angle) * 9) - 1, hy + Math.round(Math.sin(h.angle) * 9) - 1, 2, 2);
    }

    // Bateau
    const save = getState().save;
    const hullLv = save?.up.hull ?? 0;
    const spr = boatSprite(hullLv >= 20 ? 2 : hullLv >= 5 ? 1 : 0);
    ctx.save();
    ctx.translate(X(b.x), Y(b.y) + Math.round(Math.sin(t * 2.2) * 0.8));
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#04121f';
    ctx.beginPath();
    ctx.ellipse(1, 3, spr.width * 0.42, spr.width * 0.2, b.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(b.angle + Math.sin(t * 1.7) * 0.03);
    ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
    ctx.restore();

    // Météo, nuit, lumières
    const dark = 1 - this.light;
    if (this.weather === 'pluie' || this.weather === 'orage') {
      const snow = tileAt(this.seed, Math.floor(b.x), Math.floor(b.y)).biome === 'polar';
      ctx.fillStyle = snow ? '#ffffff' : '#cfe6ff';
      ctx.globalAlpha = snow ? 0.8 : 0.45;
      const n = this.weather === 'orage' ? this.rain.length : this.rain.length * 0.55;
      for (let i = 0; i < n; i++) {
        const d = this.rain[i];
        d.y += snow ? 0.7 : 4.5;
        d.x -= snow ? Math.sin(t + i) * 0.4 : 1.2;
        if (d.y > vh) {
          d.y = -4;
          d.x = Math.random() * (vw + 40);
        }
        ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, snow ? 1 : 4);
      }
      ctx.globalAlpha = 1;
    }
    if (this.weather === 'brume') {
      ctx.fillStyle = 'rgba(205,220,230,0.3)';
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = 'rgba(230,240,245,0.16)';
      for (let i = 0; i < 5; i++) {
        const fx = ((i * 97 + t * (6 + i)) % (vw + 160)) - 80;
        ctx.beginPath();
        ctx.ellipse(fx, (i * 53) % vh, 90, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tint = this.light > 0.02 && this.light < 0.98 ? Math.sin(this.light * Math.PI) : 0;
    if (tint > 0) {
      ctx.fillStyle = `rgba(255,140,70,${0.16 * tint})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    const night = 0.6 * dark + (this.weather === 'orage' ? 0.2 : this.weather === 'pluie' ? 0.08 : 0);
    if (night > 0.01) {
      ctx.fillStyle = `rgba(8,14,48,${Math.min(0.75, night)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    // En profondeur : silhouettes lumineuses après le voile de nuit.
    drawShadows(true);
    if (dark > 0.15) {
      ctx.globalCompositeOperation = 'lighter';
      const glow = (gx: number, gy: number, r: number, a: number): void => {
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        g.addColorStop(0, `rgba(255,225,140,${a * dark})`);
        g.addColorStop(1, 'rgba(255,225,140,0)');
        ctx.fillStyle = g;
        ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
      };
      glow(X(b.x), Y(b.y), 30, 0.5);
      for (const [lx, ly] of lights) {
        glow(lx, ly, 46, 0.7);
        const a = t * 0.9;
        ctx.fillStyle = `rgba(255,235,160,${0.14 * dark})`;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(a - 0.14) * 150, ly + Math.sin(a - 0.14) * 150);
        ctx.lineTo(lx + Math.cos(a + 0.14) * 150, ly + Math.sin(a + 0.14) * 150);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Combo : voile de couleur bref, plus un halo sur les bords tant que la série dure.
    const serie = comboTier(this.fish?.combat?.streak ?? 0);
    if (serie || this.pulse.a > 0.004) {
      const color = serie ? comboColor(this.fish!.combat!.streak) : this.pulse.color;
      const edge = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      edge.addColorStop(0, 'rgba(0,0,0,0)');
      edge.addColorStop(1, color);
      ctx.globalAlpha = Math.min(0.75, serie * 0.07 + this.pulse.a * 1.6);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = this.pulse.a;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
    if (this.lightning > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.lightning * 0.55})`;
      ctx.fillRect(0, 0, vw, vh);
    }
  }
}
