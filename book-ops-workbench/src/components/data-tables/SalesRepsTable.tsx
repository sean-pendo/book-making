import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Download, Users, ChevronUp, ChevronDown } from 'lucide-react';
import { TableFilters, type FilterConfig, type FilterValues } from '@/components/ui/table-filters';
import { SalesRepDetailDialog } from './SalesRepDetailDialog';
import { calculateSalesRepMetrics, type SalesRepMetrics } from '@/utils/salesRepCalculations';

interface SalesRep {
  rep_id: string;
  name: string;
  team: string | null;
  slm: string | null;
  flm: string | null;
  parent_accounts: number;
  child_accounts: number;
  customer_accounts: number;
  prospect_accounts: number;
  total_accounts: number;
  total_arr: number;
  total_atr: number;
  renewal_count: number;
  cre_risk_count: number;
}

interface SalesRepsTableProps {
  buildId: string;
}

/*
 * Sales Rep Breakdown Implementation:
 * 
 * Account Rules:
 * - Parent Account: Account ID = Financial Ultimate Parent Account ID
 * - Child Account: Account ID ≠ Financial Ultimate Parent Account ID
 * 
 * Customer & Prospect Classification (evaluated at parent account level):
 * - Customers: Hierarchy Bookings Account ARR > 0
 * - Prospects: Hierarchy Bookings Account ARR = 0
 * 
 * Metrics:
 * - ARR: Sum of Hierarchy ARR across parent
 * - ATR: Sum of ATR for parent and all children based on opportunities
 * - Risk: Count of opportunities tied to both parent and children
 */

