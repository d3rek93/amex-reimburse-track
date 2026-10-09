CREATE TABLE public.bank_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  aspsp_name TEXT,
  country TEXT,
  accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_sessions TO authenticated;
GRANT ALL ON public.bank_sessions TO service_role;

ALTER TABLE public.bank_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bank sessions"
  ON public.bank_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bank sessions"
  ON public.bank_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bank sessions"
  ON public.bank_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bank sessions"
  ON public.bank_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);