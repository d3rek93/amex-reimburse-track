-- Initial schema for the self-hosted Supabase project.
-- Consolidates the Lovable migrations kept in supabase/legacy-migrations/,
-- plus fixes found during the takeover:
--   * expenses.source now accepts 'Prélèvement' (the code wrote it, the old check rejected it)
--   * bank_sessions lived only in a drizzle migration; it is now part of the schema
--   * expenses.bank_transaction_id gives Enable Banking lines a stable identity for dedup

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  description text not null,
  original_amount numeric(10, 2),
  original_currency text,
  conversion_fees numeric(10, 2),
  amount_eur numeric(10, 2) not null,
  expense_number text[],
  reimbursement_status text not null default 'pending'
    check (reimbursement_status in ('pending', 'partial', 'complete', 'not_applicable')),
  reimbursed_amount numeric(10, 2) not null default 0,
  is_personal boolean not null default false,
  considered_complete boolean not null default false,
  source text default 'AMEX'
    check (source in ('AMEX', 'Boursobank', 'Prélèvement', 'Manuel')),
  bank_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.expenses.considered_complete is
  'Partial reimbursement the user accepts as final (company maximum reached)';
comment on column public.expenses.bank_transaction_id is
  'Enable Banking account uid + transaction id; null for PDF/CSV/manual lines';

create index idx_expenses_user_id on public.expenses (user_id);
create index idx_expenses_date on public.expenses (date);
create index idx_expenses_user_date_amount on public.expenses (user_id, date, amount_eur);
create index idx_expenses_expense_number on public.expenses using gin (expense_number);
create unique index uq_expenses_bank_transaction
  on public.expenses (user_id, bank_transaction_id)
  where bank_transaction_id is not null;

create trigger update_expenses_updated_at
  before update on public.expenses
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------- reimbursements
create table public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payment_date date not null,
  payment_reference text not null,
  expense_number text not null,
  expense_date date not null,
  category text not null,
  amount_eur numeric not null,
  matched_expense_id uuid references public.expenses (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  discrepancy_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_reimbursements_user_date_amount
  on public.reimbursements (user_id, expense_date, amount_eur);

create trigger update_reimbursements_updated_at
  before update on public.reimbursements
  for each row execute function public.update_updated_at_column();

-- ------------------------------------------------------- account_snapshots
create table public.account_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_date date not null,
  balance_eur numeric not null,
  pending_card_eur numeric not null default 0,
  amex_last_debit_date date,
  source text not null default 'Boursobank',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, snapshot_date, source)
);

create trigger update_account_snapshots_updated_at
  before update on public.account_snapshots
  for each row execute function public.update_updated_at_column();

-- ----------------------------------------------------------- bank_sessions
create table public.bank_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  aspsp_name text,
  country text,
  accounts jsonb not null default '[]'::jsonb,
  valid_until timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create trigger update_bank_sessions_updated_at
  before update on public.bank_sessions
  for each row execute function public.update_updated_at_column();

-- ------------------------------------------------- legacy (history only)
-- Not used by the advance calculation; kept so imported history has a home.
create table public.manual_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transfer_date date not null,
  amount_eur numeric not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.balance_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_eur numeric not null,
  reference_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------- grants + row security
do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'reimbursements', 'account_snapshots',
    'bank_sessions', 'manual_transfers', 'balance_references'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Users manage own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end;
$$;
