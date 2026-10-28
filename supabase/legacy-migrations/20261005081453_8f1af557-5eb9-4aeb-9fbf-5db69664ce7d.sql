CREATE TABLE public.account_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  balance_eur numeric NOT NULL,
  source text NOT NULL DEFAULT 'Boursobank',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date, source)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_snapshots TO authenticated;
GRANT ALL ON public.account_snapshots TO service_role;
ALTER TABLE public.account_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own snapshots" ON public.account_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_account_snapshots_updated_at BEFORE UPDATE ON public.account_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();