-- Migration: Add Renewal Specialist and Sub-Region fields to sales_reps
-- Purpose: Support Commercial RS routing and EMEA sub-region assignment

ALTER TABLE sales_reps 
ADD COLUMN IF NOT EXISTS is_renewal_specialist boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sub_region text;

COMMENT ON COLUMN sales_reps.is_renewal_specialist IS 'Renewal Specialist reps handle accounts with ARR <= $25K (Commercial mode)';
COMMENT ON COLUMN sales_reps.sub_region IS 'EMEA sub-region: DACH, UKI, Nordics, France, Benelux, Middle_East, RO_EMEA';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_sales_reps_is_renewal_specialist ON sales_reps(is_renewal_specialist) WHERE is_renewal_specialist = true;
CREATE INDEX IF NOT EXISTS idx_sales_reps_sub_region ON sales_reps(sub_region) WHERE sub_region IS NOT NULL;

