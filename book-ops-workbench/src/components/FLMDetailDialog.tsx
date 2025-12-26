import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getAccountARR, getAccountATR, formatCurrency } from '@/_domain';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Building2, TrendingUp, AlertTriangle, Users, Eye, Send, ChevronDown, ChevronRight, Search, UserCheck, UserX, LogOut, BarChart3 } from 'lucide-react';
import ManagerBeforeAfterComparison from './ManagerBeforeAfterComparison';
import { SalesRepDetailDialog } from '@/components/data-tables/SalesRepDetailDialog';
import { AccountDetailDialog } from '@/components/AccountDetailDialog';
import SendToManagerDialog from './SendToManagerDialog';
import AccountsLeavingView from './AccountsLeavingView';
import { useProspectOpportunities, formatCloseDate, formatNetARR } from '@/hooks/useProspectOpportunities';
import { RenewalQuarterBadge } from '@/components/ui/RenewalQuarterBadge';

interface FLMDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flmData: {
    flm: string;
    slm: string;
    data: {
      totalAccounts: number;
      totalARR: number;
      totalATR: number;
      riskCount: number;
      retainedCount: number;
      activeReps: Set<string> | string[]; // Can be Set or Array depending on source
      accounts: any[];
    };
  } | null;
  buildId: string;
}

interface AccountWithChildren {
  sfdc_account_id: string;
  account_name: string;
  is_parent: boolean;
  is_customer: boolean;
  hierarchy_bookings_arr_converted: number;
  calculated_arr: number;
  arr: number;
  calculated_atr: number;
  atr: number;
  cre_count: number;
  cre_risk: boolean;
  expansion_tier: string;
  initial_sale_tier: string;
  renewal_quarter: string | null;
  owner_name: string;
  new_owner_name: string;
  owner_id: string;
  new_owner_id: string;
  hq_country: string;
  sales_territory: string;
  ultimate_parent_id: string;
  children?: AccountWithChildren[];
}

