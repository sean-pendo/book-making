-- Create default assignment rules using the correct rule_type values
DELETE FROM assignment_rules WHERE rule_type IN ('GEO_FIRST', 'CONTINUITY', 'TIER_BALANCE', 'ROUND_ROBIN');

INSERT INTO assignment_rules (name, rule_type, priority, conditions, enabled, description, created_at, updated_at) VALUES
('US Region Priority', 'GEO_FIRST', 1, '{"regions": ["South East", "North East", "West", "Central"], "matchByGeo": true}', true, 'Assign accounts to sales reps based on US geographic regions', now(), now()),
('Continuity Bias', 'CONTINUITY', 2, '{"preserveExisting": true, "requireSameRegion": true}', true, 'Preserve existing owner-account relationships when rep is still on team', now(), now()),
('Tier 1 Balance', 'TIER_BALANCE', 3, '{"tierField": "hierarchy_bookings_arr_converted", "threshold": 50000, "balanceAcrossReps": true}', true, 'Ensure even distribution of high-value accounts across sales reps', now(), now()),
('Load Balancing', 'ROUND_ROBIN', 4, '{"factors": ["accountCount", "totalARR", "renewalDates", "accountMix"], "maxVariance": 0.2}', true, 'Multi-factor load balancing across all dimensions', now(), now());