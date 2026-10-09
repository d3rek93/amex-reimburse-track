# Architecture rules

- Advance position is computed only in `src/lib/advance.ts` (`computeAdvancePosition`) — single source of truth, avoids divergent formulas.
- The real bank balance comes from `account_snapshots`, written by the Boursobank CSV import — never ask the user to type a reference balance.
- `balance_references` and `manual_transfers` are legacy and not used in the advance calculation — kept only to preserve history.
- Boursobank CSV import must accept both the English (`dateOp…`) and French (`Date Opération…`) headers — the bank changes formats.
- Bank data can also arrive through the Enable Banking connector (edge function `enable-banking`, client mapper `src/lib/bankSync.ts`); it must write the same `expenses` rows and the same `account_snapshots` record as the CSV import, using the same line heuristics (card and direct-debit lines only, transfers ignored) — so both paths stay comparable and the advance formula never needs a second branch.
- The Enable Banking private key and application ID live only in the backend function's secrets, and the OAuth return route `/bank-callback` must stay the app's registered redirect URL — moving the app's domain breaks the bank connection.
