-- Phase 1: Database Schema Enhancement
-- Add account_scope field to assignment_rules table
ALTER TABLE public.assignment_rules 
ADD COLUMN account_scope TEXT NOT NULL DEFAULT 'all';

-- Add check constraint for valid account_scope values
ALTER TABLE public.assignment_rules 
ADD CONSTRAINT assignment_rules_account_scope_check 
CHECK (account_scope IN ('customers', 'prospects', 'all'));

-- Update existing rules to have appropriate scope based on their type
UPDATE public.assignment_rules 
SET account_scope = CASE 
  WHEN rule_type IN ('CONTINUITY', 'TIER_BALANCE') THEN 'customers'
  WHEN rule_type IN ('GEO_FIRST', 'MIN_THRESHOLDS') THEN 'all'
  ELSE 'all'
END;

-- Add comment for documentation
COMMENT ON COLUMN public.assignment_rules.account_scope IS 'Defines which account types this rule applies to: customers, prospects, or all';