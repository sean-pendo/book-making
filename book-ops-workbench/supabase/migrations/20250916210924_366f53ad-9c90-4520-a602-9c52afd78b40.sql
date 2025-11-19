-- Check if there are any import files or temporary tables that might contain original owner data
-- First, let's see what data we have and try to understand the data import pattern

-- Sample some accounts to understand the data structure
SELECT sfdc_account_id, account_name, owner_id, owner_name, new_owner_id, new_owner_name, sales_territory
FROM accounts 
WHERE build_id = '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd' 
AND is_parent = true
LIMIT 5;

-- Check if new_owner_id might be populated from a recent assignment
SELECT COUNT(*) as accounts_with_new_owners,
       COUNT(DISTINCT new_owner_id) as unique_new_owners
FROM accounts 
WHERE build_id = '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd'
AND new_owner_id IS NOT NULL;