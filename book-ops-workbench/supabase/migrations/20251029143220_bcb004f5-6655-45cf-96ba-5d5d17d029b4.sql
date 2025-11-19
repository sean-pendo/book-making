-- Add quarterly renewal min/max columns to assignment_configuration
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS q1_renewal_min integer,
ADD COLUMN IF NOT EXISTS q1_renewal_max integer,
ADD COLUMN IF NOT EXISTS q2_renewal_min integer,
ADD COLUMN IF NOT EXISTS q2_renewal_max integer,
ADD COLUMN IF NOT EXISTS q3_renewal_min integer,
ADD COLUMN IF NOT EXISTS q3_renewal_max integer,
ADD COLUMN IF NOT EXISTS q4_renewal_min integer,
ADD COLUMN IF NOT EXISTS q4_renewal_max integer,
ADD COLUMN IF NOT EXISTS q1_renewal_max_override integer,
ADD COLUMN IF NOT EXISTS q2_renewal_max_override integer,
ADD COLUMN IF NOT EXISTS q3_renewal_max_override integer,
ADD COLUMN IF NOT EXISTS q4_renewal_max_override integer;