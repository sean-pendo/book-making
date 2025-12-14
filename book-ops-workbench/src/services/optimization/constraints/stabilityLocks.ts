/**
 * Stability Locks
 * 
 * Identifies accounts that should be locked to their current owner (or backfill target).
 * These become hard constraints in the LP.
 * 
 * Lock types (in priority order):
 * 1. Manual lock (exclude_from_reassignment = true)
 * 2. Backfill migration (owner is leaving, migrate to replacement)
 * 3. CRE risk (at-risk accounts stay with experienced owner)
 * 4. Renewal soon (renewing within X days)
 * 5. PE firm (PE-owned accounts stay aligned)
 * 6. Recent change (recently changed owner, minimize disruption)
 */

import type { 
  AggregatedAccount, 
  EligibleRep, 
  LPStabilityConfig, 
  StabilityLockResult 
} from '../types';

/**
 * Check if an account should be locked
 */
export function checkStabilityLock(
  account: AggregatedAccount,
  reps: EligibleRep[],
  config: LPStabilityConfig
): StabilityLockResult {
  const noLock: StabilityLockResult = {
    isLocked: false,
    lockType: null,
    targetRepId: null,
    reason: null
  };
  
  // Find current owner in eligible reps
  const currentOwner = reps.find(r => r.rep_id === account.owner_id);
  
  // Check manual lock first (exclude_from_reassignment)
  if (account.exclude_from_reassignment) {
    if (currentOwner) {
      return {
        isLocked: true,
        lockType: 'manual_lock',
        targetRepId: currentOwner.rep_id,
        reason: 'Manually excluded from reassignment'
      };
    }
    // No eligible owner → can't lock, will be assigned by optimization
  }
  
  // Must have eligible current owner for other locks
  if (!currentOwner) {
    return noLock;
  }
  
  // Check backfill migration FIRST (takes precedence)
  if (config.backfill_migration_enabled && currentOwner.is_backfill_source) {
    const targetRep = reps.find(r => r.rep_id === currentOwner.backfill_target_rep_id);
    if (targetRep) {
      return {
        isLocked: true,
        lockType: 'backfill_migration',
        targetRepId: targetRep.rep_id,
        reason: `Owner ${currentOwner.name} is leaving, migrating to ${targetRep.name}`
      };
    }
    // No valid backfill target → account enters normal optimization
    // (don't lock to leaving rep)
    return noLock;
  }
  
  // CRE Risk
  if (config.cre_risk_locked && account.cre_risk) {
    return {
      isLocked: true,
      lockType: 'cre_risk',
      targetRepId: currentOwner.rep_id,
      reason: 'CRE at-risk account - relationship stability'
    };
  }
  
  // Renewal Soon
  if (config.renewal_soon_locked && account.renewal_date) {
    const renewalDate = new Date(account.renewal_date);
    const now = new Date();
    const daysUntilRenewal = Math.floor(
      (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysUntilRenewal >= 0 && daysUntilRenewal <= config.renewal_soon_days) {
      return {
        isLocked: true,
        lockType: 'renewal_soon',
        targetRepId: currentOwner.rep_id,
        reason: `Renewal in ${daysUntilRenewal} days`
      };
    }
  }
  
  // PE Firm
  if (config.pe_firm_locked && account.pe_firm) {
    return {
      isLocked: true,
      lockType: 'pe_firm',
      targetRepId: currentOwner.rep_id,
      reason: `PE firm: ${account.pe_firm}`
    };
  }
  
  // Recent Change
  if (config.recent_change_locked && account.owner_change_date) {
    const changeDate = new Date(account.owner_change_date);
    const now = new Date();
    const daysSinceChange = Math.floor(
      (now.getTime() - changeDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceChange >= 0 && daysSinceChange <= config.recent_change_days) {
      return {
        isLocked: true,
        lockType: 'recent_change',
        targetRepId: currentOwner.rep_id,
        reason: `Owner changed ${daysSinceChange} days ago`
      };
    }
  }
  
  return noLock;
}

/**
 * Process all accounts and return locked vs unlocked
 */
export function identifyLockedAccounts(
  accounts: AggregatedAccount[],
  reps: EligibleRep[],
  config: LPStabilityConfig
): {
  lockedAccounts: Array<{ account: AggregatedAccount; lock: StabilityLockResult }>;
  unlockedAccounts: AggregatedAccount[];
  lockStats: Record<string, number>;
} {
  const lockedAccounts: Array<{ account: AggregatedAccount; lock: StabilityLockResult }> = [];
  const unlockedAccounts: AggregatedAccount[] = [];
  const lockStats: Record<string, number> = {
    manual_lock: 0,
    backfill_migration: 0,
    cre_risk: 0,
    renewal_soon: 0,
    pe_firm: 0,
    recent_change: 0
  };
  
  for (const account of accounts) {
    const lock = checkStabilityLock(account, reps, config);
    
    if (lock.isLocked && lock.lockType) {
      lockedAccounts.push({ account, lock });
      lockStats[lock.lockType] = (lockStats[lock.lockType] || 0) + 1;
    } else {
      unlockedAccounts.push(account);
    }
  }
  
  console.log(`[StabilityLocks] Locked: ${lockedAccounts.length}, Unlocked: ${unlockedAccounts.length}`);
  console.log(`[StabilityLocks] By type:`, lockStats);
  
  return { lockedAccounts, unlockedAccounts, lockStats };
}

