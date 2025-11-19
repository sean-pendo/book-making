-- Add column to mark accounts that should not be reassigned
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS exclude_from_reassignment boolean DEFAULT false;

-- Add comment to explain the column
COMMENT ON COLUMN public.accounts.exclude_from_reassignment IS 'When true, this account should keep its current owner and not be reassigned during assignment operations';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_accounts_exclude_from_reassignment 
ON public.accounts(build_id, exclude_from_reassignment) 
WHERE exclude_from_reassignment = true;