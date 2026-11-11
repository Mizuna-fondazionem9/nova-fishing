# Équilibrage de NOVA Fishing

Toutes les formules vivent dans `packages/shared/src` (`fish.ts`, `fishing.ts`, `gear.ts`, `world.ts`, `save.ts`).
Les tableaux ci-dessous sortent de `npm run balance` (2 000 combats simulés par case) ; les seuils importants sont
verrouillés par des tests (`tests/rules.test.ts`).

## Principes

1. **L'habileté compte, mais ne remplace pas l'équipement.** Un excellent joueur capture des poissons nettement
   au-dessus de sa canne ; au-delà d'un certain écart, la ligne casse avant que le poisson soit fatigué, même en
   jeu parfait.
2. **Rien d'exponentiel.** Coûts polynomiaux, effets à rendement décroissant, bonus régional logarithmique,
   niveaux plafonnés à 200 : aucun nombre ne peut déborder.
3. **Chaque espèce garde son identité.** Le niveau régional ne multiplie pas tout par le même facteur : il renforce
   surtout le point fort de l'espèce.

## Difficulté d'une espèce : le `tier`

Chaque espèce a un `tier` de 1 (sardine) à 30 (léviathan) et quatre modificateurs propres (`stam`, `pow`, `spd`,
`aggr`), un profil de curseur et un style de touche.

| Grandeur | Formule |
|---|---|
| Bonus régional `b` | `ln(1 + niveau / 12)` — niveau 1 : 0,08 ; 12 : 0,69 ; 60 : 1,79 |
| Niveau régional | `1 + (distance au port de départ / 260)^0,8` |
| Facteur de point fort `f(k)` | `1 + 0,5·b` si `k` est le point fort de l'espèce, sinon `1 + 0,15·b` |
| Facteur de taille `t` | `longueur / longueur médiane`, borné à [0,6 ; 2,2] |
| Fatigue (endurance) | `84 · tier^0,8 · stam · t^0,8 · (coriace ? 1,35 : 1) · f(endurant)` |
| Puissance | `6,5 · tier^0,92 · pow · t^0,5 · (coriace ? 1,15 : 1) · f(puissant)` |
| Vitesse du curseur | `min(2,6 ; (0,6 + 0,1 · tier^0,62) · spd · √f(vif))` longueurs de jauge / s |
| Largeur de zone | `(0,25 − 0,0035 · tier) / √f(rusé)`, bornée à [0,10 ; 0,25] |

Points forts : `endurant`, `puissant`, `vif`, `rusé`. Un thon lointain devient surtout plus endurant, un barracuda
surtout plus rapide.

## Combat

Simulation à pas fixe de 60 Hz, identique sur le client et le serveur (le serveur rejoue les appuis).

| Élément | Règle |
|---|---|
| Usure passive de la ligne | `0,677 · puissance^0,9 / résistance de canne^0,4` par seconde, jamais moins que `ligne / 110` (aucun combat ne dépasse ~2 min) |
| Rush du poisson | curseur ×1,4 et usure ×1,8 pendant 1,2 à 2,2 s ; annoncé 0,5 s avant ; fréquence liée à `aggr` |
| Coup réussi | fatigue `− puissance de canne × bonus de série` ; la zone se déplace |
| Coup critique | tiers central de la zone : dégâts ×1,75 |
| Bonus de série | `1 + récupération × 0,06 × min(série − 1 ; 5)` |
| Coup raté | ligne `− (4 + 0,9 · puissance) / moulinet` ; la série retombe à zéro |
| Entre deux appuis | aucun temps mort. Seul un anti-rebond de 3 ticks (50 ms) absorbe les doubles déclenchements matériels |
| Double-clic | pendant 6 ticks (0,1 s) après un coup réussi, un appui hors de la nouvelle zone est ignoré sans pénalité ; un appui dans la zone compte |
| Marteler | ne sert à rien : hors de ces 0,1 s, chaque appui hors zone est un coup raté |
| Série critique | compteur des critiques enchaînés, remis à zéro par un coup simple ou raté. Purement visuel et sonore : aucun effet sur les dégâts |

Profils de curseur : `regular` (constant), `accel` (lent au départ de chaque passage, rapide à la fin),
`oscillating` (vitesse sinusoïdale, période 1,7 s), `erratic` (paliers ×0,6 / ×1 / ×1,45 tirés toutes les 0,9 à 1,7 s —
imprévisible mais constant entre deux changements, donc lisible).

Le mur d'équipement vient du croisement de deux courbes : l'usure de la ligne croît presque linéairement avec la
puissance du poisson (exposant 0,9) alors que la résistance de la canne ne la freine qu'à la puissance 0,4, et le
poisson a en même temps plus de fatigue à encaisser. Passé un certain écart, la ligne casse avant la fin, quel que
soit le nombre de coups critiques.

