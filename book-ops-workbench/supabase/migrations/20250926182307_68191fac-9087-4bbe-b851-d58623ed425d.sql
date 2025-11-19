-- Phase 1: Clean up duplicate rules and rebalance configuration

-- Delete the duplicate GEO_FIRST rule (keep the one with more comprehensive territory mappings)
DELETE FROM assignment_rules 
WHERE id = '87862d53-babf-4f85-a7cd-8449555a4762' 
AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Delete the Round Robin Balance rule (we'll keep the SMART_BALANCE rule)
DELETE FROM assignment_rules 
WHERE id = '1e34a4bb-3c7f-4c80-872b-4b674fb054f6' 
AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Update the remaining GEO_FIRST rule: Set as Priority 1, scope to all accounts
UPDATE assignment_rules 
SET priority = 1,
    account_scope = 'all',
    name = 'Geographic Assignment - Consolidated',
    description = 'Primary geographic assignment for all accounts across all territories',
    updated_at = now()
WHERE id = '04e08698-c546-48ff-be28-4559b5c46488' 
AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Update the SMART_BALANCE rule: Set as Priority 2 with better balance configuration
UPDATE assignment_rules 
SET priority = 2,
    account_scope = 'all',
    name = 'Smart Balance - Primary',
    description = 'Primary workload balancing with flexible variance and reasonable limits',
    conditions = jsonb_build_object(
        'applyTo', 'all',
        'maxVariance', 20,
        'minARRThreshold', 500000,
        'minAccountsThreshold', 2,
        'maxAccountsPerRep', 100,
        'maxARRPerRep', 5000000
    ),
    updated_at = now()
WHERE id = '30789941-a517-4989-b917-4f2f3737db83' 
AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Update CONTINUITY rule: Set as Priority 3 with higher override threshold
UPDATE assignment_rules 
SET priority = 3,
    conditions = jsonb_build_object(
        'minimumOwnershipDays', 7,
        'overrideThreshold', 25,
        'skipIfOverloaded', true
    ),
    name = 'Account Continuity - Balanced',
    description = 'Maintain ownership continuity but allow rebalancing when severely imbalanced (25%+)',
    updated_at = now()
WHERE id = '23bd4ca9-b5a9-4838-a3fd-556e5dc4fbd7' 
AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Update MIN_THRESHOLDS rule: Set as Priority 4 with lower, more achievable thresholds
UPDATE assignment_rules 
SET priority = 4,
    conditions = jsonb_build_object(
        'customersOnly', false,
        'maxVariancePercent', 15,
        'minCustomerARR', 500000,
        'minParentAccounts', 3
    ),
    name = 'Minimum Thresholds - Balanced',
    description = 'Achievable minimum thresholds: 3 accounts, $500K ARR, with 15% variance tolerance',
    updated_at = now()
WHERE id = '042970b4-9d43-4990-b024-dd7e1a7c928f' 
AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Add a new ROUND_ROBIN rule as Priority 5 for final cleanup
INSERT INTO assignment_rules (
    build_id,
    name,
    rule_type,
    priority,
    conditions,
    account_scope,
    description,
    enabled,
    created_at,
    updated_at
) VALUES (
    'e783d327-162a-4962-ba41-4f4df6f71eea',
    'Final Round Robin Distribution',
    'ROUND_ROBIN',
    5,
    jsonb_build_object(
        'balancingCriteria', 'hybrid',
        'loadBalancingStrategy', 'weighted_arr',
        'maxVariancePercent', 15,
        'respectCapLimits', true
    ),
    'all',
    'Final round-robin distribution for any remaining unassigned accounts',
    true,
    now(),
    now()
);