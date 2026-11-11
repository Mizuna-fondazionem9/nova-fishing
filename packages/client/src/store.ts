// État de l'application côté client + appels au serveur.
import { useSyncExternalStore } from 'react';
import type { Save, Challenge, UserInfo, Specimen, Port, Weather, TimeOfDay, BiomeId, MeResponse, Mutation } from '../../shared/src/index';

export type Panel = null | 'port' | 'ship' | 'bestiary' | 'aquarium' | 'trophies' | 'daily' | 'settings' | 'map';

export interface Hud {
  biome: BiomeId;
  x: number;
  y: number;
  level: number;
  port: Port | null;
  moving: boolean;
  canCast: boolean;
  tod: TimeOfDay;
  weather: Weather;
  danger: boolean;
  fps: number;
}

export type FishStage = null | 'casting' | 'waiting' | 'bitten' | 'hooking' | 'countdown' | 'fight' | 'resolving';

export interface CatchResult {
  outcome: 'win' | 'lose';
  reason?: string;
  specimen?: Specimen;
  stored?: boolean;
  record?: boolean;
  first?: boolean;
  stats?: { crits: number; hits: number; misses: number; seconds: number };
}

export interface AppState {
  phase: 'loading' | 'login' | 'game';
  loadText: string;
  loadPct: number;
  authError: string | null;
  devAuth: boolean;
  discord: boolean;
  user: UserInfo | null;
  save: Save | null;
  seed: number;
  daily: Challenge[];
  panel: Panel;
  toasts: { id: number; text: string }[];
  hud: Hud | null;
  fishing: FishStage;
  result: CatchResult | null;
  sound: boolean;
  fade: boolean;
  /** Augmente quand les images doivent être redessinées (retour d'arrière-plan). */
  gfx: number;
}

let state: AppState = {
  phase: 'loading', loadText: 'Connexion…', loadPct: 0, authError: null, devAuth: false, discord: true, user: null, save: null, seed: 0, daily: [],
  panel: null, toasts: [], hud: null, fishing: null, result: null,
  sound: (() => {
    try {
      return localStorage.getItem('nf_sound') !== '0';
    } catch {
      return true;
    }
  })(),
  fade: false,
  gfx: 0,
};
const listeners = new Set<() => void>();

export const getState = (): AppState => state;
export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

let toastId = 1;
export function toast(text: string, ms = 4200): void {
  const id = toastId++;
  setState({ toasts: [...state.toasts.slice(-4), { id, text }] });
  setTimeout(() => setState({ toasts: state.toasts.filter((t) => t.id !== id) }), ms);
}

/** Applique la réponse d'une opération serveur : nouvelle sauvegarde, notifications, défis. */
export function applyMutation(m: Mutation): void {
  setState({ save: m.save, ...(m.daily ? { daily: m.daily } : {}) });
  for (const n of m.notes ?? []) toast(n);
}

// ---------- Réseau ----------

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Préfixe d'adresse du jeu : '' à la racine d'un domaine, '/fishing' quand il est servi sous novabot-hub.fr/fishing.
 * Le serveur l'indique dans la balise <base> de la page ; tout le client s'y réfère.
 */
export const BASE = ((): string => {
  try {
    return new URL(document.baseURI).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
})();

let clockOffset = 0;
/** Heure du serveur (ms) : sert aux créneaux d'ombres, à la météo et au cycle jour/nuit. */
export const serverNow = (): number => Date.now() + clockOffset;

export async function api<T>(path: string, body?: unknown, opts: { keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-NF-Client': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      keepalive: opts.keepalive,
    });
  } catch {
    throw new ApiError('Connexion au serveur perdue.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && state.phase === 'game') setState({ phase: 'login', authError: 'Session expirée, reconnectez-vous.' });
    throw new ApiError(data.error ?? `Erreur ${res.status}`, res.status);
  }
  return data as T;
}

export async function loadMe(): Promise<MeResponse | null> {
  try {
    const me = await api<MeResponse>('/api/me');
    clockOffset = me.now - Date.now();
    return me;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

/** Opération de port : envoie, applique, et signale l'erreur éventuelle par une notification. */
export async function portOp(path: string, body: unknown = {}): Promise<boolean> {
  try {
    applyMutation(await api<Mutation>(path, body));
    return true;
  } catch (e) {
    toast((e as Error).message);
    return false;
  }
}
