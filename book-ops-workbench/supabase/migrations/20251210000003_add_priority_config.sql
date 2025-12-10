-- Migration: Add Priority Configuration fields to assignment_configuration
-- Purpose: Support multi-mode priority waterfall with ENT, COMMERCIAL, EMEA, and CUSTOM modes

ALTER TABLE assignment_configuration
ADD COLUMN IF NOT EXISTS assignment_mode text DEFAULT 'ENT',
ADD COLUMN IF NOT EXISTS priority_config jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS rs_arr_threshold numeric DEFAULT 25000,
ADD COLUMN IF NOT EXISTS is_custom_priority boolean DEFAULT false;

-- Add check constraint for valid assignment modes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'assignment_configuration_assignment_mode_check'
    ) THEN
        ALTER TABLE assignment_configuration
        ADD CONSTRAINT assignment_configuration_assignment_mode_check
        CHECK (assignment_mode IN ('ENT', 'COMMERCIAL', 'EMEA', 'CUSTOM'));
    END IF;
END $$;

COMMENT ON COLUMN assignment_configuration.assignment_mode IS 'Assignment mode: ENT (Enterprise), COMMERCIAL (Renewal Specialist routing), EMEA (sub-region routing), or CUSTOM (user-modified)';
COMMENT ON COLUMN assignment_configuration.priority_config IS 'Custom priority order: [{id, enabled, position, weight}]';
COMMENT ON COLUMN assignment_configuration.rs_arr_threshold IS 'ARR threshold for Renewal Specialist routing in Commercial mode (default $25K)';
COMMENT ON COLUMN assignment_configuration.is_custom_priority IS 'True if user has modified the preset priority configuration';