export const FLMDetailDialog = ({ open, onOpenChange, flmData, buildId }: FLMDetailDialogProps) => {
  const [selectedRep, setSelectedRep] = useState<any>(null);
  const [sendToManagerOpen, setSendToManagerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('reps');
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'customers' | 'prospects'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);

  // Fetch prospect opportunity data (Net ARR and Close Date)
  const { getNetARR, getCloseDate, getNetARRColorClass } = useProspectOpportunities(buildId);

  // Fetch opportunities for ATR calculation (ATR comes from renewal opportunities)
  const { data: atrByAccount } = useQuery({
    queryKey: ['flm-opportunities-atr', buildId],
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
    enabled: open && !!buildId
  });

  // Fetch reps under this FLM
  const { data: flmRepsData, isLoading: repsLoading } = useQuery({
    queryKey: ['flm-reps-detail', flmData?.flm, buildId, atrByAccount],
    queryFn: async () => {
      if (!flmData) return null;

      const { data: salesReps, error: repsError } = await supabase
        .from('sales_reps')
        .select('rep_id, name, team, flm, slm, region')
        .eq('build_id', buildId)
        .eq('flm', flmData.flm)
        .eq('is_active', true);

      if (repsError) throw repsError;

      // Get accounts for each rep and calculate metrics
      const repMetrics = await Promise.all(
        (salesReps || []).map(async (rep) => {
          const { data: accounts, error: accountsError } = await supabase
            .from('accounts')
            .select(`
              sfdc_account_id,
              account_name,
              calculated_arr,
              calculated_atr,
              arr,
              atr,
              cre_count,
              cre_risk,
              cre_status,
              risk_flag,
              owner_id,
              owner_name,
              new_owner_id,
              new_owner_name,
              is_parent,
              is_customer,
              ultimate_parent_id,
              has_split_ownership,
              hierarchy_bookings_arr_converted,
              hq_country,
              sales_territory
            `)
            .eq('build_id', buildId)
            .or('is_parent.eq.true,has_split_ownership.eq.true')
            .or(`new_owner_id.eq.${rep.rep_id},and(owner_id.eq.${rep.rep_id},new_owner_id.is.null)`);

          if (accountsError) throw accountsError;

          const parentAccounts = accounts?.filter(acc => acc.is_parent) || [];
          const customerAccounts = parentAccounts.filter(acc => acc.is_customer);
          const prospectAccounts = parentAccounts.filter(acc => !acc.is_customer);
          
          const totalARR = parentAccounts.reduce((sum, acc) => {
            const arr = getAccountARR(acc);
            return sum + arr;
          }, 0);
          // Calculate ATR from opportunities (more accurate than calculated_atr field)
          const totalATR = parentAccounts.reduce((sum, acc) => {
            const atrFromOpps = atrByAccount?.get(acc.sfdc_account_id) || 0;
            const atrFromAccount = getAccountATR(acc);
            return sum + (atrFromOpps || atrFromAccount);
          }, 0);
          const riskCount = parentAccounts.filter(acc => acc.cre_status !== null || (acc.cre_count && acc.cre_count > 0)).length;
          const retainedCount = parentAccounts.filter(acc => !acc.new_owner_id || acc.owner_id === acc.new_owner_id).length;
          const retentionRate = parentAccounts.length > 0 ? (retainedCount / parentAccounts.length) * 100 : 0;

          return {
            ...rep,
            totalAccounts: parentAccounts.length,
            customerAccounts: customerAccounts.length,
            prospectAccounts: prospectAccounts.length,
            totalARR,
            totalATR,
            riskCount,
            retainedCount,
            retentionRate,
            accounts: accounts || []
          };
        })
      );

      return repMetrics;
    },
    enabled: open && !!flmData && !!buildId && atrByAccount !== undefined,
  });

  // Fetch ALL accounts under this FLM (both customers and prospects) for direct drill-down
  const { data: flmAccountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['flm-all-accounts', flmData?.flm, buildId],
    queryFn: async () => {
      if (!flmData) return null;

      // First get all rep IDs under this FLM
      const { data: salesReps, error: repsError } = await supabase
        .from('sales_reps')
        .select('rep_id')
        .eq('build_id', buildId)
        .eq('flm', flmData.flm)
        .eq('is_active', true);

      if (repsError) throw repsError;
      const repIds = (salesReps || []).map(r => r.rep_id);
      
      if (repIds.length === 0) return { accounts: [], childrenByParent: new Map() };

      // Fetch ALL accounts (parents) for these reps
      const { data: parentAccounts, error: parentError } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id,
          account_name,
          is_parent,
          is_customer,
          hierarchy_bookings_arr_converted,
          calculated_arr,
          arr,
          calculated_atr,
          atr,
          cre_count,
          cre_risk,
          cre_status,
          expansion_tier,
          initial_sale_tier,
          owner_name,
          new_owner_name,
          owner_id,
          new_owner_id,
          hq_country,
          sales_territory,
          ultimate_parent_id
        `)
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .in('new_owner_id', repIds);

      if (parentError) throw parentError;

      // Also fetch accounts where new_owner_id is null but owner_id matches
      const { data: legacyAccounts, error: legacyError } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id,
          account_name,
          is_parent,
          is_customer,
          hierarchy_bookings_arr_converted,
          calculated_arr,
          arr,
          calculated_atr,
          atr,
          cre_count,
          cre_risk,
          cre_status,
          expansion_tier,
          initial_sale_tier,
          owner_name,
          new_owner_name,
          owner_id,
          new_owner_id,
          hq_country,
          sales_territory,
          ultimate_parent_id
        `)
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .is('new_owner_id', null)
        .in('owner_id', repIds);

      if (legacyError) throw legacyError;

      // Combine and dedupe
      const allParents = [...(parentAccounts || []), ...(legacyAccounts || [])];
      const uniqueParents = Array.from(new Map(allParents.map(a => [a.sfdc_account_id, a])).values());
      const parentIds = uniqueParents.map(p => p.sfdc_account_id);

      // Fetch children for these parents
      let childrenByParent = new Map<string, any[]>();
      if (parentIds.length > 0) {
        const { data: children, error: childError } = await supabase
          .from('accounts')
          .select(`
            sfdc_account_id,
            account_name,
            is_parent,
            is_customer,
            hierarchy_bookings_arr_converted,
            calculated_arr,
            arr,
            calculated_atr,
            atr,
            cre_count,
            cre_risk,
            cre_status,
            expansion_tier,
            initial_sale_tier,
            owner_name,
            new_owner_name,
            owner_id,
            new_owner_id,
            hq_country,
            sales_territory,
            ultimate_parent_id
          `)
          .eq('build_id', buildId)
          .eq('is_parent', false)
          .in('ultimate_parent_id', parentIds);

        if (!childError && children) {
          children.forEach(child => {
            if (!childrenByParent.has(child.ultimate_parent_id)) {
              childrenByParent.set(child.ultimate_parent_id, []);
            }
            childrenByParent.get(child.ultimate_parent_id)!.push(child);
          });
        }
      }

      return { accounts: uniqueParents, childrenByParent };
    },
    enabled: open && !!flmData && !!buildId && activeTab === 'accounts',
  });

  // Filter and organize accounts
  const filteredAccounts = useMemo(() => {
    if (!flmAccountsData?.accounts) return [];

    let accounts = flmAccountsData.accounts;

    // Filter by type
    if (accountTypeFilter === 'customers') {
      accounts = accounts.filter(a => a.is_customer);
    } else if (accountTypeFilter === 'prospects') {
      accounts = accounts.filter(a => !a.is_customer);
    }

    // Filter by search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      accounts = accounts.filter(a => 
        a.account_name?.toLowerCase().includes(lower) ||
        a.new_owner_name?.toLowerCase().includes(lower) ||
        a.owner_name?.toLowerCase().includes(lower) ||
        a.hq_country?.toLowerCase().includes(lower)
      );
    }

    // Sort by ARR descending
    return accounts.sort((a, b) => {
      const aArr = getAccountARR(a);
      const bArr = getAccountARR(b);
      return bArr - aArr;
    });
  }, [flmAccountsData?.accounts, accountTypeFilter, searchTerm]);

  // Calculate summary stats
  const accountsSummary = useMemo(() => {
    if (!flmAccountsData?.accounts) return { customers: 0, prospects: 0, totalARR: 0, totalATR: 0 };

    const customers = flmAccountsData.accounts.filter(a => a.is_customer);
    const prospects = flmAccountsData.accounts.filter(a => !a.is_customer);
    
    let totalARR = 0;
    flmAccountsData.accounts.forEach(a => {
      totalARR += getAccountARR(a);
    });
    
    // Calculate ATR from opportunities (more accurate)
    let totalATR = 0;
    flmAccountsData.accounts.forEach(a => {
      const atrFromOpps = atrByAccount?.get(a.sfdc_account_id) || 0;
      const atrFromAccount = getAccountATR(a);
      totalATR += atrFromOpps || atrFromAccount;
    });

    return { 
      customers: customers.length, 
      prospects: prospects.length, 
      totalARR, 
      totalATR,
      customerARR: customers.reduce((sum, a) => sum + getAccountARR(a), 0),
      prospectCount: prospects.length
    };
  }, [flmAccountsData?.accounts, atrByAccount]);

  const toggleParentExpansion = (parentId: string) => {
    const newExpanded = new Set(expandedParents);
    if (newExpanded.has(parentId)) {
      newExpanded.delete(parentId);
    } else {
      newExpanded.add(parentId);
    }
    setExpandedParents(newExpanded);
  };

  const getARR = (account: any) => {
    return getAccountARR(account);
  };

  /**
   * Get ATR for an account using SSOT getAccountATR from @/_domain.
   * Falls back to opportunity-sourced ATR if account field is empty.
   * @see MASTER_LOGIC.mdc §2.2
   */
  const getATR = (account: any) => {
    // Use SSOT getAccountATR first (from @/_domain)
    const atrFromAccount = getAccountATR(account);
    // Fall back to opportunity-sourced ATR if account field is empty
    const atrFromOpps = atrByAccount?.get(account.sfdc_account_id) || 0;
    return atrFromAccount || atrFromOpps;
  };

  if (!flmData) return null;

  const handleViewRep = (rep: any) => {
    setSelectedRep(rep);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {flmData.flm} - FLM Portfolio Breakdown
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Under SLM: {flmData.slm}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSendToManagerOpen(true)}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Send to Manager
              </Button>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="reps" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Sales Reps ({flmRepsData?.length ?? (flmData?.data.activeReps instanceof Set 
                  ? flmData.data.activeReps.size 
                  : (Array.isArray(flmData?.data.activeReps) ? flmData.data.activeReps.length : 0))})
              </TabsTrigger>
              <TabsTrigger value="accounts" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Parent Accounts ({flmAccountsData?.accounts?.length || '...'})
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Before/After
              </TabsTrigger>
              <TabsTrigger value="leaving" className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Accounts Leaving
              </TabsTrigger>
            </TabsList>

            {/* REPS TAB */}
            <TabsContent value="reps" className="space-y-6">
              {/* FLM Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Active Reps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {flmData.data.activeReps instanceof Set 
                        ? flmData.data.activeReps.size 
                        : (Array.isArray(flmData.data.activeReps) ? flmData.data.activeReps.length : 0)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Parent Accounts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {flmData.data.totalAccounts}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Total ARR
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(flmData.data.totalARR)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Total ATR
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(flmData.data.totalATR)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Risk Accounts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {flmData.data.riskCount}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Retention %
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {((flmData.data.retainedCount / flmData.data.totalAccounts) * 100).toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sales Reps Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Sales Representatives</CardTitle>
                </CardHeader>
                <CardContent>
                  {repsLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rep Name</TableHead>
                          <TableHead className="text-center">Team</TableHead>
                          <TableHead className="text-center">
                            <div className="flex flex-col">
                              <span>Customers</span>
                              <span className="text-[10px] text-muted-foreground font-normal">(Parents)</span>
                            </div>
                          </TableHead>
                          <TableHead className="text-center">
                            <div className="flex flex-col">
                              <span>Prospects</span>
                              <span className="text-[10px] text-muted-foreground font-normal">(Parents)</span>
                            </div>
                          </TableHead>
                          <TableHead className="text-center">ARR</TableHead>
                          <TableHead className="text-center">ATR</TableHead>
                          <TableHead className="text-center">
                            <div className="flex flex-col">
                              <span>Risk</span>
                              <span className="text-[10px] text-muted-foreground font-normal">(Parents)</span>
                            </div>
                          </TableHead>
                          <TableHead className="text-center">Retention</TableHead>
                          <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flmRepsData?.map((rep) => (
                          <TableRow 
                            key={rep.rep_id} 
                            className="hover:bg-muted/50 cursor-pointer"
                            onClick={() => handleViewRep(rep)}
                          >
                            <TableCell className="font-medium">{rep.name}</TableCell>
                            <TableCell className="text-center">{rep.team || '-'}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="default" className="text-xs">{rep.customerAccounts}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-xs">{rep.prospectAccounts}</Badge>
                            </TableCell>
                            <TableCell className="text-center">{formatCurrency(rep.totalARR)}</TableCell>
                            <TableCell className="text-center">{formatCurrency(rep.totalATR)}</TableCell>
                            <TableCell className="text-center">
                              {rep.riskCount > 0 ? (
                                <Badge variant="destructive">{rep.riskCount}</Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={rep.retentionRate >= 80 ? "default" : "secondary"}>
                                {rep.retentionRate.toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewRep(rep);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ACCOUNTS TAB - Direct drill-down to all accounts */}
            <TabsContent value="accounts" className="space-y-4">
              {/* Account Type Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card 
                  className={`cursor-pointer transition-colors ${accountTypeFilter === 'all' ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
                  onClick={() => setAccountTypeFilter('all')}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Parent Accounts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{accountsSummary.customers + accountsSummary.prospects}</div>
                    <p className="text-xs text-muted-foreground">{formatCurrency(accountsSummary.totalARR)} ARR</p>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-colors ${accountTypeFilter === 'customers' ? 'ring-2 ring-green-500' : 'hover:bg-muted/50'}`}
                  onClick={() => setAccountTypeFilter('customers')}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-green-600" />
                      Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{accountsSummary.customers}</div>
                    <p className="text-xs text-muted-foreground">{formatCurrency(accountsSummary.customerARR)} ARR</p>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-colors ${accountTypeFilter === 'prospects' ? 'ring-2 ring-blue-500' : 'hover:bg-muted/50'}`}
                  onClick={() => setAccountTypeFilter('prospects')}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <UserX className="h-4 w-4 text-blue-600" />
                      Prospects
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{accountsSummary.prospects}</div>
                    <p className="text-xs text-muted-foreground">No ARR (prospects)</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total ATR</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-amber-600">{formatCurrency(accountsSummary.totalATR)}</div>
                    <p className="text-xs text-muted-foreground">Available to Renew</p>
                  </CardContent>
                </Card>
              </div>

              {/* Search */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search accounts, owners, locations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Badge variant="outline">{filteredAccounts.length} accounts</Badge>
              </div>

              {/* Accounts Table with Hierarchy */}
              <Card>
                <CardContent className="p-0">
                  {accountsLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : (
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            <TableHead className="w-[300px]">Account</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Tier</TableHead>
                            <TableHead>Renewal</TableHead>
                            <TableHead className="text-right">ARR</TableHead>
                            <TableHead className="text-right">ATR / Close</TableHead>
                            <TableHead>Risk</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredAccounts.map((account) => {
                            const children = flmAccountsData?.childrenByParent?.get(account.sfdc_account_id) || [];
                            const hasChildren = children.length > 0;
                            const isExpanded = expandedParents.has(account.sfdc_account_id);

                            return (
                              <React.Fragment key={account.sfdc_account_id}>
                                {/* Parent Row */}
                                <TableRow 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => {
                                    if (hasChildren) {
                                      toggleParentExpansion(account.sfdc_account_id);
                                    } else {
                                      setSelectedAccount(account);
                                      setIsAccountDialogOpen(true);
                                    }
                                  }}
                                >
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {hasChildren ? (
                                        isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                                      ) : (
                                        <div className="w-4" />
                                      )}
                                      <div>
                                        <div className="font-medium">{account.account_name}</div>
                                        {hasChildren && (
                                          <div className="text-xs text-muted-foreground">
                                            {children.length} child account{children.length !== 1 ? 's' : ''}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={account.is_customer ? "default" : "outline"} className="text-xs">
                                      {account.is_customer ? 'Customer' : 'Prospect'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {account.new_owner_name || account.owner_name || 'Unassigned'}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-xs">
                                      {account.expansion_tier || account.initial_sale_tier || '-'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <RenewalQuarterBadge renewalQuarter={account.renewal_quarter} />
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    <div className="flex flex-col items-end">
                                      <span className={getARR(account) > 0 ? "text-green-600" : "text-muted-foreground"}>
                                        {formatCurrency(getARR(account))}
                                      </span>
                                      {!account.is_customer && getNetARR(account.sfdc_account_id) > 0 && (
                                        <span className={`text-xs ${getNetARRColorClass(getNetARR(account.sfdc_account_id))}`}>
                                          Net: {formatNetARR(getNetARR(account.sfdc_account_id))}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {account.is_customer ? (
                                      <span className="text-amber-600">{formatCurrency(getATR(account))}</span>
                                    ) : (
                                      formatCloseDate(getCloseDate(account.sfdc_account_id))
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {account.cre_status ? (
                                      <Badge 
                                        variant={account.cre_status === 'Confirmed Churn' || account.cre_status === 'At Risk' ? 'destructive' : 'secondary'}
                                        className="text-xs"
                                      >
                                        {account.cre_status}
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                </TableRow>

                                {/* Child Rows */}
                                {isExpanded && children.map((child: any) => (
                                  <TableRow 
                                    key={child.sfdc_account_id}
                                    className="bg-muted/30 cursor-pointer hover:bg-muted/50"
                                    onClick={() => {
                                      setSelectedAccount(child);
                                      setIsAccountDialogOpen(true);
                                    }}
                                  >
                                    <TableCell className="pl-10">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-muted-foreground rounded-full" />
                                        <span className="text-sm">{child.account_name}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="secondary" className="text-xs">Child</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {child.new_owner_name || child.owner_name || 'Unassigned'}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="text-xs">
                                        {child.expansion_tier || child.initial_sale_tier || '-'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <RenewalQuarterBadge renewalQuarter={child.renewal_quarter} />
                                    </TableCell>
                                    <TableCell className="text-right text-sm">
                                      <div className="flex flex-col items-end">
                                        <span className={getARR(child) > 0 ? "text-green-600" : "text-muted-foreground"}>
                                          {formatCurrency(getARR(child))}
                                        </span>
                                        {!child.is_customer && getNetARR(child.sfdc_account_id) > 0 && (
                                          <span className={`text-xs ${getNetARRColorClass(getNetARR(child.sfdc_account_id))}`}>
                                            Net: {formatNetARR(getNetARR(child.sfdc_account_id))}
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right text-sm">
                                      {child.is_customer ? (
                                        <span className="text-amber-600">{formatCurrency(getATR(child))}</span>
                                      ) : (
                                        formatCloseDate(getCloseDate(child.sfdc_account_id))
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {child.cre_status ? (
                                        <Badge 
                                          variant={child.cre_status === 'Confirmed Churn' || child.cre_status === 'At Risk' ? 'destructive' : 'secondary'}
                                          className="text-xs"
                                        >
                                          {child.cre_status}
                                        </Badge>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* BEFORE/AFTER ANALYTICS TAB */}
            <TabsContent value="analytics" className="space-y-4">
              <ManagerBeforeAfterComparison
                buildId={buildId}
                managerLevel="FLM"
                managerName={flmData.flm}
              />
            </TabsContent>

            {/* ACCOUNTS LEAVING TAB */}
            <TabsContent value="leaving" className="space-y-4">
              <AccountsLeavingView
                buildId={buildId}
                managerLevel="FLM"
                managerName={flmData.flm}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Rep Detail Dialog */}
      <SalesRepDetailDialog
        open={!!selectedRep}
        onOpenChange={(open) => !open && setSelectedRep(null)}
        rep={selectedRep}
        buildId={buildId}
      />

      {/* Account Detail Dialog */}
      <AccountDetailDialog
        open={isAccountDialogOpen}
        onOpenChange={setIsAccountDialogOpen}
        account={selectedAccount}
        buildId={buildId}
        availableReps={flmRepsData || []}
      />

      {/* Send to Manager Dialog */}
      <SendToManagerDialog
        open={sendToManagerOpen}
        onClose={() => setSendToManagerOpen(false)}
        buildId={buildId}
        managerName={flmData.flm}
        managerLevel="FLM"
      />
    </>
  );
};
