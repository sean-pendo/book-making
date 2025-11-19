-- Add new capacity configuration columns to assignment_configuration table
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS capacity_variance_percent INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS max_tier1_per_rep INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_tier2_per_rep INTEGER DEFAULT 8;

-- Add comments for documentation
COMMENT ON COLUMN assignment_configuration.capacity_variance_percent IS 'Percentage over target ARR that reps can be assigned (0-25%). Hard cap = target * (1 + variance/100)';
COMMENT ON COLUMN assignment_configuration.max_tier1_per_rep IS 'Warning threshold for maximum Tier 1 accounts per rep';
COMMENT ON COLUMN assignment_configuration.max_tier2_per_rep IS 'Warning threshold for maximum Tier 2 accounts per rep';