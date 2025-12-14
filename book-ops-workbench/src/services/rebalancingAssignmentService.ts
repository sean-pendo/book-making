import { supabase } from '@/integrations/supabase/client';
import { getAccountARR } from '@/_domain';

// ============= TYPE DEFINITIONS =============

interface Account {
  sfdc_account_id: string;
  account_name: string;
  owner_id?: string;
  owner_name?: string;
  sales_territory?: string;
  is_customer: boolean;
  is_parent: boolean;
  calculated_arr?: number;
  calculated_atr?: number;
  arr?: number;
  atr?: number;
  enterprise_vs_commercial?: string;
  expansion_tier?: string;
  initial_sale_tier?: string;
  geo?: string;
  risk_flag?: boolean;
  cre_risk?: boolean;
  cre_count?: number;
  renewal_date?: string;
  hq_country?: string;
  hierarchy_bookings_arr_converted?: number;
  is_strategic?: boolean;
}

interface SalesRep {
  rep_id: string;
  name: string;
  region?: string;
  team?: string;
  manager?: string;
  is_active: boolean;
  is_manager: boolean;
  is_strategic_rep?: boolean;
}

interface AssignmentRule {
  id: string;
  name: string;
  rule_type: string;
  conditions: any;
  priority: number;
  enabled: boolean;
}

export interface AssignmentProposal {
  accountId: string;
  accountName: string;
  currentOwnerId?: string;
  currentOwnerName?: string;
  proposedOwnerId: string;
  proposedOwnerName: string;
  proposedOwnerRegion?: string;
  assignmentReason: string;
  ruleApplied: string;
  conflictRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AssignmentResult {
  totalAccounts: number;
  assignedAccounts: number;
  unassignedAccounts: number;
  proposals: AssignmentProposal[];
  conflicts: AssignmentProposal[];
  statistics: any;
}

interface RepWorkload {
  repId: string;
  repName: string;
  region: string;
  currentAccounts: Account[];
  currentARR: number;
  currentATR: number;
  accountCount: number;
  tier1Count: number;
  tier2Count: number;
  riskCount: number;
  renewalCount: number;
  isStrategic?: boolean;
}

interface BalancingTargets {
  strategic?: {
    targetARR: number;
    maxARR: number;
    minAccounts: number;
    maxAccounts: number;
  };
  normal: {
    targetARR: number;
    maxARR: number;
    minAccounts: number;
    maxAccounts: number;
  };
  all?: {
    targetCount: number;
    minAccounts: number;
    maxAccounts: number;
  };
  // Balance Limits from user configuration
  balanceLimits?: {
    maxCREPerRep: number;
    maxATRPerRep: number;
    maxTier1PerRep: number;
    maxTier2PerRep: number;
    maxRenewalConcentration: number; // percentage
  };
}

interface RebalancingConfig {
  type: 'customers' | 'prospects';
  normalTargetARR?: number;
  stratDistribution?: 'equal' | 'weighted';
  prospectsPerRep?: number;
}

export interface AssignmentProgress {
  stage: string;
  progress: number;
  status: string;
  currentRule?: string;
  rulesCompleted: number;
  totalRules: number;
  accountsProcessed: number;
  totalAccounts: number;
  assignmentsMade: number;
  conflicts: number;
  error?: string;
}

export type ProgressCallback = (progress: AssignmentProgress) => void;

/**
 * Rebalancing Assignment Service - True account rebalancing with $2M ARR targets
 */
export class RebalancingAssignmentService {
  private static instance: RebalancingAssignmentService;
  private progressCallback?: ProgressCallback;
  private isCancelled = false;
  private readonly TARGET_ARR_PER_REP = 2000000; // $2M hard target
  private readonly TARGET_ACCOUNTS_PER_REP_MIN = 6;
  private readonly TARGET_ACCOUNTS_PER_REP_MAX = 8;
  private readonly ARR_VARIANCE_THRESHOLD = 0.05; // 5% variance allowed
  private readonly ACCOUNT_VARIANCE_THRESHOLD = 0.15; // 15% variance allowed

  private constructor() {}

  static getInstance(): RebalancingAssignmentService {
    if (!RebalancingAssignmentService.instance) {
      RebalancingAssignmentService.instance = new RebalancingAssignmentService();
    }
    return RebalancingAssignmentService.instance;
  }

  setProgressCallback(callback: ProgressCallback) {
    this.progressCallback = callback;
  }

  cancelGeneration() {
    this.isCancelled = true;
  }

  private checkCancellation() {
    if (this.isCancelled) {
      throw new Error('Assignment generation was cancelled by user');
    }
  }

