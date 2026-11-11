// Série de coups critiques (« combo ») : palette et paliers partagés entre le moteur et l'interface.
// La couleur change à chaque palier : or, orange, rose, violet, puis cyan à partir de 6.

export const COMBO_COLORS = ['#ffe14a', '#ff9f43', '#ff5c8a', '#c77dff', '#5cf0ff'];

/** Palier d'intensité des effets : 0 sans série, puis 2 à 6 (plafond). */
export const comboTier = (streak: number): number => (streak < 2 ? 0 : Math.min(streak, 6));

const WORDS = ['COMBO', 'SUPER', 'GÉNIAL', 'FURIEUX', 'LÉGENDAIRE'];
/** Mot affiché sous le compteur : il change avec le palier. */
export const comboWord = (streak: number): string => WORDS[Math.max(comboTier(streak), 2) - 2];

export const comboColor = (streak: number): string => COMBO_COLORS[Math.max(comboTier(streak), 2) - 2];
