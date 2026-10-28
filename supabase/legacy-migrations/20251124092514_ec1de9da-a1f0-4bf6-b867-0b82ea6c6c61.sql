-- Add field to mark partial reimbursements as considered complete
ALTER TABLE public.expenses 
ADD COLUMN considered_complete boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.expenses.considered_complete IS 'Indicates if a partial reimbursement is considered complete by the user (max reimbursement from company)';