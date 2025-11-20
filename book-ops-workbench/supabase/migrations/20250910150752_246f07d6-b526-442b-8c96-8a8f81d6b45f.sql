-- First check if we need to create default assignment rules
-- Delete any existing test rules and create the proper ones (wrapped in DO block for idempotency)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'assignment_rules') THEN
    DELETE FROM assignment_rules WHERE rule_type IN ('GEO_FIRST', 'CONTINUITY', 'TIER_BALANCE', 'LOAD_BALANCE');

    -- Create default assignment rules that the engine expects (only if not already present)
    INSERT INTO assignment_rules (name, rule_type, priority, conditions, enabled, description, created_at, updated_at)
    SELECT 'US Region Priority', 'GEO_FIRST', 1, '{"regions": ["South East", "North East", "West", "Central"], "matchByGeo": true}'::jsonb, true, 'Assign accounts to sales reps based on US geographic regions', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM assignment_rules WHERE rule_type = 'GEO_FIRST' AND name = 'US Region Priority');

    INSERT INTO assignment_rules (name, rule_type, priority, conditions, enabled, description, created_at, updated_at)
    SELECT 'Continuity Bias', 'CONTINUITY', 2, '{"preserveExisting": true, "requireSameRegion": true}'::jsonb, true, 'Preserve existing owner-account relationships when rep is still on team', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM assignment_rules WHERE rule_type = 'CONTINUITY' AND name = 'Continuity Bias');

    INSERT INTO assignment_rules (name, rule_type, priority, conditions, enabled, description, created_at, updated_at)
    SELECT 'Tier 1 Balance', 'TIER_BALANCE', 3, '{"tierField": "hierarchy_bookings_arr_converted", "threshold": 50000, "balanceAcrossReps": true}'::jsonb, true, 'Ensure even distribution of high-value accounts across sales reps', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM assignment_rules WHERE rule_type = 'TIER_BALANCE' AND name = 'Tier 1 Balance');

    INSERT INTO assignment_rules (name, rule_type, priority, conditions, enabled, description, created_at, updated_at)
    SELECT 'Load Balancing', 'LOAD_BALANCE', 4, '{"factors": ["accountCount", "totalARR", "renewalDates", "accountMix"], "maxVariance": 0.2}'::jsonb, true, 'Multi-factor load balancing across all dimensions', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM assignment_rules WHERE rule_type = 'LOAD_BALANCE' AND name = 'Load Balancing');
  END IF;
END $$;