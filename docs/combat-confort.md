# Confort des captures courantes

## Problème et réglage

Une zone annoncée accessible pouvait imposer dix à douze coups réussis sur un poisson ordinaire malgré une canne niveau 8–10. L'ancien guide mesurait seulement 75 % de victoires en moyenne sur les espèces, sans budget de coups ni de durée.

Les prises communes et peu communes bénéficient désormais d'une endurance réduite quand la puissance de la canne convient au poisson. La réduction augmente progressivement entre un rapport puissance de canne / puissance du poisson de 0,25 et 0,75 ; elle atteint respectivement 45 % et 35 %. Une canne très insuffisante ne reçoit aucun allègement. Les pressions régionales sur la ligne, les fenêtres de réussite et la vitesse du curseur restent celles de la rencontre.

Les prédateurs, crabes, fossiles et espèces rares conservent leur combat. Les variantes des espèces courantes gardent leurs multiplicateurs et demandent davantage d'effort que le spécimen normal. Aucun conseil ne prescrit une amélioration prioritaire : un moulinet à zéro reste une spécialisation valable.

## Résultats reproductibles

Commande : `node --import tsx scripts/combat-balance-audit.ts`. Deux cents spécimens normaux par cas, mêmes tailles, graines et profils simulés avant/après ; sans bonus de niveau joueur. Les moyennes de coups et de durée concernent les victoires. Le témoin avant utilise l'endurance intégrale de la même rencontre.

| Prise | Mer / niveau régional | Matériel | Profil simulé | Coups avant → après | Durée avant → après | Réussite avant → après |
| --- | --- | --- | --- | --- | --- | --- |
| Hareng | Polaire / 3 | 8 | Moyen | 9,3 → 5,6 | 11,2 → 6,6 s | 98,5 → 99 % |
| Hareng | Polaire / 3 | 10 | Moyen | 8,4 → 4,9 | 9,9 → 5,7 s | 98,5 → 100 % |
| Cabillaud | Polaire / 3 | 8 | Moyen | 11,6 → 8,0 | 14,2 → 9,9 s | 98,5 → 99 % |
| Cabillaud | Polaire / 3 | 10 | Moyen | 10,3 → 7,1 | 12,5 → 8,6 s | 99 → 99 % |
| Sardine | Côtière / 8 | 8 | Moyen | 12,3 → 8,6 | 13,9 → 9,8 s | 91 → 94,5 % |
| Requin tigre | Tropicale / 3 | 10 | Expert | 17,2 → 17,2 | 12,0 → 12,0 s | 85 → 85 % |

Les prix unitaires restent ceux du jeu : la baisse du temps de capture augmente le rendement de pêche des espèces courantes. La progression, les sauvegardes, les filets, les coûts et le risque des chasses ne sont pas modifiés par une formule de prix supplémentaire.

## Repères et limites

Le guide partagé par le HUD et le site exige maintenant, pour chaque espèce simulée, au moins 80 % de captures en 12 coups réussis et 25 secondes maximum. Sa génération est décrite dans `canne-et-zones.md` ; les repères peuvent augmenter car ils mesurent une pêche confortable plutôt que la seule possibilité de gagner. Certaines destinations restent trop difficiles pour un profil débutant même au plafond d'améliorations : elles n'affichent pas de faux conseil rassurant.

Les tests vérifient les prises polaires avec une canne 8–10 et moulinet zéro, la concordance du rejeu serveur, la progression sous-équipée, les variantes, les rencontres particulières et tous les repères publiés. Des essais humains sur mobile restent nécessaires pour confirmer le ressenti ; les simulations ne reproduisent pas toutes les habiletés.
