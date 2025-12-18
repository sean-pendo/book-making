import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, TrendingUp, TrendingDown, Download, Users } from 'lucide-react';
import { getAccountARR, getAccountATR } from '@/_domain';
import { downloadFile } from '@/utils/exportUtils';
import { toast } from '@/hooks/use-toast';
import { BeforeAfterDistributionChart, type BeforeAfterRepData } from '@/components/balancing/BeforeAfterDistributionChart';
import { BeforeAfterAccountChart, type BeforeAfterAccountData } from '@/components/balancing/BeforeAfterAccountChart';
import { cn } from '@/lib/utils';

interface ManagerBeforeAfterComparisonProps {
  buildId: string;
  managerLevel: 'FLM' | 'SLM';
  managerName: string;
}

export default function ManagerBeforeAfterComparison({ 
  buildId, 
  managerLevel, 
  managerName 
}: ManagerBeforeAfterComparisonProps) {
  
  // Fetch all reps in this manager's hierarchy
  const { data: salesReps } = useQuery({
    queryKey: ['manager-sales-reps-comparison', buildId, managerLevel, managerName],
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

  // Fetch ATR from opportunities (more accurate than calculated_atr field)
  const { data: atrByAccount } = useQuery({
    queryKey: ['manager-comparison-opportunities-atr', buildId],
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

  // Fetch all accounts that belong to this manager's hierarchy (before and after)
  const { data: comparisonData, isLoading } = useQuery({
    queryKey: ['manager-before-after-comparison', buildId, salesReps, atrByAccount],
    queryFn: async () => {
      if (!salesReps || salesReps.length === 0) return [];

      // Helper to get ATR for an account - prioritize opportunities data
      const getATRForAccount = (acc: any) => {
        const atrFromOpps = atrByAccount?.get(acc.sfdc_account_id) || 0;
        const atrFromAccount = getAccountATR(acc);
        return atrFromOpps || atrFromAccount;
      };

      const repIds = salesReps.map(rep => rep.rep_id);
      
      // Fetch accounts for all reps - include ALL accounts (customers + prospects)
      // Query each rep's accounts separately to properly handle owner_id vs new_owner_id
      const accountsPromises = repIds.map(repId => 
        supabase
          .from('accounts')
          .select('sfdc_account_id, account_name, build_id, is_parent, is_customer, owner_id, owner_name, new_owner_id, new_owner_name, calculated_arr, calculated_atr, arr, atr, hierarchy_bookings_arr_converted, ultimate_parent_id, has_split_ownership')
          .eq('build_id', buildId)
          .or(`owner_id.eq.${repId},new_owner_id.eq.${repId}`)
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
      const accounts = Array.from(uniqueAccountsMap.values());

      if (accountsResults.some(r => r.error)) throw accountsResults.find(r => r.error)?.error;

      // Group by rep and calculate before/after metrics with split ownership logic
      const repComparisons = salesReps.map(rep => {
        const beforeAccounts = accounts?.filter(acc => acc.owner_id === rep.rep_id) || [];
        const afterAccounts = accounts?.filter(acc => acc.new_owner_id === rep.rep_id) || [];

        // BEFORE (owner_id based)
        const beforeParents = beforeAccounts.filter(acc => acc.is_parent);
        const beforeChildren = beforeAccounts.filter(acc => !acc.is_parent && acc.has_split_ownership);
        const beforeParentOwnerMap = new Map<string, string>();
        beforeParents.forEach(parent => {
          const ownerId = parent.owner_id;
          if (parent.sfdc_account_id && ownerId) {
            beforeParentOwnerMap.set(parent.sfdc_account_id, ownerId);
          }
        });
        const beforeSplitChildrenARR = beforeChildren
          .filter(child => {
            const parentId = child.ultimate_parent_id;
            if (!parentId) return false;
            const childOwnerId = child.owner_id;
            const parentOwnerId = beforeParentOwnerMap.get(parentId);
            return childOwnerId !== parentOwnerId;
          })
          .reduce((sum, child) => sum + getAccountARR(child), 0);
        const beforeSplitChildrenATR = beforeChildren
          .filter(child => {
            const parentId = child.ultimate_parent_id;
            if (!parentId) return false;
            const childOwnerId = child.owner_id;
            const parentOwnerId = beforeParentOwnerMap.get(parentId);
            return childOwnerId !== parentOwnerId;
          })
          .reduce((sum, child) => sum + getATRForAccount(child), 0);

        // AFTER (new_owner_id based)
        const afterParents = afterAccounts.filter(acc => acc.is_parent);
        const afterChildren = afterAccounts.filter(acc => !acc.is_parent && acc.has_split_ownership);
        const afterParentOwnerMap = new Map<string, string>();
        afterParents.forEach(parent => {
          const ownerId = parent.new_owner_id || parent.owner_id;
          if (parent.sfdc_account_id && ownerId) {
            afterParentOwnerMap.set(parent.sfdc_account_id, ownerId);
          }
        });
        const afterSplitChildrenARR = afterChildren
          .filter(child => {
            const parentId = child.ultimate_parent_id;
            if (!parentId) return false;
            const childOwnerId = child.new_owner_id || child.owner_id;
            const parentOwnerId = afterParentOwnerMap.get(parentId);
            return childOwnerId !== parentOwnerId;
          })
          .reduce((sum, child) => sum + getAccountARR(child), 0);
        const afterSplitChildrenATR = afterChildren
          .filter(child => {
            const parentId = child.ultimate_parent_id;
            if (!parentId) return false;
            const childOwnerId = child.new_owner_id || child.owner_id;
            const parentOwnerId = afterParentOwnerMap.get(parentId);
            return childOwnerId !== parentOwnerId;
          })
          .reduce((sum, child) => sum + getATRForAccount(child), 0);

        return {
          rep,
          before: {
            totalAccounts: beforeParents.length,
            totalARR: beforeParents.reduce((sum, acc) => sum + getAccountARR(acc), 0) + beforeSplitChildrenARR,
            totalATR: beforeParents.reduce((sum, acc) => sum + getATRForAccount(acc), 0) + beforeSplitChildrenATR,
            customers: beforeParents.filter(acc => acc.is_customer).length,
            prospects: beforeParents.filter(acc => !acc.is_customer).length,
          },
          after: {
            totalAccounts: afterParents.length,
            totalARR: afterParents.reduce((sum, acc) => sum + getAccountARR(acc), 0) + afterSplitChildrenARR,
            totalATR: afterParents.reduce((sum, acc) => sum + getATRForAccount(acc), 0) + afterSplitChildrenATR,
            customers: afterParents.filter(acc => acc.is_customer).length,
            prospects: afterParents.filter(acc => !acc.is_customer).length,
          },
        };
      });

      // Group by FLM
      const grouped = repComparisons.reduce((acc, item) => {
        const flm = item.rep.flm || 'Unassigned';
        if (!acc[flm]) acc[flm] = [];
        acc[flm].push(item);
        return acc;
      }, {} as Record<string, typeof repComparisons>);

      return grouped;
    },
    enabled: !!salesReps && salesReps.length > 0 && !!atrByAccount,
  });

  // Calculate FLM totals
  const flmTotals = comparisonData ? Object.entries(comparisonData).reduce((acc, [flm, reps]) => {
    const totals = reps.reduce((sum, { before, after }) => ({
      beforeAccounts: sum.beforeAccounts + before.totalAccounts,
      beforeARR: sum.beforeARR + before.totalARR,
      beforeATR: sum.beforeATR + before.totalATR,
      beforeCustomers: sum.beforeCustomers + before.customers,
      beforeProspects: sum.beforeProspects + before.prospects,
      afterAccounts: sum.afterAccounts + after.totalAccounts,
      afterARR: sum.afterARR + after.totalARR,
      afterATR: sum.afterATR + after.totalATR,
      afterCustomers: sum.afterCustomers + after.customers,
      afterProspects: sum.afterProspects + after.prospects,
    }), {
      beforeAccounts: 0,
      beforeARR: 0,
      beforeATR: 0,
      beforeCustomers: 0,
      beforeProspects: 0,
      afterAccounts: 0,
      afterARR: 0,
      afterATR: 0,
      afterCustomers: 0,
      afterProspects: 0,
    });
    
    acc[flm] = totals;
    return acc;
  }, {} as Record<string, any>) : {};

  // Transform comparison data for distribution chart
  const distributionChartData: BeforeAfterRepData[] = useMemo(() => {
    if (!comparisonData || !salesReps) return [];
    
    // Flatten all reps from all FLMs
    const allReps = Object.values(comparisonData).flat();
    
    return allReps.map(({ rep, before, after }) => ({
      repId: rep.rep_id,
      repName: rep.name,
      region: rep.region || '',
      beforeArr: before.totalARR,
      afterArr: after.totalARR,
      beforeAtr: before.totalATR,
      afterAtr: after.totalATR,
      beforePipeline: 0, // Pipeline not tracked in manager comparison
      afterPipeline: 0,
      isStrategicRep: rep.is_strategic_rep ?? false,
    }));
  }, [comparisonData, salesReps]);

  // Transform comparison data for account chart
  const accountChartData: BeforeAfterAccountData[] = useMemo(() => {
    if (!comparisonData || !salesReps) return [];
    
    // Flatten all reps from all FLMs
    const allReps = Object.values(comparisonData).flat();
    
    return allReps.map(({ rep, before, after }) => ({
      repId: rep.rep_id,
      repName: rep.name,
      region: rep.region || '',
      beforeCustomers: before.customers,
      beforeProspects: before.prospects,
      beforeParentCustomers: before.customers, // No parent/child breakdown in this view
      beforeChildCustomers: 0,
      beforeParentProspects: before.prospects,
      beforeChildProspects: 0,
      afterCustomers: after.customers,
      afterProspects: after.prospects,
      afterParentCustomers: after.customers,
      afterChildCustomers: 0,
      afterParentProspects: after.prospects,
      afterChildProspects: 0,
      isStrategicRep: rep.is_strategic_rep ?? false,
    }));
  }, [comparisonData, salesReps]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Export comparison data to CSV
  const exportComparisonCSV = () => {
    if (!comparisonData || Object.keys(comparisonData).length === 0) {
      toast({
        title: 'Export Failed',
        description: 'No comparison data available to export.',
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
      'Before Accounts',
      'Before Customers',
      'Before Prospects',
      'Before ARR',
      'Before ATR',
      'After Accounts',
      'After Customers',
      'After Prospects',
      'After ARR',
      'After ATR',
      'ARR Change',
      'ARR Change %'
    ].join(','));

    // Data rows
    Object.entries(comparisonData).forEach(([flm, reps]) => {
      reps.forEach(({ rep, before, after }) => {
        const arrChange = after.totalARR - before.totalARR;
        const arrChangePct = before.totalARR === 0 ? 0 : ((arrChange / before.totalARR) * 100);
        
        csvRows.push([
          `"${flm}"`,
          `"${rep.name}"`,
          `"${rep.team || ''}"`,
          `"${rep.region || ''}"`,
          before.totalAccounts,
          before.customers,
          before.prospects,
          before.totalARR,
          before.totalATR,
          after.totalAccounts,
          after.customers,
          after.prospects,
          after.totalARR,
          after.totalATR,
          arrChange,
          arrChangePct.toFixed(1)
        ].join(','));
      });
    });

    const csvContent = csvRows.join('\n');
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(csvContent, `before-after-comparison-${managerName}-${timestamp}.csv`, 'text/csv');

    toast({
      title: 'Export Complete',
      description: 'Comparison data exported to CSV.',
    });
  };

  const getDifference = (before: number, after: number) => {
    const diff = after - before;
    const percentChange = before === 0 ? 0 : ((diff / before) * 100);
    return { diff, percentChange };
  };

  const DifferenceIndicator = ({ before, after }: { before: number; after: number }) => {
    const { diff, percentChange } = getDifference(before, after);
    if (diff === 0) return <span className="text-muted-foreground">-</span>;
    
    const isPositive = diff > 0;
    return (
      <div className={`flex items-center gap-1 ${isPositive ? 'text-success' : 'text-destructive'}`}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        <span className="text-xs font-medium">
          {isPositive ? '+' : ''}{percentChange.toFixed(0)}%
        </span>
      </div>
    );
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

  // Calculate grand totals across all FLMs
  const grandTotals = comparisonData ? Object.values(flmTotals).reduce((acc, totals) => ({
    beforeAccounts: acc.beforeAccounts + totals.beforeAccounts,
    beforeARR: acc.beforeARR + totals.beforeARR,
    afterAccounts: acc.afterAccounts + totals.afterAccounts,
    afterARR: acc.afterARR + totals.afterARR,
  }), { beforeAccounts: 0, beforeARR: 0, afterAccounts: 0, afterARR: 0 }) : null;

  const netAccountChange = grandTotals ? grandTotals.afterAccounts - grandTotals.beforeAccounts : 0;
  const netArrChange = grandTotals ? grandTotals.afterARR - grandTotals.beforeARR : 0;

  return (
    <div className="space-y-6">
      {/* Grand Total Summary */}
      {grandTotals && (grandTotals.beforeAccounts > 0 || grandTotals.afterAccounts > 0) && (
        <Card className={`border-2 ${netArrChange >= 0 ? 'border-green-200 dark:border-green-900 bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/20' : 'border-red-200 dark:border-red-900 bg-gradient-to-r from-red-50/50 to-orange-50/50 dark:from-red-950/20 dark:to-orange-950/20'}`}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {netArrChange >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-green-600" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-600" />
                )}
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Book Change</div>
                  <div className={`text-xl font-bold ${netArrChange >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {netArrChange >= 0 ? '+' : ''}{formatCurrency(netArrChange)}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-8 text-sm">
                <div>
                  <div className="text-muted-foreground">Accounts</div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{grandTotals.beforeAccounts}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold">{grandTotals.afterAccounts}</span>
                    <Badge variant={netAccountChange >= 0 ? 'default' : 'destructive'} className="text-xs">
                      {netAccountChange >= 0 ? '+' : ''}{netAccountChange}
                    </Badge>
                  </div>
                </div>
                
                <div>
                  <div className="text-muted-foreground">Total ARR</div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatCurrency(grandTotals.beforeARR)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold">{formatCurrency(grandTotals.afterARR)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Button */}
      {comparisonData && Object.keys(comparisonData).length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={exportComparisonCSV}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      )}

      {/* Distribution Charts */}
      {distributionChartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Financial Distribution (ARR/ATR) */}
          <BeforeAfterDistributionChart
            data={distributionChartData}
          />

          {/* Account Distribution */}
          <BeforeAfterAccountChart
            data={accountChartData}
          />
        </div>
      )}

      {!comparisonData || Object.keys(comparisonData).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No comparison data available</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(comparisonData).map(([flm, reps]) => {
          const totals = flmTotals[flm];
          
          return (
            <Card key={flm}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>FLM: {flm}</CardTitle>
                  <div className="flex items-center gap-8 text-sm">
                    <div className="text-right">
                      <div className="text-muted-foreground">Before Total</div>
                      <div className="font-semibold">{totals.beforeAccounts} accounts • {formatCurrency(totals.beforeARR)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">After Total</div>
                      <div className="font-semibold text-primary">{totals.afterAccounts} accounts • {formatCurrency(totals.afterARR)}</div>
                    </div>
                    <DifferenceIndicator before={totals.beforeARR} after={totals.afterARR} />
                  </div>
                </div>
              </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rep Name</TableHead>
                    <TableHead className="text-center" colSpan={2}>Current Owner (Before)</TableHead>
                    <TableHead className="text-center" colSpan={2}>New Owner (After)</TableHead>
                    <TableHead className="text-center">Change</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/30">
                    <TableHead></TableHead>
                    <TableHead className="text-right">Accounts</TableHead>
                    <TableHead className="text-right">ARR</TableHead>
                    <TableHead className="text-right">Accounts</TableHead>
                    <TableHead className="text-right">ARR</TableHead>
                    <TableHead className="text-center">ARR Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reps.map(({ rep, before, after }) => {
                    const isStrategic = rep.is_strategic_rep ?? false;
                    
                    return (
                      <TableRow 
                        key={rep.rep_id}
                        className={cn(
                          isStrategic && "bg-purple-50/50 dark:bg-purple-950/20"
                        )}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {isStrategic && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Users className="h-4 w-4 text-purple-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-sm">Strategic Rep - balanced separately</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <span className={cn(isStrategic && "text-purple-600 dark:text-purple-400")}>
                              {rep.name}
                            </span>
                            {isStrategic && (
                              <Badge variant="outline" className="text-xs border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400">
                                Strategic
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {/* Before */}
                        <TableCell className={cn(
                          "text-right",
                          isStrategic ? "bg-purple-100/30 dark:bg-purple-900/20" : "bg-muted/20"
                        )}>
                          <div>
                            <div className="font-medium">{before.totalAccounts}</div>
                            <div className="text-xs text-muted-foreground">
                              {before.customers}C / {before.prospects}P
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right",
                          isStrategic ? "bg-purple-100/30 dark:bg-purple-900/20" : "bg-muted/20"
                        )}>
                          <div>
                            <div className="font-medium">{formatCurrency(before.totalARR)}</div>
                            <div className="text-xs text-muted-foreground">
                              ATR: {formatCurrency(before.totalATR)}
                            </div>
                          </div>
                        </TableCell>
                        {/* After */}
                        <TableCell className={cn(
                          "text-right",
                          isStrategic ? "bg-purple-100/50 dark:bg-purple-900/30" : "bg-primary/5"
                        )}>
                          <div>
                            <div className="font-medium">{after.totalAccounts}</div>
                            <div className="text-xs text-muted-foreground">
                              {after.customers}C / {after.prospects}P
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right",
                          isStrategic ? "bg-purple-100/50 dark:bg-purple-900/30" : "bg-primary/5"
                        )}>
                          <div>
                            <div className="font-medium">{formatCurrency(after.totalARR)}</div>
                            <div className="text-xs text-muted-foreground">
                              ATR: {formatCurrency(after.totalATR)}
                            </div>
                          </div>
                        </TableCell>
                        {/* Change */}
                        <TableCell className="text-center">
                          <DifferenceIndicator before={before.totalARR} after={after.totalARR} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })
      )}
    </div>
  );
}
