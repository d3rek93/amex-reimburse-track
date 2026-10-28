# Expense Tracker

Suivi personnel des notes de frais : dépenses AMEX et Boursobank, remboursements Jetfly, position de l'avance.

- App : https://expense-tracker-vwac.onrender.com (Render, `render.yaml`)
- Backend : Supabase (`supabase/`), déployé par GitHub Actions
- Opérations bancaires : Enable Banking (fonction `enable-banking`) ; imports PDF/CSV en secours

Règles d'architecture et infrastructure : voir `AGENTS.md`.

```sh
npm install
npm run dev
```
