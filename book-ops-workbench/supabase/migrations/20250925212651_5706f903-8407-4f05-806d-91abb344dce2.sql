-- Remove the duplicate GEO_FIRST rule (customers-only, US territories only)
DELETE FROM assignment_rules WHERE id = '798f5c7a-9a0b-4488-bde4-105081e15197';

-- Update the remaining GEO_FIRST rule to priority 2 (so it runs earlier)
UPDATE assignment_rules SET priority = 2 WHERE id = '04e08698-c546-48ff-be28-4559b5c46488';