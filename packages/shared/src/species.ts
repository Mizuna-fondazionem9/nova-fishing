// Base des espèces. Les identifiants sont STABLES : ne jamais les renommer (sauvegardes, bestiaire).
import { BIOME_IDS, type BiomeId, type TimeOfDay, type Weather } from './world';

export type Silhouette = 'small' | 'long' | 'massive' | 'shark' | 'ray' | 'cephalo' | 'giant' | 'crab';
export const SILHOUETTE_NAMES: Record<Silhouette, string> = {
  crab: 'Crabe',
  small: 'Petit poisson',
  long: 'Poisson allongé',
  massive: 'Poisson massif',
  shark: 'Requin',
  ray: 'Raie',
  cephalo: 'Céphalopode',
  giant: 'Créature gigantesque',
};

export const RARITY_NAMES = ['Commun', 'Peu commun', 'Rare', 'Épique', 'Légendaire', 'Mythique'];
export const RARITY_COLORS = ['#9aa5b1', '#4caf6a', '#3d8bfd', '#a05cf0', '#f0b429', '#ff8fb3'];
export const RARITY_VALUE = [1, 1.5, 2.4, 4, 7, 12];
export const RARITY_WEIGHT = [100, 38, 12, 3.5, 0.7, 0.12];

export type CursorProfile = 'regular' | 'accel' | 'oscillating' | 'erratic';
/** Comportement de touche : franc, prudent, joueur (feintes), vorace, timide. */
export type BiteStyle = 'franc' | 'prudent' | 'joueur' | 'vorace' | 'timide';
/** Ce qui grandit le plus avec le niveau régional : chaque espèce garde son identité. */
export type Focus = 'endurant' | 'puissant' | 'vif' | 'ruse';
export type Shape =
  | 'fusi' | 'slim' | 'deep' | 'eel' | 'bill' | 'tuna' | 'shark' | 'ray' | 'flat'
  | 'shell' | 'shrimp' | 'crab' | 'octo' | 'squid' | 'whale' | 'serpent' | 'angler' | 'moon' | 'seahorse';

export interface Species {
  id: string;
  name: string;
  desc: string;
  biomes: BiomeId[];
  /** Plage de profondeur normalisée où l'espèce apparaît. */
  dmin: number;
  dmax: number;
  sil: Silhouette;
  /** Longueur min/max en cm, poids du plus grand spécimen normal en kg. */
  lmin: number;
  lmax: number;
  kgMax: number;
  rarity: number;
  /** Difficulté de référence (1 = sardine, 30 = léviathan). */
  tier: number;
  value: number;
  stam: number;
  pow: number;
  spd: number;
  aggr: number;
  profile: CursorProfile;
  bite: BiteStyle;
  focus: Focus;
  prefs: { time?: TimeOfDay; weather?: Weather };
  shape: Shape;
  colors: [string, string, string];
  ancient?: boolean;
  pattern: 'none' | 'stripes' | 'spots' | 'bands';
}

type Opt = Partial<Pick<Species, 'stam' | 'pow' | 'spd' | 'aggr' | 'profile' | 'bite' | 'focus' | 'prefs' | 'pattern'>>;

function S(
  id: string, name: string, desc: string, biomes: string, dmin: number, dmax: number, sil: Silhouette,
  lmin: number, lmax: number, kgMax: number, rarity: number, tier: number, shape: Shape, colors: string, o: Opt = {},
): Species {
  return {
    id, name, desc, biomes: biomes.split(' ') as BiomeId[], dmin, dmax, sil, lmin, lmax, kgMax, rarity, tier,
    value: Math.round(5 * Math.pow(tier, 1.55) * RARITY_VALUE[rarity]),
    stam: 1, pow: 1, spd: 1, aggr: 0.2, profile: 'regular', bite: 'franc', focus: 'endurant', prefs: {},
    shape, colors: colors.split(' ') as [string, string, string], pattern: 'none', ...o,
  };
}

