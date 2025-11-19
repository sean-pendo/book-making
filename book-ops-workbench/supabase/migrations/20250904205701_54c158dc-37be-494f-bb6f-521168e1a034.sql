-- Add initial_sale_tier text field to accounts table
ALTER TABLE public.accounts 
ADD COLUMN initial_sale_tier TEXT;

-- Update existing accounts to use expansion_tier value as fallback if needed
-- (This helps with any existing data that might have been incorrectly mapped)
UPDATE public.accounts 
SET initial_sale_tier = expansion_tier 
WHERE initial_sale_tier IS NULL AND expansion_tier IS NOT NULL;

-- Add index for better performance on tier queries
CREATE INDEX IF NOT EXISTS idx_accounts_initial_sale_tier ON public.accounts(initial_sale_tier);
CREATE INDEX IF NOT EXISTS idx_accounts_expansion_tier ON public.accounts(expansion_tier);

-- Add indexes to improve owner-based queries for sales rep aggregation
CREATE INDEX IF NOT EXISTS idx_accounts_owner_id ON public.accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner_id ON public.opportunities(owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_reps_rep_id ON public.sales_reps(rep_id);