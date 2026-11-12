# Jauges, progression et aquariums

## Équipement

La fiche du bateau montre des jauges exactes niveau / plafond, séparées en Bateau, Canne & ligne et Aquarium. Le plafond est désormais 50 : un niveau 6/50 remplit 12 % de la barre ; le nombre et l'effet restent lisibles. Zéro ne produit pas de remplissage artificiel. Le plafond des bassins reste 30. Les bonus atteignent à 50 l’ancienne puissance de fin de jeu à 200. Les niveaux existants au-dessus de 50 sont convertis en conservant au moins leur puissance.

## Difficulté et récompenses

`encounterTier` est commun au combat et au prix. Le niveau effectif est le maximum entre le niveau de l'espèce et un plancher régional : `1 + max(0, danger - 0.2) * 9 + max(0, niveau - 1) * 0.65`. Les eaux d'apprentissage gardent leur difficulté initiale ; les eaux avancées nécessitent du matériel plus puissant, même pour des espèces communes.

Le prix conserve la valeur de collection historique si elle est supérieure. Sinon, une valeur minimale par unité de cale protège les prises volumineuses : `12 * niveauEffectif^1.25 * sqrt(multiplicateurRareté) * sqrt(puissanceEspèce * enduranceEspèce)`, ajustée selon le poids. Taille, couleur, trait et spécimen coriace gardent leurs primes. Les ventes et l'interface recalculent ce prix, y compris pour les prises déjà conservées.

Le coût de passage au niveau suivant devient `coûtInitial * (niveau + 1)^1.55 * (1 + niveau / 80)`. Les niveaux et achats existants restent acquis. Les filets vérifient aussi la difficulté régionale ; le maillage augmente leur seuil de capture de 0,12 par niveau.

Lancer `npm run balance:progression` pour reproduire les comparaisons prix/difficulté/coût. L'équivalent 33 unités affiché est une normalisation de rendement, pas une promesse de vente : la cale réelle peut ne pas contenir exactement ce volume, et certaines créatures exigent une cale supérieure à 33 unités. Les simulations de combat représentent un profil expert, pas le taux garanti d'un joueur.

## Une seule présentation des aquariums

Le jeu et le Hub utilisent `mountAquarium` et `aquarium.css`. Le Hub charge `community.css`, produit par le même build. Les fonds sont servis sous `/fishing/assets/aquariums/` lorsque le jeu utilise le préfixe `/fishing`.

Sept illustrations originales générées en pixel art sont optimisées en WebP 960 × 540 : sand, coral, ruins, ice, harbor, aurora, ancient. Elles se trouvent dans `packages/client/public/assets/aquariums/` et sont copiées au build. Aucun nouveau domaine externe, variable d'environnement ou changement SQL. Les sprites des pensionnaires restent ceux du jeu et sont animés au-dessus des images. Le renderer répartit poissons et espèces de fond, s'adapte au redimensionnement, respecte les mouvements réduits et expose une fonction de nettoyage pour React.

Direction artistique utilisée pour les illustrations : scène sous-marine de profil, pixel art 16-bit détaillé, sable sur le quart inférieur, décor organique surtout sur les bords, centre dégagé pour les vrais poissons animés, sans interface ni texte. Variantes : jardin de sable et herbiers ; récif corallien ; ruines classiques englouties ; grotte arctique ; vestiges du port ; aurores et minéraux ; sanctuaire des Anciens.