export const SalesRepsTable = ({ buildId }: SalesRepsTableProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterValues>({});
  const [selectedRep, setSelectedRep] = useState<{
    rep_id: string;
    name: string;
    team: string | null;
    flm: string | null;
    slm: string | null;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<keyof SalesRep>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const filterConfigs: FilterConfig[] = [
    {
      key: 'team',
      label: 'Team',
      type: 'select',
      options: [], // Will be populated from data
      placeholder: 'All teams'
    },
    {
      key: 'flm',
      label: 'FLM',
      type: 'select',
      options: [], // Will be populated from data
      placeholder: 'All FLMs'
    },
    {
      key: 'slm',
      label: 'SLM',
      type: 'select',
      options: [], // Will be populated from data
      placeholder: 'All SLMs'
    },
    {
      key: 'account_count_range',
      label: 'Account Count',
      type: 'range',
      min: 0,
      max: 200
    },
    {
      key: 'arr_range',
      label: 'ARR ($)',
      type: 'range',
      min: 0,
      max: 10000000
    },
    {
      key: 'risk_level',
      label: 'CRE Risk Level',
      type: 'select',
      options: [
        { value: 'none', label: 'No CRE Risk' },
        { value: 'low', label: 'Low CRE Risk' },
        { value: 'medium', label: 'Medium CRE Risk' },
        { value: 'high', label: 'High CRE Risk' }
      ],
      placeholder: 'All risk levels'
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

  const handleSort = (field: keyof SalesRep) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: keyof SalesRep) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4" /> : 
      <ChevronDown className="h-4 w-4" />;
  };

  const sortData = (data: SalesRep[]) => {
    // Only sort by calculated fields that can't be sorted at DB level
    if (sortField === 'total_accounts' || sortField === 'total_arr' || sortField === 'cre_risk_count') {
      return [...data].sort((a, b) => {
        const aValue = a[sortField] as number;
        const bValue = b[sortField] as number;
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      });
    }
    return data;
  };

  const { data: salesReps, isLoading, error } = useQuery({
    queryKey: ['sales-reps-detail', buildId, searchTerm, filters, sortField, sortDirection],
    queryFn: async () => {
      try {
        console.log('[DEBUG SalesRepsTable] Starting rep-first approach...');
        
        // Step 1: Get sales_reps first with filters applied
        let repsQuery = supabase
          .from('sales_reps')
          .select('rep_id, name, team, flm, slm')
          .eq('build_id', buildId);

        // Apply rep-based search and filters
        if (searchTerm) {
          repsQuery = repsQuery.or(`name.ilike.%${searchTerm}%,team.ilike.%${searchTerm}%,flm.ilike.%${searchTerm}%,slm.ilike.%${searchTerm}%`);
        }
        if (filters.team) {
          repsQuery = repsQuery.eq('team', filters.team as string);
        }
        if (filters.flm) {
          repsQuery = repsQuery.eq('flm', filters.flm as string);
        }
        if (filters.slm) {
          repsQuery = repsQuery.eq('slm', filters.slm as string);
        }

        const { data: reps, error: repsError } = await repsQuery.order(
          sortField === 'name' ? 'name' : 
          sortField === 'team' ? 'team' : 
          sortField === 'flm' ? 'flm' : 
          sortField === 'slm' ? 'slm' : 'name', 
          { ascending: sortDirection === 'asc', nullsFirst: false }
        );
        if (repsError) throw repsError;
        if (!reps || reps.length === 0) return [];

        console.log(`[DEBUG SalesRepsTable] Found ${reps.length} sales_reps matching criteria`);

        // Step 2 & 3: Get accounts and opportunities for each rep individually (same as detail dialog)
        const repIds = reps.map(rep => rep.rep_id);
        const repMetrics: Record<string, SalesRepMetrics> = {};
        
        // Process each rep individually to match detail dialog logic
        for (const repId of repIds) {
          try {
            // Get accounts for this specific rep
            const { data: repAccounts, error: accountsError } = await supabase
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
                new_owner_id,
                new_owner_name
              `)
              .eq('build_id', buildId)
              .or(`new_owner_id.eq.${repId},and(owner_id.eq.${repId},new_owner_id.is.null)`);

            if (accountsError) {
              console.error(`[ERROR SalesRepsTable] Failed to get accounts for rep ${repId}:`, accountsError);
              continue;
            }

            // Get opportunities for this specific rep
            const { data: repOpportunities, error: oppsError } = await supabase
              .from('opportunities')
              .select('owner_id, new_owner_id, new_owner_name, renewal_event_date, sfdc_account_id, available_to_renew, cre_status, opportunity_type')
              .eq('build_id', buildId)
              .or(`new_owner_id.eq.${repId},and(owner_id.eq.${repId},new_owner_id.is.null)`);

            if (oppsError) {
              console.error(`[ERROR SalesRepsTable] Failed to get opportunities for rep ${repId}:`, oppsError);
              continue;
            }

            // Calculate metrics using the same logic as detail dialog
            repMetrics[repId] = calculateSalesRepMetrics(
              repId,
              repAccounts || [],
              repOpportunities || []
            );
            
          } catch (error) {
            console.error(`[ERROR SalesRepsTable] Failed to process rep ${repId}:`, error);
            // Provide default metrics on error
            repMetrics[repId] = {
              parent_accounts: 0,
              child_accounts: 0,
              customer_accounts: 0,
              prospect_accounts: 0,
              total_accounts: 0,
              total_arr: 0,
              total_atr: 0,
              renewal_count: 0,
              cre_risk_count: 0
            };
          }
        }

        // Step 4: Return mapped results with calculated metrics and apply filters, then sort by calculated fields
        let mappedReps = reps.map(rep => ({
          ...rep,
          ...repMetrics[rep.rep_id]
        })).filter(rep => {
          // Apply post-query filters based on calculated metrics
          try {
            if (filters.account_count_range) {
              const [min, max] = filters.account_count_range as [number, number];
              if (rep.total_accounts < min || rep.total_accounts > max) return false;
            }
            if (filters.arr_range) {
              const [min, max] = filters.arr_range as [number, number];
              if (rep.total_arr < min || rep.total_arr > max) return false;
            }
            if (filters.risk_level) {
              const riskLevel = getRiskLevel(rep.cre_risk_count);
              if (riskLevel !== filters.risk_level) return false;
            }
            return true;
          } catch (filterError) {
            console.warn('[WARN SalesRepsTable] Filter error for rep:', rep.rep_id, filterError);
            return true; // Include rep if filter fails
          }
        }) as SalesRep[];

        // Sort by calculated fields if needed
        if (sortField === 'total_accounts' || sortField === 'total_arr' || sortField === 'cre_risk_count') {
          mappedReps = mappedReps.sort((a, b) => {
            const aValue = a[sortField] as number;
            const bValue = b[sortField] as number;
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
          });
        }

        console.log(`[DEBUG SalesRepsTable] Returning ${mappedReps.length} filtered reps`);
        return sortData(mappedReps);

      } catch (error) {
        console.error('[ERROR SalesRepsTable] Query failed:', error);
        throw error;
      }
    },
    enabled: !!buildId,
    retry: 1,
    retryDelay: 1000,
  });

  const formatCurrency = (value: number | undefined) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };


  const getRiskLevel = (creCount: number): string => {
    if (creCount === 0) return 'none';
    if (creCount <= 2) return 'low';
    if (creCount <= 5) return 'medium';
    return 'high';
  };

  const getRiskBadge = (creCount: number) => {
    if (creCount === 0) return <Badge variant="secondary">No CRE Risk</Badge>;
    if (creCount <= 2) return <Badge variant="outline">Low CRE Risk</Badge>;
    if (creCount <= 5) return <Badge variant="default">Medium CRE Risk</Badge>;
    return <Badge variant="destructive">High CRE Risk</Badge>;
  };

  return (
    <>
      <TableFilters
        title="Sales Rep Filters"
        filters={filterConfigs}
        values={filters}
        onChange={handleFilterChange}
        onClear={clearFilters}
        activeCount={getActiveFilterCount()}
      />
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Sales Representatives</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sales reps..."
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
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 space-y-2">
            <div className="text-red-500">Error loading sales representatives</div>
            <div className="text-sm text-muted-foreground">Please try refreshing the page</div>
          </div>
        ) : !salesReps || salesReps.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">No sales representatives found</div>
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Representative
                      {getSortIcon('name')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('flm')}
                  >
                    <div className="flex items-center gap-1">
                      Management Chain
                      {getSortIcon('flm')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('team')}
                  >
                    <div className="flex items-center gap-1">
                      Team
                      {getSortIcon('team')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('total_accounts')}
                  >
                    <div className="flex items-center gap-1">
                      Account Portfolio
                      {getSortIcon('total_accounts')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('total_arr')}
                  >
                    <div className="flex items-center gap-1">
                      Financial Metrics
                      {getSortIcon('total_arr')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('cre_risk_count')}
                  >
                    <div className="flex items-center gap-1">
                      Risk & Capacity
                      {getSortIcon('cre_risk_count')}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesReps.map((rep) => (
                  <TableRow 
                    key={rep.rep_id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      try {
                        setSelectedRep({
                          rep_id: rep.rep_id,
                          name: rep.name,
                          team: rep.team,
                          flm: rep.flm,
                          slm: rep.slm
                        });
                        setDialogOpen(true);
                      } catch (error) {
                        console.error('Error opening rep detail:', error);
                      }
                    }}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div>{rep.name}</div>
                          <div className="text-xs text-muted-foreground">Click for details</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {rep.flm && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">FLM: </span>
                            <span className="font-medium">{rep.flm}</span>
                          </div>
                        )}
                        {rep.slm && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">SLM: </span>
                            <span>{rep.slm}</span>
                          </div>
                        )}
                        {!rep.flm && !rep.slm && (
                          <Badge variant="secondary" className="text-xs">No Hierarchy</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {rep.team ? (
                        <Badge variant="outline" className="text-xs">
                          {rep.team}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">No Team</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Parent:</span>
                          <span className="font-medium">{rep.parent_accounts}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Child:</span>
                          <span className="font-medium">{rep.child_accounts}</span>
                        </div>
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-muted-foreground">Customers:</span>
                           <span className="font-medium text-green-600">{rep.customer_accounts} parent(s)</span>
                         </div>
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-muted-foreground">Prospects:</span>
                           <span className="font-medium text-blue-600">{rep.prospect_accounts} parent(s)</span>
                         </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Renewals:</span>
                          <span className="font-medium text-orange-600">{rep.renewal_count}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">ARR:</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(rep.total_arr)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">ATR:</span>
                          <span className="font-medium text-red-600">
                            {formatCurrency(rep.total_atr)}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        {getRiskBadge(rep.cre_risk_count)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {salesReps && salesReps.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No sales representatives found matching your search criteria.
              </div>
            )}
          </div>
        )}
      </CardContent>
      </Card>

      <SalesRepDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rep={selectedRep}
        buildId={buildId}
      />
    </>
  );
};