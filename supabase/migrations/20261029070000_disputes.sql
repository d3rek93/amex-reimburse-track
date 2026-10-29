-- Gaps the user refuses: a claim to send to the Jetfly expense department.
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_ids text[] not null default '{}',
  expense_ids uuid[] not null default '{}',
  -- Bank total minus what Jetfly paid, when the claim was opened (positive: Jetfly owes it).
  difference numeric(10, 2) not null,
  reason text,
  status text not null default 'open' check (status in ('open', 'closed')),
  outcome text check (outcome in ('settled', 'accepted')),
  sent_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.disputes to authenticated;
grant all on public.disputes to service_role;
alter table public.disputes enable row level security;
create policy "Users manage own rows" on public.disputes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
