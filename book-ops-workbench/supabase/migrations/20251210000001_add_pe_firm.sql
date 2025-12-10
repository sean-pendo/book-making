-- Migration: Add PE Firm field to accounts
-- Purpose: Support Commercial mode PE firm protection priority

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS pe_firm text;

COMMENT ON COLUMN accounts.pe_firm IS 'Private Equity firm name. If populated, account is PE-owned and follows PE routing rules.';

-- Create index for faster PE firm lookups
CREATE INDEX IF NOT EXISTS idx_accounts_pe_firm ON accounts(pe_firm) WHERE pe_firm IS NOT NULL;

