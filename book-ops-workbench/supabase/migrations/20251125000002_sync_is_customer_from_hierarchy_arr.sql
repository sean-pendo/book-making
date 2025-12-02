-- Sync is_customer field based on hierarchy_bookings_arr_converted
-- Customer = parent account with hierarchy_bookings_arr_converted > 0
-- Prospect = parent account with hierarchy_bookings_arr_converted <= 0 or NULL

-- Update is_customer for ALL parent accounts based on hierarchy ARR
UPDATE accounts
SET is_customer = (
  hierarchy_bookings_arr_converted IS NOT NULL 
  AND hierarchy_bookings_arr_converted > 0
)
WHERE is_parent = true;

-- Log the results
DO $$
DECLARE
  customer_count INTEGER;
  prospect_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO customer_count FROM accounts WHERE is_parent = true AND is_customer = true;
  SELECT COUNT(*) INTO prospect_count FROM accounts WHERE is_parent = true AND is_customer = false;
  RAISE NOTICE 'Updated is_customer: % customers, % prospects', customer_count, prospect_count;
END $$;


