-- Migration: Add Relaxed Optimization LP Engine Support
-- This adds all configuration columns needed for the weighted LP assignment model
-- that replaces the cascading priority waterfall with a single global solve.

-- Model selection: waterfall (existing) or relaxed_optimization (new)
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS optimization_model TEXT DEFAULT 'waterfall' 
    CHECK (optimization_model IN ('waterfall', 'relaxed_optimization'));

COMMENT ON COLUMN assignment_configuration.optimization_model IS 
    'Assignment model: "waterfall" (priority cascade) or "relaxed_optimization" (single LP solve with soft constraints)';

-- Objective enables and weights for CUSTOMER assignments
-- Higher continuity weight (0.35) because customer relationships are valuable
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS lp_objectives_customer JSONB DEFAULT '{
    "continuity_enabled": true,
    "continuity_weight": 0.35,
    "geography_enabled": true,
    "geography_weight": 0.35,
    "team_alignment_enabled": true,
    "team_alignment_weight": 0.30
}'::jsonb;

COMMENT ON COLUMN assignment_configuration.lp_objectives_customer IS 
    'Scoring objective weights for customer assignments. Weights auto-normalize to sum to 1.0.';

-- Objective enables and weights for PROSPECT assignments
-- Lower continuity weight (0.20) because prospects have less relationship history
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS lp_objectives_prospect JSONB DEFAULT '{
    "continuity_enabled": true,
    "continuity_weight": 0.20,
    "geography_enabled": true,
    "geography_weight": 0.45,
    "team_alignment_enabled": true,
    "team_alignment_weight": 0.35
}'::jsonb;

COMMENT ON COLUMN assignment_configuration.lp_objectives_prospect IS 
    'Scoring objective weights for prospect assignments. Weights auto-normalize to sum to 1.0.';

-- Balance metric enables and penalties (RELATIVE scale 0-1)
-- Penalty of 1.0 means balance matters as much as assignment quality
-- These are applied to normalized deviation (deviation / target)
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS lp_balance_config JSONB DEFAULT '{
    "arr_balance_enabled": true,
    "arr_penalty": 0.5,
    "atr_balance_enabled": true,
    "atr_penalty": 0.3,
    "pipeline_balance_enabled": true,
    "pipeline_penalty": 0.4
}'::jsonb;

COMMENT ON COLUMN assignment_configuration.lp_balance_config IS 
    'Balance penalties are RELATIVE (0-1 scale). Penalty of 1.0 means balance matters as much as assignment quality. ATR applies to customers only, Pipeline applies to prospects only.';

-- Hard constraint enables
-- Each constraint can be toggled on/off independently
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS lp_constraints JSONB DEFAULT '{
    "strategic_pool_enabled": true,
    "locked_accounts_enabled": true,
    "parent_child_linking_enabled": true,
    "capacity_hard_cap_enabled": true
}'::jsonb;

COMMENT ON COLUMN assignment_configuration.lp_constraints IS 
    'Toggle hard constraints on/off. strategic_pool: strategic accounts to strategic reps only. locked_accounts: respect exclude_from_reassignment flag. parent_child: children follow parent. capacity_hard_cap: enforce max ARR per rep.';

-- Stability lock enables and parameters
-- These create hard constraints that keep accounts with current owner
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS lp_stability_config JSONB DEFAULT '{
    "cre_risk_locked": true,
    "renewal_soon_locked": true,
    "renewal_soon_days": 90,
    "pe_firm_locked": true,
    "recent_change_locked": true,
    "recent_change_days": 90,
    "backfill_migration_enabled": true
}'::jsonb;

COMMENT ON COLUMN assignment_configuration.lp_stability_config IS 
    'Stability lock configuration. When enabled, accounts meeting these conditions stay with current owner (or migrate to backfill target).';

-- Continuity score parameters
-- Controls how the tenure/stability/value scoring works
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS lp_continuity_params JSONB DEFAULT '{
    "tenure_weight": 0.35,
    "tenure_max_days": 730,
    "stability_weight": 0.30,
    "stability_max_owners": 5,
    "value_weight": 0.25,
    "value_threshold": 2000000,
    "base_continuity": 0.10
}'::jsonb;

COMMENT ON COLUMN assignment_configuration.lp_continuity_params IS 
    'Continuity score formula: base + tenure_weight*(days/max_days) + stability_weight*(1-owners/max_owners) + value_weight*(arr/threshold). All capped at 1.0.';

-- Geography score parameters
-- Controls region matching scores
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS lp_geography_params JSONB DEFAULT '{
    "exact_match_score": 1.0,
    "sibling_score": 0.65,
    "parent_score": 0.40,
    "global_score": 0.20,
    "unknown_territory_score": 0.50
}'::jsonb;

COMMENT ON COLUMN assignment_configuration.lp_geography_params IS 
    'Geography score based on region match quality. exact: same region. sibling: adjacent regions. parent: same macro-region. global: cross-region.';

-- Team alignment score parameters
-- Controls tier matching and reaching-down penalty
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS lp_team_params JSONB DEFAULT '{
    "exact_match_score": 1.0,
    "one_level_score": 0.60,
    "two_level_score": 0.25,
    "three_level_score": 0.05,
    "reaching_down_penalty": 0.15,
    "unknown_tier_score": 0.50
}'::jsonb;

COMMENT ON COLUMN assignment_configuration.lp_team_params IS 
    'Team alignment score based on tier distance (SMB→Growth→MM→ENT). reaching_down_penalty applies when rep tier > account tier.';

-- Solver configuration
-- Controls HiGHS solver behavior
ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS lp_solver_params JSONB DEFAULT '{
    "timeout_seconds": 60,
    "tie_break_method": "rank_based",
    "feasibility_penalty": 1000,
    "log_level": "info"
}'::jsonb;

COMMENT ON COLUMN assignment_configuration.lp_solver_params IS 
    'HiGHS solver configuration. tie_break_method: rank_based (by ARR). feasibility_penalty: cost per dollar of capacity overflow.';

