import { 
  autoMapTerritoryToRegion, 
  REGION_ANCESTRY, 
  REGION_SIBLINGS,
  classifyTeamTier,
  getAccountARR,
  getAccountATR,
  SALES_TOOLS_ARR_THRESHOLD,
  DEFAULT_MAX_ARR_PER_REP,
  DEFAULT_CONTINUITY_DAYS,
  calculatePriorityWeight,
  DEFAULT_PRIORITY_WEIGHTS,
  LP_SCORING_FACTORS,
  LP_PENALTY,
  getBalancePenaltyMultiplier,
  BalanceIntensity,
  LP_SCALE_LIMITS,
  repHandlesPEFirm
} from '@/_domain';
import { getDefaultPriorityConfig, PriorityConfig, SubConditionConfig } from '@/config/priorityRegistry';
import { 
  getPositionLabel, 
  recordWaterfallRun,
  generateRationale,
  continuityScore,
  geographyScore,
  teamAlignmentScore,
  DEFAULT_LP_CONTINUITY_PARAMS,
  DEFAULT_LP_GEOGRAPHY_PARAMS,
  DEFAULT_LP_TEAM_PARAMS,
  type AggregatedAccount,
  type EligibleRep,
  type AssignmentScores,
  type NormalizedWeights
} from '@/services/optimization';
import { solveLPString } from '@/services/optimization/solver/highsWrapper';

/**
 * Priority-Level Batch Assignment Engine
 * 
 * Uses batch optimization at each priority level before cascading to the next.
 * This prevents greedy assignments where early accounts "steal" capacity from better matches.
 * 
 * DYNAMIC PRIORITY CONFIGURATION:
 * Priority order is now configurable via assignment_configuration.priority_config.
 * If no config is saved, falls back to getDefaultPriorityConfig('COMMERCIAL').
 * 
 * STRATEGIC ACCOUNTS (Separate Pool):
 * - Strategic accounts ALWAYS stay with strategic reps
 * - No capacity limits apply to strategic reps
 * - Distribution is even across all active strategic reps
 * 
 * AVAILABLE PRIORITIES:
 * - manual_holdover: Strategic accounts + locked accounts stay put
 * - sales_tools_bucket: Low-ARR customers (<$25K) route to Sales Tools
 * - stability_accounts: (Phase 2 - not yet implemented)
 * - team_alignment: Embedded in HiGHS solver as penalty weights
 * - geo_and_continuity: batchAssignPriority1() - Continuity + Geography
 * - geography: batchAssignPriority2() - Geography Match
 * - continuity: batchAssignPriority3() - Continuity Any-Geo
 * - arr_balance: batchAssignPriority4() - Fallback/Balance
 * 
 * Each priority level processes ALL eligible accounts before remaining cascade to next.
 * 
 * Global Constraints:
 * - Customer ARR capacity: targetARR * (1 + capacity_variance%)
 * - CRE hard cap: Max per rep (configurable)
 * - Parent/child accounts must have same owner
 * 
 * Each AssignmentProposal includes priorityLevel (1-4) for analytics tracking.
 */

import { supabase } from '@/integrations/supabase/client';

// HiGHS solver is now handled by highsWrapper.ts with unified routing
// @see MASTER_LOGIC.mdc §11.11 Solver Routing Strategy

function sanitizeVarName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
}

/**
 * Convert local Account type to AggregatedAccount for scoring functions
 * @see MASTER_LOGIC.mdc §11.9.1 - Rationale Transparency
 */
function toAggregatedAccount(account: Account): AggregatedAccount {
  return {
    sfdc_account_id: account.sfdc_account_id,
    account_name: account.account_name,
    aggregated_arr: getAccountARR(account),
    aggregated_atr: getAccountATR(account) || 0,
    pipeline_value: account.pipeline_value || 0,
    child_ids: [],
    is_parent: account.is_parent || false,
    owner_id: account.owner_id,
    owner_name: account.owner_name,
    owner_change_date: account.owner_change_date || null,
    owners_lifetime_count: (account as any).owners_lifetime_count || 1,
    is_customer: account.is_customer || false,
    is_strategic: account.is_strategic || false,
    sales_territory: account.sales_territory,
    geo: account.geo,
    employees: account.employees || null,
    enterprise_vs_commercial: (account as any).enterprise_vs_commercial || null,
    tier: null,
    expansion_tier: account.expansion_tier,
    initial_sale_tier: account.initial_sale_tier,
    cre_risk: account.cre_risk,
    renewal_date: account.renewal_date || null,
    pe_firm: account.pe_firm,
    exclude_from_reassignment: account.exclude_from_reassignment
  };
}

/**
 * Convert local SalesRep type to EligibleRep for scoring functions
 */
function toEligibleRep(rep: SalesRep): EligibleRep {
  return {
    rep_id: rep.rep_id,
    name: rep.name,
    region: rep.region,
    team_tier: rep.team_tier || null,
    is_active: rep.is_active ?? true,
    include_in_assignments: rep.include_in_assignments ?? true,
    is_strategic_rep: rep.is_strategic_rep || false,
    is_backfill_source: (rep as any).is_backfill_source || false,
    is_backfill_target: (rep as any).is_backfill_target || false,
    backfill_target_rep_id: (rep as any).backfill_target_rep_id || null,
    current_arr: 0
  };
}

/**
 * Calculate assignment scores for an account-rep pair
 * Used to generate transparent rationales in the waterfall engine
 * @see MASTER_LOGIC.mdc §11.9.1
 */
function calculateAssignmentScores(
  account: Account,
  rep: SalesRep,
  territoryMappings: Record<string, string>
): AssignmentScores {
  const aggAccount = toAggregatedAccount(account);
  const eligibleRep = toEligibleRep(rep);
  
  return {
    continuity: continuityScore(aggAccount, eligibleRep, DEFAULT_LP_CONTINUITY_PARAMS),
    geography: geographyScore(aggAccount, eligibleRep, territoryMappings, DEFAULT_LP_GEOGRAPHY_PARAMS),
    teamAlignment: teamAlignmentScore(aggAccount, eligibleRep, DEFAULT_LP_TEAM_PARAMS),
    tieBreaker: 0
  };
}

/**
 * Generate a transparent rationale for a waterfall assignment
 * Uses the shared rationale generator with percentage breakdowns
 * @see MASTER_LOGIC.mdc §11.9.1
 */
function generateWaterfallRationale(
  account: Account,
  rep: SalesRep,
  territoryMappings: Record<string, string>,
  priorityConfig: PriorityConfig[],
  weights: NormalizedWeights = { wC: 0.35, wG: 0.35, wT: 0.30 }
): string {
  const aggAccount = toAggregatedAccount(account);
  const eligibleRep = toEligibleRep(rep);
  const scores = calculateAssignmentScores(account, rep, territoryMappings);
  
  return generateRationale(
    aggAccount,
    eligibleRep,
    scores,
    weights,
    null, // no stability lock
    priorityConfig
  );
}

// Team Alignment Constants
// GAMMA: 1-level mismatch penalty (Growth → SMB) - discouraged but acceptable
// EPSILON: 2+ level mismatch penalty (MM → SMB) - almost never, 10x harder
const TEAM_ALIGNMENT_PENALTIES = {
  GAMMA: 100,    // 1-level mismatch: ~20% allowance
  EPSILON: 1000  // 2+ level mismatch: almost never
};

type TeamTier = 'SMB' | 'Growth' | 'MM' | 'ENT';

const TIER_ORDER: TeamTier[] = ['SMB', 'Growth', 'MM', 'ENT'];

// Priority display names for consistent labeling
const PRIORITY_NAMES: Record<string, string> = {
  'manual_holdover': 'Manual Holdover',
  'sales_tools_bucket': 'Sales Tools Bucket',
  'stability_accounts': 'Stability Accounts',
  'strategic_continuity': 'Strategic Pool: Continuity',
  'strategic_distribution': 'Strategic Pool: Distribution',
  'geo_and_continuity': 'Continuity + Geography',
  'geography': 'Geographic Match',
  'continuity': 'Account Continuity',
  'team_alignment': 'Team Alignment',
  'arr_balance': 'Residual Optimization',
};

/**
 * Region Hierarchy for Geographic Scoring
 * 
 * Defines fallback paths from granular to broader regions.
 * Used by getGeographyScore() to calculate match quality when
 * an account can't find an exact geo match but needs to rank
 * alternative reps.
 * 
 * AMER regions (from territoryAutoMapping.ts):
 * - 'North East', 'South East', 'Central', 'West' -> 'AMER' -> 'Global'
 * 
 * Score decreases by 25 points per level of hierarchy.
 * Example: Central account -> West rep = 50 points (sibling under AMER)
 */
// REGION_ANCESTRY and REGION_SIBLINGS imported from @/_domain

// formatPriorityLabel removed - now using this.formatPriorityLabel() class method
// which uses getPositionLabel() from optimization module for config-driven position labels

// classifyTeamTier imported from @/_domain

/**
 * Calculate team alignment penalty based on tier distance
 * 0 distance = no penalty (perfect match)
 * 1 distance = GAMMA penalty (discouraged but acceptable)
 * 2+ distance = EPSILON penalty (almost never)
 */
function calculateTeamAlignmentPenalty(
  accountTier: TeamTier,
  repTier: TeamTier | null | undefined
): number {
  if (!repTier) return 0; // No penalty if rep has no tier assigned
  
  const accountIndex = TIER_ORDER.indexOf(accountTier);
  const repIndex = TIER_ORDER.indexOf(repTier);
  const distance = Math.abs(accountIndex - repIndex);
  
  if (distance === 0) return 0;
  if (distance === 1) return TEAM_ALIGNMENT_PENALTIES.GAMMA;
  return TEAM_ALIGNMENT_PENALTIES.EPSILON;
}

interface Account {
  id: string;
  sfdc_account_id: string;
  account_name: string;
  arr: number;
  calculated_arr: number | null;
  calculated_atr?: number | null;
  hierarchy_bookings_arr_converted?: number | null;  // Primary ARR source for customers
  sales_territory?: string | null;
  geo?: string | null;
  owner_id: string | null;
  owner_name: string | null;
  is_customer: boolean;
  is_parent: boolean;
  expansion_tier: string | null;
  cre_count: number;
  exclude_from_reassignment: boolean;
  parent_id?: string | null;
  ultimate_parent_id?: string | null;
  renewal_quarter?: string | null;
  employees?: number | null;  // For team alignment classification
  // Stability fields for stability_accounts priority
  cre_risk?: boolean | null;
  renewal_date?: string | null;
  pe_firm?: string | null;
  owner_change_date?: string | null;
}

interface SalesRep {
  id: string;
  rep_id: string;
  name: string;
  region: string | null;
  is_active: boolean;
  is_strategic_rep: boolean;
  include_in_assignments: boolean;
  team_tier?: 'SMB' | 'Growth' | 'MM' | 'ENT' | null;  // For team alignment
  pe_firms?: string | null;  // For PE firm routing - see MASTER_LOGIC.mdc §10.7
}

interface AssignmentConfiguration {
  customer_target_arr: number;
  customer_max_arr: number;
  customer_min_arr?: number;  // From DB - absolute minimum for customers
  prospect_target_arr: number;
  prospect_max_arr: number;
  prospect_min_arr?: number;  // From DB - absolute minimum for prospects
  max_cre_per_rep: number;
  capacity_variance_percent?: number;
  max_tier1_per_rep?: number;
  max_tier2_per_rep?: number;
  territory_mappings?: Record<string, string> | null;
  rs_arr_threshold?: number; // Sales Tools threshold (default $25K)
  
  // Balance thresholds (calculated or overridden)
  cre_target?: number;
  cre_max?: number;
  cre_max_override?: number;
  atr_target?: number;
  atr_max?: number;
  atr_max_override?: number;
  tier1_target?: number;
  tier1_max?: number;
  tier1_max_override?: number;
  tier2_target?: number;
  tier2_max?: number;
  tier2_max_override?: number;
  q1_renewal_target?: number;
  q2_renewal_target?: number;
  q3_renewal_target?: number;
  q4_renewal_target?: number;
  last_calculated_at?: string | null;
}

interface AssignmentWarning {
  severity: 'low' | 'medium' | 'high';
  type: 'continuity_broken' | 'cross_region' | 'cre_risk' | 'tier_concentration' | 'unassigned' | 'parent_child_separated' | 'strategic_overflow' | 'capacity_exceeded';
  accountOrRep: string;
  reason: string;
  details: string;
}

interface AssignmentProposal {
  account: Account;
  proposedRep: SalesRep;
  currentOwner: SalesRep | null;
  rationale: string;
  warnings: AssignmentWarning[];
  ruleApplied: string;
  arr: number;
  priorityLevel: 1 | 2 | 3 | 4;  // Track which priority level assigned this account
}

interface WorkloadState {
  arr: number;
  netARR: number;  // For prospects (from opportunities with net_arr > 0)
  accounts: number;
  cre: number;
  atr: number;
  tier1: number;
  tier2: number;
  q1_renewals: number;
  q2_renewals: number;
  q3_renewals: number;
  q4_renewals: number;
}

/**
 * Progress callback for waterfall engine UI updates
 * Provides granular progress during priority waterfall execution
 */
export interface WaterfallProgress {
  stage: 'initializing' | 'loading' | 'priority' | 'solving' | 'finalizing' | 'complete';
  status: string;
  progress: number;  // 0-100
  currentPriority?: string;
  priorityIndex?: number;
  totalPriorities?: number;
  accountsProcessed?: number;
  totalAccounts?: number;
  assignmentsMade?: number;
}

export type WaterfallProgressCallback = (progress: WaterfallProgress) => void;

/**
 * Yield to the UI event loop to keep animations smooth
 * Uses double-frame yield to ensure browser has time to render
 * and process pending timers (like setInterval for the stopwatch)
 */
