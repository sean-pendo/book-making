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
}

export interface PriorityConfig {
  id: string;
  enabled: boolean;
  position: number;
  weight: number;
}

/**
 * All available priorities in the system.
 * 
 * Holdover priorities filter accounts BEFORE optimization runs.
 * Optimization priorities become constraints/weights in the HiGHS solver.
 */
export const PRIORITY_REGISTRY: PriorityDefinition[] = [
  // ========== HOLDOVER PRIORITIES (filter before optimization) ==========
  
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
  
  {
    id: 'cre_risk',
    name: 'CRE Risk Protection',
    description: 'At-risk accounts (CRE flagged) stay with current experienced owner',
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [{ table: 'accounts', field: 'cre_risk' }],
    type: 'holdover',
    defaultWeight: 95,
    defaultPosition: { ENT: 1, COMMERCIAL: 1, EMEA: 1 }
  },
  
  {
    id: 'geo_and_continuity',
    name: 'Geography + Continuity',
    description: 'Account stays with current owner if they match geography AND rep has capacity',
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [],
    type: 'holdover',
    defaultWeight: 90,
    isLocked: true, // P2 - Geography/Continuity components cannot go above this
    defaultPosition: { ENT: 2, COMMERCIAL: 2, EMEA: 2 }
  },
  
  {
    id: 'pe_firm',
    name: 'PE Firm Protection',
    description: 'PE-owned accounts stay with designated AE, never routed to Renewal Specialists',
    modes: ['COMMERCIAL'],
    requiredFields: [{ table: 'accounts', field: 'pe_firm' }],
    type: 'holdover',
    defaultWeight: 95,
    defaultPosition: { COMMERCIAL: 2 }
  },
  
  {
    id: 'top_10_percent',
    name: 'Top 10% ARR Carve-out',
    description: 'Top 10% accounts by ARR stay with AE, not routed to Renewal Specialists',
    modes: ['COMMERCIAL'],
    requiredFields: [{ table: 'accounts', field: 'hierarchy_bookings_arr_converted' }],
    type: 'holdover',
    defaultWeight: 90,
    defaultPosition: { COMMERCIAL: 3 }
  },
  
  // ========== OPTIMIZATION PRIORITIES (constraints/weights in HiGHS) ==========
  
  {
    id: 'rs_routing',
    name: 'Renewal Specialist Routing',
    description: 'Route accounts with ARR <= threshold to Renewal Specialist reps',
    modes: ['COMMERCIAL'],
    requiredFields: [
      { table: 'accounts', field: 'hierarchy_bookings_arr_converted' },
      { table: 'sales_reps', field: 'is_renewal_specialist' }
    ],
    type: 'optimization',
    defaultWeight: 80,
    defaultPosition: { COMMERCIAL: 5 }
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
    defaultPosition: { ENT: 3, COMMERCIAL: 6, EMEA: 3 }
  },
  
  {
    id: 'sub_region',
    name: 'EMEA Sub-Region Routing',
    description: 'Route accounts to DACH, UKI, Nordics, France, Benelux, or Middle East teams',
    modes: ['EMEA'],
    requiredFields: [
      { table: 'accounts', field: 'hq_country' },
      { table: 'sales_reps', field: 'sub_region' }
    ],
    type: 'optimization',
    defaultWeight: 70,
    defaultPosition: { EMEA: 4 }
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
    defaultPosition: { ENT: 4, COMMERCIAL: 7, EMEA: 5 }
  },
  
  {
    id: 'renewal_balance',
    name: 'Renewal Quarter Balance',
    description: 'Distribute renewals evenly across Q1/Q2/Q3/Q4 per rep',
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [{ table: 'accounts', field: 'renewal_quarter' }],
    type: 'optimization',
    defaultWeight: 50,
    defaultPosition: { ENT: 5, COMMERCIAL: 8, EMEA: 6 }
  },
  
  {
    id: 'arr_balance',
    name: 'ARR Workload Balance',
    description: 'Even distribution of ARR across all reps to meet targets',
    modes: ['ENT', 'COMMERCIAL', 'EMEA'],
    requiredFields: [], // No specific field required, always available
    type: 'optimization',
    defaultWeight: 60,
    defaultPosition: { ENT: 6, COMMERCIAL: 9, EMEA: 7 }
  }
];

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
      weight: p.defaultWeight
    }))
    .sort((a, b) => a.position - b.position);
}

/**
 * Get priorities available for a mode based on mapped fields
 */
export function getAvailablePriorities(
  mode: Exclude<AssignmentMode, 'CUSTOM'>,
  mappedFields: {
    accounts: Set<string>;
    sales_reps: Set<string>;
    opportunities: Set<string>;
  }
): { available: PriorityDefinition[]; unavailable: PriorityDefinition[] } {
  const modePriorities = PRIORITY_REGISTRY.filter(p => p.modes.includes(mode));
  
  const available: PriorityDefinition[] = [];
  const unavailable: PriorityDefinition[] = [];
  
  for (const priority of modePriorities) {
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
  
  // Check for duplicate positions
  const positions = config.map(c => c.position);
  const uniquePositions = new Set(positions);
  if (positions.length !== uniquePositions.size) {
    issues.push('Priority positions must be unique');
  }
  
  return issues;
}

