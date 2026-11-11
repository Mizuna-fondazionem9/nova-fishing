# Carnet de l'explorateur

## Parcours joueur

- **Port → Capitainerie → Contrats** : accepter, suivre et remettre un contrat. Les livraisons retirent réellement les prises demandées de la cale. Les photographies ne comptent que les captures manuelles après acceptation. Les découvertes comptent uniquement les nouveaux lieux.
- **Port → Capitainerie → Préparer la sortie** : acheter et équiper un montage, acheter des appâts et sélectionner celui du prochain lancer. Le panneau Cale et équipement rappelle le montage et l'appât sélectionnés.
- **Carnet** dans la navigation : lieux découverts, lieux aperçus à proximité, fragments de carte et inscriptions. Un lieu apparaît automatiquement au carnet en passant à proximité ; ses actions exigent d'approcher à huit tuiles.
- **Carte du monde** : lieux découverts en turquoise, destination d'une carte reconstituée en orangé. Les terres et ports existants ne changent pas. Les très longs trajets peuvent nécessiter plusieurs caps.
- **Aquarium** : nom du bassin, décors, collections et prise à l'honneur. La personnalisation et les récompenses de collection se font au port ; la consultation reste disponible partout.

## Lieux remarquables

Les positions, noms et textes dépendent uniquement de la graine du monde. La génération vérifie une case d'eau et l'éloignement des quais. Les lagons sont choisis dans des anses protégées existantes, avec un passage local vers la mer ; aucun nouveau relief n'est imposé. Un cache borné évite de recalculer les points à chaque image.

| Lieu | Activité | Intérêt durable |
|---|---|---|
| Épave | Cabine, soute et cartothèque à fouiller | Fragments de carte et trois petites histoires possibles |
| Sanctuaire | Déchiffrer une inscription dans trois sanctuaires différents | Histoire persistante en trois étapes, décor des Anciens |
| Lagon | Pêche locale et relevé de casier | Probabilité de couleur rare doublée dans un rayon de 18 tuiles ; petites prises compatibles avec la faune du lieu |
| Source volcanique | Examiner les dépôts pendant une accalmie | Rythme visible : six secondes de poussée de chaleur par cycle de vingt secondes |

La première découverte donne 75 pièces et un fragment d'inscription, une seule fois. Les inscriptions ne sont pas des ressources vendables. Les sources donnent un fragment de carte par jour. Trois fragments de carte révèlent un lieu encore inconnu dans la région. Une carte en cours doit être suivie avant d'en reconstituer une nouvelle.

## Contrats et réputation

Trois contrats déterministes sont proposés par port et journée UTC. Maximum trois contrats actifs et six récompenses par jour, tous ports confondus. Les contrats expirent à minuit UTC ; l'heure de référence est celle du serveur.

| Contrat | Objectif | Pièces | Réputation du port |
|---|---|---:|---:|
| Livraison | Trois prises d'une espèce commune indiquée | 220 | 20 |
| Carnet de capture | Une prise manuelle d'au moins 2 kg après acceptation | 260 | 25 |
| Exploration | Deux nouvelles découvertes après acceptation | 350 | 35 |

La réputation est propre à chaque port. Les titres progressent à 100, 250 et 500 points. Atteindre 100 points dans un port débloque une fois le décor Souvenirs du port et trois appâts scintillants. La réputation n'ajoute pas de revenu passif.

## Matériel et appâts

| Montage permanent | Prix | Compromis |
|---|---:|---|
| Polyvalent | Gratuit | Statistiques classiques |
| Précision | 1 200 | Précision +0,04 ; puissance −8 % |
| Profondeurs | 2 200 | Résistance +18 % ; puissance −10 % |
| Casier de lagon | 1 600 | Relevés dans les lagons ; capacité de cale −10 % |

Un seul montage équipé à la fois ; les améliorations de la canne restent conservées. Le serveur vérifie que la cale tient dans la nouvelle capacité. Le changement de bateau conserve les effets du montage.

- **Scintillant, 60 pièces** : poids d'apparition des espèces de rareté 2 ou plus multiplié par 1,75 parmi les espèces de la silhouette visée. Aucun effet si toutes les espèces candidates ont la même catégorie de rareté.
- **Discret, 35 pièces** : fenêtre de ferrage +15 % ; 65 % des départs sans morsure sont remplacés par une véritable touche.
- Une unité consommée au lancer, avant de connaître la prise ; réserve maximale de vingt unités par appât. Aucune garantie d'espèce ou de variante.

## Aquarium et collections

- Mémoire du monde : trois préhistoriques → Ruines englouties.
- Éclats du Nord : cinq espèces polaires → Glaces du Nord.
- Écailles précieuses : cinq espèces avec une couleur rare → Aurores marines.
- Cabinet de nacre : quatre coquillages → Jardin de nacre.
- Histoire des sanctuaires terminée → Jardin des Anciens.

Les décors restent débloqués après la vente des prises. Les variantes anciennes encore conservées en cale ou aquarium comptent aussi ; les anciennes prises vendues avant l'enregistrement des variantes restent impossibles à reconstruire. La sélection d'une prise à l'honneur ne duplique ni ne retire le poisson.

## Limites et autorité

Six compartiments d'épave rémunérés et trois relevés de casier par jour UTC au maximum. Chaque compartiment est limité à une fouille par jour ; chaque lagon à un relevé par jour. Les casiers rapportent deux petites prises et exigent deux unités libres en cale. Aucune action de lieu pendant une pêche ou une attaque en cours.

Tous les achats, distances, consommations, étapes et récompenses sont vérifiés dans les transactions du serveur. Les positions de lieu sont recalculées depuis leur identifiant ; le client ne fournit pas les coordonnées qui font foi. Les photos de contrat ne peuvent pas être validées par le client.

Sauvegarde v3 additive : aucun changement SQL, aucune réinitialisation des bateaux, animaux, prises, pièces ou collections existantes.

## Validation

Compilation, contrôle TypeScript et tests de règles/serveur. `npm run test:e2e:adventure` prépare un joueur local fictif et vérifie les contrats, équipements, appâts, aquarium, épaves et affichages mobile/desktop, avec captures dans `tests/e2e/shots`. Il ne crée aucune route de triche en production.

Dans l'environnement de préparation, Chromium ne démarre pas (socket système refusé). Le navigateur de bureau séparé ne joint pas le serveur local ; l'installation du navigateur headless reçoit une archive tronquée. Le parcours visuel est fourni mais n'est donc pas validé ici. Avant déploiement, le lancer sur une machine disposant de Chromium/Chrome et vérifier aussi l'ergonomie sur iPad réel.
