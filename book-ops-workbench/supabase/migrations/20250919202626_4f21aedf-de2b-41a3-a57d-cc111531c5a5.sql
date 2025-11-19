-- Phase 1: Immediate Data Cleanup - Fix all stale ATR data
-- Clean up stale calculated_atr values for accounts that have no 'Renewals' opportunities

UPDATE public.accounts 
SET calculated_atr = 0
WHERE build_id IN (
  SELECT DISTINCT build_id FROM accounts WHERE build_id IS NOT NULL
)
AND calculated_atr > 0
AND sfdc_account_id NOT IN (
  SELECT DISTINCT o.sfdc_account_id 
  FROM opportunities o 
  WHERE o.opportunity_type = 'Renewals'
    AND o.available_to_renew IS NOT NULL 
    AND o.available_to_renew > 0
    AND o.build_id = accounts.build_id
);

-- Also update any accounts that have incorrect ARR calculations
WITH correct_calculations AS (
  SELECT 
    a.sfdc_account_id,
    a.build_id,
    -- Correct ARR calculation
    CASE 
      WHEN a.is_parent = true AND COALESCE(a.hierarchy_bookings_arr_converted, 0) > 0 THEN 
        a.hierarchy_bookings_arr_converted
      ELSE 
        COALESCE(
          (SELECT SUM(DISTINCT o.amount) 
           FROM opportunities o 
           WHERE o.build_id = a.build_id 
             AND o.sfdc_account_id = a.sfdc_account_id
             AND o.amount IS NOT NULL),
          a.arr,
          0
        )
    END as correct_arr,
    -- Correct ATR calculation (ONLY from Renewals)
    COALESCE(
      (SELECT SUM(DISTINCT o.available_to_renew) 
       FROM opportunities o 
       WHERE o.build_id = a.build_id 
         AND o.sfdc_account_id = a.sfdc_account_id
         AND o.opportunity_type = 'Renewals'
         AND o.available_to_renew IS NOT NULL),
      0
    ) as correct_atr,
    -- Correct CRE count
    COALESCE(
      (SELECT COUNT(DISTINCT o.sfdc_opportunity_id)
       FROM opportunities o 
       WHERE o.build_id = a.build_id 
         AND o.sfdc_account_id = a.sfdc_account_id
         AND o.cre_status IS NOT NULL 
         AND o.cre_status != ''),
      0
    ) as correct_cre_count
  FROM accounts a
)
UPDATE accounts 
SET 
  calculated_arr = cc.correct_arr,
  calculated_atr = cc.correct_atr,
  cre_count = cc.correct_cre_count
FROM correct_calculations cc
WHERE accounts.sfdc_account_id = cc.sfdc_account_id
  AND accounts.build_id = cc.build_id;