import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, User, Split, Download } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, MessageSquare, Edit2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import ManagerNotesDialog from './ManagerNotesDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getAccountARR, getAccountATR } from '@/utils/accountCalculations';
import { downloadFile } from '@/utils/exportUtils';

// Interface for hierarchical account display
interface AccountWithHierarchy {
  sfdc_account_id: string;
  account_name: string;
  build_id: string;
  is_parent: boolean;
  is_customer: boolean;
  owner_id: string;
  owner_name: string | null;
  new_owner_id: string | null;
  new_owner_name: string | null;
  calculated_arr: number | null;
  calculated_atr: number | null;
  arr: number | null;
  atr: number | null;
  hierarchy_bookings_arr_converted: number | null;
  expansion_tier: string | null;
  geo: string | null;
  sales_territory: string | null;
  hq_country: string | null;
  cre_count: number | null;
  cre_risk: boolean | null;
  cre_status: string | null;
  ultimate_parent_id: string | null;
  has_split_ownership: boolean | null;
  children?: AccountWithHierarchy[];
  isVirtualParent?: boolean;
}

interface ManagerHierarchyViewProps {
  buildId: string;
  managerLevel: 'FLM' | 'SLM';
  managerName: string;
  reviewStatus: string;
}

export default function ManagerHierarchyView({ 
  buildId, 
  managerLevel, 
  managerName,
  reviewStatus 
}: ManagerHierarchyViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [reassigningAccount, setReassigningAccount] = useState<any>(null);
  const [newOwnerId, setNewOwnerId] = useState<string>('');
  const [reassignmentRationale, setReassignmentRationale] = useState<string>('');
  const { user, effectiveProfile } = useAuth();
  const queryClient = useQueryClient();

  // Toggle parent account expansion
  const toggleParentExpansion = (accountId: string) => {
    const newExpanded = new Set(expandedParents);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedParents(newExpanded);
  };

  // Fetch sales reps in this manager's hierarchy
  const { data: salesReps, isLoading: repsLoading } = useQuery({
    queryKey: ['manager-sales-reps', buildId, managerLevel, managerName],
    queryFn: async () => {
      let query = supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId);

      if (managerLevel === 'FLM') {
        query = query.eq('flm', managerName);
      } else if (managerLevel === 'SLM') {
        query = query.eq('slm', managerName);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch all accounts assigned to reps in this hierarchy
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['manager-accounts', buildId, salesReps],
    queryFn: async () => {
      if (!salesReps || salesReps.length === 0) return [];

      const repIds = salesReps.map(rep => rep.rep_id);
      
      // Fetch accounts for all reps individually to handle both new and old owners
      // Include all accounts (customers and prospects) where rep is the current owner
      const accountsPromises = repIds.map(repId => 
        supabase
          .from('accounts')
          .select('sfdc_account_id, account_name, build_id, is_parent, is_customer, owner_id, owner_name, new_owner_id, new_owner_name, calculated_arr, calculated_atr, arr, atr, hierarchy_bookings_arr_converted, expansion_tier, geo, sales_territory, hq_country, cre_count, cre_risk, cre_status, ultimate_parent_id, has_split_ownership')
          .eq('build_id', buildId)
          .or(`new_owner_id.eq.${repId},and(owner_id.eq.${repId},new_owner_id.is.null)`)
      );

      const accountsResults = await Promise.all(accountsPromises);
      const allAccounts = accountsResults.flatMap(result => result.data || []);

      // Remove duplicates based on sfdc_account_id
      const uniqueAccountsMap = new Map();
      allAccounts.forEach(acc => {
        if (!uniqueAccountsMap.has(acc.sfdc_account_id)) {
          uniqueAccountsMap.set(acc.sfdc_account_id, acc);
        }
      });

      // Sort by account type first (Customers before Prospects), then by ARR descending
      const data = Array.from(uniqueAccountsMap.values()).sort((a, b) => {
        // Customers (is_customer=true) come first
        if (a.is_customer !== b.is_customer) {
          return a.is_customer ? -1 : 1;
        }
        // Then sort by ARR descending
        return (b.calculated_arr || 0) - (a.calculated_arr || 0);
      });

      if (accountsResults.some(r => r.error)) throw accountsResults.find(r => r.error)?.error;
      return data;
    },
    enabled: !!salesReps && salesReps.length > 0,
  });

  // Fetch notes for accounts (with counts)
  const { data: accountNotes } = useQuery({
    queryKey: ['manager-all-notes', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_notes')
        .select('*')
        .eq('build_id', buildId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Group notes by account ID - store all notes and count
      const notesByAccount = data?.reduce((acc, note) => {
        if (!acc[note.sfdc_account_id]) {
          acc[note.sfdc_account_id] = {
            latestNote: note,
            count: 1,
          };
        } else {
          acc[note.sfdc_account_id].count++;
        }
        return acc;
      }, {} as Record<string, { latestNote: any; count: number }>);
      
      return notesByAccount;
    },
  });

  // Fetch opportunities for renewal metrics
  const { data: opportunities } = useQuery({
    queryKey: ['manager-opportunities', buildId, salesReps],
    queryFn: async () => {
      if (!salesReps || salesReps.length === 0) return [];

      const repIds = salesReps.map(rep => rep.rep_id);
      
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('build_id', buildId)
        .in('new_owner_id', repIds);

      if (error) throw error;
      return data;
    },
    enabled: !!salesReps && salesReps.length > 0,
  });

  // Fetch ATR from opportunities (more accurate than calculated_atr field)
  // ATR comes from renewal opportunities' available_to_renew field
  const { data: atrByAccount } = useQuery({
    queryKey: ['manager-opportunities-atr', buildId],
    queryFn: async (): Promise<Map<string, number>> => {
      if (!buildId) return new Map<string, number>();
      
      const { data, error } = await supabase
        .from('opportunities')
        .select('sfdc_account_id, available_to_renew, opportunity_type')
        .eq('build_id', buildId)
        .eq('opportunity_type', 'Renewals')
        .not('available_to_renew', 'is', null);
      
      if (error) throw error;
      
      // Aggregate ATR by account
      const atrMap = new Map<string, number>();
      (data || []).forEach(opp => {
        const current = atrMap.get(opp.sfdc_account_id) || 0;
        atrMap.set(opp.sfdc_account_id, current + (opp.available_to_renew || 0));
      });
      
      return atrMap;
    },
    enabled: !!buildId,
  });

  const toggleRep = (repId: string) => {
    const newExpanded = new Set(expandedReps);
    if (newExpanded.has(repId)) {
      newExpanded.delete(repId);
    } else {
      newExpanded.add(repId);
    }
    setExpandedReps(newExpanded);
  };

  // Fetch reassignments for accounts
  const { data: accountReassignments } = useQuery({
    queryKey: ['manager-all-reassignments', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_reassignments')
        .select('sfdc_account_id, approval_status')
        .eq('build_id', buildId)
        .in('approval_status', ['pending_slm', 'pending_revops']);

      if (error) throw error;
      return data;
    },
  });

  const getRepAccounts = (repId: string) => {
    return accounts?.filter(acc => acc.new_owner_id === repId) || [];
  };

  // Build hierarchical account structure for a rep (matching SalesRepDetailDialog pattern)
  const getHierarchicalAccounts = (repId: string): AccountWithHierarchy[] => {
    const repAccounts = getRepAccounts(repId);
    if (!repAccounts.length) return [];

    // Separate parent accounts (no ultimate_parent_id) and child accounts
    const parentAccounts = repAccounts.filter(a => 
      !a.ultimate_parent_id || 
      a.ultimate_parent_id === '' || 
      a.ultimate_parent_id.trim() === ''
    );
    
    const childAccounts = repAccounts.filter(a => 
      a.ultimate_parent_id && 
      a.ultimate_parent_id !== '' && 
      a.ultimate_parent_id.trim() !== ''
    );

    const hierarchicalAccounts: AccountWithHierarchy[] = [];

    // Add parent accounts to hierarchy with their children
    parentAccounts.forEach(parent => {
      const children = childAccounts.filter(c => c.ultimate_parent_id === parent.sfdc_account_id);
      hierarchicalAccounts.push({
        ...parent,
        children: children.map(child => ({
          ...child,
          children: [],
          isVirtualParent: false,
        })),
        isVirtualParent: false,
      });
    });

    // Group orphaned children (whose parent is not owned by this rep) by their parent
    const childAccountsByParent = new Map<string, typeof childAccounts>();
    childAccounts.forEach(child => {
      const parentId = child.ultimate_parent_id!;
      // Check if this child's parent is already in parentAccounts
      const hasParent = parentAccounts.some(p => p.sfdc_account_id === parentId);
      if (!hasParent) {
        if (!childAccountsByParent.has(parentId)) {
          childAccountsByParent.set(parentId, []);
        }
        childAccountsByParent.get(parentId)!.push(child);
      }
    });

    // Create virtual parent entries for orphaned children
    childAccountsByParent.forEach((children, parentId) => {
      const firstChild = children[0];
      const virtualParent: AccountWithHierarchy = {
        sfdc_account_id: `virtual-parent-${parentId}`,
        account_name: `${firstChild.account_name.split(' - ')[0] || 'Unknown Parent'} (Parent - Not Owned)`,
        build_id: firstChild.build_id,
        is_parent: true,
        is_customer: false,
        owner_id: firstChild.owner_id,
        owner_name: firstChild.owner_name,
        new_owner_id: firstChild.new_owner_id,
        new_owner_name: firstChild.new_owner_name,
        calculated_arr: 0,
        calculated_atr: 0,
        arr: 0,
        atr: 0,
        hierarchy_bookings_arr_converted: 0,
        expansion_tier: null,
        geo: firstChild.geo,
        sales_territory: firstChild.sales_territory,
        hq_country: firstChild.hq_country,
        cre_count: 0,
        cre_risk: false,
        cre_status: null,
        ultimate_parent_id: null,
        has_split_ownership: true,
        children: children.map(child => ({
          ...child,
          children: [],
          isVirtualParent: false,
        })),
        isVirtualParent: true,
      };
      hierarchicalAccounts.push(virtualParent);
    });

    // Sort: Customers first, then by ARR descending
    return hierarchicalAccounts.sort((a, b) => {
      if (a.is_customer !== b.is_customer) {
        return a.is_customer ? -1 : 1;
      }
      return (getAccountARR(b) || 0) - (getAccountARR(a) || 0);
    });
  };

  const getRepMetrics = (repId: string) => {
    const repAccounts = getRepAccounts(repId);
    const rep = salesReps?.find(r => r.rep_id === repId);
    
    // Separate parent accounts from child accounts
    const parentAccounts = repAccounts.filter(acc => acc.is_parent);
    const childAccounts = repAccounts.filter(acc => !acc.is_parent && acc.has_split_ownership);
    
    // Build parent owner map with fallback to owner_id
    const parentOwnerMap = new Map<string, string>();
    parentAccounts.forEach(parent => {
      const ownerId = parent.new_owner_id || parent.owner_id;
      if (parent.sfdc_account_id && ownerId) {
        parentOwnerMap.set(parent.sfdc_account_id, ownerId);
      }
    });
    
    // Calculate split ownership children ARR (where child owner differs from parent owner)
    const splitOwnershipChildrenARR = childAccounts
      .filter(child => {
        const parentId = child.ultimate_parent_id;
        if (!parentId) return false;
        const childOwnerId = child.new_owner_id || child.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, child) => sum + getAccountARR(child), 0);
    
    // Total ARR = Parent ARR + Split Children ARR
    const totalARR = 
      parentAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0) + 
      splitOwnershipChildrenARR;
    
    // ATR calculation - prioritize opportunities data over calculated_atr field
    const getATRForAccount = (acc: any) => {
      const atrFromOpps = atrByAccount?.get(acc.sfdc_account_id) || 0;
      const atrFromAccount = getAccountATR(acc);
      return atrFromOpps || atrFromAccount;
    };

    // ATR follows same pattern
    const splitOwnershipChildrenATR = childAccounts
      .filter(child => {
        const parentId = child.ultimate_parent_id;
        if (!parentId) return false;
        const childOwnerId = child.new_owner_id || child.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, child) => sum + getATRForAccount(child), 0);
    
    const totalATR = 
      parentAccounts.reduce((sum, acc) => sum + getATRForAccount(acc), 0) + 
      splitOwnershipChildrenATR;
    
    // Separate customers and prospects for proper metric calculation
    const customerAccounts = parentAccounts.filter(acc => acc.is_customer);
    const prospectAccounts = parentAccounts.filter(acc => !acc.is_customer);
    const customerCount = customerAccounts.length;
    
    // Calculate tier distribution (ONLY from CUSTOMER accounts - tiers don't apply to prospects)
    const tier1 = customerAccounts.filter(acc => acc.expansion_tier === 'Tier 1').length;
    const tier2 = customerAccounts.filter(acc => acc.expansion_tier === 'Tier 2').length;
    const tier3 = customerAccounts.filter(acc => acc.expansion_tier === 'Tier 3').length;
    const tier4 = customerAccounts.filter(acc => acc.expansion_tier === 'Tier 4').length;
    
    // Calculate retention % (CUSTOMER accounts they previously owned that they still own)
    const retainedAccounts = customerAccounts.filter(acc => 
      acc.owner_id === acc.new_owner_id && acc.owner_id === repId
    ).length;

    // Calculate CRE Parents count (parent accounts with cre_status set - matches ComprehensiveReview)
    const creCount = customerAccounts.filter(acc => acc.cre_status !== null && acc.cre_status !== '').length;
    
    // Calculate region match % only for CUSTOMER accounts
    const customerRegionMatches = customerAccounts.filter(acc => 
      rep?.region && (acc.geo === rep.region || acc.sales_territory === rep.region)
    ).length;

    return {
      totalAccounts: parentAccounts.length,
      totalARR,
      totalATR,
      customers: customerCount,
      prospects: prospectAccounts.length,
      // Combined tier %s based on CUSTOMER count only (tiers don't apply to prospects)
      tier1And2Pct: customerCount > 0 ? ((tier1 + tier2) / customerCount * 100) : 0,
      tier3And4Pct: customerCount > 0 ? ((tier3 + tier4) / customerCount * 100) : 0,
      // Region % now based on CUSTOMER count only
      regionMatchPct: customerCount > 0 ? (customerRegionMatches / customerCount * 100) : 0,
      // Retention % is based on CUSTOMER count only
      retentionPct: customerCount > 0 ? (retainedAccounts / customerCount * 100) : 0,
      creCount,
    };
  };

  const hasNotes = (accountId: string) => {
    return accountNotes?.[accountId]?.latestNote;
  };

  const getNoteCount = (accountId: string) => {
    return accountNotes?.[accountId]?.count || 0;
  };

  const hasReassignment = (accountId: string) => {
    return accountReassignments?.some(r => r.sfdc_account_id === accountId);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Export team view to CSV
  const exportTeamViewCSV = () => {
    if (!salesReps || !accounts) {
      toast({
        title: 'Export Failed',
        description: 'No data available to export.',
        variant: 'destructive',
      });
      return;
    }

    const csvRows: string[] = [];
    
    // Header
    csvRows.push([
      'FLM',
      'Rep Name',
      'Rep Team',
      'Rep Region',
      'Account Name',
      'Account Type',
      'Is Parent',
      'ARR',
      'ATR',
      'Location',
      'Tier',
      'CRE Status',
      'Previous Owner',
      'Current Owner',
      'Has Reassignment'
    ].join(','));

    // Data rows
    Object.entries(repsByFLM || {}).forEach(([flm, flmReps]) => {
      flmReps.forEach((rep: any) => {
        const repAccounts = getRepAccounts(rep.rep_id);
        repAccounts.forEach((account) => {
          const atr = atrByAccount?.get(account.sfdc_account_id) || getAccountATR(account);
          csvRows.push([
            `"${flm}"`,
            `"${rep.name}"`,
            `"${rep.team || ''}"`,
            `"${rep.region || ''}"`,
            `"${account.account_name}"`,
            account.is_customer ? 'Customer' : 'Prospect',
            account.is_parent ? 'Yes' : 'No',
            getAccountARR(account),
            atr,
            `"${account.hq_country || account.sales_territory || account.geo || ''}"`,
            `"${account.expansion_tier || ''}"`,
            `"${account.cre_status || ''}"`,
            `"${account.owner_name || ''}"`,
            `"${account.new_owner_name || ''}"`,
            hasReassignment(account.sfdc_account_id) ? 'Yes' : 'No'
          ].join(','));
        });
      });
    });

    const csvContent = csvRows.join('\n');
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(csvContent, `team-view-${managerName}-${timestamp}.csv`, 'text/csv');

    toast({
      title: 'Export Complete',
      description: `Exported ${accounts.length} accounts to CSV.`,
    });
  };

  const filteredReps = salesReps?.filter(rep =>
    rep.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rep.team?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group reps by FLM
  const repsByFLM = filteredReps?.reduce((acc, rep) => {
    const flm = rep.flm || 'Unassigned';
    if (!acc[flm]) acc[flm] = [];
    acc[flm].push(rep);
    return acc;
  }, {} as Record<string, any[]>);

  const getFLMMetrics = (flm: string) => {
    const flmReps = repsByFLM?.[flm] || [];
    const flmRepIds = flmReps.map(rep => rep.rep_id);
    const flmAccounts = accounts?.filter(acc => flmRepIds.includes(acc.new_owner_id)) || [];
    
    // Separate parent accounts from child accounts
    const parentAccounts = flmAccounts.filter(acc => acc.is_parent);
    const childAccounts = flmAccounts.filter(acc => !acc.is_parent && acc.has_split_ownership);
    
    // Build parent owner map with fallback to owner_id
    const parentOwnerMap = new Map<string, string>();
    parentAccounts.forEach(parent => {
      const ownerId = parent.new_owner_id || parent.owner_id;
      if (parent.sfdc_account_id && ownerId) {
        parentOwnerMap.set(parent.sfdc_account_id, ownerId);
      }
    });
    
    // Calculate split ownership children ARR (where child owner differs from parent owner)
    const splitOwnershipChildrenARR = childAccounts
      .filter(child => {
        const parentId = child.ultimate_parent_id;
        if (!parentId) return false;
        const childOwnerId = child.new_owner_id || child.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, child) => sum + getAccountARR(child), 0);
    
    // Total ARR = Parent ARR + Split Children ARR
    const totalARR = 
      parentAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0) + 
      splitOwnershipChildrenARR;
    
    // ATR calculation - prioritize opportunities data over calculated_atr field
    const getFLMATRForAccount = (acc: any) => {
      const atrFromOpps = atrByAccount?.get(acc.sfdc_account_id) || 0;
      const atrFromAccount = getAccountATR(acc);
      return atrFromOpps || atrFromAccount;
    };

    // ATR follows same pattern
    const splitOwnershipChildrenATR = childAccounts
      .filter(child => {
        const parentId = child.ultimate_parent_id;
        if (!parentId) return false;
        const childOwnerId = child.new_owner_id || child.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, child) => sum + getFLMATRForAccount(child), 0);
    
    const totalATR = 
      parentAccounts.reduce((sum, acc) => sum + getFLMATRForAccount(acc), 0) + 
      splitOwnershipChildrenATR;
    
    return {
      totalReps: flmReps.length,
      totalAccounts: parentAccounts.length,
      totalARR,
      totalATR,
      customers: parentAccounts.filter(acc => acc.is_customer).length,
      prospects: parentAccounts.filter(acc => !acc.is_customer).length,
    };
  };

  // Determine initial approval status based on user's role
  const getInitialApprovalStatus = (): string => {
    const role = effectiveProfile?.role;
    if (role === 'REVOPS') return 'approved';      // RevOps auto-approves
    if (role === 'SLM') return 'pending_revops';   // SLM skips SLM approval
    return 'pending_slm';                           // FLM needs SLM approval first
  };

  const getApprovalSuccessMessage = (): string => {
    const role = effectiveProfile?.role;
    if (role === 'REVOPS') return 'Reassignment has been applied.';
    if (role === 'SLM') return 'Your reassignment request has been submitted for RevOps approval.';
    return 'Your reassignment request has been submitted for SLM approval.';
  };

  const reassignAccountMutation = useMutation({
    mutationFn: async ({ accountId, newOwner }: { accountId: string; newOwner: any }) => {
      const approvalStatus = getInitialApprovalStatus();
      
      const { error } = await supabase
        .from('manager_reassignments')
        .insert({
          build_id: buildId,
          manager_user_id: user!.id,
          sfdc_account_id: accountId,
          account_name: reassigningAccount.account_name,
          current_owner_id: reassigningAccount.new_owner_id,
          current_owner_name: reassigningAccount.new_owner_name,
          proposed_owner_id: newOwner.rep_id,
          proposed_owner_name: newOwner.name,
          rationale: reassignmentRationale || 'Manager reassignment',
          approval_status: approvalStatus,
        });

      if (error) throw error;

      // If RevOps, also update the account directly since it's auto-approved
      if (approvalStatus === 'approved') {
        const { error: updateError } = await supabase
          .from('accounts')
          .update({
            new_owner_id: newOwner.rep_id,
            new_owner_name: newOwner.name,
          })
          .eq('sfdc_account_id', accountId)
          .eq('build_id', buildId);

        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      toast({
        title: 'Reassignment Proposed',
        description: getApprovalSuccessMessage(),
      });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['slm-pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['manager-pending-approvals'] });
      setReassigningAccount(null);
      setNewOwnerId('');
      setReassignmentRationale('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleReassign = () => {
    const newOwner = salesReps?.find(rep => rep.rep_id === newOwnerId);
    if (!newOwner) {
      toast({
        title: 'Error',
        description: 'Please select a valid rep to reassign to.',
        variant: 'destructive',
      });
      return;
    }

    reassignAccountMutation.mutate({
      accountId: reassigningAccount.sfdc_account_id,
      newOwner,
    });
  };

  // Approve a rep's entire book
  const approveRepBookMutation = useMutation({
    mutationFn: async (repId: string) => {
      const rep = salesReps?.find(r => r.rep_id === repId);
      if (!rep) throw new Error('Rep not found');

      // Create an approval note for this rep's book
      const { error } = await supabase
        .from('manager_notes')
        .insert({
          build_id: buildId,
          sfdc_account_id: `rep-book-${repId}`, // Special ID for rep-level approvals
          manager_user_id: user!.id,
          note_text: `Book approved by ${effectiveProfile?.full_name || 'Manager'}`,
          category: 'approval',
          status: 'resolved',
          tags: ['book-approval', rep.name],
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Book Approved',
        description: 'The rep\'s book has been approved.',
      });
      queryClient.invalidateQueries({ queryKey: ['manager-all-notes'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (repsLoading || accountsLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Your Team Hierarchy
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={exportTeamViewCSV}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by rep name or team..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {!repsByFLM || Object.keys(repsByFLM).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No sales reps found in your hierarchy.</p>
            ) : (
              Object.entries(repsByFLM).map(([flm, flmReps]) => {
                const flmMetrics = getFLMMetrics(flm);
                
                return (
                  <div key={flm} className="space-y-2">
                    {/* FLM Summary Header */}
                    <Card className="bg-primary/5 border-primary/20">
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-lg">{flm}</div>
                            <div className="text-sm text-muted-foreground">{flmMetrics.totalReps} reps</div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <div className="text-sm font-medium">{flmMetrics.totalAccounts} accounts</div>
                              <div className="text-xs text-muted-foreground">
                                {flmMetrics.customers} customers • {flmMetrics.prospects} prospects
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">{formatCurrency(flmMetrics.totalARR)}</div>
                              <div className="text-xs text-muted-foreground">ARR</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">{formatCurrency(flmMetrics.totalATR)}</div>
                              <div className="text-xs text-muted-foreground">ATR</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Reps under this FLM */}
                    {flmReps.map((rep) => {
                      const metrics = getRepMetrics(rep.rep_id);
                      const hierarchicalAccounts = getHierarchicalAccounts(rep.rep_id);
                      const isExpanded = expandedReps.has(rep.rep_id);

                      return (
                        <Collapsible key={rep.rep_id} open={isExpanded} onOpenChange={() => toggleRep(rep.rep_id)}>
                          <Card className="hover:bg-accent/5 transition-colors">
                            <div className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center gap-3 flex-1 cursor-pointer">
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </Button>
                                    <div>
                                      <div className="font-medium">{rep.name}</div>
                                      <div className="text-sm text-muted-foreground">
                                        {rep.team && <span>{rep.team}</span>}
                                        {rep.region && <span className="ml-2">• {rep.region}</span>}
                                      </div>
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                <div className="flex items-center gap-4">
                                  <div className="text-right min-w-[90px]">
                                    <div className="text-sm font-medium">{metrics.totalAccounts}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {metrics.customers}C • {metrics.prospects}P
                                    </div>
                                  </div>
                                  <div className="text-right min-w-[90px]">
                                    <div className="text-sm font-medium">{formatCurrency(metrics.totalARR)}</div>
                                    <div className="text-xs text-muted-foreground">ARR</div>
                                  </div>
                                  <div className="text-right min-w-[90px]">
                                    <div className="text-sm font-medium">{formatCurrency(metrics.totalATR)}</div>
                                    <div className="text-xs text-muted-foreground">ATR</div>
                                  </div>
                                  <div className="text-right min-w-[140px]">
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                                      <div className="text-right">
                                        <span className="text-muted-foreground">T1&T2:</span>
                                        <span className="ml-1 font-medium">{metrics.tier1And2Pct.toFixed(0)}%</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-muted-foreground">T3&T4:</span>
                                        <span className="ml-1 font-medium">{metrics.tier3And4Pct.toFixed(0)}%</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-muted-foreground">Region:</span>
                                        <span className="ml-1 font-medium">{metrics.regionMatchPct.toFixed(0)}%</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-muted-foreground">Retain:</span>
                                        <span className="ml-1 font-medium">{metrics.retentionPct.toFixed(0)}%</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right min-w-[70px]">
                                    <div className="text-xs">
                                      <span className="text-muted-foreground">CRE:</span>
                                      <span className="ml-1 font-medium">{metrics.creCount}</span>
                                    </div>
                                  </div>
                                  <Button 
                                    variant="default"
                                    size="sm"
                                    onClick={() => approveRepBookMutation.mutate(rep.rep_id)}
                                    disabled={reviewStatus === 'accepted' || approveRepBookMutation.isPending}
                                    className="min-w-[120px]"
                                  >
                                    {approveRepBookMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      'Approve Book'
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                            <CollapsibleContent>
                              <div className="px-4 pb-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[280px]">Account Name</TableHead>
                                      <TableHead>Type</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead className="text-right">ARR</TableHead>
                                      <TableHead className="text-right">ATR</TableHead>
                                      <TableHead>Location</TableHead>
                                      <TableHead className="w-[150px]">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {hierarchicalAccounts.map((account) => {
                                      const note = hasNotes(account.sfdc_account_id);
                                      const hasChildren = account.children && account.children.length > 0;
                                      const isParentExpanded = expandedParents.has(account.sfdc_account_id);

                                      return (
                                        <>
                                          {/* Parent Account Row */}
                                          <TableRow 
                                            key={account.sfdc_account_id}
                                            className={`${hasChildren ? 'cursor-pointer hover:bg-muted/50' : ''} ${account.isVirtualParent ? 'bg-muted/30 italic' : ''}`}
                                            onClick={() => hasChildren && toggleParentExpansion(account.sfdc_account_id)}
                                          >
                                            <TableCell>
                                              <div className="flex items-center gap-2">
                                                {hasChildren && (
                                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                                    {isParentExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                  </Button>
                                                )}
                                                {!hasChildren && <div className="w-6" />}
                                                <div>
                                                  <div className="font-medium">{account.account_name}</div>
                                                  {hasChildren && (
                                                    <div className="text-xs text-muted-foreground">
                                                      {account.children!.length} child account{account.children!.length !== 1 ? 's' : ''}
                                                    </div>
                                                  )}
                                                </div>
                                                {account.has_split_ownership && !account.isVirtualParent && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                                                          <Split className="h-3 w-3 mr-1" />
                                                          Split
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p>This account has children assigned to different owners</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                              </div>
                                            </TableCell>
                                            <TableCell>
                                              {!account.isVirtualParent && (
                                                <Badge variant={account.is_customer ? "default" : "secondary"}>
                                                  {account.is_customer ? 'Customer' : 'Prospect'}
                                                </Badge>
                                              )}
                                            </TableCell>
                                            <TableCell>
                                              {!account.isVirtualParent && hasReassignment(account.sfdc_account_id) && (
                                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                                                  Reassigned
                                                </Badge>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                              {!account.isVirtualParent && formatCurrency(getAccountARR(account))}
                                            </TableCell>
                                            <TableCell className="text-right">
                                              {!account.isVirtualParent && formatCurrency(atrByAccount?.get(account.sfdc_account_id) || getAccountATR(account))}
                                            </TableCell>
                                            <TableCell>
                                              {!account.isVirtualParent && (account.hq_country || account.sales_territory || account.geo || 'N/A')}
                                            </TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                              {!account.isVirtualParent && (
                                                <div className="flex gap-2">
                                                  <Button
                                                    variant={note ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() => setSelectedAccount({ ...account, currentOwner: rep })}
                                                    className="gap-1 relative"
                                                  >
                                                    <MessageSquare className="w-3 h-3" />
                                                    {getNoteCount(account.sfdc_account_id) > 0 ? (
                                                      <span className="flex items-center gap-1">
                                                        <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs font-medium min-w-[18px] text-center">
                                                          {getNoteCount(account.sfdc_account_id)}
                                                        </span>
                                                      </span>
                                                    ) : (
                                                      'Note'
                                                    )}
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setReassigningAccount({ ...account, currentOwner: rep })}
                                                    disabled={reviewStatus === 'accepted' || hasReassignment(account.sfdc_account_id)}
                                                  >
                                                    Reassign
                                                  </Button>
                                                </div>
                                              )}
                                            </TableCell>
                                          </TableRow>

                                          {/* Note Row for Parent */}
                                          {note && !account.isVirtualParent && (
                                            <TableRow key={`${account.sfdc_account_id}-note`} className="bg-primary/5 border-l-4 border-l-primary">
                                              <TableCell colSpan={7}>
                                                <div className="flex items-start gap-3 py-3 px-2">
                                                  <MessageSquare className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                      <Badge variant="outline" className="text-xs">Manager Note</Badge>
                                                    </div>
                                                    <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                                                      {note.note_text}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-2">
                                                      Added {new Date(note.created_at).toLocaleDateString()} at {new Date(note.created_at).toLocaleTimeString()}
                                                    </div>
                                                  </div>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 flex-shrink-0"
                                                    onClick={() => setSelectedAccount({ ...account, currentOwner: rep })}
                                                    title="Edit note"
                                                  >
                                                    <Edit2 className="w-4 h-4" />
                                                  </Button>
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          )}

                                          {/* Child Account Rows (when expanded) */}
                                          {isParentExpanded && account.children?.map((child) => {
                                            const childNote = hasNotes(child.sfdc_account_id);
                                            return (
                                              <>
                                                <TableRow key={child.sfdc_account_id} className="bg-muted/20">
                                                  <TableCell className="pl-12">
                                                    <div className="flex items-center gap-2">
                                                      <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
                                                      <div className="font-medium text-sm">{child.account_name}</div>
                                                    </div>
                                                  </TableCell>
                                                  <TableCell>
                                                    <Badge variant={child.is_customer ? "default" : "secondary"} className="text-xs">
                                                      {child.is_customer ? 'Customer' : 'Prospect'}
                                                    </Badge>
                                                  </TableCell>
                                                  <TableCell>
                                                    {hasReassignment(child.sfdc_account_id) && (
                                                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs">
                                                        Reassigned
                                                      </Badge>
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="text-right text-sm">
                                                    {formatCurrency(getAccountARR(child))}
                                                  </TableCell>
                                                  <TableCell className="text-right text-sm">
                                                    {formatCurrency(atrByAccount?.get(child.sfdc_account_id) || getAccountATR(child))}
                                                  </TableCell>
                                                  <TableCell className="text-sm">
                                                    {child.hq_country || child.sales_territory || child.geo || 'N/A'}
                                                  </TableCell>
                                                  <TableCell>
                                                    <div className="flex gap-2">
                                                      <Button
                                                        variant={childNote ? "default" : "outline"}
                                                        size="sm"
                                                        onClick={() => setSelectedAccount({ ...child, currentOwner: rep })}
                                                        className="gap-1 text-xs"
                                                      >
                                                        <MessageSquare className="w-3 h-3" />
                                                        {getNoteCount(child.sfdc_account_id) > 0 ? (
                                                          <span className="bg-primary text-primary-foreground rounded-full px-1 py-0.5 text-xs font-medium min-w-[16px] text-center">
                                                            {getNoteCount(child.sfdc_account_id)}
                                                          </span>
                                                        ) : (
                                                          'Note'
                                                        )}
                                                      </Button>
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setReassigningAccount({ ...child, currentOwner: rep })}
                                                        disabled={reviewStatus === 'accepted' || hasReassignment(child.sfdc_account_id)}
                                                        className="text-xs"
                                                      >
                                                        Reassign
                                                      </Button>
                                                    </div>
                                                  </TableCell>
                                                </TableRow>

                                                {/* Note Row for Child */}
                                                {childNote && (
                                                  <TableRow key={`${child.sfdc_account_id}-note`} className="bg-primary/5 border-l-4 border-l-primary">
                                                    <TableCell colSpan={7}>
                                                      <div className="flex items-start gap-3 py-2 px-2 pl-12">
                                                        <MessageSquare className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                          <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                                                            {childNote.note_text}
                                                          </div>
                                                          <div className="text-xs text-muted-foreground mt-1">
                                                            {new Date(childNote.created_at).toLocaleDateString()}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    </TableCell>
                                                  </TableRow>
                                                )}
                                              </>
                                            );
                                          })}
                                        </>
                                      );
                                    })}
                                    {hierarchicalAccounts.length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={7} className="text-center text-muted-foreground py-4">
                                          No accounts assigned
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {selectedAccount && (
        <ManagerNotesDialog
          open={!!selectedAccount}
          onClose={() => setSelectedAccount(null)}
          account={selectedAccount}
          buildId={buildId}
        />
      )}

      {reassigningAccount && (
        <Dialog open={!!reassigningAccount} onOpenChange={() => {
          setReassigningAccount(null);
          setNewOwnerId('');
          setReassignmentRationale('');
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Reassign Account</DialogTitle>
              <DialogDescription>
                Propose a new owner for {reassigningAccount.account_name} from your team
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Account</span>
                  <span className="font-medium">{reassigningAccount.account_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Current Owner</span>
                  <span className="font-medium">{reassigningAccount.new_owner_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">ARR</span>
                  <span className="font-medium">{formatCurrency(getAccountARR(reassigningAccount))}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>New Owner (Same Team Only)</Label>
                <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a rep..." />
                  </SelectTrigger>
                  <SelectContent>
                    {salesReps
                      ?.filter(rep => 
                        // Exclude current owner from options
                        rep.rep_id !== reassigningAccount.new_owner_id
                        // Allow reassignment to any rep in the manager's hierarchy
                        // (salesReps is already filtered to only include reps under this manager)
                      )
                      .map((rep) => (
                        <SelectItem key={rep.rep_id} value={rep.rep_id}>
                          {rep.name} {rep.team && `(${rep.team})`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reassignment Rationale (Optional)</Label>
                <Textarea
                  placeholder="Explain why this account should be reassigned..."
                  value={reassignmentRationale}
                  onChange={(e) => setReassignmentRationale(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReassigningAccount(null);
                  setNewOwnerId('');
                  setReassignmentRationale('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReassign}
                disabled={!newOwnerId || reassignAccountMutation.isPending}
              >
                {reassignAccountMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Submit Reassignment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
