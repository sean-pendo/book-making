/**
 * Priority Registry
 * 
 * Defines all available assignment priorities with their metadata,
 * required fields, types (holdover vs optimization), and default positions per mode.
 * 
 * ⚠️ PARTIAL DEPRECATION NOTICE (2025-12-11):
 * 
 * STILL IN USE (for UI configuration displays):
 * - Type exports: AssignmentMode, PriorityConfig, PriorityDefinition, SubCondition
 * - Registry data: PRIORITY_REGISTRY, getPriorityById, getDefaultPriorityConfig
 * - Used by: WaterfallLogicExplainer, PriorityWaterfallConfig, FullAssignmentConfig, 
 *            AssignmentEngine page, modeDetectionService
 * 
 * NOT USED FOR ACTUAL EXECUTION:
 * - The priority definitions here are NOT used to drive assignment logic
 * - Actual assignment uses `simplifiedAssignmentEngine.ts` which has hardcoded priority levels
 * - This registry is primarily for UI display/configuration purposes
 * 
 * To align UI config with actual execution:
 * - Either connect this registry to simplifiedAssignmentEngine
 * - Or update UI components to reflect the hardcoded priority levels
 */

export type AssignmentMode = 'ENT' | 'COMMERCIAL' | 'EMEA' | 'APAC' | 'CUSTOM';

export type PriorityType = 'holdover' | 'optimization';

export interface RequiredField {
  table: 'accounts' | 'sales_reps' | 'opportunities';
  field: string;
}

/**
 * Sub-condition for expandable priorities like Stability Accounts
 */
export interface SubCondition {
  id: string;
  name: string;
  description: string;
  requiredFields: RequiredField[];
  defaultEnabled: boolean;
}

/**
 * Display configuration for priority badges in UI
 * Used by PriorityBadge component to render consistent badges across the app
 */
export interface PriorityDisplayConfig {
  /** Icon name to display in badge */
  icon: 'Shield' | 'Users' | 'Globe' | 'TrendingUp' | 'AlertTriangle';
  /** Tailwind color classes for the badge */
  colorClass: string;
  /** Short label to display in the badge */
  shortLabel: string;
  /** Keywords to match in ruleApplied/rationale strings (lowercase) */
  matchKeywords: string[];
}

export interface PriorityDefinition {
  id: string;
  name: string;
  description: string;
  modes: Exclude<AssignmentMode, 'CUSTOM'>[]; // Which presets include this priority
  requiredFields: RequiredField[];
  type: PriorityType;
  isLocked?: boolean; // If true, cannot be reordered or disabled
  cannotGoAbove?: string; // If set, this priority cannot be dragged above the specified priority ID
  defaultPosition: Partial<Record<Exclude<AssignmentMode, 'CUSTOM'>, number>>;
  subConditions?: SubCondition[]; // For expandable priorities like Stability Accounts
  displayConfig?: PriorityDisplayConfig; // For UI badge rendering
}

export interface SubConditionConfig {
  id: string;
  enabled: boolean;
}

export interface PriorityConfig {
  id: string;
  enabled: boolean;
  position: number;
  subConditions?: SubConditionConfig[]; // For priorities with sub-conditions
  settings?: Record<string, unknown>; // Priority-specific settings (e.g., team_alignment: { minTierMatchPct: 80 })
}

/**
 * All available priorities in the system.
 * 
 * Holdover priorities filter accounts BEFORE optimization runs.
 * Optimization priorities become constraints/weights in the HiGHS solver.
 */
