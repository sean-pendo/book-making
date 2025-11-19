-- Fix Jaime Pollara's missing region assignment
UPDATE sales_reps 
SET region = 'West' 
WHERE rep_id = '005Pf0000084nYb' 
  AND build_id = '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd'
  AND (region IS NULL OR region = '' OR TRIM(region) = '');

-- Normalize territory names for consistency
UPDATE sales_reps 
SET region = CASE 
  WHEN LOWER(TRIM(region)) = 'north east' THEN 'Northeast'
  WHEN LOWER(TRIM(region)) = 'south east' THEN 'Southeast'
  ELSE region
END
WHERE build_id = '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd'
  AND LOWER(TRIM(region)) IN ('north east', 'south east');