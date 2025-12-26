/**
 * Assignment Types
 * 
 * Shared types for assignment engine results and progress tracking.
 * These types are used by useAssignmentEngine.ts and AssignmentGenerationDialog.tsx.
 * 
 * NOTE: These are simpler than the types in assignmentService.ts which have
 * a more complex statistics structure. Do not merge them.
 */

// Re-export ParentalAlignmentWarning from its source
export type { ParentalAlignmentWarning } from '@/services/parentalAlignmentService';
import type { ParentalAlignmentWarning } from '@/services/parentalAlignmentService';
import type { AssignmentConfidence } from '@/_domain';

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
  /** How confident is the system in this assignment? Based on warning severity. @see MASTER_LOGIC.mdc §13.4.1 */
  confidence: AssignmentConfidence;
}

export interface AssignmentResult {
  totalAccounts: number;
  assignedAccounts: number;
  unassignedAccounts: number;
  proposals: AssignmentProposal[];
  conflicts: AssignmentProposal[];
  statistics: any;
  parentalAlignmentWarnings?: ParentalAlignmentWarning[];
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