## Touche et ferrage

| Style | Attente | Touches légères | Feintes | Ignore l'appât | Fenêtre de base |
|---|---|---|---|---|---|
| franc | 1,5–4 s | 0–1 | 0 | 5 % | 900 ms |
| prudent | 3–6,5 s | 1–3 | 0–1 | 20 % | 800 ms |
| joueur | 2–4,5 s | 0–1 | 2–3 | 10 % | 680 ms |
| vorace | 0,8–2,2 s | 0 | 0 | 3 % | 560 ms |
| timide | 4,5–8 s | 1–2 | 0–1 | 30 % | 1 000 ms |

Fenêtre réelle : `max(380 ; base − 8 · tier) × (1 + 0,1 · (moulinet − 1))` ms. Ferrer avant la vraie morsure ou
après la fenêtre fait fuir le poisson.

## Joueurs simulés

| Profil | Erreur de synchronisation (écart-type) | Tente sa chance | Réaction |
|---|---|---|---|
| débutant | 110 ms | 65 % des passages | 0,53 s |
| moyen | 70 ms | 80 % | 0,40 s |
| expert | 25 ms | 95 % | 0,17 s |
| parfait | 0 ms | 100 % | 0 s |

### Canne de départ (toutes améliorations à 0) — taux de capture et durée moyenne

| Espèce | Tier | Débutant | Moyen | Expert | Parfait |
|---|---|---|---|---|---|
| Sardine | 1 | 96 % (14 s) | 100 % (8 s) | 100 % (6 s) | 100 % (6 s) |
| Maquereau | 1,6 | 60 % (19 s) | 99 % (11 s) | 100 % (7 s) | 100 % (7 s) |
| Bar | 2,6 | 14 % | 71 % (16 s) | 100 % (11 s) | 100 % (10 s) |
| Lieu jaune | 3 | 7 % | 54 % | 97 % (12 s) | 99 % |
| Cabillaud | 4 | 1 % | 20 % | 64 % (16 s) | 74 % |
| Congre | 5 | 0 % | 0 % | 25 % | 34 % |
| Barracuda | 6 | 0 % | 0 % | 40 % | 58 % |
| Mérou et au-delà | ≥ 8 | 0 % | 0 % | 0 % | 0 % |

La canne de départ vaut ★1,6 (le niveau où un poisson a autant de puissance que la canne a de résistance,
`(résistance / 6,5)^(1/0,92)`) : un expert monte jusqu'au tier 4 à 6 (2,5 à 4 fois sa canne), personne ne capture
un tier 8 ou plus.

Depuis la suppression du temps mort entre deux appuis, l'adresse compte davantage : les chiffres des débutants
n'ont pas bougé, ceux des experts ont monté sur les poissons rapides (congre 7 → 25 %, barracuda 17 → 40 %). Le mur
d'équipement, lui, est resté au même endroit.

### Canne niveau 5 (les six améliorations de canne à 5)

Débutant : bar 88 %, cabillaud 37 %. Expert : congre et barracuda 100 %, mérou 43 %, espadon 56 %, thon rouge 0 %.

### Canne niveau 80

Expert : requin fantôme (tier 23) 97 %, léviathan (tier 30) 62 %. Moyen : calmar géant 65 %, requin fantôme 7 %.
Débutant : thon rouge 32 %, calmar géant 11 %.

## Améliorations

Coût pour passer du niveau `n` au niveau `n + 1` : `coût de base × (n + 1)^1,85 × (1 + n / 40)`.

| Amélioration | Coût de base | Effet au niveau `n` |
|---|---|---|
| Voilure (vitesse) | 80 | `4,6 × (1 + 1,6 · n/(n+25))` tuiles/s — plafond souple 12 |
| Gréement (accélération) | 50 | `3 × (1 + 2 · n/(n+15))` tuiles/s² |
| Coque | 60 | `100 + 22 · n^0,8` PC |
| Cale | 70 | `20 + 5 · n^0,85` unités |
| Maillage des filets | 90 | rendement `1 + 1,5 · n/(n+20)` |
| Atelier de bord | 40 | réparation `2 × (1 − 0,7 · n/(n+15))` pièces par PC |
| Puissance de canne | 60 | `10 × (1 + 0,18 · n^0,7)` |
| Résistance de canne | 60 | `10 × (1 + 0,30 · n^0,8)` |
| Solidité de ligne | 50 | `100 × (1 + 0,16 · n^0,75)` |
| Moulinet | 45 | `1 + 1,2 · n/(n+18)` |
| Récupération | 55 | `n/(n+20)` |
| Guides de précision | 70 | zone `+ 25 % × n/(n+15)` (bonus volontairement modéré) |
| Bassins d'aquarium | 150 | `4 + 2n` places (30 niveaux) |

