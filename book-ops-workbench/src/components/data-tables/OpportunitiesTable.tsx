import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Download, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { TableFilters, type FilterConfig, type FilterValues } from '@/components/ui/table-filters';

interface Opportunity {
  sfdc_opportunity_id: string;
  sfdc_account_id: string;
  opportunity_name: string | null;
  opportunity_type: string | null;
  account_name: string | null;
  owner_name: string | null;
  owner_id: string | null;
  available_to_renew: number | null;
  net_arr: number | null;
  renewal_event_date: string | null;
  cre_status: string | null;
}

interface OpportunitiesTableProps {
  buildId: string;
}

export const OpportunitiesTable = ({ buildId }: OpportunitiesTableProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [filters, setFilters] = useState<FilterValues>({});
  const [sortField, setSortField] = useState<keyof Opportunity>('renewal_event_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const pageSize = 50;

  const filterConfigs: FilterConfig[] = [
    {
      key: 'cre_status',
      label: 'CRE Status',
      type: 'select',
      options: [
        { value: 'Green', label: 'Green' },
        { value: 'Yellow', label: 'Yellow' },
        { value: 'Red', label: 'Red' }
      ],
      placeholder: 'All CRE statuses'
    },
    {
      key: 'opportunity_type',
      label: 'Opportunity Type',
      type: 'select',
      options: [], // Will be populated from data
      placeholder: 'All types'
    },
    {
      key: 'atr_min',
      label: 'Min ATR ($)',
      type: 'number',
      min: 0
    },
    {
      key: 'net_arr_min',
      label: 'Min Net ARR ($)',
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

  const handleSort = (field: keyof Opportunity) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: keyof Opportunity) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4" /> : 
      <ChevronDown className="h-4 w-4" />;
  };

  const { data: opportunities, isLoading } = useQuery({
    queryKey: ['opportunities-detail', buildId, searchTerm, currentPage, filters, sortField, sortDirection],
    queryFn: async () => {
      // First get opportunities with all filters and sorting applied
      let oppQuery = supabase
        .from('opportunities')
        .select(`
          sfdc_opportunity_id, sfdc_account_id, opportunity_name, opportunity_type,
          owner_name, owner_id, available_to_renew, net_arr, 
          renewal_event_date, cre_status
        `)
        .eq('build_id', buildId);

      if (searchTerm) {
        oppQuery = oppQuery.or(`opportunity_name.ilike.%${searchTerm}%,owner_name.ilike.%${searchTerm}%,cre_status.ilike.%${searchTerm}%`);
      }

      // Apply filters
      if (filters.cre_status) {
        oppQuery = oppQuery.ilike('cre_status', `%${filters.cre_status}%`);
      }
      if (filters.opportunity_type) {
        oppQuery = oppQuery.eq('opportunity_type', filters.opportunity_type as string);
      }
      if (filters.atr_min) {
        oppQuery = oppQuery.gte('available_to_renew', filters.atr_min as number);
      }
      if (filters.net_arr_min) {
        oppQuery = oppQuery.gte('net_arr', filters.net_arr_min as number);
      }

      // Apply sorting at database level
      const ascending = sortDirection === 'asc';
      if (sortField === 'opportunity_name' || sortField === 'owner_name' || 
          sortField === 'cre_status') {
        oppQuery = oppQuery.order(sortField as string, { ascending, nullsFirst: false });
      } else if (sortField === 'available_to_renew' || sortField === 'net_arr') {
        oppQuery = oppQuery.order(sortField as string, { ascending, nullsFirst: false });
      } else if (sortField === 'renewal_event_date') {
        oppQuery = oppQuery.order(sortField as string, { ascending, nullsFirst: false });
      } else if (sortField === 'account_name') {
        // For account_name, we'll need to sort after joining with accounts
        oppQuery = oppQuery.order('opportunity_name', { ascending, nullsFirst: false });
      } else {
        // Default sorting
        oppQuery = oppQuery.order('renewal_event_date', { ascending: false, nullsFirst: false });
      }

      // Apply pagination after all filtering and sorting
      oppQuery = oppQuery.range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

      const { data: opps, error: oppError } = await oppQuery;
      if (oppError) throw oppError;

      // Get account names for matching
      const accountIds = opps?.map(opp => opp.sfdc_account_id).filter(Boolean) || [];
      let accountNames: Record<string, string> = {};
      
      if (accountIds.length > 0) {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('sfdc_account_id, account_name')
          .eq('build_id', buildId)
          .in('sfdc_account_id', accountIds);
        
        accountNames = accounts?.reduce((acc, account) => {
          acc[account.sfdc_account_id] = account.account_name;
          return acc;
        }, {} as Record<string, string>) || {};
      }

      // Combine data
      let combinedData = opps?.map(opp => ({
        ...opp,
        account_name: accountNames[opp.sfdc_account_id] || null
      })) as Opportunity[] || [];

      // If sorting by account_name, sort here since we couldn't do it at DB level
      if (sortField === 'account_name') {
        combinedData = combinedData.sort((a, b) => {
          const aValue = a.account_name || '';
          const bValue = b.account_name || '';
          return sortDirection === 'asc' 
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        });
      }
      
      return combinedData;
    },
    enabled: !!buildId,
  });

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      // Parse YYYY-MM-DD format directly without timezone conversion
      const [year, month, day] = dateString.split('-').map(Number);
      if (!year || !month || !day) return dateString;
      // Create date with local components to avoid timezone shifts
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getCREStatusBadge = (cre_status: string | null) => {
    if (!cre_status) return <Badge variant="secondary">No Status</Badge>;
    
    const status = cre_status.toLowerCase();
    if (status.includes('green')) return <Badge variant="default" className="bg-green-100 text-green-800">Green</Badge>;
    if (status.includes('yellow')) return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Yellow</Badge>;
    if (status.includes('red')) return <Badge variant="destructive">Red</Badge>;
    
    return <Badge variant="outline">{cre_status}</Badge>;
  };


  return (
    <>
      <TableFilters
        title="Opportunity Filters"
        filters={filterConfigs}
        values={filters}
        onChange={handleFilterChange}
        onClear={clearFilters}
        activeCount={getActiveFilterCount()}
      />
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Opportunities</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search opportunities..."
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
                  onClick={() => handleSort('opportunity_name')}
                >
                  <div className="flex items-center gap-1">
                    Opportunity
                    {getSortIcon('opportunity_name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('account_name')}
                >
                  <div className="flex items-center gap-1">
                    Account
                    {getSortIcon('account_name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('owner_name')}
                >
                  <div className="flex items-center gap-1">
                    Owner
                    {getSortIcon('owner_name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('available_to_renew')}
                >
                  <div className="flex items-center gap-1">
                    Financial Details
                    {getSortIcon('available_to_renew')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('cre_status')}
                >
                  <div className="flex items-center gap-1">
                    CRE Status
                    {getSortIcon('cre_status')}
                  </div>
                </TableHead>
              </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities?.map((opp) => {
                  return (
                    <TableRow key={opp.sfdc_opportunity_id}>
                      <TableCell>
                         <div className="space-y-1">
                           <div className="font-medium">
                             {opp.opportunity_name || opp.sfdc_opportunity_id}
                           </div>
                            <div className="text-sm text-muted-foreground font-mono">
                              {opp.sfdc_opportunity_id}
                            </div>
                          {opp.opportunity_type && (
                            <Badge variant="outline" className="text-xs">
                              {opp.opportunity_type}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                         <div className="space-y-1">
                           <div className="font-medium">
                             {opp.account_name || 'N/A'}
                           </div>
                            <div className="text-sm text-muted-foreground font-mono">
                              {opp.sfdc_account_id}
                            </div>
                          {!opp.account_name && (
                            <Badge variant="destructive" className="text-xs">
                              No Account Match
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                         <div className="space-y-1">
                           <div className="font-medium">
                             {opp.owner_name || 'Unassigned'}
                           </div>
                            <div className="text-sm text-muted-foreground font-mono">
                              {opp.owner_id || 'No ID'}
                            </div>
                         </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">ATR:</span>
                            <span className="font-medium text-blue-600">
                              {opp.available_to_renew ? formatCurrency(opp.available_to_renew) : '$0'}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Net ARR:</span>
                            <span className="font-medium text-green-600">
                              {opp.net_arr ? formatCurrency(opp.net_arr) : '$0'}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {opp.renewal_event_date && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Renewal: </span>
                              <span className="text-orange-600">{formatDate(opp.renewal_event_date)}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getCREStatusBadge(opp.cre_status)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {opportunities && opportunities.length === pageSize && (
              <div className="flex justify-center">
                <Button 
                  variant="outline" 
                  onClick={() => setCurrentPage(prev => prev + 1)}
                >
                  Load More
                </Button>
              </div>
            )}

            {opportunities && opportunities.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No opportunities found matching your search criteria.
              </div>
            )}
          </div>
        )}
      </CardContent>
      </Card>
    </>
  );
};