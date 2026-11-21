import type { ArtSpec } from '../fish-specs';

export const art: Record<string, ArtSpec> = {
  "legine_antarctique": {"L": 48, "T": 7.3, "B": 8.2, "pk": 0.28, "pkB": 0.38, "nose": 0.6, "ped": 1.5, "sag": [0.4, 0.18, 1.5], "tail": ["trunc", 6, 6], "d": [{"a": 0.24, "b": 0.38, "h": 5, "k": "round"}, {"a": 0.42, "b": 0.62, "h": 4.5, "k": "round"}, {"a": 0.66, "b": 0.84, "h": 3.5, "k": "round"}], "an": [{"a": 0.44, "b": 0.62, "h": 4, "k": "round"}, {"a": 0.66, "b": 0.84, "h": 3, "k": "round"}], "pel": [0.24, 3], "pec": ["in", 0.28, 5], "barb": [1, 3], "pat": [["wavy", 3, 0]], "mouth": 7},
  "trematome_de_bernacchi": {"L": 23, "T": 4.4, "B": 4.2, "pk": 0.14, "nose": 0.4, "ped": 1.3, "tp": 0.9, "tail": ["point", 8, 4.5], "tc": 1, "d": [{"a": 0.24, "b": 0.44, "h": 6, "k": "round", "c": 1, "tip": 2}, {"a": 0.48, "b": 0.9, "h": 5, "k": "round", "c": 1, "tip": 2}], "an": [{"a": 0.5, "b": 0.9, "h": 4, "k": "round", "c": 1}], "pel": [0.26, 4, 2], "pec": ["in", 0.28, 5, 1], "mouth": 3, "eye": [4, -0.32, 2], "gill": 0, "bl": 0.5, "pat": []},
  "notothenie_marbree": {"L": 32, "T": 4.2, "B": 4.3, "pk": 0.26, "ped": 0.9, "tail": ["fork", 6, 5], "d": [{"a": 0.26, "b": 0.38, "h": 3.5}, {"a": 0.44, "b": 0.6, "h": 3.5}, {"a": 0.66, "b": 0.84, "h": 3}], "an": [{"a": 0.44, "b": 0.6, "h": 3}, {"a": 0.66, "b": 0.84, "h": 2.5}], "pel": [0.24, 3], "jaw": 1, "barb": [1, 2], "eye": [4, -0.3, 2], "pat": [["wavy", 3, 0]]},
  "krill_antarctique": {"r": "crust", "L": 22, "th": 2.8, "curl": 0.55, "rostrum": 2, "ant": [12, 6], "legs": [7, 3], "fan": 4, "segs": 6, "pat": [["dots", 4, 2, 1, 0.4, 0.85]]},
  "baleine_bleue": {"L": 59, "T": 11.3, "B": 10.3, "pk": 0.278, "nose": 0.55, "noseB": 0.4, "ped": 1.6, "tp": 1.35, "hump": [0.2, 0.05, 1.6], "tail": ["fluke", 9, 9], "tc": 0, "pec": ["paddle", 0.29, 8, 1], "gill": 0, "mouth": 0, "eye": [22, 0.35, 1, 1], "bl": 2, "pat": [["wavy", 3, 0], ["spots", 12, 2, -0.85, 0.55]], "d": [{"a": 0.65, "b": 0.77, "h": 3, "k": "falc"}]},
  "phoque_leopard": {"r": "animal", "kind": "seal", "w": 23, "h": 6, "count": 2, "reach": 7, "mark": "leopard"},
  "phoque_de_weddell": {"r": "animal", "kind": "seal", "w": 20, "h": 9, "count": 2, "reach": 6, "mark": "weddell"},
  "phoque_du_groenland": {"r": "animal", "kind": "seal", "w": 18, "h": 8, "count": 2, "reach": 7, "mark": "harp"},
  "morse": {"r": "animal", "kind": "seal", "w": 22, "h": 10, "count": 2, "reach": 10, "mark": "tusks"},
  "elephant_de_mer_du_sud": {"r": "animal", "kind": "seal", "w": 24, "h": 9, "count": 2, "reach": 8, "mark": "trunk"},
  "meduse_a_criniere_de_lion": {"r": "animal", "kind": "jelly", "w": 20, "h": 10, "count": 26, "reach": 20, "mark": "mane"},
};