export const SPECIES: Species[] = [
  // --- Eaux côtières ---
  S('sardine', 'Sardine', 'Petit poisson argenté qui vit en bancs serrés.', 'coastal temperate', 0, 0.5, 'small', 10, 25, 0.15, 0, 1, 'slim', '#5f8fb8 #dfe9f2 #2f4d6b', { bite: 'franc', focus: 'vif' }),
  S('anchois', 'Anchois', 'Minuscule, nerveux, et toujours en groupe.', 'coastal tropical', 0, 0.45, 'small', 8, 18, 0.06, 0, 1, 'slim', '#6fa3a8 #e6efe9 #36585c', { bite: 'vorace', focus: 'vif', spd: 1.1 }),
  S('maquereau', 'Maquereau', 'Nageur infatigable au dos tigré.', 'coastal temperate', 0, 0.6, 'small', 20, 45, 1.2, 0, 1.6, 'fusi', '#2f7f8f #e3eef0 #173d47', { pattern: 'stripes', bite: 'vorace', focus: 'vif', spd: 1.15 }),
  S('mulet', 'Mulet', 'Brouteur placide des ports et des estuaires.', 'coastal', 0, 0.3, 'small', 25, 60, 3, 0, 1.5, 'fusi', '#8a96a0 #e8ecef #4d565e', { bite: 'prudent' }),
  S('bar', 'Bar commun', 'Chasseur des vagues, méfiant et puissant.', 'coastal temperate', 0, 0.5, 'small', 35, 90, 8, 1, 2.6, 'fusi', '#7d8c98 #eef1f3 #3c4852', { bite: 'prudent', focus: 'puissant', pow: 1.15, prefs: { time: 'aube' } }),
  S('daurade', 'Daurade royale', 'Reconnaissable à son bandeau doré entre les yeux.', 'coastal reef', 0, 0.35, 'small', 25, 65, 5, 1, 2.4, 'deep', '#a9b4bd #f1f0e6 #d9a73a', { bite: 'joueur' }),
  S('orphie', 'Orphie', 'Aiguille vivante aux arêtes vertes.', 'coastal temperate', 0, 0.4, 'long', 40, 90, 1.3, 1, 2, 'eel', '#4f9a8a #e4f0ea #25584c', { bite: 'vorace', focus: 'vif', spd: 1.25, profile: 'accel' }),
  S('congre', 'Congre', 'Serpent des épaves, tout en muscles.', 'coastal temperate deep', 0.1, 0.8, 'long', 80, 240, 60, 2, 5, 'eel', '#55606b #c9d0d6 #2a3138', { bite: 'prudent', focus: 'puissant', pow: 1.3, stam: 1.2, prefs: { time: 'nuit' } }),
  S('sole', 'Sole', 'Poisson plat enfoui dans le sable.', 'coastal', 0, 0.4, 'ray', 20, 55, 2.5, 1, 2, 'flat', '#a58f6a #e9dfc8 #6d5c3f', { pattern: 'spots', bite: 'timide', prefs: { time: 'nuit' } }),
  S('seiche', 'Seiche', 'Maîtresse du camouflage aux bras courts.', 'coastal reef', 0, 0.45, 'cephalo', 15, 45, 4, 1, 2.5, 'squid', '#b0795a #f0dcc8 #6b4430', { pattern: 'bands', bite: 'joueur', focus: 'ruse', profile: 'oscillating' }),
  // --- Mer tropicale ---
  S('exocet', 'Exocet', 'Le poisson volant qui plane au ras des vagues.', 'tropical', 0, 0.6, 'small', 18, 40, 0.8, 0, 2, 'slim', '#3f78c9 #e8f0fa #1f3e6e', { focus: 'vif', spd: 1.2, bite: 'vorace' }),
  S('carangue', 'Carangue', 'Bagarreuse compacte des eaux chaudes.', 'tropical reef', 0, 0.6, 'small', 30, 80, 12, 0, 2.6, 'deep', '#9fb3bf #f0f4f6 #d6c04a', { focus: 'puissant', pow: 1.2 }),
  S('coryphene', 'Coryphène', 'Éclair vert et or, acrobate hors de l’eau.', 'tropical', 0.2, 0.8, 'massive', 60, 180, 30, 1, 4, 'fusi', '#2fae7a #f3e36a #1e6b9c', { focus: 'vif', spd: 1.2, aggr: 0.4, profile: 'accel' }),
  S('barracuda', 'Barracuda', 'Torpille dentée qui frappe sans prévenir.', 'tropical reef', 0, 0.7, 'long', 70, 190, 40, 2, 6, 'eel', '#8c9aa6 #eef1f3 #39434c', { pattern: 'spots', bite: 'vorace', focus: 'vif', spd: 1.3, aggr: 0.6, profile: 'accel' }),
  S('thon_jaune', 'Thon jaune', 'Sprinteur du large aux nageoires en faucille.', 'tropical', 0.3, 0.9, 'massive', 80, 210, 180, 2, 7, 'tuna', '#27456e #e6ebf0 #f2c53d', { focus: 'endurant', stam: 1.3, pow: 1.15 }),
  S('voilier', 'Voilier', 'Sa grande voile dorsale en fait le poisson le plus rapide.', 'tropical', 0.3, 0.9, 'long', 150, 320, 90, 3, 10, 'bill', '#2b4f8a #dfe6ef #6a4fb5', { focus: 'vif', spd: 1.35, aggr: 0.6, profile: 'accel' }),
  S('marlin_bleu', 'Marlin bleu', 'Le trophée des trophées : rostre, puissance et sauts.', 'tropical deep', 0.4, 1, 'long', 200, 450, 600, 3, 12, 'bill', '#1f3f7a #e3e9f2 #132a52', { focus: 'puissant', pow: 1.3, stam: 1.2, aggr: 0.7, profile: 'erratic' }),
  S('raie_manta', 'Raie manta', 'Géante paisible qui vole sous la surface.', 'tropical reef', 0.1, 0.8, 'ray', 250, 600, 1300, 3, 11, 'ray', '#2c3440 #e9edf0 #151a20', { focus: 'endurant', stam: 1.6, spd: 0.85, bite: 'timide' }),
  S('requin_tigre', 'Requin-tigre', 'Opportuniste rayé qui avale tout.', 'tropical reef', 0.1, 0.9, 'shark', 250, 520, 800, 3, 13, 'shark', '#6f7d86 #e8ecee #3b454c', { pattern: 'stripes', focus: 'puissant', pow: 1.3, aggr: 0.8, profile: 'erratic', bite: 'vorace' }),
  S('requin_baleine', 'Requin-baleine', 'Le plus grand poisson du monde, constellé de taches.', 'tropical', 0.4, 1, 'giant', 600, 1400, 15000, 4, 20, 'whale', '#3e5a78 #dfe7ee #9fc3e0', { pattern: 'spots', focus: 'endurant', stam: 1.8, spd: 0.8, pow: 1.1, bite: 'timide' }),
  // --- Récifs coralliens ---
  S('poisson_clown', 'Poisson-clown', 'Locataire orange et blanc des anémones.', 'reef', 0, 0.35, 'small', 6, 14, 0.08, 0, 1.4, 'deep', '#f07a2a #ffffff #2a1a12', { pattern: 'bands', bite: 'timide' }),
  S('chirurgien', 'Chirurgien bleu', 'Bleu électrique, scalpel à la queue.', 'reef', 0, 0.4, 'small', 12, 30, 0.6, 0, 1.8, 'deep', '#2a62d9 #f2d53a #101a3a', { focus: 'vif', spd: 1.1 }),
  S('papillon', 'Poisson-papillon', 'Disque jaune délicat qui picore le corail.', 'reef', 0, 0.35, 'small', 9, 22, 0.3, 0, 1.8, 'deep', '#f3d23c #fbfbf2 #26262a', { pattern: 'bands', bite: 'prudent' }),
  S('rascasse_volante', 'Rascasse volante', 'Épines venimeuses déployées comme des plumes.', 'reef', 0, 0.5, 'small', 20, 45, 1.3, 1, 3, 'fusi', '#b5483a #f4e3d2 #5c1f18', { pattern: 'stripes', bite: 'prudent', focus: 'ruse', profile: 'oscillating' }),
  S('perroquet', 'Poisson-perroquet', 'Croque le corail avec son bec et fabrique le sable.', 'reef', 0, 0.45, 'massive', 30, 110, 20, 1, 3.5, 'deep', '#2fb5a8 #f08fb0 #1f6f8a', { focus: 'endurant', stam: 1.2 }),
  S('poulpe_recif', 'Poulpe de récif', 'Huit bras, trois cœurs et un esprit joueur.', 'reef coastal', 0, 0.5, 'cephalo', 30, 110, 12, 1, 4, 'octo', '#b0563a #edc9a8 #6a2c1c', { bite: 'joueur', focus: 'ruse', profile: 'oscillating', aggr: 0.35 }),
  S('murene', 'Murène', 'Embusquée dans son trou, gueule ouverte.', 'reef', 0.05, 0.6, 'long', 70, 250, 30, 2, 6, 'eel', '#7a6a2f #d9cf8f #3d3414', { pattern: 'spots', bite: 'vorace', focus: 'puissant', pow: 1.25, aggr: 0.6, prefs: { time: 'nuit' } }),
  S('requin_recif', 'Requin pointe-noire', 'Patrouilleur élégant des lagons.', 'reef tropical', 0, 0.6, 'shark', 90, 200, 45, 2, 7, 'shark', '#9a8f7c #f0ece4 #2b2b2b', { focus: 'vif', spd: 1.2, aggr: 0.5 }),
  S('merou', 'Mérou géant', 'Colosse territorial à la gueule d’aspirateur.', 'reef', 0.1, 0.7, 'massive', 100, 270, 400, 2, 8, 'deep', '#6d6a4c #cfc9a0 #36341f', { pattern: 'spots', focus: 'puissant', pow: 1.4, stam: 1.3, spd: 0.85 }),
  S('napoleon', 'Napoléon', 'Bosse sur le front et lèvres charnues : un seigneur du récif.', 'reef', 0.1, 0.6, 'massive', 100, 230, 190, 3, 10, 'deep', '#3f8f8a #b7e0c8 #244e6b', { focus: 'endurant', stam: 1.4, bite: 'prudent', profile: 'oscillating' }),
  // --- Océan tempéré ---
  S('hareng', 'Hareng', 'L’argent de la mer, en bancs immenses.', 'temperate polar', 0, 0.6, 'small', 15, 40, 0.7, 0, 1.4, 'slim', '#6f8fa8 #e8eef2 #364c5e', { focus: 'vif' }),
  S('merlu', 'Merlu', 'Chasseur nocturne à la chair fine.', 'temperate', 0.2, 0.8, 'small', 30, 110, 12, 0, 2.5, 'fusi', '#8d949a #e9ebed #474c50', { prefs: { time: 'nuit' } }),
  S('lieu', 'Lieu jaune', 'Rôde autour des roches et des épaves.', 'temperate coastal', 0.1, 0.6, 'small', 35, 110, 13, 1, 3, 'fusi', '#7c7f4a #e8e6c8 #3e4024', { focus: 'puissant', pow: 1.15 }),
  S('cabillaud', 'Cabillaud', 'Barbillon au menton, appétit sans fond.', 'temperate polar', 0.2, 0.8, 'massive', 50, 180, 80, 1, 4, 'fusi', '#8a8356 #e6e1c2 #4a4628', { pattern: 'spots', focus: 'endurant', stam: 1.2, bite: 'vorace' }),
  S('raie_bouclee', 'Raie bouclée', 'Losange épineux qui plane au ras du fond.', 'temperate coastal', 0.1, 0.7, 'ray', 40, 120, 16, 1, 3.5, 'ray', '#8a7350 #efe6d2 #4d3f28', { pattern: 'spots', bite: 'timide' }),
  S('calmar', 'Calmar', 'Flèche translucide propulsée à réaction.', 'temperate tropical', 0.2, 0.8, 'cephalo', 20, 70, 3, 1, 3, 'squid', '#c9838f #f6e4e6 #7a3f49', { focus: 'vif', spd: 1.2, profile: 'accel', prefs: { time: 'nuit' } }),
  S('poisson_lune', 'Poisson-lune', 'Disque géant qui se chauffe au soleil.', 'temperate tropical', 0.3, 0.9, 'massive', 120, 330, 2000, 2, 7, 'moon', '#9aa3ab #e9edf0 #59626a', { focus: 'endurant', stam: 1.7, spd: 0.75, pow: 0.9, bite: 'timide', prefs: { weather: 'clair' } }),
  S('requin_bleu', 'Requin peau bleue', 'Voyageur infatigable à la robe indigo.', 'temperate deep', 0.3, 1, 'shark', 180, 380, 200, 2, 8, 'shark', '#2f5a9a #e6ecf3 #1b3560', { focus: 'endurant', stam: 1.25, aggr: 0.5 }),
  S('espadon', 'Espadon', 'Une épée, un caractère, et des rushs foudroyants.', 'temperate tropical', 0.4, 1, 'long', 150, 450, 550, 2, 9, 'bill', '#3b4660 #dfe3ea #1f2636', { focus: 'puissant', pow: 1.3, aggr: 0.7, profile: 'erratic' }),
  S('thon_rouge', 'Thon rouge', 'Un obus de muscles qui traverse les océans.', 'temperate', 0.4, 1, 'massive', 150, 330, 650, 3, 12, 'tuna', '#1f2f4f #dfe5ec #c8352f', { focus: 'endurant', stam: 1.5, pow: 1.2, spd: 1.1 }),
  S('requin_pelerin', 'Requin-pèlerin', 'Gueule béante, il filtre le plancton en paix.', 'temperate polar', 0.3, 1, 'giant', 500, 1100, 5000, 4, 19, 'whale', '#5c5a52 #d9d6cc #2f2e2a', { focus: 'endurant', stam: 1.7, spd: 0.8, bite: 'timide' }),
  // --- Eaux polaires ---
  S('capelan', 'Capelan', 'Petit poisson des glaces, proie de tous.', 'polar', 0, 0.6, 'small', 12, 25, 0.06, 0, 3, 'slim', '#7f9f98 #e9f2ef #40524e', { focus: 'vif', bite: 'vorace' }),
  S('morue_polaire', 'Morue polaire', 'Vit sous la banquise grâce à son antigel naturel.', 'polar', 0, 0.8, 'small', 18, 40, 0.6, 0, 4, 'fusi', '#7b8794 #e6ebf0 #3d4650', {}),
  S('omble', 'Omble arctique', 'Ventre rouge feu dans l’eau la plus froide.', 'polar', 0, 0.5, 'small', 30, 100, 12, 1, 5, 'fusi', '#4f7a6a #f0f0e8 #d9502f', { pattern: 'spots', focus: 'vif', spd: 1.15, bite: 'joueur' }),
  S('loup_mer', 'Loup de mer', 'Mâchoire de broyeur, humeur exécrable.', 'polar temperate', 0.2, 0.8, 'long', 60, 150, 24, 1, 6, 'eel', '#5f6f86 #d6dde6 #2f3a4a', { pattern: 'bands', focus: 'puissant', pow: 1.3, aggr: 0.5 }),
  S('poisson_glaces', 'Poisson des glaces', 'Sang transparent, sans hémoglobine.', 'polar', 0.2, 0.9, 'small', 25, 75, 3.5, 2, 7, 'fusi', '#b9d3e0 #f6fbfd #6f9bb0', { bite: 'prudent', focus: 'ruse', profile: 'oscillating' }),
  S('fletan', 'Flétan', 'Le géant des poissons plats, large comme une porte.', 'polar temperate', 0.3, 0.9, 'ray', 100, 300, 250, 2, 8, 'flat', '#5e5a44 #e4dfc8 #2f2d22', { focus: 'puissant', pow: 1.35, stam: 1.2 }),
  S('requin_groenland', 'Requin du Groenland', 'Peut vivre quatre siècles dans le noir glacé.', 'polar deep', 0.4, 1, 'shark', 250, 640, 1000, 3, 14, 'shark', '#6a6f6a #c9cdc6 #33362f', { focus: 'endurant', stam: 1.8, spd: 0.75, pow: 1.2, bite: 'timide' }),
  S('calmar_colossal', 'Calmar colossal', 'Des yeux grands comme des assiettes, des crochets aux bras.', 'polar abyss', 0.5, 1, 'giant', 400, 1000, 500, 4, 18, 'squid', '#a8323a #f0c8c0 #5c151b', { focus: 'puissant', pow: 1.4, aggr: 0.8, profile: 'erratic', prefs: { time: 'nuit' } }),
  // --- Océan profond ---
  S('poisson_hachette', 'Poisson-hachette', 'Lame d’argent couverte de lanternes.', 'deep abyss', 0.5, 1, 'small', 3, 12, 0.02, 0, 5, 'deep', '#b8c2cc #f2f5f7 #4a5560', { focus: 'vif', prefs: { time: 'nuit' } }),
  S('grenadier', 'Grenadier', 'Grosse tête, queue de rat, yeux immenses.', 'deep', 0.5, 1, 'long', 40, 110, 3, 0, 5, 'eel', '#6b6f7a #c9ccd3 #33363d', {}),
  S('sabre', 'Poisson-sabre', 'Ruban de métal poli qui monte la nuit.', 'deep temperate', 0.5, 1, 'long', 80, 230, 5, 1, 6, 'eel', '#aab4bd #f4f6f8 #5a646d', { focus: 'vif', spd: 1.2, bite: 'vorace', prefs: { time: 'nuit' } }),
  S('baudroie', 'Baudroie abyssale', 'Une lanterne, une gueule, et la patience.', 'deep abyss', 0.6, 1, 'massive', 20, 120, 40, 2, 9, 'angler', '#3a2f38 #7a6a70 #9fe8d0', { bite: 'vorace', focus: 'puissant', pow: 1.3, spd: 0.9, aggr: 0.5 }),
  S('requin_griset', 'Requin griset', 'Six fentes branchiales : un fossile vivant.', 'deep', 0.6, 1, 'shark', 200, 480, 590, 2, 10, 'shark', '#5a5f58 #c6cac2 #2c2f2a', { focus: 'endurant', stam: 1.4, aggr: 0.5 }),
  S('regalec', 'Régalec', 'Le roi des harengs : un ruban d’argent de plusieurs mètres.', 'deep', 0.6, 1, 'long', 300, 1100, 270, 3, 13, 'eel', '#b9c4cf #f5f7f9 #d9413a', { focus: 'ruse', profile: 'oscillating', bite: 'timide', spd: 1.1 }),
  S('requin_lutin', 'Requin-lutin', 'Museau en lame et mâchoire qui jaillit.', 'deep abyss', 0.7, 1, 'shark', 200, 400, 210, 3, 14, 'shark', '#d9a5a8 #f6e6e6 #8a5a5e', { bite: 'vorace', focus: 'vif', spd: 1.25, aggr: 0.7, profile: 'accel' }),
  S('coelacanthe', 'Cœlacanthe', 'On le croyait éteint depuis 66 millions d’années.', 'deep', 0.6, 1, 'massive', 100, 200, 90, 4, 16, 'fusi', '#2f4a7a #9fb4d9 #e8eef8', { pattern: 'spots', bite: 'prudent', focus: 'ruse', profile: 'erratic', stam: 1.3, prefs: { time: 'nuit' } }),
  S('calmar_geant', 'Calmar géant', 'Longtemps une légende de marins. Plus maintenant.', 'deep abyss', 0.7, 1, 'cephalo', 300, 1200, 280, 4, 17, 'squid', '#c44a3a #f3d0c4 #6e2018', { focus: 'puissant', pow: 1.35, aggr: 0.8, profile: 'erratic' }),
  // --- Fosses abyssales ---
  S('poisson_vipere', 'Poisson-vipère', 'Des crocs si longs qu’ils dépassent la tête.', 'abyss', 0.6, 1, 'small', 15, 35, 0.2, 1, 9, 'slim', '#2a2f3a #5a6270 #7fe0ff', { bite: 'vorace', focus: 'vif', spd: 1.3, aggr: 0.6 }),
  S('poisson_ogre', 'Poisson-ogre', 'Petite boule de dents au fond du monde.', 'abyss', 0.6, 1, 'small', 8, 18, 0.12, 2, 10, 'deep', '#3a2a26 #6e5a54 #c9b8b0', { focus: 'puissant', pow: 1.4, aggr: 0.7 }),
  S('grandgousier', 'Grandgousier', 'Une bouche de pélican au bout d’un fouet.', 'abyss', 0.6, 1, 'long', 50, 110, 1, 2, 11, 'eel', '#1f1f2a #4a4a5c #ff7ab0', { bite: 'joueur', focus: 'ruse', profile: 'oscillating' }),
  S('poulpe_dumbo', 'Poulpe dumbo', 'Deux nageoires en oreilles, et il plane.', 'abyss', 0.6, 1, 'cephalo', 20, 60, 6, 3, 13, 'octo', '#e89a6a #fbe3d0 #a8552f', { bite: 'timide', focus: 'ruse', profile: 'oscillating', spd: 0.9 }),
  S('vampire_abysses', 'Vampire des abysses', 'Cape noire, yeux bleus, lumière froide.', 'abyss', 0.7, 1, 'cephalo', 15, 35, 0.5, 3, 14, 'octo', '#5a1420 #9a3a48 #7fd0ff', { bite: 'joueur', focus: 'ruse', profile: 'erratic' }),
  S('requin_lezard', 'Requin-lézard', 'Corps d’anguille, trois cents dents en trident.', 'abyss deep', 0.7, 1, 'shark', 100, 200, 30, 3, 15, 'shark', '#5a4038 #a88a7c #2c1f1a', { bite: 'vorace', focus: 'vif', spd: 1.3, aggr: 0.7, profile: 'accel' }),
  S('dragon_abysses', 'Dragon des abysses', 'Il fabrique sa propre lumière rouge pour chasser.', 'abyss', 0.8, 1, 'long', 30, 60, 0.3, 4, 19, 'eel', '#14141c #3a3a4a #ff3a3a', { bite: 'vorace', focus: 'puissant', pow: 1.5, aggr: 0.9, profile: 'erratic' }),
  // --- Eaux mystérieuses ---
  S('carpe_astrale', 'Carpe astrale', 'Ses écailles reflètent un ciel qui n’est pas le nôtre.', 'mystic', 0, 1, 'small', 30, 80, 9, 2, 16, 'fusi', '#5a3fb5 #e0d0ff #ffd86a', { pattern: 'spots', bite: 'joueur', focus: 'ruse', profile: 'oscillating' }),
  S('anguille_aurore', 'Anguille d’aurore', 'Un ruban de lumière verte ondule sous la coque.', 'mystic', 0, 1, 'long', 120, 400, 45, 3, 18, 'eel', '#1f8f6a #b0ffd9 #7a3fe0', { pattern: 'bands', focus: 'vif', spd: 1.35, profile: 'accel', aggr: 0.6 }),
  S('hippocampe_roi', 'Hippocampe roi', 'Couronné de corail, il ne se laisse approcher qu’à l’aube.', 'mystic', 0, 0.7, 'small', 25, 60, 2, 4, 20, 'seahorse', '#e0a030 #fff0b0 #b0306a', { bite: 'timide', focus: 'ruse', profile: 'erratic', prefs: { time: 'aube' } }),
  S('raie_nebuleuse', 'Raie nébuleuse', 'Son dos est une carte d’étoiles mouvante.', 'mystic', 0.2, 1, 'ray', 200, 500, 700, 3, 20, 'ray', '#2a1f5c #c0a8ff #ff8fd0', { pattern: 'spots', focus: 'endurant', stam: 1.6 }),
  S('selene', 'Sélène d’argent', 'Un disque de lune tombé dans la mer.', 'mystic', 0.2, 1, 'massive', 100, 260, 900, 4, 22, 'moon', '#c8d4e8 #ffffff #7f9fd9', { focus: 'endurant', stam: 1.6, pow: 1.2, prefs: { time: 'nuit' } }),
  S('requin_fantome', 'Requin fantôme', 'On voit à travers lui. Lui vous voit très bien.', 'mystic', 0.3, 1, 'shark', 300, 600, 900, 4, 23, 'shark', '#9fd0e0 #f0fbff #4a8fa8', { focus: 'vif', spd: 1.3, aggr: 0.9, profile: 'erratic', bite: 'vorace' }),
  S('kraken', 'Kraken juvénile', 'Juvénile, disent les savants. Personne n’a vu l’adulte.', 'mystic abyss', 0.6, 1, 'giant', 800, 2000, 9000, 5, 28, 'octo', '#7a1f3a #f0a8b8 #3a0a18', { focus: 'puissant', pow: 1.5, stam: 1.4, aggr: 1, profile: 'erratic' }),
  S('leviathan', 'Léviathan', 'La mer elle-même, quand elle décide de mordre.', 'mystic', 0.5, 1, 'giant', 1500, 4000, 40000, 5, 30, 'serpent', '#1f5c5a #a8f0d9 #0a2a3a', { pattern: 'bands', focus: 'endurant', stam: 1.6, pow: 1.4, aggr: 1, profile: 'erratic', prefs: { weather: 'orage' } }),
];

