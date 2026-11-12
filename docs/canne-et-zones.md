# Niveaux, cadrage et guide de pêche

Le plafond des améliorations du bateau et de la canne passe de 200 à 50. Les bassins gardent leur plafond de 30. Les niveaux 0 à 3 ont exactement leurs anciens bonus ; les niveaux suivants progressent plus vite, jusqu’à retrouver au niveau 50 les bonus de l’ancien niveau 200. La puissance maximale de fin de jeu reste accessible.

Les anciennes sauvegardes passent de la version 4 à 5. Les niveaux jusqu’à 50 sont conservés. Les niveaux supérieurs sont convertis vers le plus petit niveau entier donnant au moins leurs anciens bonus. La conversion ne touche ni les pièces ni la collection et ne s’applique qu’une fois. La puissance des filets utilise le même niveau équivalent que leurs autres bonus.

Les jauges ont une hauteur de 16 px et un remplissage exact sur 50 niveaux. Les images de capture sont recadrées sur leurs pixels visibles puis mises à l’échelle selon l’espace réellement disponible, avec maintien des proportions et adaptation au redimensionnement.

## Guide du site

`packages/shared/src/rod-guide.json` est généré avec `node --import tsx scripts/rod-guide.ts` depuis les vrais combats. Il couvre les douze biomes et les tranches régionales 1–3, 4–8, 9–15 et 16–30. Le calcul utilise la borne haute de chaque tranche, les poissons communs/peu communs (hors crabes et fossiles), 20 spécimens déterministes par espèce et par niveau, et les profils de simulation débutant et moyen. Le seuil visé est 75 % de captures en moyenne sur l’échantillon des espèces. Ce n’est pas une garantie pour un poisson particulier ou une distribution exacte des apparitions en jeu.

Les recommandations sont affichées en étoiles. Les étoiles du joueur sont la moyenne arithmétique des six niveaux : puissance, résistance, ligne, moulinet, récupération et précision, arrondie à une décimale. Les simulations de référence utilisent des cannes équilibrées ; elles donnent un repère, sans imposer une répartition ou une amélioration prioritaire. Si aucun niveau jusqu’à 50 n’atteint le seuil, le guide indique que la zone reste très exigeante ; il n’invente pas un niveau inaccessible. Les rares, géants et trophées ne sont pas couverts par ces repères.

Le guide est affiché sur `/nova-fishing#guide-canne` grâce au bundle community.js. La fiche équipement du jeu y donne accès. Après modification des combats ou des bonus, régénérer le JSON et vérifier les tests avant de déployer.

Déploiement : mettre à jour le jeu d’abord, puis la PR du gabarit NovaBot qui ajoute le conteneur du guide et les liens de navigation. Aucune variable ou migration SQL manuelle.

## Repères compréhensibles en jeu

Le guide utilise maintenant des fiches de destinations, triées des plus accessibles aux plus exigeantes, et les mêmes noms de secteurs que le badge du jeu : Proche du départ, Au large, Eaux lointaines, Eaux extrêmes. Le badge reste affiché sur téléphone (l’ancien niveau régional numérique était masqué à cette largeur). Il ouvre la fiche équipement, qui compare le matériel réel aux repères du profil choisi sans prescrire une amélioration particulière. Au-delà de la plage modélisée, aucun feu vert n’est affiché.

Les explications sur les six améliorations et les limites du modèle sont repliables. Les joueurs n’ont plus à interpréter un tableau de nombres ni à deviner un niveau régional caché.


## Affichage relatif et filet

Le HUD affiche le nom de la mer, le secteur, les étoiles réelles et conseillées, et un statut explicite Adapté/Exigeant/Déconseillé (vert/orange/rouge). Les étoiles visibles ne changent pas les statistiques du combat ni les trophées qui utilisaient l’ancien indice de résistance. Le profil de confort choisi dans la fiche équipement est partagé avec le HUD pendant la session.

Le filet a une indication indépendante : absent, cale pleine, aucune prise de filet ici, trop faible, prises limitées ou adapté. Le serveur et l’interface utilisent le même filtre d’espèces éligibles, sans modifier les seuils de capture.