export const PRIORITY_REGISTRY: PriorityDefinition[] = [
  // ========== P0: MANUAL HOLDOVER (locked) ==========
  {
    id: 'manual_holdover',
    name: 'Manual Holdover & Strategic Accounts',
    description: 'Excluded accounts stay put, strategic accounts stay with strategic reps',
    modes: ['ENT', 'COMMERCIAL', 'EMEA', 'APAC'],
    requiredFields: [],
    type: 'holdover',
    isLocked: true, // P0 - Always first, cannot be disabled or moved
    defaultPosition: { ENT: 0, COMMERCIAL: 0, EMEA: 0, APAC: 0 },
    displayConfig: {
      icon: 'Shield',
      colorClass: 'border-amber-500 text-amber-700',
      shortLabel: 'Protected',
      matchKeywords: ['manual holdover', 'manual', 'holdover', 'strategic', 'excluded']
    }
  },
  
  // ========== P1: SALES TOOLS BUCKET (Commercial only) ==========
  {
    id: 'sales_tools_bucket',
    name: 'Sales Tools Bucket',
    description: 'Route customer accounts under $25K ARR to Sales Tools (no SLM/FLM hierarchy)',
    modes: ['COMMERCIAL'],
    requiredFields: [{ table: 'accounts', field: 'hierarchy_bookings_arr_converted' }],
    type: 'holdover',
    defaultPosition: { COMMERCIAL: 1 },
    displayConfig: {
      icon: 'TrendingUp',
      colorClass: 'border-orange-500 text-orange-600',
      shortLabel: 'Sales Tools',
      matchKeywords: ['sales tools']
    }
  },
  
  // ========== P2: STABILITY ACCOUNTS (expandable sub-conditions) ==========
  {
    id: 'stability_accounts',
    name: 'Stability Accounts',
    description: 'Accounts meeting stability conditions stay with current owner',
    modes: ['ENT', 'COMMERCIAL', 'EMEA', 'APAC'],
    requiredFields: [], // No required fields - uses sub-conditions
    type: 'holdover',
    defaultPosition: { ENT: 1, COMMERCIAL: 2, EMEA: 1, APAC: 1 },
    subConditions: [
      {
        id: 'cre_risk',
        name: 'CRE Risk',
        description: 'At-risk accounts (CRE flagged) stay with current experienced owner',
        requiredFields: [{ table: 'accounts', field: 'cre_risk' }],
        defaultEnabled: true
      },
      {
        id: 'renewal_soon',
        name: 'Renewal Soon',
        description: 'Accounts with renewal date within 90 days stay with current owner',
        requiredFields: [{ table: 'accounts', field: 'renewal_date' }],
        defaultEnabled: true
      },
      {
        id: 'pe_firm',
        name: 'PE Firm',
        description: 'PE-owned accounts stay with majority owner',
        requiredFields: [{ table: 'accounts', field: 'pe_firm' }],
        defaultEnabled: true
      },
      {
        id: 'recent_owner_change',
        name: 'Recent Owner Change',
        description: 'Accounts that changed owner in last 90 days stay to minimize disruption',
        requiredFields: [{ table: 'accounts', field: 'owner_change_date' }],
        defaultEnabled: true
      }
    ],
    displayConfig: {
      icon: 'Shield',
      colorClass: 'border-amber-500 text-amber-700',
      shortLabel: 'Stable',
      matchKeywords: ['stability', 'stable account', 'cre', 'renewal soon', 'pe firm', 'recent change', 'backfill']
    }
  },
  
  // ========== P3: TEAM ALIGNMENT ==========
  {
    id: 'team_alignment',
    name: 'Team Alignment',
    description: 'Match account employee count to rep team tier (SMB/Growth/MM/ENT)',
    modes: ['COMMERCIAL', 'EMEA', 'APAC'],
    requiredFields: [
      { table: 'accounts', field: 'employees' },
      { table: 'sales_reps', field: 'team' }  // Uses 'team' field which contains tier values (SMB/Growth/MM/ENT)
    ],
    type: 'optimization',
    defaultPosition: { COMMERCIAL: 3, EMEA: 5, APAC: 5 },
    displayConfig: {
      icon: 'Users',
      colorClass: 'border-indigo-500 text-indigo-700',
      shortLabel: 'Team Fit',
      matchKeywords: ['team alignment']
    }
  },
  
  // ========== P4+: OPTIMIZATION PRIORITIES ==========
  {
    id: 'geo_and_continuity',
    name: 'Geography + Continuity',
    description: 'Account stays with current owner if they match geography AND rep has capacity',
    modes: ['ENT', 'COMMERCIAL', 'EMEA', 'APAC'],
    requiredFields: [],
    type: 'optimization',
    defaultPosition: { ENT: 2, COMMERCIAL: 4, EMEA: 2, APAC: 2 },
    displayConfig: {
      icon: 'Users',
      colorClass: 'border-green-500 text-green-700',
      shortLabel: 'Geo+Cont',
      matchKeywords: ['geography + continuity', 'continuity + geography', 'continuity + geo', 'geo_and_continuity']
    }
  },
  
  {
    id: 'continuity',
    name: 'Account Continuity',
    description: 'Prefer keeping accounts with their current owner when balanced',
    modes: ['ENT', 'COMMERCIAL', 'EMEA', 'APAC'],
    requiredFields: [],
    type: 'optimization',
    cannotGoAbove: 'geo_and_continuity',
    defaultPosition: { ENT: 3, COMMERCIAL: 5, EMEA: 3, APAC: 3 },
    displayConfig: {
      icon: 'Users',
      colorClass: 'border-purple-500 text-purple-700',
      shortLabel: 'Continuity',
      matchKeywords: ['account continuity', 'current/past owner']
    }
  },
  
  {
    id: 'geography',
    name: 'Geographic Match',
    description: 'Match account territory to rep region for regional alignment',
    modes: ['ENT', 'COMMERCIAL', 'EMEA', 'APAC'],
    requiredFields: [],
    type: 'optimization',
    cannotGoAbove: 'geo_and_continuity',
    defaultPosition: { ENT: 4, COMMERCIAL: 6, EMEA: 4, APAC: 4 },
    displayConfig: {
      icon: 'Globe',
      colorClass: 'border-blue-500 text-blue-700',
      shortLabel: 'Geography',
      matchKeywords: ['geographic match', 'geography match']
    }
  },
  
  {
    id: 'arr_balance',
    name: 'Residual Optimization',
    description: 'Final stage: assigns remaining accounts using multi-metric balancing',
    modes: ['ENT', 'COMMERCIAL', 'EMEA', 'APAC'],
    requiredFields: [],
    type: 'optimization',
    isLocked: true,
    defaultPosition: { ENT: 5, COMMERCIAL: 7, EMEA: 6, APAC: 6 },
    displayConfig: {
      icon: 'TrendingUp',
      colorClass: 'border-cyan-500 text-cyan-700',
      shortLabel: 'Balance',
      matchKeywords: ['residual', 'best available', 'arr balance', 'force assignment', 'forced']
    }
  }
];

