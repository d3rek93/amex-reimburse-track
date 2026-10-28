-- Reconciliation model: Jetfly claim lines and payment batches, Jetfly
-- transfers received on Boursobank, and the user's decisions.
-- Expense statuses are no longer stored: the app derives them from these
-- tables with src/lib/reconciliation.ts.

-- One line of a Jetfly monthly statement ("590303 - 31/08/2026 - Hotel - Night").
-- Corrections reuse the note number with a negative amount in a later batch.
create table public.claim_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id text not null,
  line_date date not null,
  category text not null default '',
  subcategory text not null default '',
  amount_eur numeric(10, 2) not null,
  batch_ref text not null,
  payment_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, note_id, batch_ref, amount_eur)
);
create index idx_claim_lines_user_note on public.claim_lines (user_id, note_id);

-- Header of a payment in the statement ("01/09/2026 MOS 20260901 1014 217,64").
create table public.claim_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ref text not null,
  payment_date date not null,
  declared_total numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, ref)
);

-- Money received from Jetfly on the bank account.
create table public.jetfly_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  amount_eur numeric(10, 2) not null,
  label text not null default '',
  bank_transaction_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, bank_transaction_id)
);

-- Associations the user validated or made by hand (notes ↔ expenses).
-- A non-zero difference is a discrepancy the user accepted.
create table public.reconciliation_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_ids text[] not null default '{}',
  expense_ids uuid[] not null default '{}',
  difference numeric(10, 2) not null default 0,
  comment text,
  created_at timestamptz not null default now()
);

-- Pairs the user said do not belong together; the engine never proposes them again.
create table public.reconciliation_rejections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id text not null,
  expense_id uuid not null references public.expenses (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, note_id, expense_id)
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'claim_lines', 'claim_batches', 'jetfly_transfers',
    'reconciliation_links', 'reconciliation_rejections'
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

-- Keep what was already imported with the previous XLS importer.
insert into public.claim_lines (user_id, note_id, line_date, category, amount_eur, batch_ref, payment_date)
select user_id, expense_number, expense_date, category, amount_eur, payment_reference, payment_date
from public.reimbursements
where coalesce(expense_number, '') <> ''
on conflict do nothing;

insert into public.claim_batches (user_id, ref, payment_date, declared_total)
select user_id, payment_reference, min(payment_date), sum(amount_eur)
from public.reimbursements
where coalesce(payment_reference, '') <> ''
group by user_id, payment_reference
on conflict do nothing;
