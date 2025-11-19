import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { getAccountARR, getAccountATR } from '@/utils/accountCalculations';

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

  // Fetch all accounts that belong to this manager's hierarchy (before and after)
  const { data: comparisonData, isLoading } = useQuery({
    queryKey: ['manager-before-after-comparison', buildId, salesReps],
    queryFn: async () => {
      if (!salesReps || salesReps.length === 0) return [];

      const repIds = salesReps.map(rep => rep.rep_id);
      
      // Get all accounts where either owner_id or new_owner_id matches a rep in this hierarchy
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('sfdc_account_id, account_name, build_id, is_parent, is_customer, owner_id, owner_name, new_owner_id, new_owner_name, calculated_arr, calculated_atr, ultimate_parent_id, has_split_ownership')
        .eq('build_id', buildId)
        .eq('is_customer', true)
        .or('is_parent.eq.true,has_split_ownership.eq.true')
        .or(`owner_id.in.(${repIds.join(',')}),new_owner_id.in.(${repIds.join(',')})`)
        .order('new_owner_name');

      if (error) throw error;

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
          .reduce((sum, child) => sum + getAccountATR(child), 0);

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
          .reduce((sum, child) => sum + getAccountATR(child), 0);

        return {
          rep,
          before: {
            totalAccounts: beforeParents.length,
            totalARR: beforeParents.reduce((sum, acc) => sum + getAccountARR(acc), 0) + beforeSplitChildrenARR,
            totalATR: beforeParents.reduce((sum, acc) => sum + getAccountATR(acc), 0) + beforeSplitChildrenATR,
            customers: beforeParents.filter(acc => acc.is_customer).length,
            prospects: beforeParents.filter(acc => !acc.is_customer).length,
          },
          after: {
            totalAccounts: afterParents.length,
            totalARR: afterParents.reduce((sum, acc) => sum + getAccountARR(acc), 0) + afterSplitChildrenARR,
            totalATR: afterParents.reduce((sum, acc) => sum + getAccountATR(acc), 0) + afterSplitChildrenATR,
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
    enabled: !!salesReps && salesReps.length > 0,
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
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

  return (
    <div className="space-y-6">
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
                  {reps.map(({ rep, before, after }) => (
                    <TableRow key={rep.rep_id}>
                      <TableCell className="font-medium">{rep.name}</TableCell>
                      {/* Before */}
                      <TableCell className="text-right bg-muted/20">
                        <div>
                          <div className="font-medium">{before.totalAccounts}</div>
                          <div className="text-xs text-muted-foreground">
                            {before.customers}C / {before.prospects}P
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right bg-muted/20">
                        <div>
                          <div className="font-medium">{formatCurrency(before.totalARR)}</div>
                          <div className="text-xs text-muted-foreground">
                            ATR: {formatCurrency(before.totalATR)}
                          </div>
                        </div>
                      </TableCell>
                      {/* After */}
                      <TableCell className="text-right bg-primary/5">
                        <div>
                          <div className="font-medium">{after.totalAccounts}</div>
                          <div className="text-xs text-muted-foreground">
                            {after.customers}C / {after.prospects}P
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right bg-primary/5">
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
                  ))}
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
