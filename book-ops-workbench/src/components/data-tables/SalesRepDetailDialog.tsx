import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateSalesRepMetrics, getAccountCustomerStatus } from '@/utils/salesRepCalculations';
import { getAccountARR, getAccountATR } from '@/utils/accountCalculations';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Building2, TrendingUp, AlertTriangle, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { TableFilters, type FilterConfig, type FilterValues } from '@/components/ui/table-filters';

interface SalesRepDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rep: {
    rep_id: string;
    name: string;
    team: string | null;
    flm: string | null;
    slm: string | null;
  } | null;
  buildId: string;
}

interface AccountWithHierarchy {
  sfdc_account_id: string;
  account_name: string;
  ultimate_parent_id: string | null;
  ultimate_parent_name: string | null;
  is_customer: boolean;
  is_parent: boolean;
  arr: number;
  atr: number;
  calculated_arr: number;
  calculated_atr: number;
  hierarchy_bookings_arr_converted: number;
  cre_count: number;
  industry: string | null;
  account_type: string | null;
  geo: string | null;
  sales_territory: string | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  cre_risk: boolean;
  risk_flag: boolean;
  owner_id: string;
  owner_name: string | null;
  new_owner_id: string | null;
  new_owner_name: string | null;
  hq_country: string | null;
  children?: AccountWithHierarchy[];
  isParent: boolean;
}