Coût cumulé pour monter **toutes** les améliorations au niveau `n` : 5 → 42 491 pièces ; 10 → 293 045 ;
20 → 2,29 millions ; 50 → 36,3 millions ; 100 → 370 millions ; 200 → 4,37 milliards (très loin de la limite des
entiers sûrs, 9 × 10^15).

## Économie

- Valeur de référence d'une espèce : `5 · tier^1,55 × rareté`, avec rareté = 1 / 1,5 / 2,4 / 4 / 7 / 12.
- Prix d'un spécimen : `valeur × (poids / poids moyen)^0,55` (borné à [0,4 ; 6]) `× taille × couleur × coriace ×
  (1 + 0,35 · b)`. Taille : grand ×1,25, géant ×1,8, record ×3. Couleur : albinos et mélanique ×1,5, doré ×3,
  irisé ×6. Coriace ×1,3.
- Le prix est toujours recalculé par le serveur à partir du spécimen qu'il a lui-même créé.
- Encombrement en cale : `⌈√poids en kg⌉`, entre 1 et 40 unités.
- Naufrage : cale perdue, retour au port le plus proche avec 40 % de coque. Améliorations, bestiaire, aquarium et
  trophées sont conservés.
- Défis du jour : 3 par jour, récompense `(120 + 30 × espèces découvertes) × 1 à 1,5`. Seule source de pièces hors
  vente, bornée à trois versements par jour.

## Variantes procédurales

| Variante | Probabilité de base | Effet |
|---|---|---|
| Grand / Géant / Record | 4,2 % / 0,72 % / 0,08 %, multipliées par `1 + b` | longueur jusqu'à 1,15 / 1,30 / 1,50 fois le maximum normal |
| Albinos / Mélanique / Doré / Irisé | 1 % / 1 % / 0,4 % / 0,1 % | palette différente, même silhouette |
| Coriace | `6 % + 2 % · b` | fatigue ×1,35, puissance ×1,15 |

## Apparition des ombres

- 2 à 5 ombres par chunk (32 × 32 tuiles), redistribuées toutes les 5 minutes, calculées à l'identique par le
  client et le serveur. Seule la silhouette est publique ; l'espèce est tirée par le serveur.
- Poids de tirage par rareté : 100 / 38 / 12 / 3,5 / 0,7 / 0,12. À partir de « rare », multiplié par `1 + 0,6 · b`.
- Préférences : heure favorite ×2,5 (sinon ×0,35) ; météo favorite ×2,5 (sinon ×0,5).

## Filets

Un relevé demande 140 tuiles « utiles » parcourues et 45 s d'intervalle. Un filet ne prend que des silhouettes
« petit poisson », communes ou peu communes, sous un tier maximal (2,2 / 3,6 / 5,5 selon le filet), et seulement
s'il reste de la place en cale.

## Créatures hostiles

Tirage à chaque synchronisation de position (toutes les 8 s environ en mer) :
`0,035 × danger du biome × min(2 ; 0,6 + niveau / 10)`. Danger : côtier 0, récif 0,1, tempéré 0,15, tropical 0,2,
polaire 0,4, profond 0,6, abysses 0,9, mystérieux 1. Chaque charge est annoncée et suit une ligne droite : on
l'évite en changeant de cap.

## Régler l'équilibrage

1. Modifier une constante dans `packages/shared/src`.
2. `npm run balance` pour voir les tableaux.
3. `npm test` : les tests d'équilibrage échouent si un débutant ne réussit plus les sardines, si l'habileté ne
   compte plus, ou si la canne de départ capture une créature de haut niveau.

### Ajustement crabes et provinces fantastiques

- Fenêtre parfaite de base : **280 ms**, allongée par les guides de précision jusqu'à 420 ms. Le moteur à 60 Hz conserve sa résolution de 16,7 ms.
- Usure passive : retour au calcul normal de la ligne, sans réduction de 30 %. Les cibles agrandies et les corrections de positionnement restent présentes.
- Océan volcanique, Mer de cristal et Mer spectrale : provinces au-delà de 900 tuiles du port de départ, sans changement des terres ni des ports. Leurs niveaux régionaux utilisent la progression existante par distance.
- Chaque province ajoute quatre espèces propres, deux formes régionales et trois crabes. Difficulté de référence des poissons : cristal 6–12, volcanique 8–14, spectral 11–17, avant modificateurs régionaux et individuels.
- Espacement déterministe des crabes conservé, y compris entre chunks. Hostiles existants étendus à ces provinces, avec les mêmes règles d'esquive.
