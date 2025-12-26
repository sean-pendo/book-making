import React, { useState, useEffect, useMemo } from 'react';
import { getAccountARR, getAccountATR, formatCurrency, HIERARCHY_WARNING_TYPES, RepBookAccountData } from '@/_domain';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, UserCheck, Search, Users, GitBranch, Lock, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useInvalidateAnalytics } from '@/hooks/useInvalidateAnalytics';
import { useRepMetricsWithDelta } from '@/hooks/useRepMetrics';
import { ReassignmentImpactPanel } from '@/components/ReassignmentImpactPanel';
import { 
  getHierarchyInfo, 
  cascadeToChildren, 
  getHierarchyTotalARR 
} from '@/services/assignmentServiceHelpers';

/**
 * Account interface for the dialog
 * Supports both full Account objects and minimal AccountDetail from various sources
 */
interface Account {
  sfdc_account_id: string;
  account_name: string;
  is_parent?: boolean;
  is_customer?: boolean;
  owner_id?: string | null;
  owner_name?: string | null;
  new_owner_id?: string | null;
  new_owner_name?: string | null;
  ultimate_parent_id?: string | null;
  ultimate_parent_name?: string | null;
  child_count?: number;
  arr?: number | null;
  calculated_arr?: number | null;
  hierarchy_bookings_arr_converted?: number | null;
}

interface Rep {
  rep_id: string;
  name: string;
  team?: string;
  region?: string;
}

interface HierarchyAwareReassignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  buildId: string;
  availableReps?: Rep[];
  onSuccess?: () => void;
}

/**
 * HierarchyAwareReassignDialog
 * 
 * A comprehensive reassignment dialog that handles:
 * - Parent accounts (with cascade to children)
 * - Child accounts (with option to split or move with parent)
 * - Standalone accounts (simple reassignment)
 * 
 * Defaults to keeping hierarchies together and shows warnings
 * with "Hierarchy Split" terminology when breaking.
 * 
 * @see MASTER_LOGIC.mdc §13.4.2
 */
