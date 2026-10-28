-- Create table to store the reference balance
CREATE TABLE public.balance_references (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount_eur NUMERIC NOT NULL,
  reference_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.balance_references ENABLE ROW LEVEL SECURITY;

-- Create policies for user access (only one reference per user, so we need all CRUD)
CREATE POLICY "Users can view their own balance reference" 
ON public.balance_references 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own balance reference" 
ON public.balance_references 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own balance reference" 
ON public.balance_references 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own balance reference" 
ON public.balance_references 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_balance_references_updated_at
BEFORE UPDATE ON public.balance_references
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();