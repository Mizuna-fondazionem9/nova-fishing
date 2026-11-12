// Types des échanges client <-> serveur.
import type { Save, Challenge } from './save';
import type { Specimen } from './fish';
import type { BiteScript, CombatParams } from './fishing';

export interface UserInfo {
  id: string;
  name: string;
  avatar: string | null;
}

export interface MeResponse {
  user: UserInfo;
  save: Save;
  seed: number;
  now: number;
  daily: Challenge[];
}

/** Ce que renvoie toute opération qui modifie la sauvegarde. */
export interface Mutation {
  save: Save;
  /** Messages à afficher (trophées, défis, filets...). */
  notes: string[];
  daily?: Challenge[];
}

export interface Encounter {
  id: string;
  kind: string;
  shadowKey?: string;
  speciesId?: string;
  x?: number; y?: number;
  /** Angle d'arrivée (radians) et distance d'apparition (tuiles). */
  angle: number;
  dist: number;
}

export interface SyncResponse extends Mutation {
  /** Vrai si le serveur a refusé le déplacement et replacé le bateau. */
  corrected: boolean;
  encounter?: Encounter;
  netted?: Specimen[];
}

export interface CastResponse {
  sid: string;
  script: BiteScript;
  harpoon?: boolean;
  save?: Save;
}

export interface HookResponse {
  verdict: 'ok' | 'early' | 'late' | 'none';
  wrecked?: boolean;
  combat?: CombatParams;
  save?: Save;
}

export interface ResolveResponse extends Mutation {
  outcome: 'win' | 'lose';
  specimen?: Specimen;
  stored?: boolean;
  record?: boolean;
  first?: boolean;
}

export interface HitResponse extends Mutation {
  wrecked: boolean;
  damage: number;
}

export interface ApiError {
  error: string;
}
