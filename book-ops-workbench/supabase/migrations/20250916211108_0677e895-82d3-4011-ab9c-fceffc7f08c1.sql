-- Restore current owner data from new_owner_id where available
-- This assumes that some new_owner assignments represent the baseline/original owners
UPDATE accounts 
SET owner_id = new_owner_id,
    owner_name = new_owner_name
WHERE build_id = '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd'
  AND owner_id IS NULL 
  AND new_owner_id IS NOT NULL;