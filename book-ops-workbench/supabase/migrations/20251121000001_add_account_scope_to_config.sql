-- Add account_scope column to assignment_configuration table
-- This column was referenced in the UI but missing from the schema

ALTER TABLE assignment_configuration
ADD COLUMN IF NOT EXISTS account_scope TEXT NOT NULL DEFAULT 'all';

-- Add check constraint for valid values
ALTER TABLE assignment_configuration
ADD CONSTRAINT assignment_configuration_account_scope_check
CHECK (account_scope IN ('customers', 'prospects', 'all'));

-- Add comment
COMMENT ON COLUMN assignment_configuration.account_scope IS 'Defines which account types this configuration applies to: customers, prospects, or all';
