import type { Shape, Silhouette } from '../species';

export interface FieldNotes {
  scientificName: string;
  group: string;
  sizeRange: string;
  weightRange: string;
  estimatedWeight: boolean;
}

export interface FieldEntry extends FieldNotes {
  id: string;
  name: string;
  description: string;
  lmin: number;
  lmax: number;
  kgMin: number;
  kgMax: number;
  shape: Shape;
  sil: Silhouette;
  rarity: number;
  tier: number;
  colors: [string, string, string];
}
