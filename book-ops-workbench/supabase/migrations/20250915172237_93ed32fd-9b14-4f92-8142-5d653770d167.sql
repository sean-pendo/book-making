-- Insert the 4 missing assignment rules with full JSON configurations
INSERT INTO assignment_rules (build_id, name, rule_type, priority, conditions, description, enabled, created_at, updated_at) VALUES

-- US Region Priority (GEO_FIRST) - Priority 2
('8fc766cc-b091-44b6-bd1c-4d5f9b8409dd', 'US Region Priority', 'GEO_FIRST', 2, '{
  "territoryMappings": {
    "NORTHEAST": ["NY", "NJ", "CT", "MA", "ME", "NH", "VT", "RI"],
    "SOUTHEAST": ["FL", "GA", "SC", "NC", "VA", "WV", "KY", "TN", "AL", "MS", "AR", "LA"],
    "MIDWEST": ["OH", "MI", "IN", "IL", "WI", "MN", "IA", "MO", "ND", "SD", "NE", "KS"],
    "SOUTHWEST": ["TX", "OK", "NM", "AZ"],
    "WEST": ["CA", "NV", "UT", "CO", "WY", "MT", "ID", "WA", "OR", "AK", "HI"]
  },
  "fallbackStrategy": "ROUND_ROBIN",
  "priorityWeights": {
    "SAME_REGION": 100,
    "ADJACENT_REGION": 50,
    "ANY_REGION": 10
  }
}', 'Geographic territory-based assignment with US regional priorities', true, now(), now()),

-- Continuity Bias (CONTINUITY) - Priority 3
('8fc766cc-b091-44b6-bd1c-4d5f9b8409dd', 'Continuity Bias', 'CONTINUITY', 3, '{
  "minimumOwnershipDays": 30,
  "overrideThreshold": 25,
  "skipIfOverloaded": true,
  "requireRegionalMatch": true
}', 'Maintains account ownership continuity with configurable thresholds', true, now(), now()),

-- Tier Balance (TIER_BALANCE) - Priority 4
('8fc766cc-b091-44b6-bd1c-4d5f9b8409dd', 'Tier Balance', 'TIER_BALANCE', 4, '{
  "tierFields": ["expansion_tier", "initial_sale_tier"],
  "distributionMethod": "equal_percentage",
  "maxVariancePercent": 15,
  "tierThresholds": {
    "tier1": 50000,
    "tier2": 20000,
    "tier3": 5000
  }
}', 'Balances tier distribution across sales representatives', true, now(), now()),

-- Round Robin (ROUND_ROBIN) - Priority 5
('8fc766cc-b091-44b6-bd1c-4d5f9b8409dd', 'Round Robin', 'ROUND_ROBIN', 5, '{
  "balancingCriteria": "hybrid",
  "maxVariancePercent": 10,
  "targetDistribution": "equal",
  "loadBalancingStrategy": "weighted_arr"
}', 'Round-robin assignment with load balancing considerations', true, now(), now());