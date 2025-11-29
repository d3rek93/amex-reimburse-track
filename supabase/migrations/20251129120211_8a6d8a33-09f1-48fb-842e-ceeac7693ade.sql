-- Create table for manual transfers to restore the advance balance
CREATE TABLE public.manual_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  transfer_date DATE NOT NULL,
  amount_eur NUMERIC NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.manual_transfers ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own transfers" 
ON public.manual_transfers 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transfers" 
ON public.manual_transfers 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transfers" 
ON public.manual_transfers 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transfers" 
ON public.manual_transfers 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_manual_transfers_updated_at
BEFORE UPDATE ON public.manual_transfers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();