export const HierarchyAwareReassignDialog = ({
  open,
  onOpenChange,
  account,
  buildId,
  availableReps = [],
  onSuccess
}: HierarchyAwareReassignDialogProps) => {
  // Form state
  const [rationale, setRationale] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Confirmation dialogs
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSplitWarning, setShowSplitWarning] = useState(false);
  const [showLockOverrideWarning, setShowLockOverrideWarning] = useState(false);
  
  // Hierarchy state
  const [hierarchyInfo, setHierarchyInfo] = useState<Awaited<ReturnType<typeof getHierarchyInfo>> | null>(null);
  const [hierarchyTotalARR, setHierarchyTotalARR] = useState<number>(0);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(false);
  
  // Toggle state - defaults to keeping hierarchy together
  const [includeChildren, setIncludeChildren] = useState(true); // For parents: include children
  const [moveOnlyThis, setMoveOnlyThis] = useState(false); // For children: move only this account
  const [overrideLocks, setOverrideLocks] = useState(false); // Override locked children
  
  // Child accounts data (for calculating impact metrics)
  const [childAccountsData, setChildAccountsData] = useState<RepBookAccountData[]>([]);
  
  const invalidateAnalytics = useInvalidateAnalytics();

  // Reset state when dialog opens/closes or account changes
  useEffect(() => {
    if (open && account) {
      setRationale('');
      setNewOwnerId('');
      setSearchTerm('');
      setIncludeChildren(true);
      setMoveOnlyThis(false);
      setOverrideLocks(false);
      setShowConfirmation(false);
      setShowSplitWarning(false);
      setShowLockOverrideWarning(false);
      
      // Fetch hierarchy info
      fetchHierarchyInfo();
    }
  }, [open, account?.sfdc_account_id]);

  const fetchHierarchyInfo = async () => {
    if (!account) return;
    
    setIsLoadingHierarchy(true);
    try {
      const info = await getHierarchyInfo(account.sfdc_account_id, buildId);
      setHierarchyInfo(info);
      
      // Fetch total ARR if parent with children
      if (info.isParent && !info.isStandalone) {
        const totalARR = await getHierarchyTotalARR(account.sfdc_account_id, buildId);
        setHierarchyTotalARR(totalARR);
        
        // Fetch child accounts data for impact metrics
        const { data: children } = await supabase
          .from('accounts')
          .select('sfdc_account_id, is_customer, arr, calculated_arr, hierarchy_bookings_arr_converted, calculated_atr, atr, expansion_tier, initial_sale_tier, cre_count, pipeline_value, exclude_from_reassignment')
          .eq('build_id', buildId)
          .eq('ultimate_parent_id', account.sfdc_account_id);
        
        setChildAccountsData((children || []) as RepBookAccountData[]);
      } else {
        setHierarchyTotalARR(getAccountARR(account));
        setChildAccountsData([]);
      }
    } catch (error) {
      console.error('Error fetching hierarchy info:', error);
      setHierarchyInfo(null);
      setChildAccountsData([]);
    } finally {
      setIsLoadingHierarchy(false);
    }
  };

  // Determine account type
  const isParent = hierarchyInfo?.isParent ?? (account?.is_parent || !account?.ultimate_parent_id);
  const isChild = hierarchyInfo?.isChild ?? !!account?.ultimate_parent_id;
  const isStandalone = hierarchyInfo?.isStandalone ?? (isParent && (!account?.child_count || account.child_count === 0));
  const hasLockedChildren = (hierarchyInfo?.lockedChildCount ?? 0) > 0;

  // Will this action create a hierarchy split?
  const willCreateSplit = isChild ? moveOnlyThis : (isParent && !isStandalone && !includeChildren);

  // Calculate number of accounts affected
  const accountsAffectedCount = useMemo(() => {
    if (isStandalone || willCreateSplit || (isChild && moveOnlyThis)) {
      return 1;
    }
    const childCount = hierarchyInfo?.childCount || 0;
    const lockedToExclude = overrideLocks ? 0 : (hierarchyInfo?.lockedChildCount || 0);
    return 1 + childCount - lockedToExclude;
  }, [isStandalone, willCreateSplit, isChild, moveOnlyThis, hierarchyInfo, overrideLocks]);

  // Build the list of accounts being moved for impact calculation
  const accountsBeingMoved: RepBookAccountData[] = useMemo(() => {
    if (!account) return [];
    
    // Convert main account to RepBookAccountData format
    const mainAccount: RepBookAccountData = {
      ...account,
      expansion_tier: (account as any).expansion_tier,
      initial_sale_tier: (account as any).initial_sale_tier,
      cre_count: (account as any).cre_count,
      pipeline_value: (account as any).pipeline_value,
    };
    
    // Single account scenarios
    if (isStandalone || willCreateSplit || (isChild && moveOnlyThis)) {
      return [mainAccount];
    }
    
    // Parent with children - include non-locked children
    if (isParent && includeChildren && childAccountsData.length > 0) {
      const eligibleChildren = overrideLocks
        ? childAccountsData
        : childAccountsData.filter(c => !c.exclude_from_reassignment);
      return [mainAccount, ...eligibleChildren];
    }
    
    return [mainAccount];
  }, [account, isStandalone, willCreateSplit, isChild, moveOnlyThis, isParent, includeChildren, childAccountsData, overrideLocks]);

  // Get current owner info for metrics lookup
  const currentOwnerId = account?.new_owner_id || account?.owner_id || null;
  const selectedRep = availableReps.find(r => r.rep_id === newOwnerId);

  // Fetch metrics for losing and gaining reps
  const {
    currentMetrics: losingRepCurrent,
    projectedMetrics: losingRepProjected,
    isLoading: isLoadingLosingMetrics,
  } = useRepMetricsWithDelta(currentOwnerId, buildId, accountsBeingMoved, false);

  const {
    currentMetrics: gainingRepCurrent,
    projectedMetrics: gainingRepProjected,
    isLoading: isLoadingGainingMetrics,
  } = useRepMetricsWithDelta(newOwnerId || null, buildId, accountsBeingMoved, true);

  const handleProceed = () => {
    // Determine which confirmation to show
    if (overrideLocks && hasLockedChildren) {
      setShowLockOverrideWarning(true);
    } else if (willCreateSplit) {
      setShowSplitWarning(true);
    } else {
      setShowConfirmation(true);
    }
  };

  const handleConfirmedReassignment = async () => {
    if (!account || !newOwnerId) return;

    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const selectedRep = availableReps.find(r => r.rep_id === newOwnerId);
      
      if (!selectedRep) {
        toast({
          title: "Invalid Selection",
          description: "Selected owner is not valid",
          variant: "destructive",
        });
        return;
      }

      const previousOwnerId = account.new_owner_id || account.owner_id;
      let childrenUpdated = 0;
      let auditAction = 'manual_reassignment';

      // Handle different scenarios
      if (isChild && !moveOnlyThis) {
        // Child moving with parent - need to update entire hierarchy
        // First, update the parent
        if (hierarchyInfo?.parentInfo) {
          const { error: parentError } = await supabase
            .from('accounts')
            .update({
              new_owner_id: newOwnerId,
              new_owner_name: selectedRep.name,
            })
            .eq('sfdc_account_id', hierarchyInfo.parentInfo.sfdc_account_id)
            .eq('build_id', buildId);
          
          if (parentError) throw parentError;
          
          // Cascade to all children (including this one)
          childrenUpdated = await cascadeToChildren(
            hierarchyInfo.parentInfo.sfdc_account_id,
            newOwnerId,
            selectedRep.name,
            buildId,
            overrideLocks
          );
          auditAction = 'hierarchy_reassignment';
        }
      } else if (isParent && !isStandalone && includeChildren) {
        // Parent with cascade to children
        const { error: parentError } = await supabase
          .from('accounts')
          .update({
            new_owner_id: newOwnerId,
            new_owner_name: selectedRep.name,
          })
          .eq('sfdc_account_id', account.sfdc_account_id)
          .eq('build_id', buildId);
        
        if (parentError) throw parentError;
        
        childrenUpdated = await cascadeToChildren(
          account.sfdc_account_id,
          newOwnerId,
          selectedRep.name,
          buildId,
          overrideLocks
        );
        auditAction = 'hierarchy_reassignment';
      } else {
        // Single account update (standalone, or split scenario)
        const { error: updateError } = await supabase
          .from('accounts')
          .update({
            new_owner_id: newOwnerId,
            new_owner_name: selectedRep.name,
            previous_owner_id: previousOwnerId
          })
          .eq('sfdc_account_id', account.sfdc_account_id)
          .eq('build_id', buildId);

        if (updateError) throw updateError;
        
        // If this creates a split, mark split ownership
        if (willCreateSplit) {
          await supabase.rpc('mark_split_ownership', { p_build_id: buildId });
          auditAction = 'hierarchy_split';
        }
      }

      // Log the change in audit_log
      const warningTypes = [];
      if (willCreateSplit) warningTypes.push(HIERARCHY_WARNING_TYPES.HIERARCHY_SPLIT.type);
      if (overrideLocks && hasLockedChildren) warningTypes.push(HIERARCHY_WARNING_TYPES.LOCK_OVERRIDE.type);

      const { error: auditError } = await supabase
        .from('audit_log')
        .insert({
          build_id: buildId,
          table_name: 'accounts',
          record_id: account.sfdc_account_id,
          action: auditAction,
          old_values: {
            owner_id: account.owner_id,
            owner_name: account.owner_name,
            new_owner_id: account.new_owner_id,
            new_owner_name: account.new_owner_name
          },
          new_values: {
            new_owner_id: newOwnerId,
            new_owner_name: selectedRep.name,
            children_updated: childrenUpdated,
            warnings: warningTypes
          },
          rationale: `MANUAL_REASSIGNMENT: ${rationale || `Account reassigned to ${selectedRep.name}`}`,
          created_by: userData.user?.id
        });

      if (auditError) console.error('Audit log error:', auditError);

      // Trigger recalculation of account values
      await supabase.rpc('update_account_calculated_values', { p_build_id: buildId });

      // Invalidate analytics queries
      await invalidateAnalytics(buildId);

      // Success message
      const accountsAffected = 1 + childrenUpdated;
      toast({
        title: "Success",
        description: accountsAffected > 1 
          ? `${account.account_name} and ${childrenUpdated} child account${childrenUpdated !== 1 ? 's' : ''} reassigned to ${selectedRep.name}.`
          : `${account.account_name} reassigned to ${selectedRep.name}.`,
      });

      // Reset and close
      setRationale('');
      setNewOwnerId('');
      setShowConfirmation(false);
      setShowSplitWarning(false);
      setShowLockOverrideWarning(false);
      onOpenChange(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error reassigning account:', error);
      toast({
        title: "Error",
        description: "Failed to reassign account",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredReps = availableReps.filter(rep =>
    rep.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    rep.rep_id !== (account?.new_owner_id || account?.owner_id)
  );

  const selectedRepName = availableReps.find(r => r.rep_id === newOwnerId)?.name;

  if (!account) return null;

  const accountARR = getAccountARR(account);
  const displayARR = isParent && !isStandalone && includeChildren ? hierarchyTotalARR : accountARR;

  return (
    <>
      {/* Main Dialog */}
      <Dialog open={open && !showConfirmation && !showSplitWarning && !showLockOverrideWarning} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Reassign Account
            </DialogTitle>
            <DialogDescription>
              {isStandalone && "Assign a new owner to this account."}
              {isParent && !isStandalone && "Reassign this parent account and optionally its children."}
              {isChild && "Reassign this child account or its entire hierarchy."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Account Info Card */}
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {isParent && !isStandalone && <Users className="h-4 w-4 text-muted-foreground" />}
                    {isChild && <GitBranch className="h-4 w-4 text-muted-foreground" />}
                    <p className="text-sm font-medium text-muted-foreground">
                      {isStandalone ? 'Account' : isParent ? 'Parent Account' : 'Child Account'}
                    </p>
                  </div>
                  <p className="text-lg font-semibold">{account.account_name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    ARR: {formatCurrency(accountARR)}
                  </p>
                </div>
                <Badge variant={account.is_customer ? "default" : "outline"}>
                  {account.is_customer ? 'Customer' : 'Prospect'}
                </Badge>
              </div>
              
              {/* Hierarchy Info */}
              {!isLoadingHierarchy && hierarchyInfo && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  {isChild && hierarchyInfo.parentInfo && (
                    <div>
                      <p className="text-sm text-muted-foreground">Parent Account</p>
                      <p className="font-medium">{hierarchyInfo.parentInfo.account_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Current Owner: {hierarchyInfo.parentInfo.owner_name || 'Unassigned'}
                      </p>
                    </div>
                  )}
                  {isParent && !isStandalone && (
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Child Accounts</p>
                        <p className="font-medium">{hierarchyInfo.childCount}</p>
                      </div>
                      {hasLockedChildren && (
                        <div className="flex items-center gap-1 text-amber-600">
                          <Lock className="h-4 w-4" />
                          <span className="text-sm">{hierarchyInfo.lockedChildCount} locked</span>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Total Hierarchy ARR</p>
                        <p className="font-medium">{formatCurrency(hierarchyTotalARR)}</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Current Owner</p>
                    <p className="font-medium">{account.owner_name || 'Unassigned'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Hierarchy Options - Only show for non-standalone accounts */}
            {!isStandalone && (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <GitBranch className="h-4 w-4" />
                  Hierarchy Options
                </div>

                {isParent && (
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="include-children">Include all child accounts</Label>
                      <p className="text-sm text-muted-foreground">
                        Move parent and {hierarchyInfo?.childCount || 0} children together
                      </p>
                    </div>
                    <Switch
                      id="include-children"
                      checked={includeChildren}
                      onCheckedChange={setIncludeChildren}
                    />
                  </div>
                )}

                {isChild && (
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="move-only-this">Move this account only</Label>
                      <p className="text-sm text-muted-foreground">
                        Separate from parent hierarchy (creates split)
                      </p>
                    </div>
                    <Switch
                      id="move-only-this"
                      checked={moveOnlyThis}
                      onCheckedChange={setMoveOnlyThis}
                    />
                  </div>
                )}

                {/* Locked children override - only show for parents with locked children */}
                {isParent && hasLockedChildren && includeChildren && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="space-y-0.5">
                      <Label htmlFor="override-locks" className="flex items-center gap-2">
                        <Lock className="h-3 w-3" />
                        Override locked accounts
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {hierarchyInfo?.lockedChildCount} children are locked and won't move by default
                      </p>
                    </div>
                    <Switch
                      id="override-locks"
                      checked={overrideLocks}
                      onCheckedChange={setOverrideLocks}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Warning for hierarchy split */}
            {willCreateSplit && newOwnerId && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800">Hierarchy Split Warning</p>
                    <p className="text-amber-700 mt-1">
                      {isChild 
                        ? `This will separate "${account.account_name}" from its parent. They will have different owners.`
                        : `This will leave ${hierarchyInfo?.childCount || 0} child accounts with their current owners.`
                      }
                    </p>
                    <p className="text-amber-700 mt-1">
                      Assignment confidence will be marked as LOW.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Info note for locked children that won't move */}
            {isParent && hasLockedChildren && includeChildren && !overrideLocks && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex gap-2">
                  <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800">Locked Accounts Note</p>
                    <p className="text-blue-700 mt-1">
                      {hierarchyInfo?.lockedChildCount} child account(s) are locked and will keep their current owners. 
                      Enable "Override locked accounts" above to include them.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Owner Selection */}
            <div className="space-y-3">
              <Label>Select New Owner</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sales reps..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {filteredReps.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No sales reps found
                  </div>
                ) : (
                  filteredReps.map(rep => (
                    <button
                      key={rep.rep_id}
                      onClick={() => setNewOwnerId(rep.rep_id)}
                      className={`w-full p-3 text-left hover:bg-muted/50 border-b last:border-b-0 transition-colors ${
                        newOwnerId === rep.rep_id ? 'bg-primary/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{rep.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {rep.team || 'No team'} • {rep.region || 'No region'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Impact Preview Panel - shows before/after metrics for both reps */}
            {newOwnerId && (
              <ReassignmentImpactPanel
                losingRep={currentOwnerId ? {
                  id: currentOwnerId,
                  name: account?.new_owner_name || account?.owner_name || 'Current Owner',
                  region: availableReps.find(r => r.rep_id === currentOwnerId)?.region || null,
                } : null}
                gainingRep={{
                  id: newOwnerId,
                  name: selectedRep?.name || 'New Owner',
                  region: selectedRep?.region || null,
                }}
                losingRepMetrics={losingRepCurrent}
                gainingRepMetrics={gainingRepCurrent}
                losingRepProjected={losingRepProjected}
                gainingRepProjected={gainingRepProjected}
                accountTerritory={(account as any)?.sales_territory || (account as any)?.geo}
                accountsAffectedCount={accountsAffectedCount}
                isLoading={isLoadingLosingMetrics || isLoadingGainingMetrics}
              />
            )}

            {/* Rationale */}
            <div className="space-y-2">
              <Label htmlFor="rationale">Rationale (Optional)</Label>
              <Textarea
                id="rationale"
                placeholder="Explain why you're reassigning this account..."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button 
              onClick={handleProceed}
              disabled={isLoading || !newOwnerId || isLoadingHierarchy}
            >
              {willCreateSplit ? 'Continue with Split' : 'Reassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standard Confirmation Dialog */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Reassignment</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Are you sure you want to reassign <strong>{account.account_name}</strong> to{' '}
                  <strong>{selectedRepName}</strong>?
                </p>
                {!isStandalone && !willCreateSplit && (
                  <p>
                    This will also move {(hierarchyInfo?.childCount || 0) - (overrideLocks ? 0 : hierarchyInfo?.lockedChildCount || 0)} child account(s).
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedReassignment}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hierarchy Split Warning Dialog */}
      <AlertDialog open={showSplitWarning} onOpenChange={setShowSplitWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Hierarchy Split Warning
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {isChild ? (
                  <>
                    <p>
                      <strong>{account.account_name}</strong> will be assigned to a different owner 
                      than its parent <strong>{hierarchyInfo?.parentInfo?.account_name}</strong>.
                    </p>
                    <div className="rounded-lg bg-amber-50 p-3 text-sm">
                      <p className="font-medium text-amber-800">What this means:</p>
                      <ul className="list-disc list-inside mt-1 text-amber-700 space-y-1">
                        <li>Parent and child will have different owners</li>
                        <li>Assignment confidence will be marked as LOW</li>
                        <li>The child's revenue will be tracked separately</li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>{account.account_name}</strong> will be reassigned, but its{' '}
                      <strong>{hierarchyInfo?.childCount}</strong> child accounts will keep their current owners.
                    </p>
                    <div className="rounded-lg bg-amber-50 p-3 text-sm">
                      <p className="font-medium text-amber-800">What this means:</p>
                      <ul className="list-disc list-inside mt-1 text-amber-700 space-y-1">
                        <li>Parent will have a different owner than children</li>
                        <li>Assignment confidence will be marked as LOW</li>
                        <li>This may complicate account management</li>
                      </ul>
                    </div>
                  </>
                )}
                <p className="font-medium">Are you sure you want to proceed?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedReassignment}
              disabled={isLoading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isLoading ? 'Processing...' : 'Confirm Split'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lock Override Warning Dialog */}
      <AlertDialog open={showLockOverrideWarning} onOpenChange={setShowLockOverrideWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Lock className="h-5 w-5" />
              Override Locked Accounts Warning
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <strong>{hierarchyInfo?.lockedChildCount}</strong> child account(s) are currently 
                  locked to prevent reassignment. You have chosen to override these locks.
                </p>
                {hierarchyInfo?.lockedChildren && hierarchyInfo.lockedChildren.length > 0 && (
                  <div className="rounded-lg border p-3 max-h-32 overflow-y-auto">
                    <p className="text-sm font-medium mb-2">Locked accounts that will be reassigned:</p>
                    <ul className="text-sm space-y-1">
                      {hierarchyInfo.lockedChildren.slice(0, 5).map(child => (
                        <li key={child.sfdc_account_id} className="flex items-center gap-2">
                          <Lock className="h-3 w-3 text-muted-foreground" />
                          <span>{child.account_name}</span>
                          <span className="text-muted-foreground">
                            (current: {child.owner_name || 'Unassigned'})
                          </span>
                        </li>
                      ))}
                      {hierarchyInfo.lockedChildren.length > 5 && (
                        <li className="text-muted-foreground">
                          ...and {hierarchyInfo.lockedChildren.length - 5} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                <p className="font-medium text-red-600">
                  This action cannot be easily undone. Are you sure?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedReassignment}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? 'Processing...' : 'Override & Reassign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// Also export as default for flexibility
export default HierarchyAwareReassignDialog;