// Trois espèces propres à chacun des huit biomes, également visibles au bestiaire.
const CRAB_ZONES: [BiomeId, string[], string, number][] = [
  ['river', ['Écrevisse des îles', 'Écrevisse bleue', 'Crabe d’eau douce'], '#8b7952 #dfce8b #3b5841', 2],
  ['volcanic', ['Crabe de basalte', 'Crabe des braises', 'Crabe obsidienne'], '#aa4938 #ffc17d #462834', 9],
  ['crystal', ['Crabe de quartz', 'Crabe opalin', 'Crabe saphir'], '#65bccc #e1ffff #3e608d', 7],
  ['spectral', ['Crabe ectoplasme', 'Crabe des âmes', 'Crabe du voile'], '#77b79c #dcffde #3a5c65', 12],
  ['coastal', ['Crabe vert', 'Étrille des quais', 'Tourteau côtier'], '#80914b #d6c88b #384c32', 1.5],
  ['tropical', ['Crabe cocotier', 'Crabe violoniste', 'Crabe de mangrove'], '#ce7840 #f2c27a #813f28', 3],
  ['reef', ['Crabe porcelaine', 'Crabe des coraux', 'Crabe arlequin'], '#c85a6a #f4d0be #66365c', 4],
  ['temperate', ['Araignée de mer', 'Crabe dormeur', 'Crabe des laminaires'], '#a48351 #e2c49a #59452f', 4.5],
  ['polar', ['Crabe des neiges', 'Crabe royal boréal', 'Crabe de banquise'], '#a7c2d1 #f0f5fa #536b91', 7],
  ['deep', ['Crabe des épaves', 'Crabe des cheminées', 'Crabe aveugle'], '#8a718f #d7b9cf #473f60', 9],
  ['abyss', ['Crabe yéti', 'Crabe des failles', 'Crabe abyssal'], '#a9b4ad #edf0d2 #3d5564', 13],
  ['mystic', ['Crabe de lune', 'Crabe prismatique', 'Crabe des étoiles'], '#8680ce #e3c9ff #3e387d', 16],
];
for (const [biome, names, colors, tier] of CRAB_ZONES) names.forEach((name, i) => {
  const id = `crabe_${biome}_${['a', 'b', 'c'][i]}`;
  SPECIES.push(S(id, name, 'Une carapace à saisir au bon instant : visez les cercles avant sa fuite.', biome,
    0, 1, 'crab', 8 + i * 4, 24 + i * 12, 1.2 + i * 2, i, tier + i, 'crab', colors,
    { bite: 'franc', aggr: 0, stam: 1.3, pow: 1.1, focus: 'ruse' }));
});

