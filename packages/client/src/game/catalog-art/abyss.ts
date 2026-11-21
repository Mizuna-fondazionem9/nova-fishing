import type { ArtSpec } from '../fish-specs';

export const art: Record<string, ArtSpec> = {
  "poisson_escargot_de_mariana": {"L": 36, "T": 4.2, "B": 4.7, "pk": 0.26, "nose": 1.3, "ped": 1, "tail": ["trunc", 5, 5], "d": [{"a": 0.3, "b": 0.4, "h": 6, "k": "spine"}, {"a": 0.44, "b": 0.92, "h": 4, "k": "low"}], "an": [{"a": 0.48, "b": 0.92, "h": 3, "k": "low"}], "pel": [0.28, 4], "pec": ["in", 0.3, 9, 8], "jaw": 1, "mouth": 7, "eye": [7, -0.3, 2], "pat": []},
  "brotule_abyssale": {"L": 39, "T": 3.0, "B": 3.0, "pk": 0.158, "nose": 0.5, "ped": 1, "tp": 0.8, "tail": ["point", 6, 3.5], "d": [{"a": 0.14, "b": 0.97, "h": 3, "k": "spine"}], "an": [{"a": 0.44, "b": 0.97, "h": 2.5, "k": "low"}], "pel": [0.16, 3], "pec": ["in", 0.16, 7, 1], "mouth": 3, "eye": [3, -0.4, 1], "gill": 0, "bl": 0.6, "pat": []},
  "poisson_trepied": {"L": 52, "T": 6.1, "B": 6.1, "pk": 0.138, "nose": 0.5, "ped": 0.4, "tp": 0.7, "tail": null, "d": [{"a": 0.16, "b": 0.22, "h": 6}, {"a": 0.26, "b": 1, "h": 1.5, "k": "low"}], "an": [{"a": 0.84, "b": 0.92, "h": 18, "k": "fila"}], "pec": ["in", 0.16, 5], "mouth": ["down", 4], "barb": [1, 3], "eye": [5, -0.3, 3], "pat": [], "pel": [0.35, 19]},
  "amphipode_geant": {"r": "crust", "L": 32, "th": 6.2, "curl": 1.4, "rostrum": 1, "ant": [6, 3], "legs": [5, 5], "fan": 4, "segs": 6, "pat": [], "hump": 3},
  "cochon_de_mer": {"r": "animal", "kind": "slug", "w": 11, "h": 7, "count": 6, "reach": 5, "mark": "feet"},
};