async function yieldToUI(): Promise<void> {
  // Double yield: first to let React process state updates, 
  // second to let browser render and process timers
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        // Yield again after animation frame to let timer callbacks run
        setTimeout(resolve, 16); // ~1 frame at 60fps
      });
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/**
 * Lightweight yield for use in hot loops
 * Only yields to microtask queue (~0-4ms) instead of full frame (~32ms)
 * Use this for iteration-based yielding in LP building loops
 */
async function yieldMicrotask(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

export class WaterfallAssignmentEngine {
  private buildId: string;
  private assignmentType: 'customer' | 'prospect';
  private config: AssignmentConfiguration;
  private workloadMap: Map<string, WorkloadState>;
  private repMap: Map<string, SalesRep>;
  private warnings: AssignmentWarning[];
  private opportunitiesMap: Map<string, number>;  // Map sfdc_account_id -> net_arr
  private totalProspectCount: number = 0;  // Track total prospects for dynamic capacity calculation
  private priorityConfig: PriorityConfig[] = [];  // Loaded from DB in generateAssignments
  private balanceIntensityMultiplier: number = 1.0;  // Balance vs continuity trade-off @see MASTER_LOGIC.mdc §11.3.1
  private balanceIntensity: BalanceIntensity = 'NORMAL';  // Store string for telemetry
  private lpBalanceConfig?: { arr_penalty?: number; atr_penalty?: number; pipeline_penalty?: number };  // Store for telemetry
  private progressCallback?: WaterfallProgressCallback;
  private lastYieldTime: number = 0;

  constructor(buildId: string, assignmentType: 'customer' | 'prospect', config: AssignmentConfiguration, opportunities?: Array<{sfdc_account_id: string, net_arr: number}>, progressCallback?: WaterfallProgressCallback) {
    this.buildId = buildId;
    this.assignmentType = assignmentType;
    this.config = {
      ...config,
      capacity_variance_percent: config.capacity_variance_percent ?? 10,
      max_tier1_per_rep: config.max_tier1_per_rep ?? 5,
      max_tier2_per_rep: config.max_tier2_per_rep ?? 8
    };
    this.workloadMap = new Map();
    this.repMap = new Map();
    this.warnings = [];
    this.opportunitiesMap = new Map();

    // Build opportunities map for Net ARR calculation
    if (opportunities) {
      opportunities.forEach(opp => {
        const existing = this.opportunitiesMap.get(opp.sfdc_account_id) || 0;
        this.opportunitiesMap.set(opp.sfdc_account_id, existing + (opp.net_arr || 0));
      });
      console.log(`📊 Loaded ${this.opportunitiesMap.size} accounts with Net ARR data, total opportunities: ${opportunities.length}`);
    }

    // Store progress callback for UI updates
    this.progressCallback = progressCallback;
    this.lastYieldTime = Date.now();

    console.log(`🎯 Waterfall Engine initialized:`, {
      type: assignmentType,
      targetARR: this.getTargetARR() / 1000000 + 'M',
      capacityLimit: this.getCapacityLimit() / 1000000 + 'M',
      maxCRE: this.config.max_cre_per_rep
    });
  }

  /**
   * Report progress to UI callback and yield to event loop
   * Always yields to ensure the browser can render the update and run timers
   */
  private async reportProgress(progress: WaterfallProgress): Promise<void> {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
    
    // Always yield to UI after progress update
    // This ensures the browser can:
    // 1. Process the React state update
    // 2. Render the updated progress bar
    // 3. Run pending timer callbacks (stopwatch, animations)
    await yieldToUI();
    this.lastYieldTime = Date.now();
  }

  private getTargetARR(): number {
    return this.assignmentType === 'customer'
      ? this.config.customer_target_arr
      : this.config.prospect_target_arr;
  }

  private getCapacityLimit(): number {
    // Use the configured max ARR as the hard cap, with fallback
    // @see MASTER_LOGIC.mdc §12.1.2 Waterfall Engine Min/Max Enforcement
    const configured = this.assignmentType === 'customer'
      ? this.config.customer_max_arr
      : this.config.prospect_max_arr;
    return configured || DEFAULT_MAX_ARR_PER_REP;
  }

  /**
   * Get the absolute minimum ARR floor for a rep
   * Uses configured min if set, otherwise falls back to calculated threshold
   * @see MASTER_LOGIC.mdc §12.1.2 Waterfall Engine Min/Max Enforcement
   */
  private getMinimumFloor(): number {
    const configuredMin = this.assignmentType === 'customer'
      ? this.config.customer_min_arr
      : this.config.prospect_min_arr;
    
    // Use configured min if set, otherwise calculate from target × variance
    return configuredMin ?? this.getMinimumThreshold();
  }

  /**
   * Format priority label for display using config-driven position
   * Uses priority_config from database to determine P# label
   */
  private formatPriorityLabel(priorityId: string): string {
    const posLabel = getPositionLabel(priorityId, this.priorityConfig);
    const friendlyName = PRIORITY_NAMES[priorityId] || priorityId;
    return `${posLabel}: ${friendlyName}`;
  }

  private getMinimumThreshold(): number {
    // Calculate minimum threshold based on target and variance (soft floor)
    const target = this.getTargetARR();
    const variance = this.config.capacity_variance_percent || 10;
    return target * (1 - variance / 100);
  }

  async generateAssignments(
    accounts: Account[],
    reps: SalesRep[]
  ): Promise<{ proposals: AssignmentProposal[], warnings: AssignmentWarning[] }> {
    const startTime = Date.now();
    console.log(`🚀 Starting waterfall assignment: ${accounts.length} accounts, ${reps.length} reps`);

    // Report initial progress
    await this.reportProgress({
      stage: 'initializing',
      status: 'Initializing waterfall engine...',
      progress: 2,
      totalAccounts: accounts.length,
      assignmentsMade: 0
    });

    // Fetch full config including priority_config and territory_mappings
    const { data: configData } = await supabase
      .from('assignment_configuration')
      .select('*')
      .eq('build_id', this.buildId)
      .single();

    const territoryMappings = configData?.territory_mappings || {};

    // Load priority configuration - use saved config or fall back to default
    this.priorityConfig = (configData?.priority_config as unknown as PriorityConfig[]) 
      || getDefaultPriorityConfig('COMMERCIAL');
    
    console.log(`[Engine] ✅ Loaded priority config with ${this.priorityConfig.length} priorities`);
    
    // Get balance intensity for LP penalty multiplier @see MASTER_LOGIC.mdc §11.3.1
    this.balanceIntensity = (configData?.balance_intensity as BalanceIntensity) ?? 'NORMAL';
    this.balanceIntensityMultiplier = getBalancePenaltyMultiplier(this.balanceIntensity);
    console.log(`[Waterfall] Balance intensity: ${this.balanceIntensity} (multiplier: ${this.balanceIntensityMultiplier}x)`);
    
    // Store lp_balance_config for telemetry
    this.lpBalanceConfig = configData?.lp_balance_config as { arr_penalty?: number; atr_penalty?: number; pipeline_penalty?: number } | undefined;
    
    // Apply territory mappings to accounts with missing geo but present sales_territory
    accounts = accounts.map(account => {
      if (!account.geo && account.sales_territory && territoryMappings[account.sales_territory]) {
        return {
          ...account,
          geo: territoryMappings[account.sales_territory]
        };
      }
      return account;
    });

    this.warnings = [];
    
    // Initialize workload and rep map
    reps.forEach(rep => {
      this.repMap.set(rep.rep_id, rep);
      this.workloadMap.set(rep.rep_id, {
        arr: 0,
        netARR: 0,  // Track Net ARR separately for prospects
        accounts: 0,
        cre: 0,
        atr: 0,
        tier1: 0,
        tier2: 0,
        q1_renewals: 0,
        q2_renewals: 0,
        q3_renewals: 0,
        q4_renewals: 0
      });
    });

    // Filter to only parent accounts matching type
    const assignableAccounts = accounts.filter(a => {
      if (!a.is_parent) return false;
      if (a.exclude_from_reassignment) return false;
      if (this.assignmentType === 'customer' && !a.is_customer) return false;
      if (this.assignmentType === 'prospect' && a.is_customer) return false;
      return true;
    });

    // Store total count for dynamic capacity calculation
    this.totalProspectCount = assignableAccounts.length;

    console.log(`✅ Filtered to ${assignableAccounts.length} assignable parent accounts`);
    
    // Log prospect assignment summary
    if (this.assignmentType === 'prospect') {
      const withNetARR = assignableAccounts.filter(a => (this.opportunitiesMap.get(a.sfdc_account_id) || 0) > 0).length;
      const withoutNetARR = assignableAccounts.length - withNetARR;
      const activeReps = reps.filter(r => r.is_active && r.include_in_assignments && !r.is_strategic_rep).length;
      const targetPerRep = Math.ceil(assignableAccounts.length / activeReps);
      const maxPerRep = Math.round(targetPerRep * 1.5); // 50% variance
      console.log(`📊 Prospect Assignment Summary:
  - Total Prospects: ${assignableAccounts.length}
  - With Net ARR > 0: ${withNetARR}
  - With Net ARR = 0: ${withoutNetARR}
  - Active Reps: ${activeReps}
  - Target per Rep: ~${targetPerRep} accounts
  - Max per Rep: ~${maxPerRep} accounts (50% variance)`);
    }

    // Prioritize: Strategic first, then Tier 1, then by Net ARR (for prospects) or ARR (for customers) descending
    const sortedAccounts = assignableAccounts.sort((a, b) => {
      const aIsStrategic = this.isStrategicAccount(a);
      const bIsStrategic = this.isStrategicAccount(b);
      if (aIsStrategic && !bIsStrategic) return -1;
      if (!aIsStrategic && bIsStrategic) return 1;
      
      const aTier1 = a.expansion_tier === 'Tier 1' ? 1 : 0;
      const bTier1 = b.expansion_tier === 'Tier 1' ? 1 : 0;
      if (aTier1 !== bTier1) return bTier1 - aTier1;
      
      // Use Net ARR for prospects, ARR for customers
      if (this.assignmentType === 'prospect') {
        const aNetARR = this.opportunitiesMap.get(a.sfdc_account_id) || 0;
        const bNetARR = this.opportunitiesMap.get(b.sfdc_account_id) || 0;
        return bNetARR - aNetARR; // Higher Net ARR first
      } else {
        const aARR = getAccountARR(a);
        const bARR = getAccountARR(b);
        return bARR - aARR;
      }
    });

    let proposals: AssignmentProposal[] = [];

    // DYNAMIC PRIORITY EXECUTION
    // Execute priorities in the order configured by the user
    console.log(`🔄 Starting Dynamic Priority Execution...`);
    
    // Get enabled priorities sorted by position
    const enabledPriorities = this.priorityConfig
      .filter(p => p.enabled)
      .sort((a, b) => a.position - b.position);
    
    console.log(`[Engine] Enabled priorities: ${enabledPriorities.map(p => `${p.id}@${p.position}`).join(' → ')}`);
    
    // Report loading complete, starting priorities
    await this.reportProgress({
      stage: 'loading',
      status: `Loaded ${sortedAccounts.length} accounts, starting priority waterfall...`,
      progress: 10,
      totalAccounts: sortedAccounts.length,
      totalPriorities: enabledPriorities.length,
      assignmentsMade: 0
    });
    
    // Track remaining accounts and stats per priority
    let remainingAccounts = [...sortedAccounts];
    const priorityStats: Record<string, number> = {};
    
    // Execute each priority in configured order
    // Progress from 10% to 85% across all priorities
    const progressPerPriority = 75 / enabledPriorities.length;
    
    for (let i = 0; i < enabledPriorities.length; i++) {
      const priority = enabledPriorities[i];
      const priorityLabel = PRIORITY_NAMES[priority.id] || priority.id;
      const baseProgress = 10 + (i * progressPerPriority);
      
      console.log(`\n=== Executing: ${priority.id} (position ${priority.position}) ===`);
      console.log(`[Engine] ${remainingAccounts.length} accounts remaining`);
      
      // Report starting this priority
      await this.reportProgress({
        stage: 'priority',
        status: `P${priority.position}: ${priorityLabel} - Processing ${remainingAccounts.length} accounts...`,
        progress: baseProgress,
        currentPriority: priorityLabel,
        priorityIndex: i + 1,
        totalPriorities: enabledPriorities.length,
        totalAccounts: sortedAccounts.length,
        accountsProcessed: sortedAccounts.length - remainingAccounts.length,
        assignmentsMade: proposals.length
      });
      
      const result = await this.executePriority(priority, remainingAccounts, reps);
      
      // Use concat to avoid stack overflow with large arrays (spread operator fails at ~10k items)
      proposals = proposals.concat(result.assigned);
      remainingAccounts = result.remaining;
      priorityStats[priority.id] = result.assigned.length;
      
      // Report completing this priority
      await this.reportProgress({
        stage: 'priority',
        status: `P${priority.position}: ${priorityLabel} - Assigned ${result.assigned.length} accounts`,
        progress: baseProgress + progressPerPriority * 0.9,
        currentPriority: priorityLabel,
        priorityIndex: i + 1,
        totalPriorities: enabledPriorities.length,
        totalAccounts: sortedAccounts.length,
        accountsProcessed: sortedAccounts.length - remainingAccounts.length,
        assignmentsMade: proposals.length
      });
      
      console.log(`[Engine] ${priority.id}: assigned ${result.assigned.length}, remaining ${remainingAccounts.length}`);
    }
    
    // FORCE ASSIGNMENT: Any remaining accounts get assigned to least loaded rep
    // This ensures 100% assignment rate even when all reps are at capacity
    if (remainingAccounts.length > 0) {
      console.log(`\n🔥 FORCE ASSIGNMENT: ${remainingAccounts.length} accounts need forced assignment`);
      
      await this.reportProgress({
        stage: 'priority',
        status: `Force assigning ${remainingAccounts.length} remaining accounts...`,
        progress: 86,
        currentPriority: 'Force Assignment',
        totalAccounts: sortedAccounts.length,
        accountsProcessed: sortedAccounts.length - remainingAccounts.length,
        assignmentsMade: proposals.length
      });
      
      // Get all eligible reps (active, assignable, non-strategic)
      const allEligibleReps = reps.filter(rep => 
        rep.is_active && 
        rep.include_in_assignments &&
        !rep.is_strategic_rep
      );
      
      if (allEligibleReps.length === 0) {
        // No reps available at all - add warnings
        for (const account of remainingAccounts) {
          this.warnings.push({
            severity: 'high',
            type: 'unassigned',
            accountOrRep: account.account_name,
            reason: 'No active reps available',
            details: `Account could not be assigned - no active reps in pool`
          });
        }
      } else {
        // Force assign each remaining account to least loaded rep
        for (let i = 0; i < remainingAccounts.length; i++) {
          const account = remainingAccounts[i];
          const accountARR = getAccountARR(account);
          const currentOwner = account.owner_id ? this.repMap.get(account.owner_id) || null : null;
          
          // Find least loaded rep based on assignment type
          let leastLoadedRep: SalesRep;
          if (this.assignmentType === 'prospect') {
            // For prospects, sort by account count ascending (lowest first)
            leastLoadedRep = [...allEligibleReps].sort((a, b) => {
              const workloadA = this.workloadMap.get(a.rep_id)!;
              const workloadB = this.workloadMap.get(b.rep_id)!;
              return workloadA.accounts - workloadB.accounts;
            })[0];
          } else {
            // For customers, use ARR-based selection
            leastLoadedRep = this.findMostCapacityRep(allEligibleReps);
          }
          
          console.log(`✅ RO: ${account.account_name} FORCE-assigned to ${leastLoadedRep.name} (All Reps At Capacity)`);
          
          // Update workload tracking
          const workload = this.workloadMap.get(leastLoadedRep.rep_id)!;
          workload.arr += accountARR;
          workload.accounts += 1;
          
          const forceWarnings: AssignmentWarning[] = [{
            severity: 'high',
            type: 'capacity_exceeded',
            accountOrRep: leastLoadedRep.name,
            reason: `All reps at capacity - forced assignment`,
            details: `Account assigned despite capacity constraints`
          }];
          
          if (currentOwner && currentOwner.rep_id !== leastLoadedRep.rep_id) {
            forceWarnings.push({
              severity: 'medium',
              type: 'continuity_broken',
              accountOrRep: account.account_name,
              reason: `Changed from ${currentOwner.name} to ${leastLoadedRep.name}`,
              details: `Forced reassignment due to capacity constraints`
            });
          }
          
          proposals.push({
            account,
            proposedRep: leastLoadedRep,
            currentOwner,
            rationale: 'RO: Force Assignment - All Reps At Capacity',
            warnings: forceWarnings,
            ruleApplied: 'RO: Forced Assignment',
            arr: accountARR,
            priorityLevel: 4
          });
          
          priorityStats['force_assignment'] = (priorityStats['force_assignment'] || 0) + 1;
          
          // Yield to UI periodically during force assignment (every 50 accounts)
          if (i % 50 === 0) {
            await this.reportProgress({
              stage: 'priority',
              status: `Force assigning... ${i + 1}/${remainingAccounts.length}`,
              progress: 86 + (i / remainingAccounts.length) * 4,
              currentPriority: 'Force Assignment',
              totalAccounts: sortedAccounts.length,
              accountsProcessed: sortedAccounts.length - remainingAccounts.length + i,
              assignmentsMade: proposals.length
            });
          }
        }
        
        // Clear remaining accounts since they've all been force-assigned
        remainingAccounts = [];
      }
    }
    
    // Report finalizing
    await this.reportProgress({
      stage: 'finalizing',
      status: 'Finalizing assignments and generating summary...',
      progress: 92,
      totalAccounts: sortedAccounts.length,
      accountsProcessed: sortedAccounts.length,
      assignmentsMade: proposals.length
    });
    
    // Log summary
    console.log(`\n📊 Priority Execution Summary:`);
    for (const [priorityId, count] of Object.entries(priorityStats)) {
      console.log(`  - ${priorityId}: ${count}`);
    }
    console.log(`  - Unassigned: ${remainingAccounts.length}`);
    console.log(`  - Total: ${proposals.length}`);

    // Post-process: Check for warnings
    this.checkPostAssignmentWarnings(reps);

    // Report complete
    await this.reportProgress({
      stage: 'complete',
      status: `Complete! ${proposals.length} assignments generated.`,
      progress: 100,
      totalAccounts: sortedAccounts.length,
      accountsProcessed: sortedAccounts.length,
      assignmentsMade: proposals.length
    });

    const solveTimeMs = Date.now() - startTime;
    console.log(`✅ Generated ${proposals.length} proposals with ${this.warnings.length} warnings in ${solveTimeMs}ms`);
    
    // Calculate simple metrics for telemetry
    const telemetryMetrics = this.calculateTelemetryMetrics(proposals, reps);
    
    // Record telemetry (fire-and-forget)
    // @see MASTER_LOGIC.mdc §14 - Optimization Telemetry
    recordWaterfallRun({
      buildId: this.buildId,
      assignmentType: this.assignmentType,
      numAccounts: sortedAccounts.length,
      numReps: reps.filter(r => r.is_active && r.include_in_assignments).length,
      numLockedAccounts: priorityStats['manual_holdover'] || 0,
      numStrategicAccounts: priorityStats['strategic_continuity'] || 0,
      solveTimeMs,
      warnings: this.warnings.map(w => `${w.type}: ${w.reason}`),
      // Pass config snapshot for telemetry analysis
      config: {
        balance_intensity: this.balanceIntensity,
        priority_config: this.priorityConfig,
        lp_balance_config: this.lpBalanceConfig,
        intensity_multiplier: this.balanceIntensityMultiplier
      },
      metrics: telemetryMetrics
    }).catch(() => {}); // Swallow errors - telemetry is non-critical
    
    return { proposals, warnings: this.warnings };
  }
  
  /**
   * Calculate simple metrics for telemetry
   * These are lightweight calculations that don't require full LP metrics infrastructure
   */
  private calculateTelemetryMetrics(
    proposals: AssignmentProposal[],
    reps: SalesRep[]
  ): { arr_variance_percent?: number; continuity_rate?: number; exact_geo_match_rate?: number } {
    if (proposals.length === 0) return {};
    
    // Continuity rate: % of accounts staying with current owner
    const continuityCount = proposals.filter(p => 
      p.currentOwner && p.proposedRep.rep_id === p.currentOwner.rep_id
    ).length;
    const continuity_rate = (continuityCount / proposals.length) * 100;
    
    // Geo match rate: % of accounts with exact geo match
    const exactGeoCount = proposals.filter(p => {
      const accountGeo = p.account.geo || p.account.sales_territory;
      const repRegion = p.proposedRep.region;
      return accountGeo && repRegion && accountGeo === repRegion;
    }).length;
    const exact_geo_match_rate = (exactGeoCount / proposals.length) * 100;
    
    // ARR variance: coefficient of variation of ARR per rep
    const repARRMap = new Map<string, number>();
    for (const p of proposals) {
      const arr = getAccountARR(p.account);
      const current = repARRMap.get(p.proposedRep.rep_id) || 0;
      repARRMap.set(p.proposedRep.rep_id, current + arr);
    }
    
    const arrValues = Array.from(repARRMap.values());
    if (arrValues.length > 1) {
      const mean = arrValues.reduce((a, b) => a + b, 0) / arrValues.length;
      if (mean > 0) {
        const variance = arrValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arrValues.length;
        const stdDev = Math.sqrt(variance);
        const arr_variance_percent = (stdDev / mean) * 100;
        return { arr_variance_percent, continuity_rate, exact_geo_match_rate };
      }
    }
    
    return { continuity_rate, exact_geo_match_rate };
  }

  // ========== PRIORITY DISPATCHER ==========
  
  /**
   * Execute a single priority and return assigned/remaining accounts
   * Routes to the appropriate handler method based on priority ID
   */
  private async executePriority(
    priority: PriorityConfig,
    accounts: Account[],
    reps: SalesRep[]
  ): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    switch (priority.id) {
      case 'manual_holdover':
        return this.handleManualHoldover(accounts, reps);
      
      case 'sales_tools_bucket':
        return this.handleSalesToolsBucket(accounts, reps);
      
      case 'geo_and_continuity':
        return this.batchAssignPriority1(accounts, reps);
      
      case 'geography':
        return this.batchAssignPriority2(accounts, reps);
      
      case 'continuity':
        return this.batchAssignPriority3(accounts, reps);
      
      case 'arr_balance':
        return this.batchAssignPriority4(accounts, reps);
      
      case 'stability_accounts':
        return this.handleStabilityAccounts(accounts, reps, priority);
      
      case 'team_alignment':
        // Team alignment is applied via HiGHS penalties in solveWithHiGHS(), not a discrete step
        // If this priority is enabled, the solver already applies team alignment penalties
        console.log(`[Engine] team_alignment: applied via solver penalties (not a discrete step)`);
        return { assigned: [], remaining: accounts };
      
      default:
        console.warn(`[Engine] Unknown priority: ${priority.id}, skipping`);
        return { assigned: [], remaining: accounts };
    }
  }

  // ========== EXTRACTED PRIORITY HANDLERS ==========

  /**
   * Handle Manual Holdover (P0) - Strategic accounts stay with strategic reps
   * Locked accounts stay put. This runs before all other priorities.
   */
  private async handleManualHoldover(
    accounts: Account[],
    reps: SalesRep[]
  ): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    const assigned: AssignmentProposal[] = [];
    const remaining: Account[] = [];
    
    for (const account of accounts) {
      // Strategic accounts get assigned to strategic reps immediately
      if (this.isStrategicAccount(account)) {
        const proposal = this.assignStrategicAccount(account, reps);
        if (proposal) {
          assigned.push(proposal);
          this.updateWorkload(proposal.proposedRep.rep_id, account);
        } else {
          // Strategic account couldn't be assigned (no strategic reps) - pass through
          remaining.push(account);
        }
      } else {
        // Non-strategic account continues to next priority
        remaining.push(account);
      }
    }
    
    return { assigned, remaining };
  }

  /**
   * Handle Stability Accounts - Lock at-risk accounts to current owner
   * Checks enabled sub-conditions: CRE risk, renewal soon, PE firm, recent change
   */
  private async handleStabilityAccounts(
    accounts: Account[],
    reps: SalesRep[],
    priority: PriorityConfig
  ): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    const assigned: AssignmentProposal[] = [];
    const remaining: Account[] = [];
    
    // Get enabled sub-conditions
    const enabledConditions = new Set(
      (priority.subConditions || [])
        .filter(sc => sc.enabled)
        .map(sc => sc.id)
    );
    
    console.log(`[Engine] Stability Accounts: checking ${accounts.length} accounts with conditions: ${Array.from(enabledConditions).join(', ') || 'none'}`);
    
    if (enabledConditions.size === 0) {
      // No sub-conditions enabled, skip this priority
      return { assigned: [], remaining: accounts };
    }
    
    // Build lock stats
    const lockStats: Record<string, number> = {
      cre_risk: 0,
      renewal_soon: 0,
      pe_firm: 0,
      recent_owner_change: 0
    };
    
    for (const account of accounts) {
      const currentOwner = account.owner_id ? this.repMap.get(account.owner_id) : null;
      
      // Must have current owner to lock
      if (!currentOwner) {
        remaining.push(account);
        continue;
      }
      
      let lockReason: string | null = null;
      let lockType: string | null = null;
      
      // Check CRE Risk
      if (enabledConditions.has('cre_risk') && account.cre_risk) {
        lockReason = 'CRE at-risk account - relationship stability';
        lockType = 'cre_risk';
        lockStats.cre_risk++;
      }
      
      // Check Renewal Soon (within stability window)
      // @see MASTER_LOGIC.mdc §10.8 - DEFAULT_CONTINUITY_DAYS
      if (!lockReason && enabledConditions.has('renewal_soon') && account.renewal_date) {
        const renewalDate = new Date(account.renewal_date);
        const now = new Date();
        const daysUntilRenewal = Math.floor(
          (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysUntilRenewal >= 0 && daysUntilRenewal <= DEFAULT_CONTINUITY_DAYS) {
          lockReason = `Renewal in ${daysUntilRenewal} days`;
          lockType = 'renewal_soon';
          lockStats.renewal_soon++;
        }
      }
      
      // Check PE Firm - Route to dedicated PE rep if one exists
      // @see MASTER_LOGIC.mdc §10.7.1 - Dedicated PE Rep Routing
      if (!lockReason && enabledConditions.has('pe_firm') && account.pe_firm) {
        // First, check if any rep is dedicated to this PE firm
        // Note: Use Array.from(this.repMap.values()) since class uses repMap, not salesReps array
        const dedicatedPERep = Array.from(this.repMap.values()).find(r => 
          r.include_in_assignments !== false && 
          r.pe_firms && 
          repHandlesPEFirm(r.pe_firms, account.pe_firm)
        );
        
        if (dedicatedPERep) {
          // Route to dedicated PE rep (override current owner)
          lockReason = `PE firm: ${account.pe_firm} → dedicated rep ${dedicatedPERep.name}`;
          lockType = 'pe_firm';
          lockStats.pe_firm++;
          
          // Override currentOwner to the dedicated PE rep for this account
          const accountARR = getAccountARR(account);
          assigned.push({
            account,
            proposedRep: dedicatedPERep,
            currentOwner,  // Keep original for reference
            rationale: lockReason,
            warnings: currentOwner?.rep_id !== dedicatedPERep.rep_id 
              ? [`Reassigning from ${currentOwner?.name || 'unassigned'} to dedicated PE rep`] 
              : [],
            ruleApplied: this.formatPriorityLabel('stability_accounts'),
            arr: accountARR,
            priorityLevel: 1
          });
          this.updateWorkload(dedicatedPERep.rep_id, account);
          continue; // Skip normal lock handling below
        }
        
        // No dedicated PE rep found - fall back to current owner
        lockReason = `PE firm: ${account.pe_firm} (no dedicated rep)`;
        lockType = 'pe_firm';
        lockStats.pe_firm++;
      }
      
      // Check Recent Owner Change (within stability window)
      // @see MASTER_LOGIC.mdc §10.8 - DEFAULT_CONTINUITY_DAYS
      if (!lockReason && enabledConditions.has('recent_owner_change') && account.owner_change_date) {
        const changeDate = new Date(account.owner_change_date);
        const now = new Date();
        const daysSinceChange = Math.floor(
          (now.getTime() - changeDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceChange >= 0 && daysSinceChange <= DEFAULT_CONTINUITY_DAYS) {
          lockReason = `Owner changed ${daysSinceChange} days ago`;
          lockType = 'recent_owner_change';
          lockStats.recent_owner_change++;
        }
      }
      
      if (lockReason && lockType) {
        const accountARR = getAccountARR(account);
        assigned.push({
          account,
          proposedRep: currentOwner,
          currentOwner,
          rationale: `${lockType}: ${lockReason}`,
          warnings: [],
          ruleApplied: this.formatPriorityLabel('stability_accounts'),
          arr: accountARR,
          priorityLevel: 1  // Stability is high priority
        });
        this.updateWorkload(currentOwner.rep_id, account);
      } else {
        remaining.push(account);
      }
    }
    
    console.log(`[Engine] Stability Accounts: locked ${assigned.length}, remaining ${remaining.length}`);
    console.log(`[Engine] Lock stats:`, lockStats);
    
    return { assigned, remaining };
  }

  /**
   * Handle Sales Tools Bucket - Route low-ARR customers to Sales Tools
   * Only applies to customer assignments, not prospects
   */
  private async handleSalesToolsBucket(
    accounts: Account[],
    reps: SalesRep[]
  ): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    // Only apply to customer assignments
    if (this.assignmentType !== 'customer') {
      return { assigned: [], remaining: accounts };
    }
    
    const salesToolsThreshold = this.config.rs_arr_threshold || SALES_TOOLS_ARR_THRESHOLD;
    const assigned: AssignmentProposal[] = [];
    const remaining: Account[] = [];
    
    // Create dummy "Sales Tools" rep for these assignments
    const salesToolsRep: SalesRep = {
      id: '',
      rep_id: '',
      name: 'Sales Tools',
      region: null,
      is_active: true,
      is_strategic_rep: false,
      include_in_assignments: false
    };
    
    for (const account of accounts) {
      const accountARR = getAccountARR(account);
      
      if (accountARR < salesToolsThreshold) {
        assigned.push({
          account,
          proposedRep: salesToolsRep,
          currentOwner: account.owner_id ? this.repMap.get(account.owner_id) || null : null,
          rationale: `Routed to Sales Tools (ARR $${accountARR.toLocaleString()} < $${salesToolsThreshold.toLocaleString()})`,
          warnings: [],
          ruleApplied: this.formatPriorityLabel('sales_tools_bucket'),
          arr: accountARR,
          priorityLevel: 1  // Report as P1 for analytics
        });
      } else {
        remaining.push(account);
      }
    }
    
    if (assigned.length > 0) {
      console.log(`[Engine] Sales Tools Bucket: ${assigned.length} accounts under $${salesToolsThreshold.toLocaleString()} routed`);
    }
    
    return { assigned, remaining };
  }


  /**
   * Solve batch assignment using HiGHS optimization
   * Formulates LP: maximize assignment quality while respecting capacity constraints
   * 
   * Now uses unified solver routing via highsWrapper.solveLPString()
   * @see MASTER_LOGIC.mdc §11.11 Solver Routing Strategy
   */
  private async solveWithHiGHS(
    accounts: Account[],
    eligibleRepsPerAccount: Map<string, SalesRep[]>,
    priorityLevel: 1 | 2 | 3 | 4,
    ruleApplied: string,
    rationale: string
  ): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    const assigned: AssignmentProposal[] = [];
    const remaining: Account[] = [];
    
    // Get unique eligible reps
    const allEligibleReps = new Map<string, SalesRep>();
    for (const reps of eligibleRepsPerAccount.values()) {
      for (const rep of reps) {
        allEligibleReps.set(rep.rep_id, rep);
      }
    }
    
    if (allEligibleReps.size === 0 || accounts.length === 0) {
      return { assigned: [], remaining: [...accounts] };
    }
    
    try {
      // No longer loading HiGHS directly - using unified solver via highsWrapper
      
      // Build LP problem
      const lines: string[] = [];
      const objectiveTerms: string[] = [];
      const constraints: string[] = [];
      const binaries: string[] = [];
      
      const targetARR = this.getTargetARR();
      const variance = (this.config.capacity_variance_percent || 10) / 100;
      const preferredMaxARR = targetARR * (1 + variance); // Use ceiling, not hard cap
      
      // Variables: x_account_rep = 1 if account assigned to rep
      lines.push('Maximize');
      lines.push(' obj:');
      
      // Calculate priority-based weights from position using SSOT
      // Higher position (lower number) = higher weight
      // @see _domain/constants.ts calculatePriorityWeight()
      const getPriorityWeightFromConfig = (priorityId: string): number => {
        const priority = this.priorityConfig.find(p => p.id === priorityId && p.enabled);
        if (!priority) return 0.1; // Disabled or not found = minimal weight
        return calculatePriorityWeight(priority.position);
      };
      
      // Weights derived from priority positions (SSOT: _domain/constants.ts)
      // geo_and_continuity contributes 50% to both geo and continuity
      const geoWeight = getPriorityWeightFromConfig('geography') + getPriorityWeightFromConfig('geo_and_continuity') * 0.5 
        || DEFAULT_PRIORITY_WEIGHTS.GEOGRAPHY;
      const continuityWeight = getPriorityWeightFromConfig('continuity') + getPriorityWeightFromConfig('geo_and_continuity') * 0.5
        || DEFAULT_PRIORITY_WEIGHTS.CONTINUITY;
      const teamWeight = getPriorityWeightFromConfig('team_alignment') || DEFAULT_PRIORITY_WEIGHTS.TEAM_ALIGNMENT;
      const balanceWeight = getPriorityWeightFromConfig('arr_balance') || DEFAULT_PRIORITY_WEIGHTS.BALANCE;
      
      console.log(`[LP Weights from Priority Config] geo=${geoWeight.toFixed(2)}, continuity=${continuityWeight.toFixed(2)}, team=${teamWeight.toFixed(2)}, balance=${balanceWeight.toFixed(2)}`);
      
      for (const account of accounts) {
        const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
        const accountARR = getAccountARR(account);
        
        // Classify account for team alignment
        const accountTier = classifyTeamTier(account.employees);
        
        for (const rep of eligibleReps) {
          const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
          
          // Balance score: prefer lower-loaded reps (0-100)
          // @see _domain/constants.ts LP_SCORING_FACTORS.BALANCE_MAX_BONUS
          const currentLoad = this.workloadMap.get(rep.rep_id)?.arr || 0;
          const loadRatio = currentLoad / targetARR;
          const balanceScore = Math.max(0, LP_SCORING_FACTORS.BALANCE_MAX_BONUS - loadRatio * 50);
          
          // Continuity score: bonus for keeping with current owner
          // @see _domain/constants.ts LP_SCORING_FACTORS.CONTINUITY_MATCH_BONUS
          const continuityScore = account.owner_id === rep.rep_id ? LP_SCORING_FACTORS.CONTINUITY_MATCH_BONUS : 0;
          
          // Geography score (0-100)
          // @see _domain/constants.ts LP_SCORING_FACTORS.GEOGRAPHY_MAX_SCORE
          const geoScore = this.getGeographyScore(account, rep);
          
          // Team alignment score (reduces for mismatched tiers)
          // 1-level mismatch: GAMMA (100) - discouraged but acceptable
          // 2+ level mismatch: EPSILON (1000) - almost never
          // @see _domain/constants.ts LP_SCORING_FACTORS.TEAM_ALIGNMENT_MAX_SCORE
          const teamAlignmentPenalty = calculateTeamAlignmentPenalty(accountTier, rep.team_tier);
          const teamScore = Math.max(0, LP_SCORING_FACTORS.TEAM_ALIGNMENT_MAX_SCORE - teamAlignmentPenalty / 10);
          
          // Final coefficient: weighted sum based on priority positions (SSOT)
          // @see _domain/constants.ts calculatePriorityWeight(), LP_SCORING_FACTORS.BASE_COEFFICIENT
          const coefficient = Math.max(1, 
            balanceScore * balanceWeight +
            continuityScore * continuityWeight +
            geoScore * geoWeight +
            teamScore * teamWeight +
            LP_SCORING_FACTORS.BASE_COEFFICIENT
          );
          objectiveTerms.push(`${coefficient.toFixed(2)} ${varName}`);
          binaries.push(varName);
        }
      }
      
      if (objectiveTerms.length === 0) {
        return { assigned: [], remaining: [...accounts] };
      }
      
      // NOTE: objectiveTerms is populated here but NOT written yet!
      // We need to add penalty terms from the balance constraint loop first.
      // The objective line will be written AFTER all penalty terms are added.
      // @see MASTER_LOGIC.mdc §11.3 - penalty terms must be in objective
      const objectiveLineIndex = lines.length; // Placeholder position
      lines.push(''); // Will be replaced after penalty terms are added
      
      // Constraints
      lines.push('Subject To');
      
      // Each account assigned to at most one rep (= 1 for required, <= 1 for optional)
      for (const account of accounts) {
        const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
        const assignmentVars = eligibleReps.map(rep => 
          `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`
        );
        
        if (assignmentVars.length > 0) {
          constraints.push(` assign_${sanitizeVarName(account.sfdc_account_id)}: ${assignmentVars.join(' + ')} <= 1`);
        }
      }
      
      // Rep ARR balance constraints with Big-M penalty slacks
      // @see _domain/MASTER_LOGIC.mdc §11.3 Three-Tier Penalty System
      // @see _domain/MASTER_LOGIC.mdc §12.1.2 Waterfall Engine Min/Max Enforcement
      // This allows reps to go over preferredMax but penalizes it, and strongly penalizes going over absoluteMax
      // Use SSOT penalty constants for Big-M system
      // @see _domain/constants.ts LP_PENALTY
      const absoluteMaxARR = this.getCapacityLimit();
      let absoluteMinARR = this.getMinimumFloor();
      const preferredMinARR = targetARR * (1 - variance);
      
      // Safety check: min must be less than target (otherwise constraint is infeasible)
      if (absoluteMinARR >= targetARR) {
        console.warn(`[LP] Min ARR ($${absoluteMinARR.toLocaleString()}) >= target ($${targetARR.toLocaleString()}), using 0 as floor`);
        absoluteMinARR = 0;
      }
      
      const metricLabel = this.assignmentType === 'prospect' ? 'Pipeline' : 'ARR';
      console.log(`[LP Balance] ${metricLabel} constraints: min=${absoluteMinARR.toLocaleString()}, prefMin=${preferredMinARR.toLocaleString()}, target=${targetARR.toLocaleString()}, prefMax=${preferredMaxARR.toLocaleString()}, max=${absoluteMaxARR.toLocaleString()}, intensity=${this.balanceIntensityMultiplier}x`);
      
      const slackBounds: string[] = [];
      
      // Track iterations for UI yielding - prevents browser freeze on large datasets
      let lpBuildIterations = 0;
      
      for (const [repId, rep] of allEligibleReps) {
        // For prospects, use netARR (pipeline); for customers, use ARR
        const currentLoad = this.assignmentType === 'prospect' 
          ? (this.workloadMap.get(repId)?.netARR || 0)
          : (this.workloadMap.get(repId)?.arr || 0);
        const valueTerms: string[] = [];
        
        for (const account of accounts) {
          const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
          if (eligibleReps.some(r => r.rep_id === repId)) {
            const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(repId)}`;
            // For prospects, use pipeline value; for customers, use ARR
            const accountValue = this.assignmentType === 'prospect'
              ? (this.opportunitiesMap.get(account.sfdc_account_id) || 0)
              : getAccountARR(account);
            if (accountValue > 0) {
              // Normalize by target to keep coefficients in stable range
              const normalizedValue = accountValue / targetARR;
              valueTerms.push(`${normalizedValue.toFixed(6)} ${varName}`);
            }
          }
          lpBuildIterations++;
        }
        
        if (valueTerms.length > 0) {
          const repIdx = sanitizeVarName(repId);
          
          // Slack variables for this rep (6 total: alpha over/under, beta over/under, bigM over/under)
          const ao = `ao_${repIdx}`, au = `au_${repIdx}`;
          const bo = `bo_${repIdx}`, bu = `bu_${repIdx}`;
          const mo = `mo_${repIdx}`, mu = `mu_${repIdx}`;
          
          // Add penalty terms to objective (negative because we maximize)
          // Apply balance intensity multiplier @see MASTER_LOGIC.mdc §11.3.1
          const im = this.balanceIntensityMultiplier;
          objectiveTerms.push(`- ${(LP_PENALTY.ALPHA * im).toFixed(6)} ${ao}`);
          objectiveTerms.push(`- ${(LP_PENALTY.ALPHA * im).toFixed(6)} ${au}`);
          objectiveTerms.push(`- ${(LP_PENALTY.BETA * im).toFixed(6)} ${bo}`);
          objectiveTerms.push(`- ${(LP_PENALTY.BETA * im).toFixed(6)} ${bu}`);
          objectiveTerms.push(`- ${(LP_PENALTY.BIG_M * im).toFixed(6)} ${mo}`);
          objectiveTerms.push(`- ${(LP_PENALTY.BIG_M * im).toFixed(6)} ${mu}`);
          
          // Decomposition constraint: sum(value/target * x) - ao + au - bo + bu - mo + mu = 1 - currentLoad/target
          // For prospects: value = pipeline (net_arr); for customers: value = ARR
          // This allows deviation from target with graduated penalties
          const normalizedTarget = 1 - currentLoad / targetARR; // How much more they can take (normalized)
          constraints.push(` bal_${repIdx}: ${valueTerms.join(' + ')} - 1 ${ao} + 1 ${au} - 1 ${bo} + 1 ${bu} - 1 ${mo} + 1 ${mu} = ${normalizedTarget.toFixed(6)}`);
          
          // Slack bounds (normalized) - ASYMMETRIC for over/under
          // @see MASTER_LOGIC.mdc §12.1.2 Waterfall Engine Min/Max Enforcement
          const alphaRange = variance; // e.g., 0.10 for 10%
          const betaOverRange = (absoluteMaxARR - preferredMaxARR) / targetARR; // Buffer zone above
          const betaUnderRange = Math.max(0, (preferredMinARR - absoluteMinARR) / targetARR); // Buffer zone below
          slackBounds.push(` 0 <= ${ao} <= ${alphaRange.toFixed(6)}`);
          slackBounds.push(` 0 <= ${au} <= ${alphaRange.toFixed(6)}`);
          slackBounds.push(` 0 <= ${bo} <= ${betaOverRange.toFixed(6)}`);
          slackBounds.push(` 0 <= ${bu} <= ${betaUnderRange.toFixed(6)}`);
          slackBounds.push(` ${mo} >= 0`);
          slackBounds.push(` ${mu} >= 0`);
        }
        
        // Yield every 50K iterations to prevent UI freeze on large datasets
        if (lpBuildIterations % 50000 === 0) {
          await yieldMicrotask();
        }
      }
      
      // Team Alignment tier match constraints (only if team_alignment priority is enabled)
      const teamAlignmentConfig = this.priorityConfig.find(p => p.id === 'team_alignment');
      if (teamAlignmentConfig?.enabled) {
        const minPct = ((teamAlignmentConfig.settings?.minTierMatchPct as number) ?? 80) / 100;
        console.log(`[HiGHS] Adding tier match constraints: min ${minPct * 100}% tier match per rep`);
        
        // For each rep with a tier, add constraint:
        // sum(matching accounts) >= minPct * sum(all accounts assigned to this rep)
        // Rearranged: sum(matching) - minPct * sum(all) >= 0
        // => sum(matching) * (1 - minPct) - sum(non-matching) * minPct >= 0
        for (const [repId, rep] of allEligibleReps) {
          if (!rep.team_tier) continue; // Skip reps without tier
          
          const repTier = rep.team_tier;
          const matchingTerms: string[] = [];
          const nonMatchingTerms: string[] = [];
          
          for (const account of accounts) {
            const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
            if (!eligibleReps.some(r => r.rep_id === repId)) continue;
            
            const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(repId)}`;
            const accountTier = classifyTeamTier(account.employees);
            
            if (accountTier === repTier) {
              // Matching tier: coefficient = (1 - minPct)
              matchingTerms.push(`${(1 - minPct).toFixed(4)} ${varName}`);
            } else {
              // Non-matching tier: coefficient = -minPct
              nonMatchingTerms.push(`${minPct.toFixed(4)} ${varName}`);
            }
            lpBuildIterations++;
          }
          
          // Constraint: matching * (1-minPct) - nonMatching * minPct >= 0
          if (matchingTerms.length > 0 || nonMatchingTerms.length > 0) {
            let constraintLhs = matchingTerms.join(' + ');
            if (nonMatchingTerms.length > 0) {
              constraintLhs += (constraintLhs ? ' - ' : '- ') + nonMatchingTerms.join(' - ');
            }
            if (constraintLhs) {
              constraints.push(` tier_${sanitizeVarName(repId)}: ${constraintLhs} >= 0`);
            }
          }
          
          // Continue yielding based on cumulative iteration count
          if (lpBuildIterations % 50000 === 0) {
            await yieldMicrotask();
          }
        }
      }
      
      // NOW write the objective function with all penalty terms included
      // This MUST happen AFTER the balance constraint loop that adds penalty terms
      // @see MASTER_LOGIC.mdc §11.3 - Big-M penalty terms must be in objective
      lines[objectiveLineIndex] = '    ' + objectiveTerms.join(' + ');
      console.log(`[LP Objective] Written with ${objectiveTerms.length} terms (includes ${objectiveTerms.filter(t => t.includes('mo_') || t.includes('mu_')).length} BigM penalty terms)`);
      
      lines.push(...constraints);
      
      // Bounds section
      lines.push('Bounds');
      
      // Slack variable bounds (Big-M penalty slacks)
      lines.push(...slackBounds);
      
      // Binary variable bounds (0-1)
      for (const varName of binaries) {
        lines.push(` 0 <= ${varName} <= 1`);
      }
      
      lines.push('Binary');
      lines.push(' ' + binaries.join(' '));
      lines.push('End');
      
      const lpProblem = lines.join('\n');
      const numSlacks = slackBounds.length;
      console.log(`[WaterfallEngine P${priorityLevel}] Solving ${accounts.length} accounts, ${allEligibleReps.size} reps, ${numSlacks} slack vars...`);
      
      // Yield to UI before solving (solver can block for a while)
      await yieldToUI();
      
      // Use unified solver routing via highsWrapper
      // For large datasets (>3000 accounts), use cloud mode to prevent UI freezing
      // Browser WASM runs on main thread and blocks UI for large LPs
      // @see MASTER_LOGIC.mdc §11.11 Solver Routing Strategy
      const useCloudMode = accounts.length > LP_SCALE_LIMITS.WARN_ACCOUNTS_THRESHOLD;
      const solution = await solveLPString(lpProblem, useCloudMode ? 'cloud' : 'browser');
      
      // Yield to UI after solving to update animations
      await yieldToUI();
      
      if (solution.status !== 'Optimal') {
        console.warn(`[WaterfallEngine P${priorityLevel}] Non-optimal status: ${solution.status}, falling back to greedy`);
        if (solution.error) {
          console.warn(`[WaterfallEngine P${priorityLevel}] Error: ${solution.error}`);
        }
        return { assigned: [], remaining: [...accounts] };
      }
      
      console.log(`[WaterfallEngine P${priorityLevel}] Optimal solution found, objective: ${solution.objectiveValue?.toFixed(2)}, time: ${solution.solveTimeMs}ms`);
      
      // Parse solution (using unified response format from highsWrapper)
      const assignedAccountIds = new Set<string>();
      
      // Build lookup map once for O(1) variable matching instead of O(n^3) nested loops
      // This dramatically improves performance for large datasets (8K+ accounts)
      const varToAccountRep = new Map<string, { account: Account, rep: SalesRep }>();
      for (const account of accounts) {
        const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
        for (const rep of eligibleReps) {
          const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
          varToAccountRep.set(varName, { account, rep });
        }
      }
      
      // Yield once after map building
      await yieldMicrotask();
      
      // Parse solution with O(1) lookups
      for (const [varName, varData] of Object.entries(solution.columns || {})) {
        if (!varName.startsWith('x_')) continue;
        if ((varData as any).Primal < 0.5) continue;
        
        const match = varToAccountRep.get(varName);
        if (match) {
          const { account, rep } = match;
          const accountARR = getAccountARR(account);
          const currentOwner = account.owner_id ? this.repMap.get(account.owner_id) || null : null;
          
          const accountWarnings: AssignmentWarning[] = [];
          if (currentOwner && currentOwner.rep_id !== rep.rep_id) {
            accountWarnings.push({
              severity: 'medium',
              type: 'continuity_broken',
              accountOrRep: account.account_name,
              reason: `Changed from ${currentOwner.name} to ${rep.name}`,
              details: `Optimized assignment for balance`
            });
          }
          
          const proposal: AssignmentProposal = {
            account,
            proposedRep: rep,
            currentOwner,
            rationale: `${rationale} (Optimized)`,
            warnings: accountWarnings,
            ruleApplied,
            arr: accountARR,
            priorityLevel
          };
          
          assigned.push(proposal);
          this.updateWorkload(rep.rep_id, account);
          assignedAccountIds.add(account.sfdc_account_id);
        }
      }
      
      // Remaining are unassigned
      for (const account of accounts) {
        if (!assignedAccountIds.has(account.sfdc_account_id)) {
          remaining.push(account);
        }
      }
      
      console.log(`[HiGHS P${priorityLevel}] Assigned ${assigned.length}, remaining ${remaining.length}`);
      return { assigned, remaining };
      
    } catch (error) {
      console.error(`[HiGHS P${priorityLevel}] Error:`, error);
      console.log(`[HiGHS P${priorityLevel}] Falling back to greedy assignment...`);
      
      // GREEDY FALLBACK: Assign accounts one by one when HiGHS fails
      const greedyAssigned: AssignmentProposal[] = [];
      const greedyRemaining: Account[] = [];
      
      for (const account of accounts) {
        const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
        if (eligibleReps.length === 0) {
          greedyRemaining.push(account);
          continue;
        }
        
        // Find rep with most capacity
        const bestRep = eligibleReps.reduce((best, current) => {
          const bestLoad = this.workloadMap.get(best.rep_id)?.arr || 0;
          const currentLoad = this.workloadMap.get(current.rep_id)?.arr || 0;
          return currentLoad < bestLoad ? current : best;
        });
        
        const accountARR = getAccountARR(account);
        const currentOwner = account.owner_id ? this.repMap.get(account.owner_id) || null : null;
        
        const accountWarnings: AssignmentWarning[] = [];
        if (currentOwner && currentOwner.rep_id !== bestRep.rep_id) {
          accountWarnings.push({
            severity: 'medium',
            type: 'continuity_broken',
            accountOrRep: account.account_name,
            reason: `Changed from ${currentOwner.name} to ${bestRep.name}`,
            details: `Greedy fallback assignment`
          });
        }
        
        const proposal: AssignmentProposal = {
          account,
          proposedRep: bestRep,
          currentOwner,
          rationale: `${rationale} (Greedy Fallback)`,
          warnings: accountWarnings,
          ruleApplied,
          arr: accountARR,
          priorityLevel
        };
        
        greedyAssigned.push(proposal);
        this.updateWorkload(bestRep.rep_id, account);
      }
      
      console.log(`[HiGHS P${priorityLevel}] Greedy fallback: ${greedyAssigned.length} assigned, ${greedyRemaining.length} remaining`);
      return { assigned: greedyAssigned, remaining: greedyRemaining };
    }
  }
  // ========== PRIORITY-LEVEL BATCH METHODS ==========

  /**
   * geo_and_continuity: Batch assign accounts to current owner if in same geography AND has capacity
   * Uses HiGHS optimization to decide which accounts get continuity when owners have limited capacity
   * Note: Strategic accounts are now handled by handleManualHoldover() before this runs
   */
  private async batchAssignPriority1(accounts: Account[], allReps: SalesRep[]): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    // Build eligibility map: account -> current owner (if same geo and has capacity)
    const eligibleRepsPerAccount = new Map<string, SalesRep[]>();
    const accountsWithOptions: Account[] = [];
    const accountsWithoutOptions: Account[] = [];
    
    for (const account of accounts) {
      if (!account.owner_id) {
        accountsWithoutOptions.push(account);
        continue;
      }
      
      const currentOwner = this.repMap.get(account.owner_id);
      if (!currentOwner || currentOwner.is_strategic_rep) {
        accountsWithoutOptions.push(account);
        continue;
      }
      
      // Check if current owner is in same geography
      if (!this.isSameGeography(account, currentOwner)) {
        accountsWithoutOptions.push(account);
        continue;
      }
      
      const accountARR = getAccountARR(account);
      
      // Check if current owner has capacity
      if (this.hasCapacity(currentOwner.rep_id, accountARR, account.cre_count, account, currentOwner)) {
        eligibleRepsPerAccount.set(account.sfdc_account_id, [currentOwner]);
        accountsWithOptions.push(account);
      } else {
        accountsWithoutOptions.push(account);
      }
    }
    
    if (accountsWithOptions.length === 0) {
      return { assigned: [], remaining: accountsWithoutOptions };
    }
    
    // Use HiGHS to optimize which accounts get continuity when multiple accounts share same owner
    const result = await this.solveWithHiGHS(
      accountsWithOptions,
      eligibleRepsPerAccount,
      1,
      this.formatPriorityLabel('geo_and_continuity'),
      'Account Continuity + Geography Match'
    );
    
    // Combine results
    return {
      assigned: result.assigned,
      remaining: [...result.remaining, ...accountsWithoutOptions]
    };
  }

  /**
   * geography: Batch assign accounts to reps in same geography with best balance
   * 
   * IMPORTANT: Still filters to geo-matched reps to maintain waterfall design.
   * Accounts that don't match any rep's geography will cascade to P3/P4.
   * 
   * The geoScore in HiGHS acts as a TIEBREAKER among geo-matched reps,
   * helping to rank them when multiple reps cover the same territory.
   * 
   * Uses HiGHS optimization to find globally optimal assignment considering:
   * - Balance bonus (prefer less loaded reps)
   * - Continuity bonus (prefer keeping with current owner)
   * - Geo score (tiebreaker among geo-matched reps)
   * - Team alignment penalty (discourage tier mismatches)
   */
  private async batchAssignPriority2(accounts: Account[], allReps: SalesRep[]): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    // Build eligibility map: account -> list of eligible GEO-MATCHED reps
    // Accounts without geo matches cascade to P3/P4
    const eligibleRepsPerAccount = new Map<string, SalesRep[]>();
    const accountsWithOptions: Account[] = [];
    const accountsWithoutOptions: Account[] = [];

    for (const account of accounts) {
      const accountARR = getAccountARR(account);
      
      // Find eligible reps in SAME GEOGRAPHY with capacity
      const eligibleReps = allReps.filter(rep =>
        rep.is_active &&
        rep.include_in_assignments &&
        !rep.is_strategic_rep &&
        this.isSameGeography(account, rep) &&
        this.hasCapacity(rep.rep_id, accountARR, account.cre_count, account, rep)
      );
      
      if (eligibleReps.length > 0) {
        eligibleRepsPerAccount.set(account.sfdc_account_id, eligibleReps);
        accountsWithOptions.push(account);
      } else {
        accountsWithoutOptions.push(account);
      }
    }

    if (accountsWithOptions.length === 0) {
      return { assigned: [], remaining: accounts };
    }
    
    // Use HiGHS to optimally assign among geo-matched reps
    // geoScore helps rank when multiple reps cover the same territory
    const result = await this.solveWithHiGHS(
      accountsWithOptions,
      eligibleRepsPerAccount,
      2,
      this.formatPriorityLabel('geography'),
      'Geography Match - Balanced Distribution'
    );
    
    // Combine HiGHS remaining with accounts that had no geo options
    return {
      assigned: result.assigned,
      remaining: [...result.remaining, ...accountsWithoutOptions]
    };
  }

  /**
   * continuity: Batch assign accounts to current owner regardless of geography if has capacity
   * Uses HiGHS optimization to decide which accounts to keep with current owner when capacity is limited
   */
  private async batchAssignPriority3(accounts: Account[], allReps: SalesRep[]): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    // Build eligibility map: account -> current owner (if available and has capacity)
    const eligibleRepsPerAccount = new Map<string, SalesRep[]>();
    const accountsWithOptions: Account[] = [];
    const accountsWithoutOptions: Account[] = [];
    
    for (const account of accounts) {
      if (!account.owner_id) {
        accountsWithoutOptions.push(account);
        continue;
      }
      
      const currentOwner = this.repMap.get(account.owner_id);
      if (!currentOwner || currentOwner.is_strategic_rep) {
        accountsWithoutOptions.push(account);
        continue;
      }
      
      const accountARR = getAccountARR(account);
      
      // Check if current owner has capacity
      if (this.hasCapacity(currentOwner.rep_id, accountARR, account.cre_count, account, currentOwner)) {
        eligibleRepsPerAccount.set(account.sfdc_account_id, [currentOwner]);
        accountsWithOptions.push(account);
      } else {
        accountsWithoutOptions.push(account);
      }
    }
    
    if (accountsWithOptions.length === 0) {
      return { assigned: [], remaining: accounts };
    }
    
    // Use HiGHS to optimize which accounts to keep with current owner
    // This matters when multiple accounts share the same owner with limited capacity
    const result = await this.solveWithHiGHS(
      accountsWithOptions,
      eligibleRepsPerAccount,
      3,
      this.formatPriorityLabel('continuity'),
      'Current/Past Owner - Any Geography'
    );
    
    // Add cross-region warnings to assigned proposals
    for (const proposal of result.assigned) {
      if (!this.isSameGeography(proposal.account, proposal.proposedRep)) {
        proposal.warnings.push({
          severity: 'low',
          type: 'cross_region',
          accountOrRep: proposal.account.account_name,
          reason: `Account territory ${proposal.account.sales_territory || 'unknown'} assigned to ${proposal.proposedRep.region || 'unknown'} rep`,
          details: `Maintaining continuity with current owner despite geography mismatch`
        });
      }
    }
    
    // Combine HiGHS remaining with accounts that had no options
    return {
      assigned: result.assigned,
      remaining: [...result.remaining, ...accountsWithoutOptions]
    };
  }



  /**
   * arr_balance: Batch assign accounts to any rep (fallback/residual optimization)
   * Uses HiGHS optimization with Big-M penalties to find globally optimal assignment.
   * 
   * IMPORTANT: Unlike earlier priorities, this does NOT filter by hasCapacity().
   * ALL eligible reps are included so the LP solver can apply Big-M penalties for
   * over-allocation. The solver will either:
   * - Assign with penalty if it's the best global trade-off
   * - Leave unassigned if the penalty is too high (rare, only if all reps are way over max)
   * 
   * For very large datasets (accounts × reps > 1M binary variables), the LP string
   * can exceed JavaScript's max string length. We batch in chunks of 10K accounts
   * to avoid this limit while still using the LP solver for quality assignments.
   * 
   * @see MASTER_LOGIC.mdc §12.1.3 Capacity Gating (Hard Cap Only)
   */
  private async batchAssignPriority4(accounts: Account[], allReps: SalesRep[]): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    // Get all eligible reps ONCE (no per-account capacity filtering)
    const allEligibleReps = allReps.filter(rep =>
      rep.is_active &&
      rep.include_in_assignments &&
      !rep.is_strategic_rep
    );
    
    if (allEligibleReps.length === 0) {
      console.warn('[RO] No eligible reps available for residual optimization');
      return { assigned: [], remaining: accounts };
    }
    
    // Calculate LP problem size to determine if batching is needed
    // Each account × rep pair = 1 binary variable + constraints
    // JavaScript strings have a max length of ~512MB-1GB
    // LP problems with > MAX_LP_BINARY_VARIABLES terms can exceed this limit
    // @see MASTER_LOGIC.mdc §11.10 Scale Limits
    const problemSize = accounts.length * allEligibleReps.length;
    const BATCH_SIZE = Math.floor(LP_SCALE_LIMITS.MAX_LP_BINARY_VARIABLES / allEligibleReps.length);
    
    console.log(`[RO] Residual Optimization: ${accounts.length} accounts, ${allEligibleReps.length} reps = ${problemSize.toLocaleString()} binary vars`);
    
    // If problem is small enough, solve in one shot
    if (accounts.length <= BATCH_SIZE) {
      const eligibleRepsPerAccount = new Map<string, SalesRep[]>();
      for (const account of accounts) {
        eligibleRepsPerAccount.set(account.sfdc_account_id, allEligibleReps);
      }
      
      console.log(`[RO] Solving in single batch (${accounts.length} accounts)`);
      const result = await this.solveWithHiGHS(
        accounts,
        eligibleRepsPerAccount,
        4,
        this.formatPriorityLabel('arr_balance'),
        'Residual Optimization - Best Available Rep'
      );
      
      // Add cross-region warnings
      for (const proposal of result.assigned) {
        if (!this.isSameGeography(proposal.account, proposal.proposedRep)) {
          proposal.warnings.push({
            severity: 'low',
            type: 'cross_region',
            accountOrRep: proposal.account.account_name,
            reason: `Account territory ${proposal.account.sales_territory || 'unknown'} assigned to ${proposal.proposedRep.region || 'unknown'} rep`,
            details: `No capacity in account's home region`
          });
        }
      }
      
      return result;
    }
    
    // Batch processing for large datasets
    const numBatches = Math.ceil(accounts.length / BATCH_SIZE);
    console.log(`[RO] Problem too large, splitting into ${numBatches} batches of ~${BATCH_SIZE} accounts each`);
    
    let allAssigned: AssignmentProposal[] = [];
    let allRemaining: Account[] = [];
    let remainingAccounts = [...accounts];
    
    for (let batchNum = 0; batchNum < numBatches && remainingAccounts.length > 0; batchNum++) {
      const batchAccounts = remainingAccounts.slice(0, BATCH_SIZE);
      remainingAccounts = remainingAccounts.slice(BATCH_SIZE);
      
      console.log(`[RO] Processing batch ${batchNum + 1}/${numBatches}: ${batchAccounts.length} accounts`);
      
      const eligibleRepsPerAccount = new Map<string, SalesRep[]>();
      for (const account of batchAccounts) {
        eligibleRepsPerAccount.set(account.sfdc_account_id, allEligibleReps);
      }
      
      const result = await this.solveWithHiGHS(
        batchAccounts,
        eligibleRepsPerAccount,
        4,
        this.formatPriorityLabel('arr_balance'),
        `Residual Optimization Batch ${batchNum + 1}/${numBatches}`
      );
      
      // Add cross-region warnings
      for (const proposal of result.assigned) {
        if (!this.isSameGeography(proposal.account, proposal.proposedRep)) {
          proposal.warnings.push({
            severity: 'low',
            type: 'cross_region',
            accountOrRep: proposal.account.account_name,
            reason: `Account territory ${proposal.account.sales_territory || 'unknown'} assigned to ${proposal.proposedRep.region || 'unknown'} rep`,
            details: `No capacity in account's home region`
          });
        }
      }
      
      allAssigned = allAssigned.concat(result.assigned);
      allRemaining = allRemaining.concat(result.remaining);
      
      // Yield to UI between batches
      await yieldToUI();
    }
    
    console.log(`[RO] Batched assignment complete: ${allAssigned.length} assigned, ${allRemaining.length} remaining`);
    return { assigned: allAssigned, remaining: allRemaining };
  }

  /**
   * Helper to assign strategic accounts (separate pool)
   * Used by handleManualHoldover()
   */
  private assignStrategicAccount(account: Account, allReps: SalesRep[]): AssignmentProposal | null {
    const accountARR = getAccountARR(account);
    const currentOwner = account.owner_id ? this.repMap.get(account.owner_id) || null : null;
    
    const strategicReps = allReps.filter(rep => 
      rep.is_active && 
      rep.include_in_assignments &&
      rep.is_strategic_rep
    );
    
    if (strategicReps.length === 0) {
      this.warnings.push({
        severity: 'high',
        type: 'strategic_overflow',
        accountOrRep: account.account_name,
        reason: 'No active strategic reps available',
        details: 'Strategic account cannot be assigned'
      });
      return null;
    }
    
    // Keep with current owner if they're a strategic rep
    if (currentOwner && currentOwner.is_strategic_rep) {
      return {
        account,
        proposedRep: currentOwner,
        currentOwner,
        rationale: 'Strategic Account Continuity',
        warnings: [],
        ruleApplied: this.formatPriorityLabel('manual_holdover'),
        arr: accountARR,
        priorityLevel: 1 as const  // Strategic continuity is Priority 1
      };
    }
    
    // Distribute evenly among strategic reps
    const bestStrategicRep = this.findMostCapacityRep(strategicReps);
    return {
      account,
      proposedRep: bestStrategicRep,
      currentOwner,
      rationale: 'Strategic Account - Even Distribution',
      warnings: currentOwner ? [{
        severity: 'medium' as const,
        type: 'continuity_broken' as const,
        accountOrRep: account.account_name,
        reason: `Strategic account reassigned from ${currentOwner.name} to ${bestStrategicRep.name}`,
        details: 'Maintaining even distribution across strategic rep pool'
      }] : [],
      ruleApplied: this.formatPriorityLabel('manual_holdover'),
      arr: accountARR,
      priorityLevel: 1 as const  // Strategic accounts are always Priority 1
    };
  }

  // ========== LEGACY SINGLE ACCOUNT METHOD (kept for reference) ==========

  private assignSingleAccount(account: Account, allReps: SalesRep[]): AssignmentProposal {
    const accountARR = getAccountARR(account);
    const currentOwner = account.owner_id ? this.repMap.get(account.owner_id) || null : null;
    const accountIsStrategic = this.isStrategicAccount(account);

    // STRATEGIC ACCOUNTS: Always keep with strategic reps, ignore capacity limits
    if (accountIsStrategic) {
      const strategicReps = allReps.filter(rep => 
        rep.is_active && 
        rep.include_in_assignments &&
        rep.is_strategic_rep
      );

      if (strategicReps.length === 0) {
        throw new Error('No active strategic reps available for strategic account');
      }

      // Priority 1 for Strategic: Keep with current owner if they're a strategic rep
      if (currentOwner && currentOwner.is_strategic_rep) {
        return {
          account,
          proposedRep: currentOwner,
          currentOwner,
          rationale: 'Strategic Account Continuity',
          warnings: [],
          ruleApplied: this.formatPriorityLabel('manual_holdover'),
          arr: accountARR,
          priorityLevel: 1
        };
      }

      // Priority 2 for Strategic: Distribute evenly among strategic reps (find rep with least load)
      const bestStrategicRep = this.findMostCapacityRep(strategicReps);
      return {
        account,
        proposedRep: bestStrategicRep,
        currentOwner,
        rationale: 'Strategic Account - Even Distribution',
        warnings: currentOwner ? [{
          severity: 'medium' as const,
          type: 'continuity_broken' as const,
          accountOrRep: account.account_name,
          reason: `Strategic account reassigned from ${currentOwner.name} to ${bestStrategicRep.name}`,
          details: 'Maintaining even distribution across strategic rep pool'
        }] : [],
        ruleApplied: this.formatPriorityLabel('manual_holdover'),
        arr: accountARR,
        priorityLevel: 1  // Strategic accounts all track as P1
      };
    }

    // NORMAL ACCOUNTS: Standard waterfall logic with capacity checks
    console.log(`\n🔍 Assigning ${account.account_name} (ARR: ${(accountARR/1000000).toFixed(2)}M, CRE: ${account.cre_count}, Tier: ${account.expansion_tier || 'none'})`);
    
    
    // Waterfall Priority 1: Keep with current owner if same geography AND has capacity
    // hasCapacity() automatically handles minimum thresholds - reps below minimum are treated as having capacity
    if (currentOwner && !currentOwner.is_strategic_rep) {
      const isSameGeography = this.isSameGeography(account, currentOwner);
      
      if (isSameGeography && this.hasCapacity(currentOwner.rep_id, accountARR, account.cre_count, account, currentOwner)) {
        const currentOwnerWorkload = this.workloadMap.get(currentOwner.rep_id)!;
        console.log(`✅ P1: ${account.account_name} staying with ${currentOwner.name} (Continuity + Geo) - Rep: ${(currentOwnerWorkload.arr/1000000).toFixed(2)}M ARR, ${currentOwnerWorkload.cre} CRE`);
        return {
          account,
          proposedRep: currentOwner,
          currentOwner,
          rationale: 'Account Continuity + Geography Match',
          warnings: [],
          ruleApplied: this.formatPriorityLabel('geo_and_continuity'),
          arr: accountARR,
          priorityLevel: 1
        };
      } else if (isSameGeography) {
        console.log(`⚠️ P1: ${account.account_name} can't stay with ${currentOwner.name} - at capacity`);
      }
    }

    // Waterfall Priority 2: Assign to rep in same geography - prioritize under-minimum reps
    const sameGeoReps = allReps.filter(rep => 
      rep.is_active && 
      rep.include_in_assignments &&
      !rep.is_strategic_rep && // Exclude strategic reps from normal pool
      this.isSameGeography(account, rep) &&
      this.hasCapacity(rep.rep_id, accountARR, account.cre_count, account, rep)
    );

    if (sameGeoReps.length > 0) {
      let bestRep: SalesRep;
      
      if (this.assignmentType === 'prospect') {
        // For prospects, sort by lowest account count
        bestRep = sameGeoReps.sort((a, b) => {
          const workloadA = this.workloadMap.get(a.rep_id)!;
          const workloadB = this.workloadMap.get(b.rep_id)!;
          return workloadA.accounts - workloadB.accounts;
        })[0];
        console.log(`✅ P2: ${account.account_name} assigned to ${bestRep.name} (Geo Match + Lowest Count) - Rep Count: ${this.workloadMap.get(bestRep.rep_id)!.accounts}`);
      } else {
        // For customers, use existing ARR-based logic
        const minThreshold = this.getMinimumThreshold();
        
        // First try to find reps below minimum threshold in this geography
        const underMinReps = sameGeoReps.filter(rep => {
          const workload = this.workloadMap.get(rep.rep_id)!;
          return workload.arr < minThreshold;
        });
        
        if (underMinReps.length > 0) {
          // Assign to most under-loaded rep below minimum
          bestRep = underMinReps.sort((a, b) => {
            const workloadA = this.workloadMap.get(a.rep_id)!;
            const workloadB = this.workloadMap.get(b.rep_id)!;
            return workloadA.arr - workloadB.arr;
          })[0];
          console.log(`✅ P2: ${account.account_name} assigned to ${bestRep.name} (Geo + Below Min) - Rep ARR: ${(this.workloadMap.get(bestRep.rep_id)!.arr/1000000).toFixed(2)}M < ${(minThreshold/1000000).toFixed(2)}M`);
        } else {
          // All reps at or above minimum, pick by capacity + balance
          bestRep = this.findMostCapacityRep(sameGeoReps);
          console.log(`✅ P2: ${account.account_name} assigned to ${bestRep.name} (Geo Match) - Rep ARR: ${(this.workloadMap.get(bestRep.rep_id)!.arr/1000000).toFixed(2)}M`);
        }
      }
      
      const accountWarnings: AssignmentWarning[] = [];
      
      if (currentOwner && currentOwner.rep_id !== bestRep.rep_id) {
        accountWarnings.push({
          severity: 'medium',
          type: 'continuity_broken',
          accountOrRep: account.account_name,
          reason: `Changed from ${currentOwner.name} to ${bestRep.name}`,
          details: `Current owner at capacity or doesn't match geography`
        });
      }

      const isUnderMin = this.assignmentType === 'customer' && sameGeoReps.some(r => {
        const workload = this.workloadMap.get(r.rep_id)!;
        return workload.arr < this.getMinimumThreshold();
      });

      return {
        account,
        proposedRep: bestRep,
        currentOwner,
        rationale: isUnderMin ? 'Geography Match + Balancing' : 'Geography Match',
        warnings: accountWarnings,
        ruleApplied: this.formatPriorityLabel('geography'),
        arr: accountARR,
        priorityLevel: 2
      };
    }


    // Waterfall Priority 3: Keep with current owner even if different geography, if has capacity
    // hasCapacity() automatically handles minimum thresholds - reps below minimum are treated as having capacity
    if (currentOwner && !currentOwner.is_strategic_rep) {
      if (this.hasCapacity(currentOwner.rep_id, accountARR, account.cre_count, account, currentOwner)) {
        const accountWarnings: AssignmentWarning[] = [];
        
        // Warn about cross-region assignment
        if (!this.isSameGeography(account, currentOwner)) {
          accountWarnings.push({
            severity: 'low',
            type: 'cross_region',
            accountOrRep: account.account_name,
            reason: `Account territory ${account.sales_territory || 'unknown'} assigned to ${currentOwner.region || 'unknown'} rep`,
            details: `Maintaining continuity with current owner despite geography mismatch`
          });
        }
        
        console.log(`✅ P3: ${account.account_name} staying with ${currentOwner.name} (Continuity Cross-Geo) - ARR: ${(accountARR/1000000).toFixed(2)}M`);
        
        return {
          account,
          proposedRep: currentOwner,
          currentOwner,
          rationale: 'Current/Past Owner - Any Geography',
          warnings: accountWarnings,
          ruleApplied: this.formatPriorityLabel('continuity'),
          arr: accountARR,
          priorityLevel: 3
        };
      } else {
        console.log(`⚠️ P3: ${account.account_name} can't stay with ${currentOwner.name} - at capacity`);
      }
    }

    // Waterfall Priority 4: Assign to best available rep globally - prioritize under-minimum
    const anyReps = allReps.filter(rep =>
      rep.is_active &&
      rep.include_in_assignments &&
      !rep.is_strategic_rep && // Exclude strategic reps from normal pool
      this.hasCapacity(rep.rep_id, accountARR, account.cre_count, account, rep)
    );

    if (anyReps.length > 0) {
      let bestRep: SalesRep;
      
      if (this.assignmentType === 'prospect') {
        // For prospects, sort by lowest account count
        bestRep = this.findMostCapacityRep(anyReps);
        console.log(`✅ P4: ${account.account_name} assigned to ${bestRep.name} (Best Available + Lowest Count) - Rep Count: ${this.workloadMap.get(bestRep.rep_id)!.accounts}`);
      } else {
        // For customers, use existing ARR-based logic
        const minThreshold = this.getMinimumThreshold();
        
        // First try to find reps below minimum threshold globally
        const underMinReps = anyReps.filter(rep => {
          const workload = this.workloadMap.get(rep.rep_id)!;
          return workload.arr < minThreshold;
        });
        
        if (underMinReps.length > 0) {
          // Assign to most under-loaded rep below minimum, using balance score
          bestRep = underMinReps.sort((a, b) => {
            const workloadA = this.workloadMap.get(a.rep_id)!;
            const workloadB = this.workloadMap.get(b.rep_id)!;
            const scoreA = this.calculateBalanceScore(workloadA);
            const scoreB = this.calculateBalanceScore(workloadB);
            return scoreA - scoreB; // Lower score = more under-loaded
          })[0];
          console.log(`✅ P4: ${account.account_name} assigned to ${bestRep.name} (Best Available + Below Min) - Rep ARR: ${(this.workloadMap.get(bestRep.rep_id)!.arr/1000000).toFixed(2)}M < ${(minThreshold/1000000).toFixed(2)}M`);
        } else {
          // All reps at or above minimum, use standard selection
          bestRep = this.findMostCapacityRep(anyReps);
          console.log(`✅ P4: ${account.account_name} assigned to ${bestRep.name} (Best Available) - Rep ARR: ${(this.workloadMap.get(bestRep.rep_id)!.arr/1000000).toFixed(2)}M`);
        }
      }
      
      const accountWarnings: AssignmentWarning[] = [];

      accountWarnings.push({
        severity: 'low',
        type: 'cross_region',
        accountOrRep: account.account_name,
        reason: `Account territory ${account.sales_territory || 'unknown'} assigned to ${bestRep.region || 'unknown'} rep`,
        details: `No capacity in account's home region; Changed from ${currentOwner?.name || 'unknown'} to ${bestRep.name}: Current owner at capacity`
      });

      if (currentOwner && currentOwner.rep_id !== bestRep.rep_id) {
        accountWarnings.push({
          severity: 'medium',
          type: 'continuity_broken',
          accountOrRep: account.account_name,
          reason: `Changed from ${currentOwner.name} to ${bestRep.name}`,
          details: `Current owner at capacity`
        });
      }

      const isUnderMin = this.assignmentType === 'customer' && anyReps.some(r => {
        const workload = this.workloadMap.get(r.rep_id)!;
        return workload.arr < this.getMinimumThreshold();
      });

      return {
        account,
        proposedRep: bestRep,
        currentOwner,
        rationale: isUnderMin ? 'Best Available + Balancing' : 'Best Available',
        warnings: accountWarnings,
        ruleApplied: this.formatPriorityLabel('arr_balance'),
        arr: accountARR,
        priorityLevel: 4
      };
    }

    // RO (Residual Optimization): FORCE ASSIGNMENT - Assign to least loaded rep when all are at capacity
    // This ensures 100% of accounts get assigned, even if it means exceeding thresholds
    console.warn(`⚠️ RO: All reps at capacity for ${account.account_name} - forcing assignment to least loaded rep`);

    // Get all eligible reps (active, assignable, non-strategic)
    const allEligibleReps = allReps.filter(rep => 
      rep.is_active && 
      rep.include_in_assignments &&
      !rep.is_strategic_rep
    );

    if (allEligibleReps.length === 0) {
      throw new Error('No active reps available for assignment');
    }

    // For prospects, find the rep with the LOWEST account count
    let leastLoadedRep: SalesRep;
    if (this.assignmentType === 'prospect') {
      // Sort by account count ascending (lowest first)
      leastLoadedRep = allEligibleReps.sort((a, b) => {
        const workloadA = this.workloadMap.get(a.rep_id)!;
        const workloadB = this.workloadMap.get(b.rep_id)!;
        return workloadA.accounts - workloadB.accounts;
      })[0];
      
      const currentCount = this.workloadMap.get(leastLoadedRep.rep_id)!.accounts;
      console.log(`✅ RO: ${account.account_name} FORCE-assigned to ${leastLoadedRep.name} (Lowest Count: ${currentCount} accounts)`);
    } else {
      // For customers, use ARR-based selection
      leastLoadedRep = this.findMostCapacityRep(allEligibleReps);
      console.log(`✅ RO: ${account.account_name} FORCE-assigned to ${leastLoadedRep.name} (Lowest ARR)`);
    }

    const fallbackWarnings: AssignmentWarning[] = [{
      severity: 'high',
      type: 'capacity_exceeded',
      accountOrRep: leastLoadedRep.name,
      reason: `All reps at capacity - forced assignment`,
      details: `Rep may exceed target thresholds (Target: ${Math.ceil(this.totalProspectCount / allEligibleReps.length)}, Max: ${Math.round(Math.ceil(this.totalProspectCount / allEligibleReps.length) * 1.5)})`
    }];

    if (currentOwner && currentOwner.rep_id !== leastLoadedRep.rep_id) {
      fallbackWarnings.push({
        severity: 'medium',
        type: 'continuity_broken',
        accountOrRep: account.account_name,
        reason: `Changed from ${currentOwner.name} to ${leastLoadedRep.name}`,
        details: `Forced reassignment due to capacity constraints`
      });
    }

    return {
      account,
      proposedRep: leastLoadedRep,
      currentOwner,
      rationale: 'RO: Force Assignment - All Reps At Capacity',
      warnings: fallbackWarnings,
      ruleApplied: 'RO: Forced Assignment',
      arr: accountARR,
      priorityLevel: 4  // RO is tracked as priorityLevel 4 for analytics (fallback category)
    };
  }

  // ARR calculation: uses getAccountARR from @/_domain (single source of truth)

  private isStrategicAccount(account: Account): boolean {
    // Strategic accounts are those currently owned by strategic reps
    const currentOwner = account.owner_id ? this.repMap.get(account.owner_id) : null;
    return currentOwner?.is_strategic_rep || false;
  }

  private matchesStrategicPool(accountIsStrategic: boolean, rep: SalesRep): boolean {
    // This method is no longer needed as strategic accounts are handled separately
    // Normal accounts should never go to strategic reps
    return !rep.is_strategic_rep;
  }

  private isSameGeography(account: Account, rep: SalesRep): boolean {
    const accountTerritory = (account.sales_territory || '').trim();
    const repRegion = (rep.region || '').trim();
    
    if (!accountTerritory || !repRegion) {
      // Log warning for reps without regions
      if (!repRegion && rep.is_active && rep.include_in_assignments) {
        console.warn(`⚠️ Rep "${rep.name}" (${rep.rep_id}) has no region - cannot match geography`);
      }
      return false;
    }
    
    // FIRST: Check configured territory mappings from config
    const mappings = this.config.territory_mappings as Record<string, string> | undefined;
    if (mappings && mappings[accountTerritory]) {
      const mappedRegion = mappings[accountTerritory];
      return mappedRegion.toLowerCase() === repRegion.toLowerCase();
    }
    
    // SECOND: Use auto-mapping utility (standardized territory to region mapping)
    const mappedRegion = autoMapTerritoryToRegion(accountTerritory);
    if (mappedRegion) {
      return mappedRegion.toLowerCase() === repRegion.toLowerCase();
    }
    
    // FALLBACK: Direct string comparison (for unmapped territories)
    return accountTerritory.toLowerCase() === repRegion.toLowerCase();
  }

  /**
   * Get the mapped region for an account
   * Returns the region the account should be assigned to based on territory mappings
   */
  private getMappedRegion(account: Account): string | null {
    const accountTerritory = (account.sales_territory || '').trim();
    if (!accountTerritory) return null;
    
    // Check configured territory mappings from config
    const mappings = this.config.territory_mappings as Record<string, string> | undefined;
    if (mappings && mappings[accountTerritory]) {
      return mappings[accountTerritory];
    }
    
    // Use auto-mapping utility
    const mappedRegion = autoMapTerritoryToRegion(accountTerritory);
    if (mappedRegion) {
      return mappedRegion;
    }
    
    // Fallback: use territory as region directly
    return accountTerritory;
  }

  /**
   * Get geography score (0-100) for account-rep pairing
   * 
   * Used as a TIEBREAKER within eligible reps, not to expand eligibility.
   * P2 still filters to geo-matched reps; this score helps HiGHS rank them.
   * P4 (fallback) uses this to prefer closer matches when all reps are eligible.
   * 
   * Scoring:
   * - 100: Exact match (rep region = account's mapped region)
   * -  60: Sibling region (e.g., Central account → West rep, both under AMER)
   * -  40: Parent region (e.g., Central account → AMER rep)
   * -  25: Global/unrelated (fallback)
   */
  private getGeographyScore(account: Account, rep: SalesRep): number {
    const repRegion = (rep.region || '').trim();
    
    // Rep with no region = global coverage, lowest score but still valid
    if (!repRegion) return 25;
    
    const targetRegion = this.getMappedRegion(account);
    
    // Account with unknown territory = mid-score (no preference)
    if (!targetRegion) return 50;
    
    // Exact match = highest score
    if (this.isSameGeography(account, rep)) return 100;
    
    // Check if rep is in a sibling region (same level, shared parent)
    // e.g., Central account → West rep (both under AMER)
    const siblings = REGION_SIBLINGS[targetRegion] || [];
    if (siblings.some(s => s.toLowerCase() === repRegion.toLowerCase())) {
      return 60; // Good fallback - same geographic parent
    }
    
    // Check hierarchy for parent matches
    const hierarchy = REGION_ANCESTRY[targetRegion] || [];
    const repRegionLower = repRegion.toLowerCase();
    
    for (let level = 0; level < hierarchy.length; level++) {
      if (hierarchy[level].toLowerCase() === repRegionLower) {
        // Parent match: 40 for immediate parent, 25 for grandparent
        return Math.max(25, 50 - (level * 10));
      }
    }
    
    // Check if they share a common parent (different branches)
    const repHierarchy = REGION_ANCESTRY[repRegion] || [];
    for (const parent of hierarchy) {
      if (repHierarchy.includes(parent)) {
        return 35; // Different branches but same macro-region
      }
    }
    
    // No match found - global fallback score
    return 25;
  }

  private hasCapacity(repId: string, accountARR: number, accountCRE: number, account: Account, rep: SalesRep, ignoreCRE: boolean = false): boolean {
    const workload = this.workloadMap.get(repId)!;
    
    // STRATEGIC REPS: No capacity limits apply (bypass all threshold checks)
    if (rep.is_strategic_rep) {
      return true;
    }
    
    // PROSPECTS: Check pipeline capacity limits (Net ARR)
    if (this.assignmentType === 'prospect') {
      const accountNetARR = this.opportunitiesMap.get(account.sfdc_account_id) || 0;
      const capacityLimit = this.getCapacityLimit(); // prospect_max_arr / prospect_max_pipeline
      const targetPipeline = this.getTargetARR(); // prospect_target_arr
      const preferredMax = targetPipeline * (1 + (this.config.capacity_variance_percent || 10) / 100);
      
      const currentPipeline = workload.netARR;
      const newPipeline = currentPipeline + accountNetARR;
      
      // Hard cap: Never exceed absolute max pipeline
      if (newPipeline > capacityLimit) {
        return false;
      }
      
      // Soft cap: Prefer staying within preferred max (target + variance)
      if (newPipeline > preferredMax) {
        return false;
      }
      
      return true;
    }
    
    const capacityLimit = this.getCapacityLimit();
    
    // STANDARD CAPACITY LOGIC (for customers)
    // IMPORTANT: hasCapacity() ONLY enforces the hard cap (capacityLimit).
    // The LP solver handles Alpha/Beta/BigM zones with graduated penalties.
    // If we filter more aggressively here, the solver never sees those reps.
    // @see MASTER_LOGIC.mdc §12.1.3
    const currentLoad = workload.arr;
    const newLoad = currentLoad + accountARR;
    
    // Only block if exceeding absolute hard cap
    if (newLoad > capacityLimit) {
      return false;
    }
    
    // Check CRE capacity (hard blocker) - can be skipped for continuity checks or prospects
    if (!ignoreCRE && accountCRE > 0 && workload.cre >= this.config.max_cre_per_rep) {
      return false;
    }
    
    return true;
  }

  private isBelowMinimumThreshold(repId: string): boolean {
    // Check if rep is below minimum threshold on ANY configured metric
    const workload = this.workloadMap.get(repId)!;
    
    // ARR minimum (use appropriate metric based on assignment type)
    const arrMin = this.getMinimumThreshold();
    const currentLoad = this.assignmentType === 'prospect' ? workload.netARR : workload.arr;
    if (currentLoad < arrMin) return true;
    
    // CRE minimum (if configured)
    const creMin = (this.config as any).cre_min;
    if (creMin && workload.cre < creMin) return true;
    
    // ATR minimum (if configured)
    const atrMin = (this.config as any).atr_min;
    if (atrMin && workload.atr < atrMin) return true;
    
    // Tier 1 minimum (if configured)
    const tier1Min = (this.config as any).tier1_min;
    if (tier1Min && workload.tier1 < tier1Min) return true;
    
    // Tier 2 minimum (if configured)
    const tier2Min = (this.config as any).tier2_min;
    if (tier2Min && workload.tier2 < tier2Min) return true;
    
    return false;
  }

  private isWellBelowTarget(repId: string): boolean {
    // Check if a rep is significantly below target (less than 50% of target ARR)
    const workload = this.workloadMap.get(repId)!;
    const targetARR = this.getTargetARR();
    return workload.arr < (targetARR * 0.5);
  }

  private shouldPrioritizeBalancing(repId: string, accountARR: number): boolean {
    // Prioritize balancing if rep is well below target and this account would help
    const workload = this.workloadMap.get(repId)!;
    const targetARR = this.getTargetARR();
    const minARR = targetARR * 0.9; // 90% of target minimum
    
    // If rep is below minimum and would still be below target after this assignment
    return workload.arr < minARR && (workload.arr + accountARR) <= targetARR;
  }

  /**
   * Find the rep with most available capacity, respecting hard limits
   * @see MASTER_LOGIC.mdc §12.1.3 Waterfall Engine Hard Cap Check
   */
  private findMostCapacityRep(reps: SalesRep[]): SalesRep {
    // STEP 1: Hard cap check - filter to reps below max ARR
    // This ensures we don't pile accounts onto already-overloaded reps
    const maxARR = this.getCapacityLimit();
    const repsUnderMax = reps.filter(rep => {
      const workload = this.workloadMap.get(rep.rep_id)!;
      return workload.arr < maxARR;
    });
    
    // If all reps are over max, log warning and use all reps (can't leave accounts unassigned)
    if (repsUnderMax.length === 0) {
      console.warn(`⚠️ All ${reps.length} reps are at/above max ARR ($${maxARR.toLocaleString()}). Falling back to least loaded.`);
    }
    
    // Use reps under max if available, otherwise fall back to all reps
    const repsAfterMaxFilter = repsUnderMax.length > 0 ? repsUnderMax : reps;
    
    // For prospects, sort by lowest account count
    if (this.assignmentType === 'prospect') {
      return repsAfterMaxFilter.reduce((best, current) => {
        const bestWorkload = this.workloadMap.get(best.rep_id)!;
        const currentWorkload = this.workloadMap.get(current.rep_id)!;
        return currentWorkload.accounts < bestWorkload.accounts ? current : best;
      });
    }
    
    // For customers, use multi-dimensional selection
    const repsBelowMinimum = repsAfterMaxFilter.filter(rep => this.isBelowMinimumThreshold(rep.rep_id));
    
    // If we have reps below minimum, select from them; otherwise use filtered reps
    const repsToConsider = repsBelowMinimum.length > 0 ? repsBelowMinimum : repsAfterMaxFilter;
    
    // Find rep with LOWEST balance score (furthest below targets across all metrics)
    return repsToConsider.reduce((best, current) => {
      const bestWorkload = this.workloadMap.get(best.rep_id)!;
      const currentWorkload = this.workloadMap.get(current.rep_id)!;
      
      // Use comprehensive balance score across ALL configured metrics
      const bestBalanceScore = this.calculateBalanceScore(bestWorkload);
      const currentBalanceScore = this.calculateBalanceScore(currentWorkload);
      
      // Lower score = more under-loaded = better candidate
      if (Math.abs(bestBalanceScore - currentBalanceScore) > 0.05) {
        return currentBalanceScore < bestBalanceScore ? current : best;
      }
      
      // If balance scores are very close, use absolute ARR as tie-breaker
      return currentWorkload.arr < bestWorkload.arr ? current : best;
    });
  }

  private calculateBalanceScore(workload: WorkloadState): number {
    // Calculate comprehensive balance score across ALL configured metrics
    // Lower score = more under-loaded = better candidate for new assignments
    let totalScore = 0;
    let metricsConsidered = 0;
    
    // ARR scoring (ALWAYS included)
    const targetARR = this.getTargetARR();
    if (targetARR > 0) {
      totalScore += (workload.arr / targetARR);
      metricsConsidered++;
    }
    
    // CRE scoring (if configured)
    const creTarget = (this.config as any).cre_target;
    if (creTarget && creTarget > 0) {
      totalScore += (workload.cre / creTarget);
      metricsConsidered++;
    }
    
    // ATR scoring (if configured)
    const atrTarget = (this.config as any).atr_target;
    if (atrTarget && atrTarget > 0) {
      totalScore += (workload.atr / atrTarget);
      metricsConsidered++;
    }
    
    // Tier 1 scoring (if configured)
    const tier1Target = (this.config as any).tier1_target;
    if (tier1Target && tier1Target > 0) {
      totalScore += (workload.tier1 / tier1Target);
      metricsConsidered++;
    }
    
    // Tier 2 scoring (if configured)
    const tier2Target = (this.config as any).tier2_target;
    if (tier2Target && tier2Target > 0) {
      totalScore += (workload.tier2 / tier2Target);
      metricsConsidered++;
    }
    
    // Average the score across all considered metrics
    if (metricsConsidered === 0) {
      // Fallback if no targets configured at all
      if (targetARR > 0) {
        return workload.arr / targetARR;
      }
      return 1; // Neutral score if no targets at all
    }
    
    // Return average score across all metrics
    return totalScore / metricsConsidered;
  }

  private updateWorkload(repId: string, account: Account) {
    const workload = this.workloadMap.get(repId)!;
    const accountARR = getAccountARR(account);
    
    // For prospects, track Net ARR separately from account ARR
    if (this.assignmentType === 'prospect') {
      const accountNetARR = this.opportunitiesMap.get(account.sfdc_account_id) || 0;
      workload.netARR += accountNetARR;
      workload.arr += accountARR; // Still track account ARR for reference
    } else {
      workload.arr += accountARR;
    }
    
    workload.accounts += 1;
    
    // For prospects, don't track CRE
    if (this.assignmentType === 'prospect') {
      workload.cre += 0;
    } else {
      // For customers, track CRE normally
      workload.cre += account.cre_count || 0;
    }
    
    workload.atr += getAccountATR(account);
    
    if (account.expansion_tier === 'Tier 1') {
      workload.tier1 += 1;
    } else if (account.expansion_tier === 'Tier 2') {
      workload.tier2 += 1;
    }
    
    // Track quarterly renewals (handles both "Q1" and "Q1-FY27" formats)
    const quarter = account.renewal_quarter?.toUpperCase() || '';
    if (quarter.startsWith('Q1')) workload.q1_renewals += 1;
    if (quarter.startsWith('Q2')) workload.q2_renewals += 1;
    if (quarter.startsWith('Q3')) workload.q3_renewals += 1;
    if (quarter.startsWith('Q4')) workload.q4_renewals += 1;
  }

  private checkPostAssignmentWarnings(reps: SalesRep[]) {
    reps.forEach(rep => {
      const workload = this.workloadMap.get(rep.rep_id)!;
      
      // CRE concentration - skip for prospects
      if (this.assignmentType !== 'prospect' && workload.cre >= this.config.max_cre_per_rep) {
        this.warnings.push({
          severity: 'high',
          type: 'cre_risk',
          accountOrRep: rep.name,
          reason: `Rep has ${workload.cre} CRE accounts (threshold: ${this.config.max_cre_per_rep})`,
          details: `Consider redistributing CRE accounts`
        });
      }

      // Tier 1 concentration
      if (workload.tier1 > (this.config.max_tier1_per_rep || 5)) {
        this.warnings.push({
          severity: 'medium',
          type: 'tier_concentration',
          accountOrRep: rep.name,
          reason: `Rep has ${workload.tier1} Tier 1 accounts (threshold: ${this.config.max_tier1_per_rep})`,
          details: `May require additional support or capacity`
        });
      }

      // Tier 2 concentration
      if (workload.tier2 > (this.config.max_tier2_per_rep || 8)) {
        this.warnings.push({
          severity: 'low',
          type: 'tier_concentration',
          accountOrRep: rep.name,
          reason: `Rep has ${workload.tier2} Tier 2 accounts (threshold: ${this.config.max_tier2_per_rep})`,
          details: `Monitor for workload balance`
        });
      }
    });
  }
}

export async function generateSimplifiedAssignments(
  buildId: string,
  assignmentType: 'customer' | 'prospect',
  accounts: Account[],
  reps: SalesRep[],
  config: AssignmentConfiguration,
  opportunities?: Array<{sfdc_account_id: string, net_arr: number}>,
  progressCallback?: WaterfallProgressCallback
): Promise<{ proposals: AssignmentProposal[], warnings: AssignmentWarning[] }> {
  const engine = new WaterfallAssignmentEngine(buildId, assignmentType, config, opportunities, progressCallback);
  return engine.generateAssignments(accounts, reps);
}
