-- Add balance threshold fields to assignment_configuration table

-- 1. Variance Settings (User Configures)
ALTER TABLE assignment_configuration 
  ADD COLUMN IF NOT EXISTS cre_variance INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS atr_variance INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS tier1_variance INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS tier2_variance INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS renewal_concentration_max INTEGER DEFAULT 35;

-- 2. Auto-Calculated Thresholds (System Generates)
ALTER TABLE assignment_configuration 
  ADD COLUMN IF NOT EXISTS cre_target DECIMAL,
  ADD COLUMN IF NOT EXISTS cre_min INTEGER,
  ADD COLUMN IF NOT EXISTS cre_max INTEGER,
  
  ADD COLUMN IF NOT EXISTS atr_target DECIMAL,
  ADD COLUMN IF NOT EXISTS atr_min INTEGER,
  ADD COLUMN IF NOT EXISTS atr_max INTEGER,
  
  ADD COLUMN IF NOT EXISTS tier1_target DECIMAL,
  ADD COLUMN IF NOT EXISTS tier1_min INTEGER,
  ADD COLUMN IF NOT EXISTS tier1_max INTEGER,
  
  ADD COLUMN IF NOT EXISTS tier2_target DECIMAL,
  ADD COLUMN IF NOT EXISTS tier2_min INTEGER,
  ADD COLUMN IF NOT EXISTS tier2_max INTEGER,
  
  ADD COLUMN IF NOT EXISTS q1_renewal_target DECIMAL,
  ADD COLUMN IF NOT EXISTS q2_renewal_target DECIMAL,
  ADD COLUMN IF NOT EXISTS q3_renewal_target DECIMAL,
  ADD COLUMN IF NOT EXISTS q4_renewal_target DECIMAL;

-- 3. User Overrides (Optional Manual Values)
ALTER TABLE assignment_configuration 
  ADD COLUMN IF NOT EXISTS cre_max_override INTEGER,
  ADD COLUMN IF NOT EXISTS atr_max_override INTEGER,
  ADD COLUMN IF NOT EXISTS tier1_max_override INTEGER,
  ADD COLUMN IF NOT EXISTS tier2_max_override INTEGER,
  ADD COLUMN IF NOT EXISTS renewal_concentration_max_override INTEGER;

-- 4. Calculation Metadata
ALTER TABLE assignment_configuration 
  ADD COLUMN IF NOT EXISTS last_calculated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS based_on_account_count INTEGER,
  ADD COLUMN IF NOT EXISTS based_on_rep_count INTEGER;

-- 5. Add renewal quarter tracking to accounts if not exists
ALTER TABLE accounts 
  ADD COLUMN IF NOT EXISTS renewal_quarter TEXT,
  ADD COLUMN IF NOT EXISTS open_atr_count INTEGER DEFAULT 0;