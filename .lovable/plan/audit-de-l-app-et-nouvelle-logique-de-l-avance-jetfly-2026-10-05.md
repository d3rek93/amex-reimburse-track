# Audit de l'app et nouvelle logique de l'avance Jetfly

## Ce que j'ai trouvé

**1. Deux calculs différents pour l'avance.**
- La carte « État de l'avance » part d'un *solde de référence* saisi à la main le 05/01/2026 (166,31 €). Elle enlève ensuite les dépenses perso et ajoute les virements.
- La page « Avance » part de 1500 € fixes. Elle enlève les dépenses perso et les écarts approuvés, puis ajoute les virements.

Les deux chiffres ne peuvent donc pas concorder. C'est pour ça que tu ne sais pas où tu en es.

**2. Des virements comptés deux fois.** Par exemple, le 26/02/2026 il y a un virement importé de 500 € et un virement saisi à la main de 500 €. Ce sont probablement le même argent.

**3. Les dépenses pro pas encore remboursées sont ignorées.** Aujourd'hui, 17 dépenses AMEX (3 575 €) attendent un remboursement de Jetfly. Cet argent est sorti de l'avance mais doit y revenir. Aucun des deux calculs n'en tient compte.

**4. Les relevés Boursobank donnent déjà le vrai solde du compte**, mais l'app ne l'utilise pas.

**5. Code fragile.** Les deux grosses pages (Dépenses, Remboursements) mélangent les imports, les calculs et l'affichage. Le calcul des groupes de notes de frais y est recopié plusieurs fois, ce qui cause les bugs à répétition.

## La nouvelle logique proposée (une seule, claire)

L'avance, c'est 1500 € que Jetfly te confie. À tout moment :

```text
Ce que tu as réellement   = solde du compte pro (lu dans le dernier relevé Boursobank)
+ Ce que Jetfly te doit   = dépenses pro pas encore remboursées
- Ce que tu dois payer    = dépenses AMEX pas encore prélevées
------------------------------------------------
= Position de l'avance    -> comparée aux 1500 €
```

- Si la position est **sous 1500 €**, l'app affiche « Remets X € de ta poche » et liste les causes : dépenses perso, écarts acceptés…
- Si elle est **au-dessus**, elle affiche « Tu peux récupérer X € ».
- **Plus de solde de référence à saisir** : chaque import Boursobank met à jour le vrai solde automatiquement.

## Ce que je change

1. **Page Avance refaite.** Un seul grand chiffre (« À remettre » ou « À récupérer »), le détail des 3 lignes ci-dessus, puis l'historique de tes apports perso.
2. **Import Boursobank.** Il enregistre le solde du compte et sa date, et ne crée plus de virements en double.
3. **Nettoyage des doublons** de virements existants : je te montre la liste avant de supprimer quoi que ce soit.
4. **Code des calculs regroupé** (groupes de notes de frais, avance) en un seul endroit, sans changer ce que tu vois sur les autres pages.
5. **Toutes tes données sont gardées.** L'ancien solde de référence est conservé, mais il ne sert plus au calcul.

## Détails techniques

- Nouvelle table `account_snapshots` (user_id, date, balance_eur, source) avec GRANT + RLS. Elle est remplie à l'import Boursobank à partir de la ligne la plus récente du compte BoursoBank (colonne Solde).
- `src/lib/advance.ts` : une fonction pure `computeAdvancePosition(snapshot, expenses, reimbursements, target=1500)`.
- `src/lib/reconciliation.ts` : calcul unique des groupes de notes de frais (graphe des numéros), utilisé par Remboursements, Avance et Stats.
- Les parseurs d'import sont sortis dans `src/lib/importers/{boursobank,amex}.ts`.
- `AdvanceBalanceCard` et `SetBalanceReferenceDialog` sont remplacés. `balance_references` reste en lecture seule.
- `AGENTS.md` : règles d'architecture. La mémoire « avance » est mise à jour avec la nouvelle formule.

## Question ouverte

- Les dépenses AMEX sont-elles bien prélevées sur ce même compte pro Boursobank ? Les lignes « PRLV American Express » de ton relevé le laissent penser, et toute la formule repose dessus.