/**
 * Get ALL priorities for CUSTOM mode display
 * Shows all possible priorities regardless of mode
 */
export function getAllPriorities(): PriorityDefinition[] {
  return PRIORITY_REGISTRY;
}

/**
 * Get the default priority configuration for a given mode
 */
export function getDefaultPriorityConfig(mode: Exclude<AssignmentMode, 'CUSTOM'>): PriorityConfig[] {
  return PRIORITY_REGISTRY
    .filter(p => p.modes.includes(mode))
    .map(p => ({
      id: p.id,
      enabled: true,
      position: p.defaultPosition[mode] ?? 999,
      subConditions: p.subConditions?.map(sc => ({
        id: sc.id,
        enabled: sc.defaultEnabled
      })),
      // Add default settings for team_alignment
      settings: p.id === 'team_alignment' ? { minTierMatchPct: 80 } : undefined
    }))
    .sort((a, b) => a.position - b.position);
}

/**
 * Get priorities available for a mode based on mapped fields
 * For CUSTOM mode, returns ALL priorities with availability info
 */
export function getAvailablePriorities(
  mode: AssignmentMode,
  mappedFields: {
    accounts: Set<string>;
    sales_reps: Set<string>;
    opportunities: Set<string>;
  }
): { available: PriorityDefinition[]; unavailable: PriorityDefinition[] } {
  // For CUSTOM mode, show all priorities
  const priorities = mode === 'CUSTOM' 
    ? PRIORITY_REGISTRY 
    : PRIORITY_REGISTRY.filter(p => p.modes.includes(mode as Exclude<AssignmentMode, 'CUSTOM'>));
  
  const available: PriorityDefinition[] = [];
  const unavailable: PriorityDefinition[] = [];
  
  for (const priority of priorities) {
    // For priorities with sub-conditions, check if at least one sub-condition has data
    if (priority.subConditions && priority.subConditions.length > 0) {
      const hasAnySubConditionData = priority.subConditions.some(sc => 
        sc.requiredFields.length === 0 || 
        sc.requiredFields.every(rf => mappedFields[rf.table]?.has(rf.field))
      );
      
      if (hasAnySubConditionData) {
        available.push(priority);
      } else {
        unavailable.push(priority);
      }
    } else {
      // Regular priority - check required fields
      const hasAllFields = priority.requiredFields.every(rf => {
        const fieldSet = mappedFields[rf.table];
        return fieldSet?.has(rf.field);
      });
      
      if (hasAllFields || priority.requiredFields.length === 0) {
        available.push(priority);
      } else {
        unavailable.push(priority);
      }
    }
  }
  
  return { available, unavailable };
}

