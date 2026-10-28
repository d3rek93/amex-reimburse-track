-- Jetfly transfers imported twice: once by the bank sync, once from a
-- Boursobank CSV export. Keep the bank-sync copy, drop the file copy.
delete from public.jetfly_transfers f
where f.bank_transaction_id like 'file:%'
  and exists (
    select 1
    from public.jetfly_transfers b
    where b.user_id = f.user_id
      and b.bank_transaction_id not like 'file:%'
      and b.amount_eur = f.amount_eur
      and abs(b.date - f.date) <= 2
  );
