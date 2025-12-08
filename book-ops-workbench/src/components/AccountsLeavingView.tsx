import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Download, LogOut, TrendingDown, Users, Building2 } from 'lucide-react';
import { getAccountARR } from '@/utils/accountCalculations';
import { downloadFile } from '@/utils/exportUtils';
import { toast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RenewalQuarterBadge } from '@/components/ui/RenewalQuarterBadge';

interface AccountsLeavingViewProps {
  buildId: string;
  managerLevel: 'FLM' | 'SLM';
  managerName: string;
}

interface LeavingAccount {
  sfdc_account_id: string;
  account_name: string;
  is_customer: boolean;
  is_parent: boolean;
  owner_id: string;
  owner_name: string | null;
  new_owner_id: string | null;
  new_owner_name: string | null;
  arr: number;
  calculated_arr: number | null;
  hierarchy_bookings_arr_converted: number | null;
  hq_country: string | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  renewal_quarter: string | null;
}

interface RepLeavingData {
  repId: string;
  repName: string;
  team: string | null;
  accounts: LeavingAccount[];
  totalARR: number;
}

export default function AccountsLeavingView({ 
  buildId, 
  managerLevel, 
  managerName 
}: AccountsLeavingViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());

  // Fetch all reps in this manager's hierarchy
  const { data: salesReps } = useQuery({
    queryKey: ['accounts-leaving-reps', buildId, managerLevel, managerName],
    queryFn: async () => {
      let query = supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_active', true);

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

  // Fetch accounts that are LEAVING this manager's team
  // These are accounts where owner_id is in the team but new_owner_id is different (reassigned out)
  const { data: leavingData, isLoading } = useQuery({
    queryKey: ['accounts-leaving', buildId, salesReps],
    queryFn: async (): Promise<RepLeavingData[]> => {
      if (!salesReps || salesReps.length === 0) return [];

      const repIds = salesReps.map(rep => rep.rep_id);
      
      // Fetch accounts where original owner is in our hierarchy
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id,
          account_name,
          is_customer,
          is_parent,
          owner_id,
          owner_name,
          new_owner_id,
          new_owner_name,
          arr,
          calculated_arr,
          hierarchy_bookings_arr_converted,
          hq_country,
          expansion_tier,
          initial_sale_tier,
          renewal_quarter
        `)
        .eq('build_id', buildId)
        .eq('is_parent', true) // Only parent accounts for cleaner view
        .in('owner_id', repIds)
        .not('new_owner_id', 'is', null);

      if (error) throw error;

      // Filter to only accounts that are LEAVING (new owner is different from original)
      const leavingAccounts = (accounts || []).filter(acc => 
        acc.new_owner_id && 
        acc.new_owner_id !== acc.owner_id &&
        !repIds.includes(acc.new_owner_id) // Going to someone OUTSIDE our hierarchy
      );

      // Group by rep who is losing the account
      const byRep = new Map<string, LeavingAccount[]>();
      
      leavingAccounts.forEach(acc => {
        const repId = acc.owner_id;
        if (!byRep.has(repId)) {
          byRep.set(repId, []);
        }
        byRep.get(repId)!.push(acc);
      });

      // Build result with rep details
      const result: RepLeavingData[] = [];
      
      byRep.forEach((accounts, repId) => {
        const rep = salesReps.find(r => r.rep_id === repId);
        if (rep) {
          const totalARR = accounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
          result.push({
            repId,
            repName: rep.name,
            team: rep.team,
            accounts: accounts.sort((a, b) => getAccountARR(b) - getAccountARR(a)), // Sort by ARR desc
            totalARR,
          });
        }
      });

      // Sort reps by total ARR leaving (highest first)
      return result.sort((a, b) => b.totalARR - a.totalARR);
    },
    enabled: !!salesReps && salesReps.length > 0,
  });

  // Calculate summary metrics
  const summary = useMemo(() => {
    if (!leavingData) return { totalAccounts: 0, totalARR: 0, repsAffected: 0 };
    
    return {
      totalAccounts: leavingData.reduce((sum, rep) => sum + rep.accounts.length, 0),
      totalARR: leavingData.reduce((sum, rep) => sum + rep.totalARR, 0),
      repsAffected: leavingData.length,
    };
  }, [leavingData]);

  // Filter by search term
  const filteredData = useMemo(() => {
    if (!leavingData || !searchTerm) return leavingData;
    
    const lower = searchTerm.toLowerCase();
    return leavingData.map(rep => ({
      ...rep,
      accounts: rep.accounts.filter(acc => 
        acc.account_name?.toLowerCase().includes(lower) ||
        acc.new_owner_name?.toLowerCase().includes(lower) ||
        acc.owner_name?.toLowerCase().includes(lower) ||
        acc.hq_country?.toLowerCase().includes(lower)
      ),
    })).filter(rep => rep.accounts.length > 0);
  }, [leavingData, searchTerm]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const toggleRepExpansion = (repId: string) => {
    const newExpanded = new Set(expandedReps);
    if (newExpanded.has(repId)) {
      newExpanded.delete(repId);
    } else {
      newExpanded.add(repId);
    }
    setExpandedReps(newExpanded);
  };

  const expandAll = () => {
    if (filteredData) {
      setExpandedReps(new Set(filteredData.map(r => r.repId)));
    }
  };

  const collapseAll = () => {
    setExpandedReps(new Set());
  };

  // Export to CSV
  const exportCSV = () => {
    if (!leavingData || leavingData.length === 0) {
      toast({
        title: 'Export Failed',
        description: 'No accounts leaving to export.',
        variant: 'destructive',
      });
      return;
    }

    const csvRows: string[] = [];
    
    // Header
    csvRows.push([
      'Rep Name',
      'Rep Team',
      'Account Name',
      'Account Type',
      'Previous Owner',
      'New Owner',
      'ARR',
      'Location',
      'Tier'
    ].join(','));

    // Data rows
    leavingData.forEach(rep => {
      rep.accounts.forEach(acc => {
        csvRows.push([
          `"${rep.repName}"`,
          `"${rep.team || ''}"`,
          `"${acc.account_name}"`,
          acc.is_customer ? 'Customer' : 'Prospect',
          `"${acc.owner_name || 'Unknown'}"`,
          `"${acc.new_owner_name || 'Unknown'}"`,
          getAccountARR(acc),
          `"${acc.hq_country || ''}"`,
          `"${acc.expansion_tier || acc.initial_sale_tier || ''}"`
        ].join(','));
      });
    });

    const csvContent = csvRows.join('\n');
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(csvContent, `accounts-leaving-${managerName}-${timestamp}.csv`, 'text/csv');

    toast({
      title: 'Export Complete',
      description: `Exported ${summary.totalAccounts} accounts leaving to CSV.`,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-red-200 dark:border-red-900 bg-gradient-to-r from-red-50/50 to-orange-50/50 dark:from-red-950/20 dark:to-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LogOut className="h-4 w-4 text-red-600" />
              Accounts Leaving
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">
              {summary.totalAccounts}
            </div>
            <p className="text-xs text-muted-foreground">Parent accounts being reassigned out</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-900 bg-gradient-to-r from-red-50/50 to-orange-50/50 dark:from-red-950/20 dark:to-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              ARR Leaving
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">
              {formatCurrency(summary.totalARR)}
            </div>
            <p className="text-xs text-muted-foreground">Total ARR moving to other teams</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Reps Affected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.repsAffected}
            </div>
            <p className="text-xs text-muted-foreground">Reps losing accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts, owners..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={expandAll}>Expand All</Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>Collapse All</Button>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* No Data State */}
      {(!filteredData || filteredData.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm ? 'No accounts match your search' : 'No accounts leaving your team'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {!searchTerm && 'All accounts are staying with their current owners or moving within your hierarchy'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Accounts by Rep */}
      {filteredData && filteredData.map(rep => (
        <Collapsible 
          key={rep.repId}
          open={expandedReps.has(rep.repId)}
          onOpenChange={() => toggleRepExpansion(rep.repId)}
        >
          <Card className="border-l-4 border-l-red-500">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expandedReps.has(rep.repId) ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <CardTitle className="text-base">{rep.repName}</CardTitle>
                      {rep.team && (
                        <p className="text-sm text-muted-foreground">{rep.team}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="destructive" className="gap-1">
                      <LogOut className="h-3 w-3" />
                      {rep.accounts.length} leaving
                    </Badge>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-red-600">
                        -{formatCurrency(rep.totalARR)}
                      </div>
                      <div className="text-xs text-muted-foreground">ARR leaving</div>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="bg-blue-50 dark:bg-blue-950/30">Previous Owner</TableHead>
                      <TableHead>Going To</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Renewal</TableHead>
                      <TableHead className="text-right">ARR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rep.accounts.map(acc => (
                      <TableRow key={acc.sfdc_account_id}>
                        <TableCell className="font-medium">{acc.account_name}</TableCell>
                        <TableCell>
                          <Badge variant={acc.is_customer ? "default" : "outline"} className="text-xs">
                            {acc.is_customer ? 'Customer' : 'Prospect'}
                          </Badge>
                        </TableCell>
                        <TableCell className="bg-blue-50 dark:bg-blue-950/30">
                          <span className="text-sm font-medium">{acc.owner_name || 'Unknown'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <LogOut className="h-3 w-3 text-red-500" />
                            <span className="font-medium">{acc.new_owner_name || 'Unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{acc.hq_country || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {acc.expansion_tier || acc.initial_sale_tier || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <RenewalQuarterBadge renewalQuarter={acc.renewal_quarter} />
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {formatCurrency(getAccountARR(acc))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}

