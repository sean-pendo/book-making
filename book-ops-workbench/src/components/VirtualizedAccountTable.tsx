import React, { useState, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Edit, CheckCircle, UserX, Lock, Unlock, Info, Building2, GitBranch } from 'lucide-react';
import { getAccountARR, getAccountATR, formatCurrency } from '@/_domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Account {
  sfdc_account_id: string;
  account_name: string;
  parent_id?: string;
  ultimate_parent_id?: string;
  enterprise_vs_commercial: string;
  expansion_tier?: string;
  initial_sale_tier?: string;
  arr: number;
  hierarchy_bookings_arr_converted?: number;
  calculated_arr?: number;
  owner_id?: string;
  owner_name?: string;
  new_owner_id?: string;
  new_owner_name?: string;
  geo: string;
  hq_country?: string;
  sales_territory?: string;
  is_customer: boolean;
  is_parent: boolean;
  risk_flag: boolean;
  cre_risk: boolean;
  expansion_score?: number;
  account_type?: string;
  industry?: string;
  employees?: number;
  atr?: number;
  calculated_atr?: number;
  exclude_from_reassignment?: boolean;
}

interface AssignmentReason {
  accountId: string;
  reason: string;
}

interface AssignmentProposal {
  accountId: string;
  proposedOwnerId: string;
  proposedOwnerName: string;
  proposedOwnerRegion?: string;
  assignmentReason: string;
  ruleApplied: string;
  conflictRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface Opportunity {
  sfdc_account_id: string;
  net_arr?: number;
}

interface VirtualizedAccountTableProps {
  accounts: Account[];
  onReassign: (account: Account) => void;
  emptyMessage?: string;
  itemsPerPage?: number;
  assignmentProposals?: AssignmentProposal[];
  assignmentReasons?: AssignmentReason[];
  searchTerm?: string;
  currentOwnerFilter?: string;
  newOwnerFilter?: string;
  buildId?: string;
  lockStatusFilter?: string;
  accountType?: 'customer' | 'prospect';
  opportunities?: Opportunity[];
}

export const VirtualizedAccountTable = ({ 
  accounts, 
  onReassign, 
  emptyMessage = "No accounts found",
  itemsPerPage = 100,
  assignmentProposals = [],
  assignmentReasons = [],
  searchTerm = '',
  currentOwnerFilter = '',
  newOwnerFilter = '',
  buildId,
  lockStatusFilter = 'all',
  accountType = 'customer',
  opportunities = []
}: VirtualizedAccountTableProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingLocks, setPendingLocks] = useState<Set<string>>(new Set());
  
