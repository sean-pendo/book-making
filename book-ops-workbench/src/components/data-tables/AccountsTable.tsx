import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Download, ChevronUp, ChevronDown, Sparkles, Lock, Unlock } from 'lucide-react';
import { TableFilters, type FilterConfig, type FilterValues } from '@/components/ui/table-filters';
import { useToast } from '@/hooks/use-toast';

interface Account {
  sfdc_account_id: string;
  account_name: string;
  owner_name: string | null;
  owner_id: string | null;
  new_owner_name: string | null;
  new_owner_id: string | null;
  parent_id: string | null;
  ultimate_parent_id: string | null;
  ultimate_parent_name: string | null;
  industry: string | null;
  employees: number | null;
  arr: number | null;
  atr: number | null;
  calculated_arr: number | null;
  calculated_atr: number | null;
  hierarchy_bookings: number | null;
  hierarchy_bookings_arr_converted: number | null;
  cre_count: number | null;
  is_customer: boolean;
  geo: string | null;
  enterprise_vs_commercial: string | null;
  hq_country: string | null;
  account_type: string | null;
  sales_territory: string | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  expansion_score: number | null;
  initial_sale_score: number | null;
  cre_risk: boolean | null;
  risk_flag: boolean | null;
  renewal_date: string | null;
  exclude_from_reassignment: boolean | null;
}

interface AccountsTableProps {
  buildId: string;
}

