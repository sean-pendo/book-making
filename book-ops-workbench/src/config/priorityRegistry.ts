/**
 * Priority Registry
 * 
 * Defines all available assignment priorities with their metadata,
 * required fields, types (holdover vs optimization), and default positions per mode.
 */

export type AssignmentMode = 'ENT' | 'COMMERCIAL' | 'EMEA' | 'CUSTOM';

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

export interface PriorityDefinition {
  id: string;
  name: string;
  description: string;
  modes: Exclude<AssignmentMode, 'CUSTOM'>[]; // Which presets include this priority
  requiredFields: RequiredField[];
  type: PriorityType;
  defaultWeight: number; // 0-100, used in HiGHS objective function
  isLocked?: boolean; // If true, cannot be reordered or disabled
  cannotGoAbove?: string; // If set, this priority cannot be dragged above the specified priority ID
  defaultPosition: Partial<Record<Exclude<AssignmentMode, 'CUSTOM'>, number>>;
  subConditions?: SubCondition[]; // For expandable priorities like Stability Accounts
}

export interface SubConditionConfig {
  id: string;
  enabled: boolean;
}

export interface PriorityConfig {
  id: string;
  enabled: boolean;
  position: number;
  weight: number;
  subConditions?: SubConditionConfig[]; // For priorities with sub-conditions
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
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [],
    type: 'holdover',
    defaultWeight: 100,
    isLocked: true, // P0 - Always first, cannot be disabled or moved
    defaultPosition: { ENT: 0, COMMERCIAL: 0, EMEA: 0 }
  },
  
  // ========== P1: STABILITY ACCOUNTS (expandable sub-conditions) ==========
  {
    id: 'stability_accounts',
    name: 'Stability Accounts',
    description: 'Accounts meeting stability conditions stay with current owner',
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [], // No required fields - uses sub-conditions
    type: 'holdover',
    defaultWeight: 95,
    defaultPosition: { ENT: 1, COMMERCIAL: 1, EMEA: 1 },
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
        description: 'Accounts with renewal event date within 90 days stay with current owner',
        requiredFields: [{ table: 'opportunities', field: 'renewal_event_date' }],
        defaultEnabled: true
      },
      {
        id: 'top_10_arr',
        name: 'Top 10% ARR',
        description: 'Top 10% accounts by ARR within FLM hierarchy stay with current owner',
        requiredFields: [{ table: 'accounts', field: 'hierarchy_bookings_arr_converted' }],
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
        id: 'expansion_opps',
        name: 'Open Expansion Opps',
        description: 'Accounts with open expansion opportunities stay with current owner',
        requiredFields: [{ table: 'opportunities', field: 'type' }],
        defaultEnabled: true
      },
      {
        id: 'recent_owner_change',
        name: 'Recent Owner Change',
        description: 'Accounts that changed owner recently stay to minimize disruption',
        requiredFields: [{ table: 'accounts', field: 'owner_change_date' }],
        defaultEnabled: false // Off by default - optional
      }
    ]
  },
  
  // ========== P2+: OPTIMIZATION PRIORITIES ==========
  {
    id: 'geo_and_continuity',
    name: 'Geography + Continuity',
    description: 'Account stays with current owner if they match geography AND rep has capacity',
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [],
    type: 'optimization', // Changed to optimization - checks rep capacity
    defaultWeight: 90,
    defaultPosition: { ENT: 2, COMMERCIAL: 2, EMEA: 2 }
  },
  
  {
    id: 'geography',
    name: 'Geographic Match',
    description: 'Match account territory to rep region for regional alignment',
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [], // Core field always available
    type: 'optimization',
    defaultWeight: 75,
    cannotGoAbove: 'geo_and_continuity', // Cannot be positioned above the combined priority
    defaultPosition: { ENT: 3, COMMERCIAL: 4, EMEA: 3 }
  },
  
  {
    id: 'continuity',
    name: 'Account Continuity',
    description: 'Prefer keeping accounts with their current owner when balanced',
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [], // Core field always available
    type: 'optimization',
    defaultWeight: 65,
    cannotGoAbove: 'geo_and_continuity', // Cannot be positioned above the combined priority
    defaultPosition: { ENT: 4, COMMERCIAL: 5, EMEA: 4 }
  },
  
  {
    id: 'arr_balance',
    name: 'Next Best Reps',
    description: 'Assign to reps with most available capacity for balanced distribution',
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [], // No specific field required, always available
    type: 'optimization',
    defaultWeight: 60,
    defaultPosition: { ENT: 5, COMMERCIAL: 6, EMEA: 5 }
  },
  
  // ========== COMMERCIAL ONLY: RS ROUTING ==========
  {
    id: 'rs_routing',
    name: 'FLM Routing (≤$25k ARR)',
    description: 'Route accounts with ARR ≤$25k to the FLM (First Line Manager)',
    modes: ['COMMERCIAL'],
    requiredFields: [
      { table: 'accounts', field: 'hierarchy_bookings_arr_converted' }
    ],
    type: 'optimization',
    defaultWeight: 80,
    defaultPosition: { COMMERCIAL: 3 }
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
      weight: p.defaultWeight,
      subConditions: p.subConditions?.map(sc => ({
        id: sc.id,
        enabled: sc.defaultEnabled
      }))
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
