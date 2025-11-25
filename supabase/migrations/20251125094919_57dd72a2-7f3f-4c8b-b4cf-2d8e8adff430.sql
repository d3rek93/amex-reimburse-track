-- Add discrepancy_approved column to reimbursements table
ALTER TABLE public.reimbursements ADD COLUMN discrepancy_approved boolean NOT NULL DEFAULT false;