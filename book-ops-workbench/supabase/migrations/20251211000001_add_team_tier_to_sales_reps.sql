-- Migration: add_team_tier_to_sales_reps
-- Adds team_tier column to sales_reps for Commercial mode team alignment
-- Values: SMB, Growth, MM, ENT

ALTER TABLE sales_reps ADD COLUMN IF NOT EXISTS team_tier TEXT;

COMMENT ON COLUMN sales_reps.team_tier IS 'Size tier for team alignment: SMB, Growth, MM, ENT';