export const AccountsTable = ({ buildId }: AccountsTableProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [filters, setFilters] = useState<FilterValues>({});
  const [sortField, setSortField] = useState<keyof Account>('account_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const pageSize = 50;

  const toggleExclusionMutation = useMutation({
    mutationFn: async ({ accountId, currentValue }: { accountId: string; currentValue: boolean }) => {
      const { error } = await supabase
        .from('accounts')
        .update({ exclude_from_reassignment: !currentValue })
        .eq('sfdc_account_id', accountId)
        .eq('build_id', buildId);
      
      if (error) throw error;
    },
    onMutate: async ({ accountId, currentValue }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['accounts-detail', buildId] });
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData(['accounts-detail', buildId]);
      
      // Optimistically update the cache
      queryClient.setQueryData(['accounts-detail', buildId], (old: any) => {
        if (!old) return old;
        return old.map((acc: Account) => 
          acc.sfdc_account_id === accountId 
            ? { ...acc, exclude_from_reassignment: !currentValue }
            : acc
        );
      });
      
      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts-detail', buildId] });
      toast({
        title: "Success",
        description: "Account exclusion status updated",
      });
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['accounts-detail', buildId], context.previousData);
      }
      console.error('Error toggling exclusion:', error);
      toast({
        title: "Error",
        description: "Failed to update account exclusion status",
        variant: "destructive",
      });
    },
  });

  const filterConfigs: FilterConfig[] = [
    {
      key: 'account_type',
      label: 'Account Type',
      type: 'select',
      options: [], // Will be populated from data
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
      key: 'hierarchy_type',
      label: 'Hierarchy',
      type: 'select',
      options: [
        { value: 'parent', label: 'Parent Accounts' },
        { value: 'child', label: 'Child Accounts' }
      ],
      placeholder: 'All hierarchy types'
    },
    {
      key: 'exclusion_status',
      label: 'Lock Status',
      type: 'select',
      options: [
        { value: 'locked', label: 'Locked (Keep Owner)' },
        { value: 'unlocked', label: 'Unlocked (Can Reassign)' }
      ],
      placeholder: 'All accounts'
    },
    {
      key: 'risk_flags',
      label: 'Risk Flags',
      type: 'select',
      options: [
        { value: 'cre_risk', label: 'CRE Risk' },
        { value: 'risk_flag', label: 'Risk Flag' },
        { value: 'low_risk', label: 'Low Risk' }
      ],
      placeholder: 'All risk levels'
    },
    {
      key: 'arr_min',
      label: 'Min ARR ($)',
      type: 'number',
      min: 0
    }
  ];

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const getActiveFilterCount = () => {
    return Object.values(filters).filter(v => v !== null && v !== '' && v !== undefined).length;
  };

  const handleSort = (field: keyof Account) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: keyof Account) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4" /> : 
      <ChevronDown className="h-4 w-4" />;
  };

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts-detail', buildId, searchTerm, currentPage, filters, sortField, sortDirection],
    queryFn: async () => {
      let query = supabase
        .from('accounts')
        .select(`
          sfdc_account_id, account_name, owner_name, owner_id,
          new_owner_name, new_owner_id,
          parent_id, ultimate_parent_id, ultimate_parent_name,
          industry, employees, arr, atr, calculated_arr, calculated_atr, 
          hierarchy_bookings_arr_converted, cre_count,
          is_customer, geo, enterprise_vs_commercial, hq_country, account_type,
          sales_territory, expansion_tier, initial_sale_tier, expansion_score,
          initial_sale_score, cre_risk, risk_flag, renewal_date, exclude_from_reassignment
        `)
        .eq('build_id', buildId);

      if (searchTerm) {
        query = query.or(`account_name.ilike.%${searchTerm}%,owner_name.ilike.%${searchTerm}%,industry.ilike.%${searchTerm}%,hq_country.ilike.%${searchTerm}%,account_type.ilike.%${searchTerm}%,sales_territory.ilike.%${searchTerm}%,expansion_tier.ilike.%${searchTerm}%,initial_sale_tier.ilike.%${searchTerm}%,ultimate_parent_name.ilike.%${searchTerm}%`);
      }

      // Apply filters
      if (filters.account_type) {
        query = query.eq('account_type', filters.account_type as string);
      }
      if (filters.industry) {
        query = query.eq('industry', filters.industry as string);
      }
      if (filters.geo) {
        query = query.eq('geo', filters.geo as string);
      }
      if (filters.is_customer) {
        query = query.eq('is_customer', filters.is_customer === 'true');
      }
      if (filters.exclusion_status) {
        if (filters.exclusion_status === 'locked') {
          query = query.eq('exclude_from_reassignment', true);
        } else if (filters.exclusion_status === 'unlocked') {
          query = query.or('exclude_from_reassignment.is.null,exclude_from_reassignment.eq.false');
        }
      }
      if (filters.risk_flags) {
        if (filters.risk_flags === 'cre_risk') {
          query = query.eq('cre_risk', true);
        } else if (filters.risk_flags === 'risk_flag') {
          query = query.eq('risk_flag', true);
        } else if (filters.risk_flags === 'low_risk') {
          query = query.eq('cre_risk', false).eq('risk_flag', false);
        }
      }
      if (filters.arr_min) {
        query = query.gte('calculated_arr', filters.arr_min as number);
      }

      // Apply hierarchy filter with post-processing for complex logic
      let needsHierarchyFilter = false;
      if (filters.hierarchy_type) {
        needsHierarchyFilter = true;
      }

      // Apply sorting at database level
      const ascending = sortDirection === 'asc';
      if (sortField === 'account_name' || sortField === 'owner_name' || 
          sortField === 'sales_territory' || sortField === 'account_type' || 
          sortField === 'industry') {
        query = query.order(sortField as string, { ascending, nullsFirst: false });
      } else if (sortField === 'employees' || sortField === 'arr' || 
                 sortField === 'calculated_atr' || sortField === 'cre_count' ||
                 sortField === 'hierarchy_bookings_arr_converted') {
        query = query.order(sortField as string, { ascending, nullsFirst: false });
      } else if (sortField === 'cre_risk') {
        query = query.order('cre_risk', { ascending, nullsFirst: false });
      } else {
        // Default sorting
        query = query.order('account_name', { ascending: true });
      }

      // Apply pagination after all filtering and sorting
      query = query.range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

      const { data, error } = await query;
      if (error) throw error;
      
      let filteredData = data as Account[] || [];
      
      // Fetch assignments separately to avoid complex join issues
      if (filteredData.length > 0) {
        const accountIds = filteredData.map(a => a.sfdc_account_id);
        const { data: assignmentsData } = await supabase
          .from('assignments')
          .select('sfdc_account_id, rationale')
          .eq('build_id', buildId)
          .in('sfdc_account_id', accountIds);
        
        // Merge assignments into accounts
        const assignmentsMap = new Map(
          assignmentsData?.map(a => [a.sfdc_account_id, a]) || []
        );
        
        filteredData = filteredData.map(account => ({
          ...account,
          assignments: assignmentsMap.has(account.sfdc_account_id) 
            ? [assignmentsMap.get(account.sfdc_account_id)] 
            : []
        })) as any;
      }
      
      // Apply post-query hierarchy filter if needed
      if (needsHierarchyFilter && filters.hierarchy_type) {
        filteredData = filteredData.filter(account => {
          const isParent = account.sfdc_account_id === account.ultimate_parent_id;
          if (filters.hierarchy_type === 'parent' && !isParent) return false;
          if (filters.hierarchy_type === 'child' && isParent) return false;
          return true;
        });
      }
      
      return filteredData;
    },
    enabled: !!buildId,
  });

  const formatCurrency = (value: number | null) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatEmployees = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const getHierarchyInfo = (account: Account) => {
    const isParent = account.sfdc_account_id === account.ultimate_parent_id;
    return {
      isParent,
      hasParent: !isParent && account.ultimate_parent_id,
      parentName: account.ultimate_parent_name
    };
  };

  const getRiskBadge = (cre_risk: boolean | null, risk_flag: boolean | null) => {
    if (cre_risk) return <Badge variant="destructive">CRE Risk</Badge>;
    if (risk_flag) return <Badge variant="destructive">Risk Flag</Badge>;
    return <Badge variant="secondary">Low Risk</Badge>;
  };

  const getTierBadge = (tier: string | null) => {
    if (!tier) return null;
    
    let variant: "default" | "secondary" | "destructive" | "outline" = "default";
    if (tier.toLowerCase().includes('tier 1') || tier.toLowerCase().includes('tier1')) variant = "destructive";
    else if (tier.toLowerCase().includes('tier 2') || tier.toLowerCase().includes('tier2')) variant = "secondary";
    else if (tier.toLowerCase().includes('tier 3') || tier.toLowerCase().includes('tier3')) variant = "outline";
    
    return <Badge variant={variant}>{tier}</Badge>;
  };

  return (
    <>
      <TableFilters
        title="Account Filters"
        filters={filterConfigs}
        values={filters}
        onChange={handleFilterChange}
        onClear={clearFilters}
        activeCount={getActiveFilterCount()}
      />
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Accounts</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('account_name')}
                  >
                    <div className="flex items-center gap-1">
                      Account Name
                      {getSortIcon('account_name')}
                    </div>
                  </TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Keep Owner
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Lock account to prevent reassignment</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>Hierarchy</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('owner_name')}
                  >
                    <div className="flex items-center gap-1">
                      Current Owner
                      {getSortIcon('owner_name')}
                    </div>
                  </TableHead>
                  <TableHead>New Owner</TableHead>
                  <TableHead>Assignment Reasoning</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('sales_territory')}
                  >
                    <div className="flex items-center gap-1">
                      Territory
                      {getSortIcon('sales_territory')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('account_type')}
                  >
                    <div className="flex items-center gap-1">
                      Type
                      {getSortIcon('account_type')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('industry')}
                  >
                    <div className="flex items-center gap-1">
                      Industry
                      {getSortIcon('industry')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('employees')}
                  >
                    <div className="flex items-center gap-1">
                      Employees
                      {getSortIcon('employees')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('arr')}
                  >
                    <div className="flex items-center gap-1">
                      Bookings ARR
                      {getSortIcon('arr')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('hierarchy_bookings_arr_converted')}
                  >
                    <div className="flex items-center gap-1">
                      Hierarchy Bookings Account ARR
                      {getSortIcon('hierarchy_bookings_arr_converted')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('calculated_atr')}
                  >
                    <div className="flex items-center gap-1">
                      ATR (Calculated)
                      {getSortIcon('calculated_atr')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('cre_count')}
                  >
                    <div className="flex items-center gap-1">
                      CRE Count
                      {getSortIcon('cre_count')}
                    </div>
                  </TableHead>
                  <TableHead>Tiers & Segments</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('cre_risk')}
                  >
                    <div className="flex items-center gap-1">
                      Risk
                      {getSortIcon('cre_risk')}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts?.map((account) => {
                  const hierarchy = getHierarchyInfo(account);
                  return (
                    <TableRow key={account.sfdc_account_id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-1">
                          <span>{account.account_name}</span>
                          {account.hq_country && (
                            <span className="text-xs text-muted-foreground">{account.hq_country}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExclusionMutation.mutate({
                                    accountId: account.sfdc_account_id,
                                    currentValue: account.exclude_from_reassignment || false
                                  });
                                }}
                                disabled={toggleExclusionMutation.isPending}
                                className="h-8 w-8 p-0"
                              >
                                {account.exclude_from_reassignment ? (
                                  <Lock className="h-4 w-4 text-orange-500" />
                                ) : (
                                  <Unlock className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {account.exclude_from_reassignment
                                  ? 'Click to allow reassignment'
                                  : 'Click to lock and keep current owner'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={hierarchy.isParent ? "default" : "outline"} className="text-xs">
                            {hierarchy.isParent ? "Parent" : "Child"}
                          </Badge>
                          {hierarchy.hasParent && hierarchy.parentName && (
                            <span className="text-xs text-muted-foreground max-w-[120px] truncate">
                              Parent: {hierarchy.parentName}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.owner_name || (
                          <Badge variant="secondary">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.new_owner_name ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="default" className="text-xs">
                              {account.new_owner_name}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Proposed
                            </span>
                          </div>
                        ) : (
                          <Badge variant="secondary">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          {(account as any).assignments?.[0]?.rationale ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="cursor-help gap-1">
                                  <Sparkles className="h-3 w-3" />
                                  Why this rep?
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <p className="text-sm">{(account as any).assignments[0].rationale}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        {account.sales_territory ? (
                          <Badge variant="outline" className="text-xs">
                            {account.sales_territory}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {account.geo && (
                            <span className="text-xs text-muted-foreground">{account.geo}</span>
                          )}
                          {!account.sales_territory && !account.geo && '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.account_type ? (
                          <Badge 
                            variant={account.account_type === 'Enterprise' ? 'default' : 'outline'}
                          >
                            {account.account_type}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>{account.industry || '-'}</TableCell>
                      <TableCell>{formatEmployees(account.employees)}</TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(account.arr)}
                      </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {formatCurrency(account.hierarchy_bookings_arr_converted || 0)}
                          </div>
                        </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-blue-600">
                            {formatCurrency(account.calculated_atr)}
                          </div>
                          {account.atr && account.atr !== account.calculated_atr && (
                            <div className="text-xs text-muted-foreground">
                              Account: {formatCurrency(account.atr)}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          {account.cre_count ? (
                            <Badge variant="destructive" className="min-w-[2rem] justify-center">
                              {account.cre_count}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="min-w-[2rem] justify-center">
                              0
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          {account.expansion_tier && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Expansion:</span>
                              {getTierBadge(account.expansion_tier)}
                            </div>
                          )}
                          {account.initial_sale_tier && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Initial Sale:</span>
                              {getTierBadge(account.initial_sale_tier)}
                            </div>
                          )}
                          {!account.expansion_tier && !account.initial_sale_tier && '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getRiskBadge(account.cre_risk, account.risk_flag)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {accounts && accounts.length === pageSize && (
              <div className="flex justify-center">
                <Button 
                  variant="outline" 
                  onClick={() => setCurrentPage(prev => prev + 1)}
                >
                  Load More
                </Button>
              </div>
            )}

            {accounts && accounts.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No accounts found matching your search criteria.
              </div>
            )}
          </div>
        )}
      </CardContent>
      </Card>
    </>
  );
};