-- Fix is_customer field to use hierarchy_bookings_arr_converted instead of account_type
-- This ensures Assignment Engine shows correct customer/prospect counts

-- Update is_customer for all accounts based on correct classification logic
UPDATE accounts
SET is_customer = CASE
  WHEN is_parent = true
    AND hierarchy_bookings_arr_converted IS NOT NULL
    AND hierarchy_bookings_arr_converted > 0
  THEN true
  ELSE false
END;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_accounts_is_customer_is_parent
ON accounts(is_customer, is_parent)
WHERE is_parent = true;
