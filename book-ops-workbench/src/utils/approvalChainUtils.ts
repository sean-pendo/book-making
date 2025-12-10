/**
 * Approval Chain Utilities
 * 
 * Defines the approval workflow for manager reassignments.
 * EMEA builds skip SLM approval (no SLMs in EMEA structure).
 */

export type ApprovalStatus = 
  | 'pending_flm'
  | 'pending_slm' 
  | 'pending_revops' 
  | 'approved' 
  | 'rejected';

/**
 * Get the approval steps for a given region
 * EMEA skips SLM step, others include full chain
 */
export function getApprovalStepsForRegion(buildRegion: string | null): ApprovalStatus[] {
  if (buildRegion?.toUpperCase() === 'EMEA') {
    // EMEA has no SLMs - skip SLM approval step
    return ['pending_flm', 'pending_revops', 'approved'];
  }
  
  // Standard approval chain (AMER, GLOBAL, etc.)
  return ['pending_slm', 'pending_revops', 'approved'];
}

/**
 * Get the initial approval status for a reassignment
 */
export function getInitialApprovalStatus(buildRegion: string | null): ApprovalStatus {
  const steps = getApprovalStepsForRegion(buildRegion);
  return steps[0];
}

/**
 * Get the next approval status after the current one
 */
export function getNextApprovalStatus(
  currentStatus: ApprovalStatus,
  buildRegion: string | null
): ApprovalStatus | null {
  const steps = getApprovalStepsForRegion(buildRegion);
  const currentIndex = steps.indexOf(currentStatus);
  
  if (currentIndex === -1 || currentIndex >= steps.length - 1) {
    return null;
  }
  
  return steps[currentIndex + 1];
}

/**
 * Check if a status requires SLM approval (not applicable for EMEA)
 */
export function requiresSLMApproval(buildRegion: string | null): boolean {
  return buildRegion?.toUpperCase() !== 'EMEA';
}

/**
 * Get human-readable label for approval status
 */
export function getApprovalStatusLabel(status: ApprovalStatus): string {
  switch (status) {
    case 'pending_flm':
      return 'Pending FLM Approval';
    case 'pending_slm':
      return 'Pending SLM Approval';
    case 'pending_revops':
      return 'Pending RevOps Approval';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}

/**
 * Get the approval chain description for a region
 */
export function getApprovalChainDescription(buildRegion: string | null): string {
  if (buildRegion?.toUpperCase() === 'EMEA') {
    return 'FLM → RevOps → Approved (EMEA has no SLM step)';
  }
  return 'SLM → RevOps → Approved';
}

