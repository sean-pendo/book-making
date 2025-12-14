import { autoMapTerritoryToRegion } from '@/utils/territoryAutoMapping';
import { getDefaultPriorityConfig, PriorityConfig, SubConditionConfig } from '@/config/priorityRegistry';

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

// HiGHS Solver for batch optimization at each priority level
let highsInstance: any = null;
let highsLoadPromise: Promise<any> | null = null;

async function getHiGHS(): Promise<any> {
  if (highsInstance) return highsInstance;
  if (highsLoadPromise) return highsLoadPromise;
  
  highsLoadPromise = (async () => {
    try {
      const highsLoader = (await import('highs')).default;
      const highs = await highsLoader({
        locateFile: (file: string) => {
          if (typeof window !== 'undefined') {
            return `https://lovasoa.github.io/highs-js/${file}`;
          }
          return file;
        }
      });
      highsInstance = highs;
      console.log('[WaterfallEngine] HiGHS solver loaded');
      return highs;
    } catch (error) {
      console.error('[WaterfallEngine] Failed to load HiGHS:', error);
      throw error;
    }
  })();
  
  return highsLoadPromise;
}

function sanitizeVarName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
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
const REGION_HIERARCHY: Record<string, string[]> = {
  // AMER Sub-regions (actual data from territoryAutoMapping.ts)
  'North East': ['AMER', 'Global'],
  'South East': ['AMER', 'Global'],
  'Central': ['AMER', 'Global'],
  'West': ['AMER', 'Global'],
  'Other': ['Global'],  // International/Other territories
  'AMER': ['Global'],
  // EMEA Sub-regions
  'UK': ['EMEA', 'Global'],
  'UKI': ['EMEA', 'Global'],
  'DACH': ['EMEA', 'Global'],
  'France': ['EMEA', 'Global'],
  'Nordics': ['EMEA', 'Global'],
  'Benelux': ['EMEA', 'Global'],
  'RO-EMEA': ['EMEA', 'Global'],
  'EMEA': ['Global'],
  // APAC Sub-regions
  'ANZ': ['APAC', 'Global'],
  'Japan': ['APAC', 'Global'],
  'Singapore': ['APAC', 'Global'],
  'RO-APAC': ['APAC', 'Global'],
  'APAC': ['Global'],
  // Global (no fallback - accepts everything)
  'Global': []
};

/**
 * Sibling regions - regions at the same level that share a parent.
 * Used by getGeographyScore() to give partial credit when
 * an account goes to a neighboring region (e.g., Central -> West).
 */
const REGION_SIBLINGS: Record<string, string[]> = {
  'North East': ['South East', 'Central', 'West'],
  'South East': ['North East', 'Central', 'West'],
  'Central': ['North East', 'South East', 'West'],
  'West': ['North East', 'South East', 'Central'],
  'UK': ['DACH', 'France', 'Nordics', 'Benelux'],
  'DACH': ['UK', 'France', 'Nordics', 'Benelux'],
  'France': ['UK', 'DACH', 'Nordics', 'Benelux'],
  'Nordics': ['UK', 'DACH', 'France', 'Benelux'],
  'Benelux': ['UK', 'DACH', 'France', 'Nordics'],
};

/**
 * Format priority label for display
 * P0 = holdovers/strategic, P1-P4 = optimization priorities, RO = residual
 */
function formatPriorityLabel(priorityId: string, priorityLevel: number): string {
  const friendlyName = PRIORITY_NAMES[priorityId] || priorityId;
  if (priorityId === 'arr_balance') return `RO: ${friendlyName}`;
  return `P${priorityLevel}: ${friendlyName}`;
}

/**
 * Classify account into team tier based on employee count
 * SMB: < 100 employees
 * Growth: 100-499 employees
 * MM: 500-1499 employees
 * ENT: 1500+ employees
 */
function classifyAccountTeamTier(employees: number | null | undefined): TeamTier {
  if (!employees || employees < 100) return 'SMB';
  if (employees < 500) return 'Growth';
  if (employees < 1500) return 'MM';
  return 'ENT';
}

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
}

interface AssignmentConfiguration {
  customer_target_arr: number;
  customer_max_arr: number;
  prospect_target_arr: number;
  prospect_max_arr: number;
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

