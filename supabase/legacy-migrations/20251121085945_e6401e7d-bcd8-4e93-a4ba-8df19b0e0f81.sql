-- Create reimbursements table
CREATE TABLE public.reimbursements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  payment_date DATE NOT NULL,
  payment_reference TEXT NOT NULL,
  expense_number TEXT NOT NULL,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,
  amount_eur NUMERIC NOT NULL,
  matched_expense_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reimbursements ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own reimbursements" 
ON public.reimbursements 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reimbursements" 
ON public.reimbursements 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reimbursements" 
ON public.reimbursements 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reimbursements" 
ON public.reimbursements 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_reimbursements_updated_at
BEFORE UPDATE ON public.reimbursements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for matching
CREATE INDEX idx_reimbursements_user_date_amount ON public.reimbursements(user_id, expense_date, amount_eur);
CREATE INDEX idx_expenses_user_date_amount ON public.expenses(user_id, date, amount_eur);