// Faune des provinces fantastiques : quatre espèces propres et deux formes régionales.
const BIOME_FANTASY_NAMES: Partial<Record<BiomeId,string>> = {volcanic:'l’océan volcanique',crystal:'la mer de cristal',spectral:'la mer spectrale'};
const FANTASY_FISH: [BiomeId, string, string, number, [string,string,string,string]][] = [
  ['volcanic','brasier','#cd5c43 #ffd091 #612438',8,['Gobie de lave','Anguille de basalte','Raie des braises','Dragon des fumerolles']],
  ['crystal','quartz','#65bcca #ebffff #405a96',6,['Aiguille de quartz','Raie de cristal','Poisson-prisme','Gardien opalin']],
  ['spectral','voile','#7cc4a7 #e3ffdc #3b526e',11,['Lanterne spectrale','Ruban fantôme','Raie du voile','Dévoreur des brumes']],
];
for (const [biome, suffix, colors, tier, names] of FANTASY_FISH) {
  names.forEach((name,i) => SPECIES.push(S(`poisson_${biome}_${['a','b','c','d'][i]}`,name,
    `Une créature des eaux de ${BIOME_FANTASY_NAMES[biome] ?? biome}, aux reflets surnaturels.`,biome,0,1,
    i===2 ? 'ray' : i===3 ? 'giant' : i===1 ? 'long' : 'small',15+i*35,50+i*100,3+i*35,
    i,tier+i*2,i===2?'ray':i===3?'serpent':i===1?'eel':'deep',colors,{stam:1.15,pow:1.1,pattern:'bands'})));
  for (const [baseId,label,rarity] of [['bar','Bar',0],['calmar','Calmar',1]] as const) {
    const base=SPECIES.find(s=>s.id===baseId)!;
    SPECIES.push({...base,id:`${baseId}_${suffix}`,name:`${label} ${suffix}`,desc:`Une forme régionale de ${base.name.toLowerCase()}, adaptée à ces eaux extraordinaires.`,
      biomes:[biome],dmin:0,dmax:1,colors:colors.split(' ') as [string,string,string],tier:tier+rarity,rarity,
      value:Math.round(5*Math.pow(tier+rarity,1.55)*RARITY_VALUE[rarity]),prefs:{},pattern:'spots'});
  }
}

