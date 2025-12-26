-- Add pe_firms column to sales_reps table
-- This field stores a comma-separated list of PE firm names that this rep handles
-- See MASTER_LOGIC.mdc §10.7 - PE Firm Accounts

-- Add the pe_firms column (nullable text field for comma-separated values)
ALTER TABLE public.sales_reps 
ADD COLUMN IF NOT EXISTS pe_firms TEXT DEFAULT NULL;

-- Add a comment explaining the field's purpose
COMMENT ON COLUMN public.sales_reps.pe_firms IS 
  'Comma-separated list of PE firm names this rep is dedicated to. 
   Example: "JMI Private Equity, Vista Equity Partners"
   When set, all accounts belonging to these PE firms will be routed to this rep.
   See MASTER_LOGIC.mdc §10.7 for routing rules.';

