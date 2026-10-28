-- Modify expense_number to support multiple expense numbers
ALTER TABLE public.expenses 
ALTER COLUMN expense_number TYPE text[] USING 
  CASE 
    WHEN expense_number IS NULL THEN NULL
    WHEN expense_number = '' THEN NULL
    ELSE ARRAY[expense_number]
  END;

-- Add index for better performance on array searches
CREATE INDEX idx_expenses_expense_number ON public.expenses USING GIN(expense_number);