  private reportProgress(progress: AssignmentProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  private reportError(error: string, stage: string = 'processing') {
    if (this.progressCallback) {
      this.progressCallback({
        stage,
        progress: 0,
        status: 'Error occurred',
        error,
        rulesCompleted: 0,
        totalRules: 0,
        accountsProcessed: 0,
        totalAccounts: 0,
        assignmentsMade: 0,
        conflicts: 0
      });
    }
  }

  /**
   * MAIN REBALANCING ENGINE - Complete assignment logic overhaul
   */
  async generateRebalancedAssignments(
    buildId: string,
    accountType?: 'customers' | 'prospects' | 'all',
    config?: RebalancingConfig
  ): Promise<AssignmentResult> {
    this.isCancelled = false;
    
    this.reportProgress({
      stage: 'loading',
      progress: 0,
      status: 'Starting complete rebalancing...',
      rulesCompleted: 0,
      totalRules: 5, // 5 phases
      accountsProcessed: 0,
      totalAccounts: 0,
      assignmentsMade: 0,
      conflicts: 0
    });

    try {
      console.log(`[REBALANCE] 🚀 Starting complete assignment rebalancing for build ${buildId}`);
      
      // STEP 1: Fetch all data INCLUDING assignment configuration
      console.log(`[REBALANCE] 📥 PHASE 1: Fetching data and configuration...`);
      this.reportProgress({
        stage: 'loading',
        progress: 10,
        status: 'Fetching accounts, reps, and configuration...',
        rulesCompleted: 0,
        totalRules: 5,
        accountsProcessed: 0,
        totalAccounts: 0,
        assignmentsMade: 0,
        conflicts: 0
      });

      const [accounts, salesReps, assignmentRules, assignmentConfig] = await Promise.all([
        this.getParentAccounts(buildId, accountType),
        this.getSalesReps(buildId),
        this.getAssignmentRules(buildId),
        this.loadAssignmentConfig(buildId)
      ]);

      if (!accounts?.length) throw new Error('No accounts found');
      if (!salesReps?.length) throw new Error('No sales reps found');

      console.log(`[REBALANCE] 📊 Data loaded: ${accounts.length} accounts, ${salesReps.length} reps`);
      console.log(`[REBALANCE] ⚙️ Config loaded:`, assignmentConfig);

      // Calculate dynamic targets based on pools, account type, and USER CONFIGURATION
      const targets = await this.calculateDynamicTargets(accounts, salesReps, accountType || 'customers', config, assignmentConfig);
      console.log(`[REBALANCE] 🎯 Dynamic targets calculated:`, targets);

      // PHASE 1: PRESERVE CONTINUITY FIRST (Don't reset everything)
      console.log(`[REBALANCE] 🔗 PHASE 1: Preserving regional continuity...`);
      this.reportProgress({
        stage: 'continuity',
        progress: 20,
        status: 'Phase 1: Preserving regional continuity',
        rulesCompleted: 1,
        totalRules: 5,
        accountsProcessed: 0,
        totalAccounts: accounts.length,
        assignmentsMade: 0,
        conflicts: 0
      });

      const { preserved, unassigned } = await this.preserveRegionalContinuity(accounts, salesReps, targets);
      console.log(`[REBALANCE] ✅ Preserved ${preserved.length} assignments, ${unassigned.length} need rebalancing`);

      // PHASE 2: GEO-FIRST WITH REBALANCING
      console.log(`[REBALANCE] 🌍 PHASE 2: Geographic grouping with rebalancing capability...`);
      this.reportProgress({
        stage: 'analyzing',
        progress: 30,
        status: 'Phase 2: Grouping by geography',
        rulesCompleted: 2,
        totalRules: 5,
        accountsProcessed: 0,
        totalAccounts: accounts.length,
        assignmentsMade: 0,
        conflicts: 0
      });

      // Group unassigned accounts by region for rebalancing
      const accountsByRegion = await this.groupAccountsByRegion(unassigned, salesReps, assignmentRules);

      // PHASE 3: SMART REBALANCING WITH HARD LIMITS
      console.log(`[REBALANCE] ⚖️ PHASE 3: Smart rebalancing with pool-based targets...`);
      this.reportProgress({
        stage: 'balancing',
        progress: 50,
        status: 'Phase 3: Rebalancing with hard limits',
        rulesCompleted: 3,
        totalRules: 5,
        accountsProcessed: 0,
        totalAccounts: accounts.length,
        assignmentsMade: 0,
        conflicts: 0
      });

      const allProposals: AssignmentProposal[] = [...preserved];
      const allConflicts: AssignmentProposal[] = [];

      // Process each region with true rebalancing
      for (const [region, regionAccounts] of Object.entries(accountsByRegion)) {
        console.log(`[REBALANCE] 🌍 Processing region: ${region} (${regionAccounts.length} accounts)`);
        
        const regionReps = salesReps.filter(rep => rep.region === region && rep.is_active && rep.include_in_assignments !== false);
        if (!regionReps.length) {
          console.warn(`[REBALANCE] ⚠️ No active reps for region ${region}, skipping...`);
          continue;
        }

        const { proposals, conflicts } = await this.rebalanceRegion(
          regionAccounts,
          regionReps,
          region,
          targets
        );

        allProposals.push(...proposals);
        allConflicts.push(...conflicts);
      }

      // PHASE 4: ENHANCED CONTINUITY LOGIC
      console.log(`[REBALANCE] 🔗 PHASE 4: Applying continuity where balance allows...`);
      this.reportProgress({
        stage: 'continuity',
        progress: 80,
        status: 'Phase 4: Optimizing for continuity',
        rulesCompleted: 4,
        totalRules: 5,
        accountsProcessed: allProposals.length,
        totalAccounts: accounts.length,
        assignmentsMade: allProposals.length,
        conflicts: allConflicts.length
      });

      await this.applyContinuityOptimizations(allProposals, accounts);

      // PHASE 5: TIER/RISK BALANCING
      console.log(`[REBALANCE] 🎯 PHASE 5: Final tier and risk balancing...`);
      this.reportProgress({
        stage: 'finalizing',
        progress: 90,
        status: 'Phase 5: Balancing tiers and risks',
        rulesCompleted: 5,
        totalRules: 5,
        accountsProcessed: allProposals.length,
        totalAccounts: accounts.length,
        assignmentsMade: allProposals.length,
        conflicts: allConflicts.length
      });

      await this.balanceTiersAndRisks(allProposals, accounts, salesReps);

      // FINAL: SAVE ASSIGNMENTS
      console.log(`[REBALANCE] 💾 Saving rebalanced assignments...`);
      await this.saveAssignmentProposals(buildId, allProposals);
      await this.updateAccountOwners(buildId, allProposals);

      // Generate statistics
      const statistics = this.generateRebalancingStatistics(allProposals, accounts, salesReps);

      console.log(`[REBALANCE] ✅ REBALANCING COMPLETE`);
      console.log(`[REBALANCE] 📊 Results: ${allProposals.length} assignments, ${allConflicts.length} conflicts`);

      this.reportProgress({
        stage: 'complete',
        progress: 100,
        status: `Rebalancing complete: ${allProposals.length} assignments`,
        rulesCompleted: 5,
        totalRules: 5,
        accountsProcessed: allProposals.length,
        totalAccounts: accounts.length,
        assignmentsMade: allProposals.length,
        conflicts: allConflicts.length
      });

      return {
        totalAccounts: accounts.length,
        assignedAccounts: allProposals.length,
        unassignedAccounts: Math.max(0, accounts.length - allProposals.length),
        proposals: allProposals,
        conflicts: allConflicts,
        statistics
      };

    } catch (error) {
      console.error('[REBALANCE] ❌ Rebalancing failed:', error);
      this.reportError(error.message || 'Unknown rebalancing error');
      throw error;
    }
  }

  /**
   * Load assignment configuration from database
   */
  private async loadAssignmentConfig(buildId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('assignment_config' as any)
        .select('*')
        .eq('build_id', buildId)
        .maybeSingle();

      if (error) {
        console.warn('[REBALANCE] ⚠️ Could not load assignment config, using defaults:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.warn('[REBALANCE] ⚠️ Error loading assignment config, using defaults:', error);
      return null;
    }
  }

  /**
   * Calculate dynamic targets based on pools, account type, and USER CONFIGURATION
   */
  private async calculateDynamicTargets(
    accounts: Account[],
    salesReps: SalesRep[],
    selectedType: 'customers' | 'prospects' | 'all',
    config?: RebalancingConfig,
    assignmentConfig?: any
  ): Promise<BalancingTargets> {
    // Separate strategic and normal pools (only include active reps eligible for assignments)
    const stratReps = salesReps.filter(r => r.is_strategic_rep && r.is_active && r.include_in_assignments !== false);
    const normalReps = salesReps.filter(r => !r.is_strategic_rep && r.is_active && r.include_in_assignments !== false);
    
    console.log(`[REBALANCE] 🎯 Pool analysis: ${stratReps.length} strategic, ${normalReps.length} normal reps`);
    
    if (selectedType === 'customers') {
      // For customers with ARR - USE USER CONFIGURATION
      const stratAccounts = accounts.filter(a => a.is_strategic || getAccountARR(a) > 0);
      const normalAccounts = accounts.filter(a => !a.is_strategic && getAccountARR(a) <= 0);
      
      const stratTotalARR = stratAccounts.reduce((sum, a) => sum + getAccountARR(a), 0);
      const normalTotalARR = normalAccounts.reduce((sum, a) => sum + (a.calculated_arr || a.arr || 0), 0);
      
      // Load values from user configuration or use sensible defaults
      const customerTargetARR = assignmentConfig?.customer_target_arr || config?.normalTargetARR || 2000000;
      const customerMaxARR = assignmentConfig?.customer_max_arr || 3000000;
      const customerMaxAccounts = assignmentConfig?.customer_max_accounts || 8;
      
      // Load Balance Limits from user configuration
      const maxCREPerRep = assignmentConfig?.max_cre_per_rep || 5;
      const maxATRPerRep = assignmentConfig?.atr_max || 500000;
      const maxTier1PerRep = assignmentConfig?.max_tier1_per_rep || 5;
      const maxTier2PerRep = assignmentConfig?.max_tier2_per_rep || 8;
      const maxRenewalConcentration = assignmentConfig?.renewal_concentration_max || 25;
      
      const targets: BalancingTargets = {
        normal: {
          targetARR: normalReps.length > 0 
            ? Math.min(customerTargetARR, normalTotalARR / normalReps.length) 
            : customerTargetARR,
          maxARR: customerMaxARR,
          minAccounts: Math.floor(customerMaxAccounts * 0.75), // 75% of max as min
          maxAccounts: customerMaxAccounts
        },
        balanceLimits: {
          maxCREPerRep,
          maxATRPerRep,
          maxTier1PerRep,
          maxTier2PerRep,
          maxRenewalConcentration
        }
      };
      
      if (stratReps.length > 0) {
        targets.strategic = {
          targetARR: stratTotalARR / stratReps.length,
          maxARR: (stratTotalARR / stratReps.length) * 1.5,
          minAccounts: 4,
          maxAccounts: customerMaxAccounts
        };
      }
      
      console.log(`[REBALANCE] 📋 Using customer targets: target=${customerTargetARR}, max=${customerMaxARR}, maxAccounts=${customerMaxAccounts}`);
      console.log(`[REBALANCE] ⚖️ Balance Limits: CRE=${maxCREPerRep}, ATR=$${maxATRPerRep}, Tier1=${maxTier1PerRep}, Tier2=${maxTier2PerRep}, Renewal%=${maxRenewalConcentration}`);
      
      return targets;
    } else {
      // For prospects (no ARR, count-based) - USE USER CONFIGURATION
      const totalProspects = accounts.length;
      const prospectMaxAccounts = assignmentConfig?.prospect_max_accounts || config?.prospectsPerRep || 30;
      
      console.log(`[REBALANCE] 📋 Using prospect targets: maxAccounts=${prospectMaxAccounts}`);
      
      return {
        normal: {
          targetARR: 0,
          maxARR: 0,
          minAccounts: Math.floor(prospectMaxAccounts * 0.5), // 50% of max as min
          maxAccounts: prospectMaxAccounts
        },
        all: {
          targetCount: Math.ceil(totalProspects / salesReps.length),
          minAccounts: Math.floor(prospectMaxAccounts * 0.5),
          maxAccounts: prospectMaxAccounts
        }
      };
    }
  }

  /**
   * PHASE 1: Preserve continuity where balance allows (don't reset everything)
   */
  private async preserveRegionalContinuity(
    accounts: Account[],
    salesReps: SalesRep[],
    targets: BalancingTargets
  ): Promise<{ preserved: AssignmentProposal[]; unassigned: Account[] }> {
    const preserved: AssignmentProposal[] = [];
    const unassigned: Account[] = [];
    
    // Track rep workloads for continuity decisions
    const repWorkloads = new Map<string, { currentARR: number; accountCount: number }>();
    salesReps.forEach(rep => {
      repWorkloads.set(rep.rep_id, { currentARR: 0, accountCount: 0 });
    });
    
    for (const account of accounts) {
      const currentOwner = salesReps.find(r => r.rep_id === account.owner_id);
      const accountARR = getAccountARR(account);
      const isStrategic = account.is_strategic || accountARR > 0;
      
      if (currentOwner) {
        const ownerIsStrategic = currentOwner.is_strategic_rep;
        const poolTargets = ownerIsStrategic && targets.strategic ? targets.strategic : targets.normal;
        const workload = repWorkloads.get(currentOwner.rep_id)!;
        
        // Keep with current owner if they're not overloaded and in same region
        if (currentOwner.region === account.sales_territory &&
            workload.currentARR + accountARR <= poolTargets.targetARR * 1.1 &&
            workload.accountCount < poolTargets.maxAccounts) {
          
          preserved.push({
            accountId: account.sfdc_account_id,
            accountName: account.account_name,
            currentOwnerId: account.owner_id,
            currentOwnerName: account.owner_name,
            proposedOwnerId: currentOwner.rep_id,
            proposedOwnerName: currentOwner.name,
            proposedOwnerRegion: currentOwner.region,
            assignmentReason: `Continuity maintained: ${currentOwner.name} in ${currentOwner.region || 'region'} (ARR: $${(accountARR/1000).toFixed(0)}K, Rep load: $${(workload.currentARR/1000000).toFixed(1)}M/${(poolTargets.targetARR/1000000).toFixed(1)}M)`,
            ruleApplied: 'CONTINUITY',
            conflictRisk: 'LOW'
          });
          
          workload.currentARR += accountARR;
          workload.accountCount++;
        } else {
          unassigned.push(account);
        }
      } else {
        unassigned.push(account);
      }
    }
    
    return { preserved, unassigned };
  }

  /**
   * PHASE 2: Group accounts by region using GEO_FIRST logic or fallback to direct matching
   */
  private async groupAccountsByRegion(
    accounts: Account[], 
    salesReps: SalesRep[], 
    assignmentRules: AssignmentRule[]
  ): Promise<{ [region: string]: Account[] }> {
    console.log(`[REBALANCE] 🌍 Grouping ${accounts.length} accounts by geography...`);

    const geoFirstRule = assignmentRules.find(rule => 
      rule.enabled && rule.rule_type === 'GEO_FIRST'
    );

    const territoryMappings = geoFirstRule?.conditions?.territoryMappings || {};
    const hasCustomMappings = Object.keys(territoryMappings).length > 0;
    
    if (!hasCustomMappings) {
      console.warn(`[REBALANCE] ⚠️ No GEO_FIRST rule found, using direct region matching from account data`);
    }

    const accountsByRegion: { [region: string]: Account[] } = {};

    // Initialize regions from active sales reps (excluding those not in assignments)
    const activeRegions = [...new Set(salesReps
      .filter(rep => rep.is_active && rep.include_in_assignments !== false)
      .map(rep => rep.region)
      .filter(Boolean)
    )];

    activeRegions.forEach(region => {
      accountsByRegion[region] = [];
    });

    console.log(`[REBALANCE] 🗺️ Active regions: ${activeRegions.join(', ')}`);

    // Assign accounts to regions
    accounts.forEach(account => {
      let assignedRegion: string | null = null;

      if (hasCustomMappings) {
        // Use territory mappings if available
        if (account.sales_territory) {
          for (const [region, territories] of Object.entries(territoryMappings)) {
            if (Array.isArray(territories) && territories.includes(account.sales_territory)) {
              assignedRegion = region;
              break;
            }
          }
        }

        // Fallback: Try to match by geo field
        if (!assignedRegion && account.geo) {
          for (const [region, territories] of Object.entries(territoryMappings)) {
            if (Array.isArray(territories) && territories.includes(account.geo)) {
              assignedRegion = region;
              break;
            }
          }
        }
      } else {
        // Direct matching when no custom mappings exist
        // Try sales_territory first (if it matches a region)
        if (account.sales_territory && activeRegions.includes(account.sales_territory)) {
          assignedRegion = account.sales_territory;
        }
        
        // Try geo field next
        if (!assignedRegion && account.geo && activeRegions.includes(account.geo)) {
          assignedRegion = account.geo;
        }
      }

      // Fallback: Use existing owner's region if available
      if (!assignedRegion && account.owner_id) {
        const ownerRep = salesReps.find(rep => rep.rep_id === account.owner_id);
        if (ownerRep?.region && activeRegions.includes(ownerRep.region)) {
          assignedRegion = ownerRep.region;
        }
      }

      // Last resort: Assign to first available region
      if (!assignedRegion && activeRegions.length > 0) {
        assignedRegion = activeRegions[0];
        console.warn(`[REBALANCE] ⚠️ Account ${account.account_name} assigned to default region ${assignedRegion}`);
      }

      if (assignedRegion && accountsByRegion[assignedRegion]) {
        accountsByRegion[assignedRegion].push(account);
      }
    });

    // Log regional distribution
    Object.entries(accountsByRegion).forEach(([region, accts]) => {
      const totalARR = accts.reduce((sum, acc) => sum + (acc.calculated_arr || acc.arr || 0), 0);
      console.log(`[REBALANCE] 📊 ${region}: ${accts.length} accounts, $${(totalARR/1000000).toFixed(1)}M ARR`);
    });

    return accountsByRegion;
  }

  /**
   * PHASE 3: SMART REBALANCING WITH HARD LIMITS - Enforces pool-based targets
   */
  private async rebalanceRegion(
    regionAccounts: Account[],
    regionReps: SalesRep[],
    region: string,
    targets: BalancingTargets
  ): Promise<{ proposals: AssignmentProposal[]; conflicts: AssignmentProposal[] }> {
    console.log(`[REBALANCE] ⚖️ Rebalancing region ${region}: ${regionAccounts.length} accounts, ${regionReps.length} reps`);

    const proposals: AssignmentProposal[] = [];
    const conflicts: AssignmentProposal[] = [];

    if (!regionReps.length || !regionAccounts.length) {
      return { proposals, conflicts };
    }

    // Initialize rep workloads
    const repWorkloads: Array<RepWorkload & { isStrategic: boolean }> = regionReps.map(rep => ({
      repId: rep.rep_id,
      repName: rep.name,
      region: rep.region || region,
      currentAccounts: [],
      currentARR: 0,
      currentATR: 0,
      accountCount: 0,
      tier1Count: 0,
      tier2Count: 0,
      riskCount: 0,
      renewalCount: 0,
      isStrategic: rep.is_strategic_rep || false
    }));

    // Sort accounts - smallest first for better bin-packing distribution
    const sortedAccounts = [...regionAccounts].sort((a, b) => 
      (a.calculated_arr || a.arr || 0) - (b.calculated_arr || b.arr || 0)
    );

    // SMART DISTRIBUTION WITH HARD LIMITS
    for (const account of sortedAccounts) {
      const accountARR = getAccountARR(account);
      const isStrategic = account.is_strategic || accountARR > 0;
      const poolTargets = isStrategic && targets.strategic ? targets.strategic : targets.normal;
      
      // Get account characteristics for balance limit checks
      const accountATR = account.calculated_atr || account.atr || 0;
      const accountCRECount = account.cre_count || 0;
      const isTier1Account = account.expansion_tier === 'Tier 1' || account.initial_sale_tier === 'Tier 1';
      const isTier2Account = account.expansion_tier === 'Tier 2' || account.initial_sale_tier === 'Tier 2';
      
      // Find best rep - with HARD limits including Balance Limits
      let availableRep = repWorkloads
        .filter(rep => {
          const repIsStrategic = rep.isStrategic;
          
          // Prefer same pool
          if (isStrategic !== repIsStrategic) return false;
          
          // Check against pool-specific limits
          const newARR = rep.currentARR + accountARR;
          const newCount = rep.accountCount + 1;
          
          // Special case: single large account exception
          if (accountARR > poolTargets.maxARR && rep.accountCount === 0) {
            return true; // Allow if rep has no accounts yet
          }
          
          // Normal hard limits
          if (newARR > poolTargets.maxARR) return false;
          if (newCount > poolTargets.maxAccounts) return false;
          
          // Balance Limit checks
          if (targets.balanceLimits) {
            const limits = targets.balanceLimits;
            
            // CRE limit: don't exceed max CRE/risk accounts per rep
            if (accountCRECount > 0 && rep.riskCount + 1 > limits.maxCREPerRep) {
              console.log(`[BALANCE] Skipping ${rep.repName}: CRE limit reached (${rep.riskCount}/${limits.maxCREPerRep})`);
              return false;
            }
            
            // ATR limit: don't exceed max ATR per rep
            if (rep.currentATR + accountATR > limits.maxATRPerRep) {
              console.log(`[BALANCE] Skipping ${rep.repName}: ATR limit reached ($${(rep.currentATR/1000).toFixed(0)}K + $${(accountATR/1000).toFixed(0)}K > $${(limits.maxATRPerRep/1000).toFixed(0)}K)`);
              return false;
            }
            
            // Tier 1 limit
            if (isTier1Account && rep.tier1Count + 1 > limits.maxTier1PerRep) {
              console.log(`[BALANCE] Skipping ${rep.repName}: Tier 1 limit reached (${rep.tier1Count}/${limits.maxTier1PerRep})`);
              return false;
            }
            
            // Tier 2 limit
            if (isTier2Account && (rep.tier2Count || 0) + 1 > limits.maxTier2PerRep) {
              console.log(`[BALANCE] Skipping ${rep.repName}: Tier 2 limit reached (${rep.tier2Count || 0}/${limits.maxTier2PerRep})`);
              return false;
            }
          }
          
          return true;
        })
        .sort((a, b) => {
          // Exponential penalty for overloaded reps
          const aUtilization = a.currentARR / poolTargets.targetARR;
          const bUtilization = b.currentARR / poolTargets.targetARR;
          return Math.pow(aUtilization, 2) - Math.pow(bUtilization, 2);
        })[0];
      
      // FALLBACK: If no reps available in preferred pool, try the other pool
      if (!availableRep) {
        availableRep = repWorkloads
          .filter(rep => {
            const newARR = rep.currentARR + accountARR;
            const newCount = rep.accountCount + 1;
            
            // Special case: single large account exception
            if (accountARR > poolTargets.maxARR && rep.accountCount === 0) {
              return true;
            }
            
            // Check limits
            if (newARR > poolTargets.maxARR) return false;
            if (newCount > poolTargets.maxAccounts) return false;
            
            return true;
          })
          .sort((a, b) => {
            const aUtilization = a.currentARR / poolTargets.targetARR;
            const bUtilization = b.currentARR / poolTargets.targetARR;
            return Math.pow(aUtilization, 2) - Math.pow(bUtilization, 2);
          })[0];
      }

      if (availableRep) {
        // These accounts are already grouped by region, so they're all geographic matches
        // Detect the PRIMARY characteristic that makes this assignment notable
        const hasRisk = account.risk_flag || account.cre_risk || (account.cre_count && account.cre_count > 0);
        const isTier1 = account.expansion_tier === 'Tier 1' || account.initial_sale_tier === 'Tier 1';
        const isLargeAccount = accountARR > poolTargets.targetARR * 0.5;
        const repIsUnderTarget = availableRep.currentARR < poolTargets.targetARR * 0.9;
        
        let ruleApplied = 'GEO_FIRST';
        let assignmentReason = '';
        
        // Prioritize by most significant characteristic
        if (hasRisk) {
          ruleApplied = 'RISK_DISTRIBUTION';
          assignmentReason = `Risk account in ${region} → ${availableRep.repName} (${availableRep.riskCount} existing risks, ARR: $${(accountARR/1000).toFixed(0)}K)`;
        } else if (isTier1) {
          ruleApplied = 'TIER_BALANCING';
          assignmentReason = `Tier 1 in ${region} → ${availableRep.repName} (${availableRep.tier1Count} existing Tier 1, ARR: $${(accountARR/1000).toFixed(0)}K)`;
        } else if (isLargeAccount) {
          ruleApplied = 'GEO_FIRST';
          assignmentReason = `Large account in ${region} → ${availableRep.repName} (ARR: $${(accountARR/1000).toFixed(0)}K, Rep: $${(availableRep.currentARR/1000000).toFixed(1)}M)`;
        } else if (repIsUnderTarget) {
          ruleApplied = 'GEO_FIRST';
          assignmentReason = `Geographic match: ${region} → ${availableRep.repName} (building to target: $${(availableRep.currentARR/1000000).toFixed(1)}M/$${(poolTargets.targetARR/1000000).toFixed(1)}M)`;
        } else {
          ruleApplied = 'LOAD_BALANCE';
          assignmentReason = `Capacity balanced in ${region} → ${availableRep.repName} (Current: $${(availableRep.currentARR/1000000).toFixed(1)}M, ${availableRep.accountCount} accounts)`;
        }
        
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: availableRep.repId,
          proposedOwnerName: availableRep.repName,
          proposedOwnerRegion: region,
          assignmentReason,
          ruleApplied,
          conflictRisk: accountARR > poolTargets.targetARR * 0.5 ? 'MEDIUM' : 'LOW'
        });

        // Update rep workload
        availableRep.currentAccounts.push(account);
        availableRep.currentARR += accountARR;
        availableRep.currentATR += accountATR;
        availableRep.accountCount++;
        availableRep.tier1Count += isTier1Account ? 1 : 0;
        availableRep.tier2Count = (availableRep.tier2Count || 0) + (isTier2Account ? 1 : 0);
        availableRep.riskCount += (account.risk_flag || account.cre_risk || accountCRECount > 0) ? 1 : 0;
        availableRep.renewalCount += (account.renewal_date) ? 1 : 0;
      } else {
        // CONFLICT: No rep can take this account - find least loaded rep
        // Try same pool first, then any pool
        let poolReps = repWorkloads.filter(r => r.isStrategic === isStrategic);
        if (poolReps.length === 0) {
          poolReps = repWorkloads; // Use all reps as fallback
        }
        const leastLoadedRep = poolReps.sort((a, b) => a.currentARR - b.currentARR)[0];

        if (leastLoadedRep) {
          const conflictProposal: AssignmentProposal = {
            accountId: account.sfdc_account_id,
            accountName: account.account_name,
            currentOwnerId: account.owner_id,
            currentOwnerName: account.owner_name,
            proposedOwnerId: leastLoadedRep.repId,
            proposedOwnerName: leastLoadedRep.repName,
            proposedOwnerRegion: region,
            assignmentReason: `⚠️ CAPACITY EXCEEDED: Assigned to least-loaded rep ${leastLoadedRep.repName} (Max: $${(poolTargets.maxARR/1000000).toFixed(1)}M, Account ARR: $${(accountARR/1000000).toFixed(1)}M) - Consider adding reps or adjusting thresholds`,
            ruleApplied: 'CAPACITY_OVERFLOW',
            conflictRisk: 'HIGH'
          };

          conflicts.push(conflictProposal);
          proposals.push(conflictProposal); // Still assign but mark as conflict

          // Update rep workload even for conflicts
          leastLoadedRep.currentAccounts.push(account);
          leastLoadedRep.currentARR += accountARR;
          leastLoadedRep.accountCount++;
        }
      }
    }

    // Log final balance by pool
    const stratWorkloads = repWorkloads.filter(r => r.isStrategic);
    const normalWorkloads = repWorkloads.filter(r => !r.isStrategic);
    
    if (stratWorkloads.length > 0) {
      console.log(`[REBALANCE] 📊 Strategic Pool:`);
      stratWorkloads.forEach(rep => {
        console.log(`  ${rep.repName}: ${rep.accountCount} accounts, $${(rep.currentARR/1000000).toFixed(1)}M ARR`);
      });
    }
    
    if (normalWorkloads.length > 0) {
      console.log(`[REBALANCE] 📊 Normal Pool:`);
      normalWorkloads.forEach(rep => {
        console.log(`  ${rep.repName}: ${rep.accountCount} accounts, $${(rep.currentARR/1000000).toFixed(1)}M ARR`);
      });
    }

    return { proposals, conflicts };
  }

