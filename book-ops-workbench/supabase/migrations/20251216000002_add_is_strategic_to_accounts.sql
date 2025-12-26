-- Add is_strategic column to accounts table
-- Strategic accounts are routed only to strategic reps (is_strategic_rep = true)
-- and bypass normal capacity limits. See MASTER_LOGIC.mdc §10.6
--
-- Note: Using nullable to match existing boolean column patterns in accounts table

ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS is_strategic BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.accounts.is_strategic IS 
  'Strategic accounts are routed only to strategic reps and bypass capacity limits. See MASTER_LOGIC.mdc §10.6';

-- Index for filtering strategic accounts within a build
-- Partial index since strategic accounts are rare (~1-5% of total)
CREATE INDEX IF NOT EXISTS idx_accounts_is_strategic 
ON public.accounts(build_id) WHERE is_strategic = true;