// Fossiles vivants : une chance minuscule dans toutes les mers, jamais dans les rivières.
const seas = BIOME_IDS.filter(b=>b!=='river');
for (const [id,name,shape,tier] of [
  ['dunkleosteus','Dunkléostéus','deep',23], ['xiphactinus','Xiphactinus','fusi',20],
  ['leedsichthys','Leedsichthys','whale',28], ['helicoprion','Hélicoprion','shark',25],
  ['saurichthys','Saurichthys','bill',18],
] as [string,string,Shape,number][]) {
  const sp=S(id,name,'Un survivant préhistorique rarissime : des plaques osseuses affleurent sous ses écailles.',seas.join(' '),0,1,'giant',120,650,1500,5,tier,shape,'#71897c #e8ddbf #354f55',{stam:1.3,pow:1.2,pattern:'bands'});
  sp.ancient=true; SPECIES.push(sp);
}
for (const [id,name,biomes,shape,tier,lmax,kg,colors] of [
  ['orque','Orque','polar temperate deep','whale',16,900,6000,'#21313e #f2eee1 #102232'],
  ['narval','Narval','polar','bill',14,550,1600,'#879fa8 #f0eddb #4e697c'],
  ['dugong','Dugong','tropical reef','whale',6,350,450,'#95a69f #e4e0c7 #5d7879'],
  ['tortue_marine','Tortue marine','coastal tropical reef temperate','moon',5,140,180,'#668d58 #d0c77c #354b3f'],
  ['beluga','Béluga','polar crystal','whale',12,500,1300,'#d7e5df #ffffff #8eaab5'],
  ['baleine_boreale','Baleine boréale','polar deep','whale',20,1400,18000,'#508e9b #d4e3d9 #294e6d'],
] as [string,string,string,Shape,number,number,number,string][]) SPECIES.push(S(id,name,'Une rencontre majestueuse, à observer aussi dans votre carnet de bord.',biomes,0,1,'massive',lmax*0.45,lmax,kg,3,tier,shape,colors,{stam:1.2,pattern:'spots'}));
const shellDefs: [string,string,string][] = [
  ['moule','Moule','coastal temperate'],['palourde','Palourde','coastal tropical'],
  ['huitre','Huître','reef temperate'],['coquille_saint_jacques','Coquille Saint-Jacques','polar deep'],
  ['moule_de_braise','Moule de braise','volcanic'],['palourde_opaline','Palourde opaline','crystal mystic'],
  ['coquillage_spectral','Coquillage spectral','spectral abyss'],
];
for (const [id,name,biomes] of shellDefs) SPECIES.push(S(id,name,'Un coquillage des fonds, à remonter délicatement.',biomes,0,1,'small',4,15,0.3,0,1.5,'shell','#8b749b #e7d6b5 #4e536f',{stam:0.7,pow:0.8}));
for (const [id,name,shape,rarity,tier] of [
  ['koi_kohaku','Koï kohaku','fusi',1,2.5],['koi_showa','Koï showa','deep',2,4],
  ['carpe_doree','Carpe dorée','deep',0,2],['perche_insulaire','Perche insulaire','fusi',0,1.5],
  ['crevette_douce','Crevette d’eau douce','shrimp',0,1],['crevette_jade','Crevette de jade','shrimp',1,2],
] as [string,string,Shape,number,number][]) SPECIES.push(S(id,name,'Un habitant des rivières qui traversent les grandes îles.', 'river',0,1,'small',4,shape==='shrimp'?10:60,shape==='shrimp'?0.04:4,rarity,tier,shape,'#d78b64 #f5f0d8 #547f6d',{pattern:'spots'}));

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/** Créatures hostiles : elles attaquent le bateau, on ne les pêche pas. */
export interface Hostile {
  id: string;
  name: string;
  biomes: BiomeId[];
  /** Vitesse en tuiles/s, dégâts par charge, durée de poursuite en secondes. */
  speed: number;
  damage: number;
  persist: number;
}
export const HOSTILES: Hostile[] = [
  { id: 'maraudeur', name: 'Requin maraudeur', biomes: ['tropical', 'temperate', 'reef', 'polar', 'volcanic', 'crystal'], speed: 5.2, damage: 14, persist: 26 },
  { id: 'calmar_furieux', name: 'Calmar furieux', biomes: ['deep', 'abyss', 'polar', 'spectral'], speed: 5.8, damage: 20, persist: 30 },
  { id: 'serpent_de_mer', name: 'Serpent de mer', biomes: ['mystic', 'abyss'], speed: 6.6, damage: 28, persist: 34 },
];
export const HOSTILE_BY_ID: Record<string, Hostile> = Object.fromEntries(HOSTILES.map((h) => [h.id, h]));
