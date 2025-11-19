-- Fix NULL region for Jaime Pollara - assign to North East region
UPDATE sales_reps 
SET region = 'North East'
WHERE name = 'Jaime Pollara' 
  AND region IS NULL;