-- Add balance_intensity column to assignment_configuration
-- Controls how aggressively the optimizer enforces balance vs continuity
-- @see MASTER_LOGIC.mdc §11.3.1

ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS balance_intensity TEXT DEFAULT 'NORMAL'
CHECK (balance_intensity IN ('VERY_LIGHT', 'LIGHT', 'NORMAL', 'HEAVY', 'VERY_HEAVY'));

COMMENT ON COLUMN assignment_configuration.balance_intensity IS 
'Balance intensity multiplier: VERY_LIGHT (0.1x) to VERY_HEAVY (10x). Controls balance vs continuity trade-off.';



