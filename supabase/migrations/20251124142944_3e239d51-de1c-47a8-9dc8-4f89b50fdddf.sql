-- Add 'not_applicable' as a valid reimbursement status
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_reimbursement_status_check;

ALTER TABLE expenses ADD CONSTRAINT expenses_reimbursement_status_check 
CHECK (reimbursement_status IN ('pending', 'partial', 'complete', 'not_applicable'));