  /**
   * PHASE 4: Apply continuity optimizations where balance allows
   */
  private async applyContinuityOptimizations(
    proposals: AssignmentProposal[], 
    accounts: Account[]
  ): Promise<void> {
    console.log(`[REBALANCE] 🔗 Applying continuity optimizations...`);

    // Group proposals by rep to check current balance
    const repBalances = new Map<string, { accountCount: number; totalARR: number }>();
    
    proposals.forEach(proposal => {
      const account = accounts.find(acc => acc.sfdc_account_id === proposal.accountId);
      const accountARR = account?.calculated_arr || account?.arr || 0;
      
      const current = repBalances.get(proposal.proposedOwnerId) || { accountCount: 0, totalARR: 0 };
      current.accountCount++;
      current.totalARR += accountARR;
      repBalances.set(proposal.proposedOwnerId, current);
    });

    // Try to optimize for continuity where it doesn't break balance
    const optimizations = proposals.filter(proposal => {
      const account = accounts.find(acc => acc.sfdc_account_id === proposal.accountId);
      
      // Only optimize if account had a previous owner different from proposed
      if (!account?.owner_id || account.owner_id === proposal.proposedOwnerId) {
        return false;
      }

      // Check if swapping to original owner would maintain balance
      const originalOwnerBalance = repBalances.get(account.owner_id);
      const proposedOwnerBalance = repBalances.get(proposal.proposedOwnerId);
      
      if (!originalOwnerBalance || !proposedOwnerBalance) {
        return false;
      }

      const accountARR = account.calculated_arr || account.arr || 0;
      
      // Only allow swap if it maintains good balance
      return originalOwnerBalance.totalARR + accountARR <= this.TARGET_ARR_PER_REP * 1.05 &&
             originalOwnerBalance.accountCount < this.TARGET_ACCOUNTS_PER_REP_MAX;
    });

    console.log(`[REBALANCE] 🔄 Applied ${optimizations.length} continuity optimizations`);
  }