export const SalesRepDetailDialog = ({ open, onOpenChange, rep, buildId }: SalesRepDetailDialogProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterValues>({});
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const filterConfigs: FilterConfig[] = [
    {
      key: 'account_type',
      label: 'Account Type',
      type: 'select',
      options: [
        { value: 'Customer', label: 'Customer' },
        { value: 'Prospect', label: 'Prospect' }
      ],
      placeholder: 'All types'
    },
    {
      key: 'industry',
      label: 'Industry',
      type: 'select',
      options: [], // Will be populated from data
      placeholder: 'All industries'
    },
    {
      key: 'geo',
      label: 'Geography',
      type: 'select',
      options: [], // Will be populated from data
      placeholder: 'All geographies'
    },
    {
      key: 'tier',
      label: 'Tier',
      type: 'select',
      options: [
        { value: 'Tier 1', label: 'Tier 1' },
        { value: 'Tier 2', label: 'Tier 2' },
        { value: 'Tier 3', label: 'Tier 3' },
        { value: 'Tier 4', label: 'Tier 4' }
      ],
      placeholder: 'All tiers'
    }
  ];

  const { data: repDetail, isLoading, error } = useQuery({
    queryKey: ['sales-rep-detail', rep?.rep_id, buildId, searchTerm, filters],
    queryFn: async () => {
      try {
        if (!rep) return null;

        // Get all accounts where this rep is the final owner (either new_owner_id or owner_id if no new assignment)
        let accountsQuery = supabase
          .from('accounts')
          .select(`
            sfdc_account_id,
            account_name,
            ultimate_parent_id,
            ultimate_parent_name,
            is_customer,
            is_parent,
            arr,
            atr,
            calculated_arr,
            calculated_atr,
            hierarchy_bookings_arr_converted,
            cre_count,
            industry,
            account_type,
            geo,
            sales_territory,
            expansion_tier,
            initial_sale_tier,
            cre_risk,
            risk_flag,
            owner_id,
            owner_name,
            new_owner_id,
            new_owner_name,
            hq_country
          `)
          .eq('build_id', buildId)
          .or(`new_owner_id.eq.${rep.rep_id},and(owner_id.eq.${rep.rep_id},new_owner_id.is.null)`);

        if (searchTerm) {
          accountsQuery = accountsQuery.or(`account_name.ilike.%${searchTerm}%,ultimate_parent_name.ilike.%${searchTerm}%,industry.ilike.%${searchTerm}%,account_type.ilike.%${searchTerm}%,geo.ilike.%${searchTerm}%,sales_territory.ilike.%${searchTerm}%`);
        }

        const { data: accounts, error: accountsError } = await accountsQuery.order('account_name');
        if (accountsError) throw accountsError;
        if (!accounts) return null;
        
        // DEBUG: Log tier data from database
        console.log('🔍 TIER DEBUG - First 5 accounts:', accounts.slice(0, 5).map(a => ({
          name: a.account_name,
          expansion_tier: a.expansion_tier,
          initial_sale_tier: a.initial_sale_tier,
          combined: a.expansion_tier || a.initial_sale_tier
        })));

        // Get opportunities data for ATR and CRE calculations - check both old and new owner assignments
        const { data: opportunities, error: oppsError } = await supabase
          .from('opportunities')
          .select('owner_id, new_owner_id, new_owner_name, renewal_event_date, sfdc_account_id, available_to_renew, cre_status, opportunity_type')
          .eq('build_id', buildId)
          .or(`new_owner_id.eq.${rep.rep_id},and(owner_id.eq.${rep.rep_id},new_owner_id.is.null)`);

        if (oppsError) throw oppsError;

        // Debug: Log raw account data for ATR investigation
        console.log(`[DEBUG Dialog] Fetched ${accounts.length} accounts for rep ${rep.rep_id}`);
        console.log('[DEBUG Dialog] Sample account ATR values:', accounts.slice(0, 5).map(a => ({
          name: a.account_name,
          atr: a.atr,
          calculated_atr: a.calculated_atr
        })));

        // Use shared calculation utility for consistent metrics
        const metrics = calculateSalesRepMetrics(rep.rep_id, accounts, opportunities || []);
        
        console.log('[DEBUG Dialog] Calculated metrics:', metrics);

        // Structure the hierarchy for display using updated parent/child logic
        // Parent accounts: those with blank ultimate_parent_id
        // Child accounts: those with non-blank ultimate_parent_id
        const hierarchicalAccounts: AccountWithHierarchy[] = [];
        
        // Group accounts: parents and children separately
        const parentAccounts = accounts.filter(a => 
          !a.ultimate_parent_id || 
          a.ultimate_parent_id === '' || 
          a.ultimate_parent_id.trim() === ''
        );
        
        const childAccounts = accounts.filter(a => 
          a.ultimate_parent_id && 
          a.ultimate_parent_id !== '' && 
          a.ultimate_parent_id.trim() !== ''
        );

        // Add parent accounts to hierarchy
        parentAccounts.forEach(parent => {
          hierarchicalAccounts.push({
            ...parent,
            children: [],
            isParent: true
          });
        });
        
        // DEBUG: Check tier data after parent processing
        console.log('🔍 TIER DEBUG - After adding parents:', hierarchicalAccounts.slice(0, 3).map(a => ({
          name: a.account_name,
          expansion_tier: a.expansion_tier,
          initial_sale_tier: a.initial_sale_tier
        })));

        // Group child accounts by their ultimate parent ID
        const childAccountsByParent = new Map<string, typeof accounts>();
        childAccounts.forEach(child => {
          const parentId = child.ultimate_parent_id!;
          if (!childAccountsByParent.has(parentId)) {
            childAccountsByParent.set(parentId, []);
          }
          childAccountsByParent.get(parentId)!.push(child);
        });

        // Add orphaned child hierarchies (children whose parents aren't owned by this rep)
        childAccountsByParent.forEach((children, parentId) => {
          // Create a virtual parent entry for display purposes
          const firstChild = children[0];
          // Use the children's owner for the parent since they share ownership in this view
          const childOwnerName = firstChild.new_owner_name || firstChild.owner_name;
          const childOwnerId = firstChild.new_owner_id || firstChild.owner_id;
          const virtualParent: AccountWithHierarchy = {
            sfdc_account_id: `virtual-parent-${parentId}`, // Use unique key to avoid duplicates
            account_name: `${firstChild.ultimate_parent_name || 'Unknown Parent'} (Parent - Not Owned)`,
            ultimate_parent_id: null,
            ultimate_parent_name: firstChild.ultimate_parent_name,
            is_customer: false,
            is_parent: true,
            arr: 0,
            atr: 0,
            calculated_arr: 0,
            calculated_atr: 0,
            hierarchy_bookings_arr_converted: 0,
            cre_count: 0,
            industry: null,
            account_type: null,
            geo: null,
            sales_territory: null,
            expansion_tier: null,
            initial_sale_tier: null,
            cre_risk: false,
            risk_flag: false,
            owner_id: childOwnerId,
            owner_name: childOwnerName,
            new_owner_id: childOwnerId,
            new_owner_name: childOwnerName,
            hq_country: null,
            children: children.map(child => ({
              ...child,
              children: [],
              isParent: false
            })),
            isParent: true
          };
          hierarchicalAccounts.push(virtualParent);
        });

        // Group accounts by parent for hierarchy calculations (for filtering)
        const accountsByParent = new Map<string, typeof accounts>();
        accounts.forEach(account => {
          const parentId = account.ultimate_parent_id || account.sfdc_account_id;
          if (!accountsByParent.has(parentId)) {
            accountsByParent.set(parentId, []);
          }
          accountsByParent.get(parentId)!.push(account);
        });

        // Apply filters using hierarchy-based customer/prospect logic
        const filteredAccounts = hierarchicalAccounts.filter(account => {
          try {
            if (filters.account_type) {
              const customerStatus = getAccountCustomerStatus(account, accountsByParent);
              if (customerStatus !== filters.account_type) return false;
            }
            if (filters.industry && account.industry !== filters.industry) return false;
            if (filters.geo && account.geo !== filters.geo) return false;
            if (filters.tier) {
              const tier = account.expansion_tier || account.initial_sale_tier;
              if (tier !== filters.tier) return false;
            }
            return true;
          } catch (filterError) {
            console.warn('[WARN SalesRepDetailDialog] Filter error for account:', account.sfdc_account_id, filterError);
            return true; // Include account if filter fails
          }
        });

        // Calculate summary using metrics from shared utility
        const summary = {
          totalAccounts: metrics.total_accounts,
          parentAccounts: metrics.parent_accounts,
          childAccounts: metrics.child_accounts,
          customerAccounts: metrics.customer_accounts,
          prospectAccounts: metrics.prospect_accounts,
          totalARR: metrics.total_arr,
          totalATR: metrics.total_atr,
          totalCRECount: metrics.cre_risk_count,
          renewalCount: metrics.renewal_count
        };

        // DEBUG: Check tier data in final filtered accounts
        console.log('🔍 TIER DEBUG - Final filtered accounts:', filteredAccounts.slice(0, 3).map(a => ({
          name: a.account_name,
          expansion_tier: a.expansion_tier,
          initial_sale_tier: a.initial_sale_tier
        })));

        return {
          accounts: filteredAccounts,
          summary,
          industries: [...new Set(accounts.map(a => a.industry).filter(Boolean))],
          geos: [...new Set(accounts.map(a => a.geo).filter(Boolean))],
          hierarchyOpportunities: opportunities || [],
          accountsByParent: accountsByParent
        };

      } catch (error) {
        console.error('[ERROR SalesRepDetailDialog] Query failed:', error);
        throw error;
      }
    },
    enabled: open && !!rep && !!buildId,
    retry: 1,
    retryDelay: 1000,
  });

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const getActiveFilterCount = () => {
    return Object.values(filters).filter(v => v !== null && v !== '' && v !== undefined).length;
  };

  const formatCurrency = (value: number | undefined) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getFiscalQuarter = (date: string | Date) => {
    const d = new Date(date);
    const month = d.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
    
    // FY starts in February
    if (month >= 2 && month <= 4) return 'Q1';
    if (month >= 5 && month <= 7) return 'Q2'; 
    if (month >= 8 && month <= 10) return 'Q3';
    return 'Q4'; // Nov, Dec, Jan
  };

  const getRenewalsByQuarter = () => {
    if (!repDetail?.hierarchyOpportunities) return { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    
    const quarters = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    
    repDetail.hierarchyOpportunities.forEach(opp => {
      if (opp.renewal_event_date) {
        const quarter = getFiscalQuarter(opp.renewal_event_date);
        quarters[quarter as keyof typeof quarters]++;
      }
    });
    
    return quarters;
  };

  const getTierBadge = (tier: string | null) => {
    if (!tier) return <span className="text-xs text-muted-foreground">-</span>;
    const variant = tier === 'Tier 1' ? 'default' : 'outline';
    return <Badge variant={variant} className="text-xs">{tier}</Badge>;
  };

  const getPreviousOwnerInfo = (account: AccountWithHierarchy) => {
    // Show the original owner (owner_name) - this is who owned it BEFORE any reassignment
    // If there was a reassignment (new_owner_id exists), owner_name is the previous owner
    // If no reassignment, owner_name is still the owner (so technically no "previous")
    return account.owner_name || account.owner_id || 'Unknown';
  };

  const toggleParentExpansion = (parentId: string) => {
    const newExpanded = new Set(expandedParents);
    if (newExpanded.has(parentId)) {
      newExpanded.delete(parentId);
    } else {
      newExpanded.add(parentId);
    }
    setExpandedParents(newExpanded);
  };

  if (!rep) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-none max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {rep.name} - Detailed View
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="h-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Account Portfolio</TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-2">
              <div className="text-red-500">Error loading sales representative details</div>
              <div className="text-sm text-muted-foreground">Please close and try again</div>
            </div>
          ) : !repDetail ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted-foreground">No data found for this representative</div>
            </div>
          ) : (
            <>
              <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Account Portfolio
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Accounts:</span>
                    <span className="font-semibold">{repDetail?.summary.totalAccounts || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Parent Accounts:</span>
                    <span className="font-semibold">{repDetail?.summary.parentAccounts || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Child Accounts:</span>
                    <span className="font-semibold">{repDetail?.summary.childAccounts || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Customers:</span>
                    <span className="font-semibold text-green-600">{repDetail?.summary.customerAccounts || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Prospects:</span>
                    <span className="font-semibold text-blue-600">{repDetail?.summary.prospectAccounts || 0}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Financial Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total ARR:</span>
                    <span className="font-semibold text-green-600">
                      {formatCurrency(repDetail?.summary.totalARR)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total ATR:</span>
                    <span className="font-semibold text-red-600">
                      {formatCurrency(repDetail?.summary.totalATR)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CRE Count:</span>
                    <span className="font-semibold text-orange-600">{repDetail?.summary.totalCRECount || 0}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Renewals by Quarter
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(() => {
                    const renewalsByQuarter = getRenewalsByQuarter();
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Q1 (Feb-Apr):</span>
                          <span className="font-semibold">{renewalsByQuarter.Q1}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Q2 (May-Jul):</span>
                          <span className="font-semibold">{renewalsByQuarter.Q2}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Q3 (Aug-Oct):</span>
                          <span className="font-semibold">{renewalsByQuarter.Q3}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Q4 (Nov-Jan):</span>
                          <span className="font-semibold">{renewalsByQuarter.Q4}</span>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Rep Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-semibold">{rep.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rep ID:</span>
                      <span className="font-mono text-xs">{rep.rep_id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Team:</span>
                      <span>{rep.team || 'Not assigned'}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">FLM:</span>
                      <span>{rep.flm || 'Not assigned'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SLM:</span>
                      <span>{rep.slm || 'Not assigned'}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accounts" className="space-y-4 h-full overflow-hidden">
            <div className="space-y-4">
              <TableFilters
                title="Account Filters"
                filters={filterConfigs.map(config => {
                  if (config.key === 'industry') {
                    return {
                      ...config,
                      options: repDetail?.industries.map(industry => ({ value: industry, label: industry })) || []
                    };
                  }
                  if (config.key === 'geo') {
                    return {
                      ...config,
                      options: repDetail?.geos.map(geo => ({ value: geo, label: geo })) || []
                    };
                  }
                  return config;
                })}
                values={filters}
                onChange={handleFilterChange}
                onClear={clearFilters}
                activeCount={getActiveFilterCount()}
              />

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search accounts, industries, territories..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="border rounded-lg" style={{ width: '100% !important', minWidth: '1400px !important' }}>
                <div className="text-xs text-muted-foreground mb-2 p-2 bg-yellow-50 dark:bg-yellow-950/30 border dark:border-yellow-800">
                  DEBUG: Table should have 10 columns. Check if all are visible.
                </div>
                <div className="max-h-96 overflow-auto" style={{ width: '100% !important' }}>
                  <Table className="w-full min-w-[1600px]" style={{ tableLayout: 'fixed', width: '1600px !important' }}>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead style={{ width: '200px' }}>Account</TableHead>
                          <TableHead style={{ width: '150px' }} className="bg-blue-50 dark:bg-blue-950/30">Previous Owner</TableHead>
                          <TableHead style={{ width: '120px' }} className="bg-green-50 dark:bg-green-950/30">HQ Location</TableHead>
                          <TableHead style={{ width: '100px' }}>Type</TableHead>
                          <TableHead style={{ width: '140px' }}>Industry</TableHead>
                          <TableHead style={{ width: '120px' }}>Geography</TableHead>
                          <TableHead style={{ width: '80px' }}>Tier</TableHead>
                          <TableHead style={{ width: '120px' }}>ARR</TableHead>
                          <TableHead style={{ width: '120px' }}>ATR</TableHead>
                          <TableHead style={{ width: '100px' }}>CRE Risk</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                           <TableCell colSpan={10} className="text-center py-8">
                             <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                           </TableCell>
                         </TableRow>
                      ) : (
                        repDetail?.accounts.map((account) => (
                          <React.Fragment key={account.sfdc_account_id}>
                            <TableRow 
                              className={`${account.isParent ? 'bg-muted/50' : ''} cursor-pointer hover:bg-muted/30`}
                              onClick={() => account.children && account.children.length > 0 && toggleParentExpansion(account.sfdc_account_id)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {account.children && account.children.length > 0 && (
                                    expandedParents.has(account.sfdc_account_id) ? 
                                      <ChevronDown className="h-4 w-4" /> : 
                                      <ChevronRight className="h-4 w-4" />
                                  )}
                                  <div>
                                    <div className="font-medium">{account.account_name}</div>
                                    {account.children && account.children.length > 0 && (
                                      <div className="text-xs text-muted-foreground">
                                        {account.children.length} child account{account.children.length !== 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </div>
                                 </div>
                               </TableCell>
                                 <TableCell className="text-sm bg-blue-50 dark:bg-blue-950/30">
                                   <Badge variant={getPreviousOwnerInfo(account) === 'No Change' ? 'outline' : 'secondary'} className="text-xs">
                                     {getPreviousOwnerInfo(account)}
                                   </Badge>
                                 </TableCell>
                                 <TableCell className="text-sm bg-green-50 dark:bg-green-950/30">{account.hq_country || '-'}</TableCell>
                                <TableCell>
                                <div className="flex flex-col gap-1">
                                  {(() => {
                                    // Use hierarchy-based customer/prospect logic - SAME AS SalesRepsTable
                                    const parentId = account.ultimate_parent_id || account.sfdc_account_id;
                                    const hierarchyAccounts = repDetail?.accountsByParent?.get(parentId) || [];
                                    const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
                                    const isCustomer = hierarchyARR > 0;
                                    return isCustomer ? (
                                      <Badge variant="default" className="text-xs">Customer</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">Prospect</Badge>
                                    );
                                  })()}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{account.industry || '-'}</TableCell>
                              <TableCell className="text-sm">{account.geo || '-'}</TableCell>
                              <TableCell>
                                {getTierBadge(account.expansion_tier || account.initial_sale_tier)}
                              </TableCell>
                              <TableCell className="text-sm font-medium text-green-600">
                                {formatCurrency(getAccountARR(account))}
                              </TableCell>
                              <TableCell className="text-sm font-medium text-red-600">
                                {(() => {
                                  // Calculate ATR from RENEWAL opportunities only for this account
                                  const accountATR = repDetail?.hierarchyOpportunities?.filter(o => 
                                    o.sfdc_account_id === account.sfdc_account_id &&
                                    o.opportunity_type && o.opportunity_type.toLowerCase().trim() === 'renewals'
                                  ).reduce((sum, opp) => sum + (opp.available_to_renew || 0), 0) || 0;
                                  return formatCurrency(accountATR);
                                })()}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  // Calculate CRE risk from opportunities - ALIGN WITH SalesRepsTable  
                                  const accountCRECount = repDetail?.hierarchyOpportunities?.filter(o => 
                                    o.sfdc_account_id === account.sfdc_account_id && 
                                    o.cre_status && o.cre_status.trim() !== ''
                                  ).length || 0;
                                  
                                  if (accountCRECount === 0) {
                                    return <Badge variant="secondary" className="text-xs">No Risk</Badge>;
                                  } else {
                                    return <Badge variant="destructive" className="text-xs">{accountCRECount} CRE</Badge>;
                                  }
                                })()}
                              </TableCell>
                            </TableRow>
                            
                            {/* Child accounts */}
                            {expandedParents.has(account.sfdc_account_id) && account.children?.map((child) => (
                              <TableRow key={child.sfdc_account_id} className="bg-muted/20">
                                <TableCell className="pl-8">
                                  <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 flex items-center justify-center">
                                      <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
                                    </div>
                                    <div className="font-medium text-sm">{child.account_name}</div>
                                   </div>
                                 </TableCell>
                                  <TableCell className="text-sm pl-12">
                                    <Badge variant={getPreviousOwnerInfo(child) === 'No Change' ? 'outline' : 'secondary'} className="text-xs">
                                      {getPreviousOwnerInfo(child)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm pl-12">{child.hq_country || '-'}</TableCell>
                                  <TableCell>
                                  {(() => {
                                    // Use hierarchy-based customer/prospect logic for children too - SAME AS SalesRepsTable
                                    const parentId = child.ultimate_parent_id || child.sfdc_account_id;
                                    const hierarchyAccounts = repDetail?.accountsByParent?.get(parentId) || [];
                                    const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
                                    const isCustomer = hierarchyARR > 0;
                                    return isCustomer ? (
                                      <Badge variant="default" className="text-xs">Customer</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">Prospect</Badge>
                                    );
                                  })()}
                                 </TableCell>
                                <TableCell className="text-sm">{child.industry || '-'}</TableCell>
                                <TableCell className="text-sm">{child.geo || '-'}</TableCell>
                                <TableCell>
                                  {getTierBadge(child.expansion_tier || child.initial_sale_tier)}
                                </TableCell>
                                <TableCell className="text-sm font-medium text-green-600">
                                  {formatCurrency(getAccountARR(child))}
                                </TableCell>
                                  <TableCell className="text-sm font-medium text-red-600">
                                    {(() => {
                                      // Calculate ATR from RENEWAL opportunities only for child account
                                      const childATR = repDetail?.hierarchyOpportunities?.filter(o => 
                                        o.sfdc_account_id === child.sfdc_account_id &&
                                        o.opportunity_type && o.opportunity_type.toLowerCase().trim() === 'renewals'
                                      ).reduce((sum, opp) => sum + (opp.available_to_renew || 0), 0) || 0;
                                      return formatCurrency(childATR);
                                    })()}
                                  </TableCell>
                                 <TableCell>
                                  {(() => {
                                    // Calculate CRE risk from opportunities for this child account - ALIGN WITH SalesRepsTable  
                                    const childCRECount = repDetail?.hierarchyOpportunities?.filter(o => 
                                      o.sfdc_account_id === child.sfdc_account_id && 
                                      o.cre_status && o.cre_status.trim() !== ''
                                    ).length || 0;
                                    
                                    if (childCRECount === 0) {
                                      return <Badge variant="secondary" className="text-xs">No Risk</Badge>;
                                    } else {
                                      return <Badge variant="destructive" className="text-xs">{childCRECount} CRE</Badge>;
                                    }
                                  })()}
                                 </TableCell>
                              </TableRow>
                            ))}
                          </React.Fragment>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {repDetail?.accounts.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No accounts found matching your search criteria.
                </div>
              )}
            </div>
          </TabsContent>
            </>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};