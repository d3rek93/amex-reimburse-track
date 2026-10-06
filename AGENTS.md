# Architecture rules

- Advance position is computed only in `src/lib/advance.ts` (`computeAdvancePosition`) — single source of truth, avoids divergent formulas.
- The real bank balance comes from `account_snapshots`, written by the Boursobank CSV import — never ask the user to type a reference balance.
- `balance_references` and `manual_transfers` are legacy and not used in the advance calculation — kept only to preserve history.
- Boursobank CSV import must accept both the English (`dateOp…`) and French (`Date Opération…`) headers — the bank changes formats.
