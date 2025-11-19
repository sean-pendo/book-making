-- Drop the trigger that causes timeouts on opportunity imports
-- Keep the functions so we can call them manually when needed
DROP TRIGGER IF EXISTS trigger_update_account_calculated_values ON opportunities;

-- Add a comment explaining why the trigger was removed
COMMENT ON FUNCTION update_account_calculated_values_trigger() IS 
'This function is no longer called automatically by a trigger. 
Call update_account_calculated_values(build_id) manually after bulk imports to recalculate account metrics.';