  constructor(buildId: string, assignmentType: 'customer' | 'prospect', config: AssignmentConfiguration, opportunities?: Array<{sfdc_account_id: string, net_arr: number}>) {
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

    console.log(`🎯 Waterfall Engine initialized:`, {
      type: assignmentType,
      targetARR: this.getTargetARR() / 1000000 + 'M',
      capacityLimit: this.getCapacityLimit() / 1000000 + 'M',
      maxCRE: this.config.max_cre_per_rep
    });
  }

  private getTargetARR(): number {
    return this.assignmentType === 'customer'
      ? this.config.customer_target_arr
      : this.config.prospect_target_arr;
  }

  private getCapacityLimit(): number {
    // Use the configured max ARR directly as the hard cap
    return this.assignmentType === 'customer'
      ? this.config.customer_max_arr
      : this.config.prospect_max_arr;
  }

  private getMinimumThreshold(): number {
    // Calculate minimum threshold based on target and variance
    const target = this.getTargetARR();
    const variance = this.config.capacity_variance_percent || 10;
    return target * (1 - variance / 100);
  }

  async generateAssignments(
    accounts: Account[],
    reps: SalesRep[]
  ): Promise<{ proposals: AssignmentProposal[], warnings: AssignmentWarning[] }> {
    console.log(`🚀 Starting waterfall assignment: ${accounts.length} accounts, ${reps.length} reps`);

    // Fetch full config including priority_config and territory_mappings
    const { data: configData } = await supabase
      .from('assignment_configuration')
      .select('*')
      .eq('build_id', this.buildId)
      .single();

    const territoryMappings = configData?.territory_mappings || {};
    
    // Load priority configuration - use saved config or fall back to default
    this.priorityConfig = (configData?.priority_config as PriorityConfig[]) 
      || getDefaultPriorityConfig('COMMERCIAL');
    
    console.log(`[Engine] ✅ Loaded priority config with ${this.priorityConfig.length} priorities`);
    
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
        const aARR = this.getEffectiveARR(a);
        const bARR = this.getEffectiveARR(b);
        return bARR - aARR;
      }
    });

    const proposals: AssignmentProposal[] = [];

    // DYNAMIC PRIORITY EXECUTION
    // Execute priorities in the order configured by the user
    console.log(`🔄 Starting Dynamic Priority Execution...`);
    
    // Get enabled priorities sorted by position
    const enabledPriorities = this.priorityConfig
      .filter(p => p.enabled)
      .sort((a, b) => a.position - b.position);
    
    console.log(`[Engine] Enabled priorities: ${enabledPriorities.map(p => `${p.id}@${p.position}`).join(' → ')}`);
    
    // Track remaining accounts and stats per priority
    let remainingAccounts = [...sortedAccounts];
    const priorityStats: Record<string, number> = {};
    
    // Execute each priority in configured order
    for (const priority of enabledPriorities) {
      console.log(`\n=== Executing: ${priority.id} (position ${priority.position}) ===`);
      console.log(`[Engine] ${remainingAccounts.length} accounts remaining`);
      
      const result = await this.executePriority(priority, remainingAccounts, reps);
      
      proposals.push(...result.assigned);
      remainingAccounts = result.remaining;
      priorityStats[priority.id] = result.assigned.length;
      
      console.log(`[Engine] ${priority.id}: assigned ${result.assigned.length}, remaining ${remainingAccounts.length}`);
    }
    
    // FORCE ASSIGNMENT: Any remaining accounts get assigned to least loaded rep
    // This ensures 100% assignment rate even when all reps are at capacity
    if (remainingAccounts.length > 0) {
      console.log(`\n🔥 FORCE ASSIGNMENT: ${remainingAccounts.length} accounts need forced assignment`);
      
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
        for (const account of remainingAccounts) {
          const accountARR = this.getEffectiveARR(account);
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
        }
        
        // Clear remaining accounts since they've all been force-assigned
        remainingAccounts = [];
      }
    }
    
    // Log summary
    console.log(`\n📊 Priority Execution Summary:`);
    for (const [priorityId, count] of Object.entries(priorityStats)) {
      console.log(`  - ${priorityId}: ${count}`);
    }
    console.log(`  - Unassigned: ${remainingAccounts.length}`);
    console.log(`  - Total: ${proposals.length}`);

    // Post-process: Check for warnings
    this.checkPostAssignmentWarnings(reps);

    console.log(`✅ Generated ${proposals.length} proposals with ${this.warnings.length} warnings`);
    return { proposals, warnings: this.warnings };
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
      
      // Phase 2 stubs - not yet implemented
      case 'stability_accounts':
        console.warn(`[Engine] stability_accounts not yet implemented, skipping`);
        return { assigned: [], remaining: accounts };
      
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
    
    const salesToolsThreshold = this.config.rs_arr_threshold || 25000;
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
      const accountARR = account.hierarchy_bookings_arr_converted || account.calculated_arr || account.arr || 0;
      
      if (accountARR < salesToolsThreshold) {
        assigned.push({
          account,
          proposedRep: salesToolsRep,
          currentOwner: account.owner_id ? this.repMap.get(account.owner_id) || null : null,
          rationale: `Routed to Sales Tools (ARR $${accountARR.toLocaleString()} < $${salesToolsThreshold.toLocaleString()})`,
          warnings: [],
          ruleApplied: formatPriorityLabel('sales_tools_bucket', 0),
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
      const highs = await getHiGHS();
      
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
      
      for (const account of accounts) {
        const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
        const accountARR = this.getEffectiveARR(account);
        
        // Classify account for team alignment
        const accountTier = classifyAccountTeamTier(account.employees);
        
        for (const rep of eligibleReps) {
          const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
          
          // Objective: prefer lower-loaded reps (balance)
          const currentLoad = this.workloadMap.get(rep.rep_id)?.arr || 0;
          const loadRatio = currentLoad / targetARR;
          const balanceBonus = Math.max(0, 100 - loadRatio * 50); // Higher bonus for less-loaded reps
          
          // Continuity bonus
          const continuityBonus = account.owner_id === rep.rep_id ? 30 : 0;
          
          // Geography score (0-100) weighted by geo_weight config (0-1)
          // Higher scores for exact geo match, lower for fallback regions
          const geoScore = this.getGeographyScore(account, rep);
          const geoWeight = (this.config as any).geo_weight ?? 0.3; // Default 30% weight
          const geoBonus = geoScore * geoWeight; // 0-100 * 0-1 = 0-100 contribution
          
          // Team alignment penalty (reduces coefficient for mismatched tiers)
          // 1-level mismatch: GAMMA (100) - discouraged but acceptable
          // 2+ level mismatch: EPSILON (1000) - almost never
          const teamAlignmentPenalty = calculateTeamAlignmentPenalty(accountTier, rep.team_tier);
          
          // Final coefficient: positive bonuses minus penalty
          // balanceBonus: 0-100 (prefer less loaded reps)
          // continuityBonus: 0 or 30 (prefer keeping with current owner)
          // geoBonus: 0-100 (prefer geographic match, scaled by weight)
          // teamAlignmentPenalty: scaled down by /10 to keep proportional
          const coefficient = Math.max(1, balanceBonus + continuityBonus + geoBonus + 10 - (teamAlignmentPenalty / 10));
          objectiveTerms.push(`${coefficient.toFixed(2)} ${varName}`);
          binaries.push(varName);
        }
      }
      
      if (objectiveTerms.length === 0) {
        return { assigned: [], remaining: [...accounts] };
      }
      
      lines.push('    ' + objectiveTerms.join(' + '));
      
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
      
      // Rep capacity constraints
      for (const [repId, rep] of allEligibleReps) {
        const currentLoad = this.workloadMap.get(repId)?.arr || 0;
        const arrTerms: string[] = [];
        
        for (const account of accounts) {
          const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
          if (eligibleReps.some(r => r.rep_id === repId)) {
            const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(repId)}`;
            const arr = this.getEffectiveARR(account);
            if (arr > 0) {
              arrTerms.push(`${arr} ${varName}`);
            }
          }
        }
        
        if (arrTerms.length > 0) {
          const remainingCapacity = preferredMaxARR - currentLoad;
          constraints.push(` cap_${sanitizeVarName(repId)}: ${arrTerms.join(' + ')} <= ${Math.max(0, remainingCapacity)}`);
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
            const accountTier = classifyAccountTeamTier(account.employees);
            
            if (accountTier === repTier) {
              // Matching tier: coefficient = (1 - minPct)
              matchingTerms.push(`${(1 - minPct).toFixed(4)} ${varName}`);
            } else {
              // Non-matching tier: coefficient = -minPct
              nonMatchingTerms.push(`${minPct.toFixed(4)} ${varName}`);
            }
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
        }
      }
      
      lines.push(...constraints);
      
      // Bounds (all binary 0-1)
      lines.push('Bounds');
      for (const varName of binaries) {
        lines.push(` 0 <= ${varName} <= 1`);
      }
      
      lines.push('Binary');
      lines.push(' ' + binaries.join(' '));
      lines.push('End');
      
      const lpProblem = lines.join('\n');
      console.log(`[HiGHS P${priorityLevel}] Solving ${accounts.length} accounts, ${allEligibleReps.size} reps...`);
      
      // Solve
      const solution = highs.solve(lpProblem, {
        presolve: 'on',
        time_limit: 10.0,
        mip_rel_gap: 0.05,
      });
      
      if (solution.Status !== 'Optimal') {
        console.warn(`[HiGHS P${priorityLevel}] Non-optimal status: ${solution.Status}, falling back to greedy`);
        return { assigned: [], remaining: [...accounts] };
      }
      
      console.log(`[HiGHS P${priorityLevel}] Optimal solution found, objective: ${solution.ObjectiveValue?.toFixed(2)}`);
      
      // Parse solution
      const assignedAccountIds = new Set<string>();
      
      for (const [varName, varData] of Object.entries(solution.Columns || {})) {
        if (!varName.startsWith('x_')) continue;
        if ((varData as any).Primal < 0.5) continue;
        
        // Find matching account and rep
        for (const account of accounts) {
          const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
          for (const rep of eligibleReps) {
            const expectedVar = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
            if (varName === expectedVar) {
              const accountARR = this.getEffectiveARR(account);
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
        
        const accountARR = this.getEffectiveARR(account);
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
      
      const accountARR = this.getEffectiveARR(account);
      
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
      formatPriorityLabel('geo_and_continuity', 1),
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
      const accountARR = this.getEffectiveARR(account);
      
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
      formatPriorityLabel('geography', 2),
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
      
      const accountARR = this.getEffectiveARR(account);
      
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
      formatPriorityLabel('continuity', 3),
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
   * arr_balance: Batch assign accounts to any rep with capacity (fallback/residual optimization)
   * Uses HiGHS optimization to find globally optimal assignment
   */
  private async batchAssignPriority4(accounts: Account[], allReps: SalesRep[]): Promise<{ assigned: AssignmentProposal[], remaining: Account[] }> {
    // Build eligibility map: account -> list of all eligible reps (any geography)
    const eligibleRepsPerAccount = new Map<string, SalesRep[]>();
    const accountsWithOptions: Account[] = [];
    const accountsWithoutOptions: Account[] = [];
    
    for (const account of accounts) {
      const accountARR = this.getEffectiveARR(account);
      
      // Find all eligible reps with capacity (any geography)
      const eligibleReps = allReps.filter(rep =>
        rep.is_active &&
        rep.include_in_assignments &&
        !rep.is_strategic_rep &&
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
    
    // Use HiGHS to optimally assign
    const result = await this.solveWithHiGHS(
      accountsWithOptions,
      eligibleRepsPerAccount,
      4,
      formatPriorityLabel('arr_balance', 4),
      'Residual Optimization - Best Available Rep'
    );
    
    // Add cross-region warnings to assigned proposals
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
    
    // Combine HiGHS remaining with accounts that had no options
    return {
      assigned: result.assigned,
      remaining: [...result.remaining, ...accountsWithoutOptions]
    };
  }

  /**
   * Helper to assign strategic accounts (separate pool)
   * Used by handleManualHoldover()
   */
  private assignStrategicAccount(account: Account, allReps: SalesRep[]): AssignmentProposal | null {
    const accountARR = this.getEffectiveARR(account);
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
        ruleApplied: formatPriorityLabel('manual_holdover', 0),
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
      ruleApplied: formatPriorityLabel('manual_holdover', 0),
      arr: accountARR,
      priorityLevel: 1 as const  // Strategic accounts are always Priority 1
    };
  }

  // ========== LEGACY SINGLE ACCOUNT METHOD (kept for reference) ==========

  private assignSingleAccount(account: Account, allReps: SalesRep[]): AssignmentProposal {
    const accountARR = this.getEffectiveARR(account);
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
          ruleApplied: formatPriorityLabel('strategic_continuity', 0),
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
        ruleApplied: formatPriorityLabel('strategic_distribution', 0),
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
          ruleApplied: formatPriorityLabel('geo_and_continuity', 1),
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
        ruleApplied: formatPriorityLabel('geography', 2),
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
          ruleApplied: formatPriorityLabel('continuity', 3),
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
        ruleApplied: formatPriorityLabel('arr_balance', 4),
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

  /**
   * Get effective ARR for an account - uses hierarchy_bookings_arr_converted as primary source
   * Falls back through: hierarchy_bookings_arr_converted → calculated_arr (if > 0) → arr → 0
   */
  private getEffectiveARR(account: Account): number {
    // Priority 1: hierarchy_bookings_arr_converted (aggregated from hierarchy)
    if (account.hierarchy_bookings_arr_converted && account.hierarchy_bookings_arr_converted > 0) {
      return account.hierarchy_bookings_arr_converted;
    }
    // Priority 2: calculated_arr (if actually populated with a real value)
    if (account.calculated_arr && account.calculated_arr > 0) {
      return account.calculated_arr;
    }
    // Priority 3: arr (direct field)
    if (account.arr && account.arr > 0) {
      return account.arr;
    }
    return 0;
  }

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
      const isMatch = mappedRegion.toLowerCase() === repRegion.toLowerCase();
      if (isMatch) {
        console.log(`🗺️ Territory Mapping: "${accountTerritory}" → "${mappedRegion}" (matches ${rep.name})`);
      }
      return isMatch;
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
    const hierarchy = REGION_HIERARCHY[targetRegion] || [];
    const repRegionLower = repRegion.toLowerCase();
    
    for (let level = 0; level < hierarchy.length; level++) {
      if (hierarchy[level].toLowerCase() === repRegionLower) {
        // Parent match: 40 for immediate parent, 25 for grandparent
        return Math.max(25, 50 - (level * 10));
      }
    }
    
    // Check if they share a common parent (different branches)
    const repHierarchy = REGION_HIERARCHY[repRegion] || [];
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
    const targetARR = this.getTargetARR();
    const minThreshold = this.getMinimumThreshold();
    const preferredMax = targetARR * (1 + (this.config.capacity_variance_percent || 10) / 100);
    
    // STANDARD CAPACITY LOGIC (for customers)
    const currentLoad = workload.arr;
    const newLoad = currentLoad + accountARR;
    
    // Multi-dimensional minimum enforcement: If rep is below minimum on ANY metric
    const isBelowMinimumOnAnyMetric = this.isBelowMinimumThreshold(repId);
    if (isBelowMinimumOnAnyMetric) {
      // 1. Never exceed absolute hard cap
      if (newLoad > capacityLimit) {
        return false;
      }
      
      // 2. If this brings rep into target range (min to preferred max), excellent!
      if (newLoad >= minThreshold && newLoad <= preferredMax) {
        return true;
      }
      
      // 3. If rep is far below minimum (< 50% of min), allow up to 10% over preferred max
      if (currentLoad < (minThreshold * 0.5) && newLoad <= (preferredMax * 1.1)) {
        return true;
      }
      
      // 4. Otherwise, only accept if within 5% of preferred max
      return newLoad <= (preferredMax * 1.05);
    }
    
    // Rep is at/above minimum - check if they can stay within preferred max
    if (newLoad > preferredMax) {
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

  private findMostCapacityRep(reps: SalesRep[]): SalesRep {
    // For prospects, sort by lowest account count
    if (this.assignmentType === 'prospect') {
      return reps.reduce((best, current) => {
        const bestWorkload = this.workloadMap.get(best.rep_id)!;
        const currentWorkload = this.workloadMap.get(current.rep_id)!;
        return currentWorkload.accounts < bestWorkload.accounts ? current : best;
      });
    }
    
    // For customers, use multi-dimensional selection
    const repsBelowMinimum = reps.filter(rep => this.isBelowMinimumThreshold(rep.rep_id));
    
    // If we have reps below minimum, select from them; otherwise use all reps
    const repsToConsider = repsBelowMinimum.length > 0 ? repsBelowMinimum : reps;
    
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
    const accountARR = this.getEffectiveARR(account);
    
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
    
    workload.atr += account.calculated_atr || 0;
    
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
  opportunities?: Array<{sfdc_account_id: string, net_arr: number}>
): Promise<{ proposals: AssignmentProposal[], warnings: AssignmentWarning[] }> {
  const engine = new WaterfallAssignmentEngine(buildId, assignmentType, config, opportunities);
  return engine.generateAssignments(accounts, reps);
}
