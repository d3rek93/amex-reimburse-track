-- Add source column to expenses table
ALTER TABLE public.expenses 
ADD COLUMN source TEXT DEFAULT 'AMEX' CHECK (source IN ('AMEX', 'Boursobank', 'Manuel'));