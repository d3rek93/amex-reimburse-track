-- Add status column to reimbursements table
ALTER TABLE public.reimbursements 
ADD COLUMN status text NOT NULL DEFAULT 'active';

-- Add check constraint for valid statuses
ALTER TABLE public.reimbursements
ADD CONSTRAINT reimbursements_status_check 
CHECK (status IN ('active', 'cancelled'));