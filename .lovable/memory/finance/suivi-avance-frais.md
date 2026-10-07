---
name: Avance de frais Jetfly
description: Formule unique de la position de l'avance 1500 € basée sur le solde réel Boursobank
type: feature
---
Avance confiée par Jetfly : 1500 €.
Position = solde réel du compte pro (dernier relevé Boursobank)
 + dépenses pro non remboursées (AMEX/Boursobank/Prélèvement, pending/partial)
 − dépenses AMEX pas encore prélevées (depuis dernier PRLV AMEX − 2 jours)
 − achats carte ULTIM pas encore débités (débit différé mensuel)
 (dépenses pro payées carte perso : l'utilisateur revire leur remboursement sur son compte perso → déjà neutre dans le solde, aucun ajustement)
Dépenses perso AMEX : prélevées sur le compte pro, non dues par Jetfly → réduisent l'avance.
À remettre = 1500 − position (négatif = récupérable).
Plus de solde de référence manuel ni de virements saisis dans le calcul.
Les lignes AMEX « PRELEVEMENT AUTOMATIQUE » sont des paiements de carte, jamais des dépenses.