  const toggleExclusionMutation = useMutation({
    mutationFn: async ({ accountId, currentValue, account }: { accountId: string; currentValue: boolean; account: Account }) => {
      if (!buildId) {
        throw new Error('Build ID is required');
      }
      
      const isLocking = !currentValue; // We're locking if currentValue is false
      
      // Add instant visual feedback
      const newPending = new Set(pendingLocks);
      if (isLocking) {
        newPending.add(accountId);
      } else {
        newPending.delete(accountId);
      }
      setPendingLocks(newPending);
      
      // Call the secure database function to handle lock/unlock atomically
      const { error } = await supabase.rpc('toggle_account_lock', {
        p_account_id: accountId,
        p_build_id: buildId,
        p_is_locking: isLocking,
        p_owner_id: account.owner_id || null,
        p_owner_name: account.owner_name || null
      });
      
      if (error) throw error;
    },
    onMutate: async ({ accountId, currentValue, account }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['build-data', buildId] });
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData(['build-data', buildId]);
      
      const isLocking = !currentValue;
      
      // Optimistically update ALL related queries
      queryClient.setQueriesData({ queryKey: ['build-data'] }, (old: any) => {
        if (!old) return old;
        
        return {
          ...old,
          accounts: old.accounts?.map((acc: Account) => {
            if (acc.sfdc_account_id === accountId) {
              if (isLocking && acc.owner_id) {
                return { 
                  ...acc, 
                  exclude_from_reassignment: true,
                  new_owner_id: acc.owner_id,
                  new_owner_name: acc.owner_name
                };
              } else {
                return { 
                  ...acc, 
                  exclude_from_reassignment: false,
                  new_owner_id: null,
                  new_owner_name: null
                };
              }
            }
            return acc;
          }),
        };
      });
      
      return { previousData };
    },
    onError: (error, variables, context) => {
      // Remove from pending locks on error
      const newPending = new Set(pendingLocks);
      newPending.delete(variables.accountId);
      setPendingLocks(newPending);
      
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['build-data', buildId], context.previousData);
      }
      console.error('Error toggling exclusion:', error);
      toast({
        title: "Error",
        description: "Failed to update account exclusion status",
        variant: "destructive",
      });
    },
    onSuccess: (_, variables) => {
      // Remove from pending locks on success
      const newPending = new Set(pendingLocks);
      newPending.delete(variables.accountId);
      setPendingLocks(newPending);
      
      queryClient.invalidateQueries({ queryKey: ['build-data'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-detail'] });
      toast({
        title: "Success",
        description: "Account exclusion status updated",
      });
    },
  });
  
  // Filter and paginate accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(account => {
      // Search term filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          account.account_name.toLowerCase().includes(searchLower) ||
          account.sfdc_account_id.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      // Current owner filter
      if (currentOwnerFilter && currentOwnerFilter !== 'all') {
        if (!account.owner_name || !account.owner_name.toLowerCase().includes(currentOwnerFilter.toLowerCase())) {
          return false;
        }
      }
      
      // New owner filter
      if (newOwnerFilter && newOwnerFilter !== 'all') {
        const proposal = assignmentProposals.find(p => p.accountId === account.sfdc_account_id);
        const newOwner = account.new_owner_name || proposal?.proposedOwnerName;
        if (!newOwner || !newOwner.toLowerCase().includes(newOwnerFilter.toLowerCase())) {
          return false;
        }
      }
      
      // Lock status filter
      if (lockStatusFilter && lockStatusFilter !== 'all') {
        if (lockStatusFilter === 'locked') {
          if (!account.exclude_from_reassignment) return false;
        } else if (lockStatusFilter === 'unlocked') {
          if (account.exclude_from_reassignment) return false;
        }
      }
      
      return true;
    });
  }, [accounts, searchTerm, currentOwnerFilter, newOwnerFilter, lockStatusFilter, assignmentProposals]);

  // Memoized pagination calculation
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAccounts.slice(startIndex, endIndex);
  }, [filteredAccounts, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);

  const getDisplayTier = useCallback((account: Account) => {
    if (account.expansion_tier) {
      return `Expansion ${account.expansion_tier}`;
    }
    if (account.initial_sale_tier) {
      return `Initial ${account.initial_sale_tier}`;
    }
    return account.enterprise_vs_commercial || 'N/A';
  }, []);

  const getDisplayARR = useCallback((account: Account) => {
    return getAccountARR(account);
  }, []);

  const getProspectNetARR = useCallback((account: Account) => {
    if (!opportunities || opportunities.length === 0) return 0;
    
    return opportunities
      .filter(opp => opp.sfdc_account_id === account.sfdc_account_id)
      .reduce((sum, opp) => sum + (opp.net_arr || 0), 0);
  }, [opportunities]);

  const getContinuityRiskBadge = useCallback((account: Account) => {
    // Enhanced risk calculation based on CRE count from opportunities
    const creCount = (account as any).cre_count || 0;
    
    if (creCount === 0) {
      return <Badge variant="outline">No Risk</Badge>;
    } else if (creCount <= 2) {
      return <Badge className="bg-orange-500">Medium Risk</Badge>;
    } else {
      return <Badge variant="destructive">High Risk</Badge>;
    }
  }, []);

  // Rule name mapping for user-friendly display
  const getRuleDisplayName = useCallback((ruleName: string) => {
    const ruleMap: Record<string, string> = {
      'MANUAL_REASSIGNMENT': 'Reassigned',
      'GEO_FIRST': 'Geographic Assignment',
      'CONTINUITY': 'Continuity Rule',
      'WORKLOAD_BALANCING': 'Workload Balancing',
      'TERRITORY_ALIGNMENT': 'Territory Alignment',
      'ENTERPRISE_ASSIGNMENT': 'Enterprise Assignment',
      'COMMERCIAL_ASSIGNMENT': 'Commercial Assignment'
    };
    return ruleMap[ruleName] || ruleName;
  }, []);

  const getAssignmentTypeBadge = useCallback((account: Account) => {
    // Check if permanently assigned (has new_owner_id)
    if (account.new_owner_id) {
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Assigned</Badge>;
    }
    
    // Check if there's a pending proposal
    const proposal = assignmentProposals.find(p => p.accountId === account.sfdc_account_id);
    if (proposal) {
      return <Badge className="bg-blue-500">Pending</Badge>;
    }
    
    // No assignment
    return <Badge variant="outline">Unassigned</Badge>;
  }, [assignmentProposals]);

  if (accounts.length === 0) {
    return (
      <div className="text-center py-8">
        <UserX className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">No Accounts</h3>
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Showing {Math.min(itemsPerPage, filteredAccounts.length)} of {filteredAccounts.length} accounts 
        {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Account Details</TableHead>
              <TableHead className="min-w-[80px]">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Lock className="h-3 w-3" />
                      Keep
                      <Info className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px]" side="bottom">
                    <p className="font-semibold mb-1">Lock Account</p>
                    <p className="text-xs text-muted-foreground">
                      Locking an account prevents the assignment engine from changing its owner. 
                      Use this <strong>before</strong> generating assignments to keep accounts with their current owner.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="min-w-[120px]">Location</TableHead>
              <TableHead className="min-w-[100px]">Tier</TableHead>
              {accountType === 'prospect' ? (
                <TableHead className="min-w-[120px]">Net ARR</TableHead>
              ) : (
                <>
                  <TableHead className="min-w-[100px]">ARR</TableHead>
                  <TableHead className="min-w-[100px]">ATR</TableHead>
                </>
              )}
              <TableHead className="min-w-[180px]">Owner Assignment</TableHead>
              <TableHead className="min-w-[180px]">Rule Applied</TableHead>
              <TableHead className="min-w-[120px]">Risk</TableHead>
              <TableHead className="min-w-[250px]">Reason</TableHead>
              <TableHead className="min-w-[100px]">Status</TableHead>
              <TableHead className="min-w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((account) => (
              <TableRow key={account.sfdc_account_id}>
                <TableCell>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {account.account_name}
                      {account.is_parent ? (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800">
                          <Building2 className="h-3 w-3 mr-1" />
                          Parent
                        </Badge>
                      ) : account.ultimate_parent_id ? (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950/50 dark:text-slate-400 dark:border-slate-700">
                          <GitBranch className="h-3 w-3 mr-1" />
                          Child
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {account.sfdc_account_id}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExclusionMutation.mutate({
                            accountId: account.sfdc_account_id,
                            currentValue: account.exclude_from_reassignment || false,
                            account: account
                          });
                        }}
                        disabled={toggleExclusionMutation.isPending}
                        className="h-8 w-8 p-0 transition-all duration-200"
                      >
                        {account.exclude_from_reassignment || pendingLocks.has(account.sfdc_account_id) ? (
                          <Lock className="h-4 w-4 text-yellow-600 transition-all duration-200 animate-scale-in" />
                        ) : (
                          <Unlock className="h-4 w-4 text-muted-foreground transition-colors duration-200" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {account.exclude_from_reassignment || pendingLocks.has(account.sfdc_account_id)
                          ? 'Locked - Click to allow reassignment'
                          : 'Click to lock and keep current owner'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {account.sales_territory || account.hq_country || account.geo || 'N/A'}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getDisplayTier(account) === 'Enterprise' ? 'default' : 'secondary'}>
                    {getDisplayTier(account)}
                  </Badge>
                </TableCell>
                {accountType === 'prospect' ? (
                  <TableCell>{formatCurrency(getProspectNetARR(account))}</TableCell>
                ) : (
                  <>
                    <TableCell>{formatCurrency(getDisplayARR(account))}</TableCell>
                    <TableCell>{formatCurrency(getAccountATR(account))}</TableCell>
                  </>
                )}
                <TableCell>
                  <div className="space-y-2">
                    {/* Current Owner */}
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Current:</div>
                      {account.owner_name ? (
                        <div>
                          <div className="font-medium text-sm">{account.owner_name}</div>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">Unassigned</Badge>
                      )}
                    </div>
                    
                    {/* New Owner */}
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">New:</div>
                      {(() => {
                        // Prioritize database fields (persistent) over proposals (temporary)
                        if (account.new_owner_name) {
                          return (
                            <div>
                              <div className="font-medium text-sm text-green-600">{account.new_owner_name}</div>
                            </div>
                          );
                        }
                        
                        const proposal = assignmentProposals.find(p => p.accountId === account.sfdc_account_id);
                        if (proposal) {
                          return (
                            <div>
                              <div className="font-medium text-sm text-blue-600">{proposal.proposedOwnerName}</div>
                            </div>
                          );
                        }
                        return <span className="text-muted-foreground text-sm">-</span>;
                      })()}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {(() => {
                    // Get rule applied from database or proposal
                    const reasonData = assignmentReasons.find(r => r.accountId === account.sfdc_account_id);
                    const proposal = assignmentProposals.find(p => p.accountId === account.sfdc_account_id);
                    
                    const ruleApplied = proposal?.ruleApplied || (reasonData?.reason?.split(':')[0]?.trim()) || '-';
                    
                    if (ruleApplied === '-') {
                      return <span className="text-muted-foreground text-sm">-</span>;
                    }
                    
                    return (
                      <div className="text-sm font-medium">
                        {ruleApplied}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  {(() => {
                    // Use conflict risk from proposal if available
                    const proposal = assignmentProposals.find(p => p.accountId === account.sfdc_account_id);
                    
                    if (proposal?.conflictRisk) {
                      const risk = proposal.conflictRisk;
                      if (risk === 'LOW') {
                        return <Badge className="bg-green-500 text-white">Low Risk</Badge>;
                      } else if (risk === 'MEDIUM') {
                        return <Badge className="bg-orange-500 text-white">Medium Risk</Badge>;
                      } else if (risk === 'HIGH') {
                        return <Badge variant="destructive">High Risk</Badge>;
                      }
                    }
                    
                    // Fallback to CRE-based risk if no proposal
                    return getContinuityRiskBadge(account);
                  })()}
                </TableCell>
                <TableCell>
                  {(() => {
                    // Show detailed reason
                    const reasonData = assignmentReasons.find(r => r.accountId === account.sfdc_account_id);
                    const proposal = assignmentProposals.find(p => p.accountId === account.sfdc_account_id);
                    
                    const reason = proposal?.assignmentReason || reasonData?.reason || '-';
                    
                    if (reason === '-') {
                      return <span className="text-muted-foreground text-sm">-</span>;
                    }
                    
                    // Extract the detailed part after colon if it exists
                    const detailedReason = reason.includes(':') 
                      ? reason.split(':').slice(1).join(':').trim()
                      : reason;
                    
                    return (
                      <div className="text-sm max-w-xs">
                        {detailedReason}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  {getAssignmentTypeBadge(account)}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => onReassign(account)}>
                    <Edit className="w-3 h-3 mr-1" />
                    {account.owner_id ? 'Reassign' : 'Assign'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};