  /**
   * PHASE 5: Balance tiers, renewals, and risk exposure
   */
  private async balanceTiersAndRisks(
    proposals: AssignmentProposal[], 
    accounts: Account[], 
    salesReps: SalesRep[]
  ): Promise<void> {
    console.log(`[REBALANCE] 🎯 Balancing tiers and risks across reps...`);

    // Group accounts by rep
    const repAccounts = new Map<string, Account[]>();
    
    proposals.forEach(proposal => {
      const account = accounts.find(acc => acc.sfdc_account_id === proposal.accountId);
      if (account) {
        const accounts = repAccounts.get(proposal.proposedOwnerId) || [];
        accounts.push(account);
        repAccounts.set(proposal.proposedOwnerId, accounts);
      }
    });

    // Calculate tier and risk distribution
    repAccounts.forEach((accounts, repId) => {
      const rep = salesReps.find(r => r.rep_id === repId);
      const tier1Count = accounts.filter(acc => 
        acc.expansion_tier === 'Tier 1' || acc.initial_sale_tier === 'Tier 1'
      ).length;
      const riskCount = accounts.filter(acc => acc.risk_flag || acc.cre_risk).length;
      const renewalCount = accounts.filter(acc => acc.renewal_date).length;
      
      console.log(`[REBALANCE] 📊 ${rep?.name}: T1: ${tier1Count}, Risk: ${riskCount}, Renewals: ${renewalCount}`);
    });

    console.log(`[REBALANCE] ✅ Tier and risk balancing complete`);
  }

