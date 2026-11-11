/** Une phrase musicale par critique ; dès 3, les notes sont réellement égrenées.
 * Ré majeur / ré majeur 9 : tous les paliers restent compatibles si leurs queues se croisent.
 */
export function criticalScore(streak: number) {
  const level = Math.min(10, Math.max(1, Math.floor(Number.isFinite(streak) ? streak : 1)));
  const bloom = (level - 1) / 9;
  const pitch = 293.66;
  const phrases = [
    [0], [7], [0, 4, 7], [0, 4, 7, 12],
    [0, 4, 7, 12, 16], [0, 4, 7, 11, 14, 19],
    [0, 4, 7, 12, 16, 19, 24],
    [0, 4, 7, 11, 14, 19, 23, 24],
    [0, 4, 7, 12, 16, 19, 24, 26, 24],
    [0, 4, 7, 11, 14, 19, 23, 26, 28, 24],
  ];
  const phrase = phrases[level - 1];
  const layers: { ratio: number; volume: number; duration: number; attack: number; delay: number; type: 'sine' | 'triangle' }[] = [];
  const spacing = 0.079 - bloom * 0.014;
  phrase.forEach((semitone, i) => {
    const ratio = 2 ** (semitone / 12);
    // Accent d'ouverture puis cascade, légère respiration avant la résolution.
    const delay = i * spacing + (i === phrase.length - 1 && level >= 3 ? 0.035 : 0);
    const last = i === phrase.length - 1;
    const volume = (0.145 + bloom * 0.025) * (i === phrase.length - 1 ? 1.05 : i % 3 === 0 ? 1 : 0.85);
    // Harpe de verre : attaque précise, corps rond et éclat bref.
    layers.push({ ratio, volume, duration: 0.3 + bloom * 0.22 + (last ? bloom * 0.22 : 0), attack: 0.003, delay, type: 'triangle' });
    layers.push({ ratio: ratio * 2, volume: volume * 0.22, duration: 0.11 + bloom * 0.09, attack: 0.003, delay, type: 'sine' });
  });
  // Une nappe grave soutient la cascade, plus présente à chaque palier.
  layers.push({ ratio: 0.5, volume: 0.025 + bloom * 0.025, duration: 0.24 + bloom * 0.7, attack: 0.015, delay: 0, type: 'sine' });
  if (level >= 4) {
    // Résolution lumineuse sur la dernière note, sans deuxième jingle.
    const delay = (phrase.length - 1) * spacing + 0.035;
    layers.push({ ratio: 1.25, volume: bloom * 0.035, duration: 0.45 + bloom * 0.3, attack: 0.025, delay, type: 'sine' });
    layers.push({ ratio: 1.5, volume: bloom * 0.03, duration: 0.5 + bloom * 0.25, attack: 0.025, delay, type: 'sine' });
  }
  if (level >= 6) {
    const delay = (phrase.length - 1) * spacing + 0.035;
    layers.push({ ratio: 2, volume: bloom * 0.045, duration: 0.8, attack: 0.008, delay, type: 'triangle' });
    layers.push({ ratio: 3, volume: bloom * 0.025, duration: 0.65, attack: 0.012, delay, type: 'sine' });
  }
  return { level, pitch, echo: 0.1 + bloom * 0.18, layers };
}
