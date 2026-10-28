# Architecture rules

- Expense and note statuses are never stored: `src/lib/ledger.ts` derives them by running `src/lib/reconciliation.ts` on bank lines (`expenses`), Jetfly statements (`claim_lines`, `claim_batches`), `jetfly_transfers` and the user's decisions (`reconciliation_links`, `reconciliation_rejections`, `expenses.is_personal`). The legacy columns `reimbursement_status`, `reimbursed_amount`, `expense_number`, `considered_complete` and the `reimbursements` table are no longer read.
- The engine only auto-matches when a pair is each other's clear best candidate with the same amount; amount or date discrepancies are always suggestions. Claims are netted per note number (Jetfly corrects with negative lines).
- Parsers live in `src/lib/importers.ts` (pure); tests in `tests/` run with `npm test` and use fictional data only — never commit real statements.
- `tests/screens/` renders the built app with fictional data; `.github/workflows/screenshots.yml` pushes the images to the `ci-screenshots` branch.

- Advance position is computed only in `src/lib/advance.ts` (`computeAdvancePosition`) — single source of truth, avoids divergent formulas.
- The real bank balance comes from `account_snapshots`, written by the Boursobank CSV import — never ask the user to type a reference balance.
- `balance_references` and `manual_transfers` are legacy and not used in the advance calculation — kept only to preserve history.
- Boursobank CSV import must accept both the English (`dateOp…`) and French (`Date Opération…`) headers — the bank changes formats.
- Bank data can also arrive through the Enable Banking connector (edge function `enable-banking`, client mapper `src/lib/bankSync.ts`); it must write the same `expenses` rows and the same `account_snapshots` record as the CSV import, using the same line heuristics (card and direct-debit lines only, transfers ignored) — so both paths stay comparable and the advance formula never needs a second branch.
- The Enable Banking private key and application ID live only in the backend function's secrets, and the OAuth return route `/bank-callback` must stay the app's registered redirect URL — moving the app's domain breaks the bank connection.

# Infrastructure (since the move off Lovable, 2026-10)

- Backend: self-owned Supabase project `uynegxjtcthcmqgbosvh` (see `supabase/config.toml`). Lovable Cloud is no longer used.
- Schema lives in `supabase/migrations/`; the Lovable history is archived in `supabase/legacy-migrations/` and is never applied.
- Migrations and edge functions deploy through `.github/workflows/deploy-supabase.yml`; the app builds through `.github/workflows/ci.yml`.
- Edge function secrets: `ENABLE_BANKING_APPLICATION_ID`, `ENABLE_BANKING_PRIVATE_KEY` (set by hand in the Supabase dashboard) and `APP_URL` (set by the deploy workflow).
- App hosted on Render as a static site (`render.yaml`): https://expense-tracker-vwac.onrender.com. Changing this domain means updating `APP_URL` in the deploy workflow and the redirect URL in the Enable Banking control panel.
- Enable Banking is the primary source of bank operations; PDF and CSV imports are fallbacks.
