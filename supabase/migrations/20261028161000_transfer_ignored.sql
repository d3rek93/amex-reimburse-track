-- A Jetfly transfer the user says is not an expense reimbursement (advance top-up,
-- salary adjustment…): left out of the transfer checks.
alter table public.jetfly_transfers add column ignored boolean not null default false;
