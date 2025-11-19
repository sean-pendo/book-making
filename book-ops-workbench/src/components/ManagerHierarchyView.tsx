import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, User, Split } from 'lucide-react';
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
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [reassigningAccount, setReassigningAccount] = useState<any>(null);
  const [newOwnerId, setNewOwnerId] = useState<string>('');
  const [reassignmentRationale, setReassignmentRationale] = useState<string>('');
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
      const accountsPromises = repIds.map(repId => 
        supabase
          .from('accounts')
          .select('sfdc_account_id, account_name, build_id, is_parent, is_customer, owner_id, owner_name, new_owner_id, new_owner_name, calculated_arr, calculated_atr, arr, atr, hierarchy_bookings_arr_converted, expansion_tier, geo, sales_territory, hq_country, cre_count, ultimate_parent_id, has_split_ownership')
          .eq('build_id', buildId)
          .eq('is_customer', true)
          .or('is_parent.eq.true,has_split_ownership.eq.true')
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

      const data = Array.from(uniqueAccountsMap.values()).sort((a, b) => 
        (b.calculated_arr || 0) - (a.calculated_arr || 0)
      );

      if (accountsResults.some(r => r.error)) throw accountsResults.find(r => r.error)?.error;
      return data;
    },
    enabled: !!salesReps && salesReps.length > 0,
  });

  // Fetch notes for accounts
  const { data: accountNotes } = useQuery({
    queryKey: ['manager-all-notes', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_notes')
        .select('*')
        .eq('build_id', buildId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Group notes by account ID, keeping most recent
      const notesByAccount = data?.reduce((acc, note) => {
        if (!acc[note.sfdc_account_id]) {
          acc[note.sfdc_account_id] = note;
        }
        return acc;
      }, {} as Record<string, any>);
      
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
        .select('sfdc_account_id, status')
        .eq('build_id', buildId)
        .eq('status', 'pending');

      if (error) throw error;
      return data;
    },
  });

  const getQuarterFromDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const month = date.getMonth();
    return Math.floor(month / 3) + 1; // Q1=1, Q2=2, Q3=3, Q4=4
  };

  const getRepOpportunityMetrics = (repId: string) => {
    const repOpps = opportunities?.filter(opp => opp.new_owner_id === repId) || [];
    
    const q1Renewals = repOpps.filter(opp => 
      opp.opportunity_type?.toLowerCase().includes('renewal') && 
      getQuarterFromDate(opp.close_date) === 1
    ).length;
    
    const q2Renewals = repOpps.filter(opp => 
      opp.opportunity_type?.toLowerCase().includes('renewal') && 
      getQuarterFromDate(opp.close_date) === 2
    ).length;
    
    const q3Renewals = repOpps.filter(opp => 
      opp.opportunity_type?.toLowerCase().includes('renewal') && 
      getQuarterFromDate(opp.close_date) === 3
    ).length;
    
    const q4Renewals = repOpps.filter(opp => 
      opp.opportunity_type?.toLowerCase().includes('renewal') && 
      getQuarterFromDate(opp.close_date) === 4
    ).length;

    return { q1Renewals, q2Renewals, q3Renewals, q4Renewals };
  };

  const getRepAccounts = (repId: string) => {
    return accounts?.filter(acc => acc.new_owner_id === repId) || [];
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
    
    // ATR follows same pattern
    const splitOwnershipChildrenATR = childAccounts
      .filter(child => {
        const parentId = child.ultimate_parent_id;
        if (!parentId) return false;
        const childOwnerId = child.new_owner_id || child.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, child) => sum + getAccountATR(child), 0);
    
    const totalATR = 
      parentAccounts.reduce((sum, acc) => sum + getAccountATR(acc), 0) + 
      splitOwnershipChildrenATR;
    
    // Calculate tier distribution (only from parent accounts)
    const tier1 = parentAccounts.filter(acc => acc.expansion_tier === 'Tier 1').length;
    const tier2 = parentAccounts.filter(acc => acc.expansion_tier === 'Tier 2').length;
    const tier3 = parentAccounts.filter(acc => acc.expansion_tier === 'Tier 3').length;
    const tier4 = parentAccounts.filter(acc => acc.expansion_tier === 'Tier 4').length;
    
    // Calculate region match % (only from parent accounts)
    const regionMatches = parentAccounts.filter(acc => 
      rep?.region && (acc.geo === rep.region || acc.sales_territory === rep.region)
    ).length;
    
    // Calculate retention % (accounts they previously owned that they still own)
    const retainedAccounts = parentAccounts.filter(acc => 
      acc.owner_id === acc.new_owner_id && acc.owner_id === repId
    ).length;

    // Calculate CRE count (only from parent accounts)
    const creCount = parentAccounts.reduce((sum, acc) => sum + (acc.cre_count || 0), 0);
    
    return {
      totalAccounts: parentAccounts.length,
      totalARR,
      totalATR,
      customers: parentAccounts.filter(acc => acc.is_customer).length,
      prospects: parentAccounts.filter(acc => !acc.is_customer).length,
      tier1Pct: parentAccounts.length > 0 ? (tier1 / parentAccounts.length * 100) : 0,
      tier2Pct: parentAccounts.length > 0 ? (tier2 / parentAccounts.length * 100) : 0,
      tier3Pct: parentAccounts.length > 0 ? (tier3 / parentAccounts.length * 100) : 0,
      tier4Pct: parentAccounts.length > 0 ? (tier4 / parentAccounts.length * 100) : 0,
      regionMatchPct: parentAccounts.length > 0 ? (regionMatches / parentAccounts.length * 100) : 0,
      retentionPct: parentAccounts.length > 0 ? (retainedAccounts / parentAccounts.length * 100) : 0,
      creCount,
    };
  };

  const hasNotes = (accountId: string) => {
    return accountNotes?.[accountId];
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
    
    // ATR follows same pattern
    const splitOwnershipChildrenATR = childAccounts
      .filter(child => {
        const parentId = child.ultimate_parent_id;
        if (!parentId) return false;
        const childOwnerId = child.new_owner_id || child.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, child) => sum + getAccountATR(child), 0);
    
    const totalATR = 
      parentAccounts.reduce((sum, acc) => sum + getAccountATR(acc), 0) + 
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

  const reassignAccountMutation = useMutation({
    mutationFn: async ({ accountId, newOwner }: { accountId: string; newOwner: any }) => {
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
          status: 'pending',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Reassignment Proposed',
        description: 'Your reassignment request has been submitted for approval.',
      });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
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
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Your Team Hierarchy
          </CardTitle>
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
                      const oppMetrics = getRepOpportunityMetrics(rep.rep_id);
                      const repAccounts = getRepAccounts(rep.rep_id);
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
                                <div className="flex items-center gap-6">
                                  <div className="text-right">
                                    <div className="text-sm font-medium">{metrics.totalAccounts} accounts</div>
                                    <div className="text-xs text-muted-foreground">
                                      {metrics.customers} customers • {metrics.prospects} prospects
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-medium">{formatCurrency(metrics.totalARR)}</div>
                                    <div className="text-xs text-muted-foreground">ARR</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-medium">{formatCurrency(metrics.totalATR)}</div>
                                    <div className="text-xs text-muted-foreground">ATR</div>
                                  </div>
                                  <div className="text-right min-w-[180px]">
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                      <div className="text-right">
                                        <span className="text-muted-foreground">T1:</span>
                                        <span className="ml-1 font-medium">{metrics.tier1Pct.toFixed(0)}%</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-muted-foreground">T2:</span>
                                        <span className="ml-1 font-medium">{metrics.tier2Pct.toFixed(0)}%</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-muted-foreground">Region:</span>
                                        <span className="ml-1 font-medium">{metrics.regionMatchPct.toFixed(0)}%</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-muted-foreground">Retention:</span>
                                        <span className="ml-1 font-medium">{metrics.retentionPct.toFixed(0)}%</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right min-w-[140px]">
                                    <div className="space-y-1 text-xs">
                                      <div>
                                        <span className="text-muted-foreground">CRE:</span>
                                        <span className="ml-1 font-medium">{metrics.creCount}</span>
                                      </div>
                                      <div className="text-muted-foreground">
                                        Q1:{oppMetrics.q1Renewals} Q2:{oppMetrics.q2Renewals} Q3:{oppMetrics.q3Renewals} Q4:{oppMetrics.q4Renewals}
                                      </div>
                                    </div>
                                  </div>
                                  <Button 
                                    variant="default"
                                    size="sm"
                                    disabled={reviewStatus === 'accepted'}
                                  >
                                    Approve Book
                                  </Button>
                                </div>
                              </div>
                            </div>
                            <CollapsibleContent>
                              <div className="px-4 pb-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[250px]">Account Name</TableHead>
                                      <TableHead>Type</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead className="text-right">ARR</TableHead>
                                      <TableHead className="text-right">ATR</TableHead>
                                      <TableHead>Location</TableHead>
                                      <TableHead className="w-[150px]">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {repAccounts.map((account) => {
                                      const note = hasNotes(account.sfdc_account_id);
                                      return (
                                        <>
                                          <TableRow key={account.sfdc_account_id}>
                                            <TableCell>
                                              <div className="flex items-center gap-2">
                                                <div className="font-medium">{account.account_name}</div>
                                                {account.has_split_ownership && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge variant="warning" className="text-xs">
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
                                              <Badge variant={account.is_customer ? "default" : "secondary"}>
                                                {account.is_customer ? 'Customer' : 'Prospect'}
                                              </Badge>
                                            </TableCell>
                                            <TableCell>
                                              {hasReassignment(account.sfdc_account_id) && (
                                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                                                  Reassigned
                                                </Badge>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-right">{formatCurrency(getAccountARR(account))}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(getAccountATR(account))}</TableCell>
                                            <TableCell>{account.hq_country || account.sales_territory || account.geo || 'N/A'}</TableCell>
                                            <TableCell>
                                              <div className="flex gap-2">
                                                <Button
                                                  variant={note ? "default" : "outline"}
                                                  size="sm"
                                                  onClick={() => setSelectedAccount({ ...account, currentOwner: rep })}
                                                  className="gap-2"
                                                >
                                                  {note ? (
                                                    <>
                                                      <Edit2 className="w-3 h-3" />
                                                      View/Edit Note
                                                    </>
                                                  ) : (
                                                    <>
                                                      <MessageSquare className="w-3 h-3" />
                                                      Add Note
                                                    </>
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
                                            </TableCell>
                                          </TableRow>
                                          {note && (
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
                                        </>
                                      );
                                    })}
                                    {repAccounts.length === 0 && (
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
                        rep.rep_id !== reassigningAccount.new_owner_id &&
                        rep.team === reassigningAccount.currentOwner.team
                      )
                      .map((rep) => (
                        <SelectItem key={rep.rep_id} value={rep.rep_id}>
                          {rep.name}
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