/**
 * Get available sub-conditions for a priority based on mapped fields
 */
export function getAvailableSubConditions(
  priority: PriorityDefinition,
  mappedFields: {
    accounts: Set<string>;
    sales_reps: Set<string>;
    opportunities: Set<string>;
  }
): { available: SubCondition[]; unavailable: SubCondition[] } {
  if (!priority.subConditions) {
    return { available: [], unavailable: [] };
  }
  
  const available: SubCondition[] = [];
  const unavailable: SubCondition[] = [];
  
  for (const sc of priority.subConditions) {
    const hasAllFields = sc.requiredFields.every(rf => {
      const fieldSet = mappedFields[rf.table];
      return fieldSet?.has(rf.field);
    });
    
    if (hasAllFields || sc.requiredFields.length === 0) {
      available.push(sc);
    } else {
      unavailable.push(sc);
    }
  }
  
  return { available, unavailable };
}

/**
 * Get a priority definition by ID
 */
export function getPriorityById(id: string): PriorityDefinition | undefined {
  return PRIORITY_REGISTRY.find(p => p.id === id);
}

/**
 * Get all holdover priorities from a config
 */
export function getHoldoverPriorities(config: PriorityConfig[]): PriorityConfig[] {
  return config.filter(c => {
    const def = getPriorityById(c.id);
    return def?.type === 'holdover' && c.enabled;
  });
}

/**
 * Get all optimization priorities from a config
 */
export function getOptimizationPriorities(config: PriorityConfig[]): PriorityConfig[] {
  return config.filter(c => {
    const def = getPriorityById(c.id);
    return def?.type === 'optimization' && c.enabled;
  });
}

/**
 * Validate a priority config and return any issues
 */
export function validatePriorityConfig(config: PriorityConfig[]): string[] {
  const issues: string[] = [];
  
  // Check that manual_holdover is present and enabled (it's locked)
  const manualHoldover = config.find(c => c.id === 'manual_holdover');
  if (!manualHoldover || !manualHoldover.enabled) {
    issues.push('Manual Holdover priority must be enabled');
  }
  
  // Check for duplicate positions among enabled priorities
  const enabledPositions = config.filter(c => c.enabled).map(c => c.position);
  const uniquePositions = new Set(enabledPositions);
  if (enabledPositions.length !== uniquePositions.size) {
    issues.push('Priority positions must be unique');
  }
  
  return issues;
}