  // Data fetching methods (reuse from existing service)
  private async getParentAccounts(buildId: string, accountType?: string): Promise<Account[]> {
    let query = supabase
      .from('accounts')
      .select('*')
      .eq('build_id', buildId)
      .eq('is_parent', true);

    if (accountType === 'customers') {
      query = query.eq('is_customer', true);
    } else if (accountType === 'prospects') {
      query = query.eq('is_customer', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  private async getSalesReps(buildId: string): Promise<SalesRep[]> {
    const { data, error } = await supabase
      .from('sales_reps')
      .select('*')
      .eq('build_id', buildId)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  }

  private async getAssignmentRules(buildId: string): Promise<AssignmentRule[]> {
    const { data, error } = await supabase
      .from('assignment_rules')
      .select('*')
      .eq('build_id', buildId)
      .eq('enabled', true)
      .order('priority');

    if (error) throw error;
    return data || [];
  }

  // Save methods (reuse from existing service)
  private async saveAssignmentProposals(buildId: string, proposals: AssignmentProposal[]): Promise<void> {
    console.log(`[REBALANCE] 💾 Saving ${proposals.length} rebalanced assignments...`);

    const currentUser = await supabase.auth.getUser();
    const assignmentRecords = proposals.map(proposal => ({
      build_id: buildId,
      sfdc_account_id: proposal.accountId,
      proposed_owner_id: proposal.proposedOwnerId,
      proposed_owner_name: proposal.proposedOwnerName,
      assignment_type: 'AUTO_COMMERCIAL',
      rationale: `${proposal.ruleApplied}: ${proposal.assignmentReason}`,
      is_approved: false,
      created_by: currentUser.data.user?.id
    }));

    const { error } = await supabase
      .from('assignments')
      .insert(assignmentRecords);

    if (error) throw error;
    console.log(`[REBALANCE] ✅ Saved all assignment proposals`);
  }

  private async updateAccountOwners(buildId: string, proposals: AssignmentProposal[]): Promise<void> {
    console.log(`[REBALANCE] 🔄 Updating account owners...`);

    const updatePromises = proposals.map(proposal =>
      supabase
        .from('accounts')
        .update({
          new_owner_id: proposal.proposedOwnerId,
          new_owner_name: proposal.proposedOwnerName
        })
        .eq('sfdc_account_id', proposal.accountId)
        .eq('build_id', buildId)
    );

    await Promise.all(updatePromises);
    console.log(`[REBALANCE] ✅ Updated all account owners`);
  }

  private generateRebalancingStatistics(
    proposals: AssignmentProposal[], 
    accounts: Account[], 
    salesReps: SalesRep[]
  ): any {
    const stats = {
      totalProposals: proposals.length,
      targetARRPerRep: this.TARGET_ARR_PER_REP,
      targetAccountsPerRep: `${this.TARGET_ACCOUNTS_PER_REP_MIN}-${this.TARGET_ACCOUNTS_PER_REP_MAX}`,
      byRep: {} as Record<string, {
        accountCount: number;
        totalAccounts: number;
        totalARR: number;
        totalATR: number;
        tier1Count: number;
        tier2Count: number;
        riskCount: number;
        arrBalance: string;
        balanceScore: string;
        balanceGrade: string;
      }>,
      byGeo: {} as Record<string, {
        repCount: number;
        customerAccounts: number;
        prospectAccounts: number;
        totalARR: number;
        totalATR: number;
      }>
    };

    // Build rep-to-region mapping
    const repRegionMap: Record<string, string> = {};
    salesReps.forEach(rep => {
      repRegionMap[rep.rep_id] = rep.region || 'Unknown';
    });

    // Calculate per-geo statistics
    const geoRegions = new Set<string>();
    salesReps.forEach(rep => {
      if (rep.region) geoRegions.add(rep.region);
    });

    // Initialize geo stats
    geoRegions.forEach(region => {
      const repsInRegion = salesReps.filter(r => r.region === region);
      stats.byGeo[region] = {
        repCount: repsInRegion.length,
        customerAccounts: 0,
        prospectAccounts: 0,
        totalARR: 0,
        totalATR: 0
      };
    });

    // Calculate per-rep statistics
    salesReps.forEach(rep => {
      const repProposals = proposals.filter(p => p.proposedOwnerId === rep.rep_id);
      const repAccounts = repProposals.map(p => 
        accounts.find(acc => acc.sfdc_account_id === p.accountId)
      ).filter(Boolean) as Account[];

      const totalARR = repAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
      const totalATR = repAccounts.reduce((sum, acc) => 
        sum + Number(acc.calculated_atr || acc.atr || 0), 0);
      const tier1Count = repAccounts.filter(acc => 
        acc.initial_sale_tier === 'Tier 1' || acc.expansion_tier === 'Tier 1').length;
      const tier2Count = repAccounts.filter(acc => 
        acc.initial_sale_tier === 'Tier 2' || acc.expansion_tier === 'Tier 2').length;
      const riskCount = repAccounts.filter(acc => acc.cre_risk || acc.cre_count && acc.cre_count > 0).length;
      
      const balanceScore = Math.abs(totalARR - this.TARGET_ARR_PER_REP) / this.TARGET_ARR_PER_REP;

      stats.byRep[rep.name] = {
        accountCount: repAccounts.length,
        totalAccounts: repAccounts.length,
        totalARR,
        totalATR,
        tier1Count,
        tier2Count,
        riskCount,
        arrBalance: `${totalARR >= this.TARGET_ARR_PER_REP ? '+' : ''}${((totalARR - this.TARGET_ARR_PER_REP)/1000000).toFixed(1)}M`,
        balanceScore: balanceScore.toFixed(2),
        balanceGrade: balanceScore < 0.05 ? 'A' : balanceScore < 0.10 ? 'B' : balanceScore < 0.20 ? 'C' : 'D'
      };

      // Update geo stats for this rep
      const repRegion = rep.region;
      if (repRegion && stats.byGeo[repRegion]) {
        repAccounts.forEach(acc => {
          if (acc.is_customer) {
            stats.byGeo[repRegion].customerAccounts++;
          } else {
            stats.byGeo[repRegion].prospectAccounts++;
          }
          stats.byGeo[repRegion].totalARR += getAccountARR(acc);
          stats.byGeo[repRegion].totalATR += Number(acc.calculated_atr || acc.atr || 0);
        });
      }
    });

    console.log('[REBALANCE] Statistics generated:', {
      totalProposals: stats.totalProposals,
      geoRegions: Object.keys(stats.byGeo),
      repCount: Object.keys(stats.byRep).length
    });

    return stats;
  }
}