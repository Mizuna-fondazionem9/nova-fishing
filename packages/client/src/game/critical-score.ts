/** Dix impacts harmoniques, sans jingle périodique. Tous les paramètres plafonnent à 10. */
export function criticalScore(streak: number) {
  const level = Math.min(10, Math.max(1, Math.floor(Number.isFinite(streak) ? streak : 1)));
  const bloom = (level - 1) / 9;
  const pitch = 293.66 * 2 ** ([0, 2, 4, 5, 7, 9, 11, 12, 14, 16][level - 1] / 12);
  // Les voix entrent ensemble : le timbre s'épanouit, sans succession de notes.
  const layers = [
    { ratio: 1, volume: 0.14, duration: 0.32 + bloom * 0.4, attack: 0.005 },
    { ratio: 0.5, volume: 0.035 + bloom * 0.018, duration: 0.22 + bloom * 0.25, attack: 0.008 },
    { ratio: 2, volume: 0.009 + bloom * 0.025, duration: 0.18 + bloom * 0.42, attack: 0.006 },
    { ratio: 1.5, volume: bloom * 0.036, duration: 0.28 + bloom * 0.5, attack: 0.018 },
    { ratio: 1.25, volume: bloom * bloom * 0.026, duration: 0.35 + bloom * 0.55, attack: 0.025 },
    // Halo désaccordé très discret : sensation cristalline aux derniers paliers.
    { ratio: 2.003, volume: bloom * bloom * 0.014, duration: 0.3 + bloom * 0.65, attack: 0.035 },
  ];
  return { level, pitch, echo: 0.12 + bloom * 0.3, layers };
}
