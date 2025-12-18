import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { useAnalyticsMetrics } from '@/hooks/useBuildData';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RepDistributionChart } from '@/components/analytics';
import { formatCurrency } from '@/_domain';

interface DataOverviewAnalyticsProps {
  buildId: string;
}

/**
 * Loading skeleton for analytics section
 */
const AnalyticsSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-1.5 w-full mt-2" />
        </Card>
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-24 mb-4" />
          <Skeleton className="h-[120px] w-full" />
        </Card>
      ))}
    </div>
  </div>
);

export const DataOverviewAnalytics: React.FC<DataOverviewAnalyticsProps> = ({ buildId }) => {
  // Pass useProposed=false to show original imported data (not proposed assignments)
  // This excludes Sales Tools bucket which is a balancing concept, not import data
  const { data: metrics, isLoading, error } = useAnalyticsMetrics(buildId, false);
  
  // State for collapsible warnings
  const [isOppWarningOpen, setIsOppWarningOpen] = useState(false);
  const [isAcctWarningOpen, setIsAcctWarningOpen] = useState(false);
  
  // Query for orphaned opportunity stats - two types of orphans:
  // 1. is_orphaned = true: opportunity references account that doesn't exist
  // 2. Child account exists but its ultimate_parent_id doesn't exist (can't roll up)
  const { data: orphanStats } = useQuery({
    queryKey: ['orphanedOpportunityStats', buildId],
    queryFn: async () => {
      // Type 1: Opportunities with is_orphaned = true (account doesn't exist)
      const { data: orphanedOpps, error: err1 } = await supabase
        .from('opportunities')
        .select('sfdc_opportunity_id, opportunity_name, sfdc_account_id, opportunity_type, available_to_renew, net_arr, owner_name')
        .eq('build_id', buildId)
        .eq('is_orphaned', true)
        .order('opportunity_type')
        .order('available_to_renew', { ascending: false, nullsFirst: false });
      
      if (err1) throw err1;
      
      // Type 2: Find opportunities on child accounts whose parent doesn't exist
      // Use RPC with type assertion since types may not be regenerated yet
      const { data: missingParentOpps, error: err2 } = await (supabase
        .rpc as any)('get_opps_with_missing_parent', { p_build_id: buildId });
      
      // If RPC doesn't exist, we'll handle it gracefully
      const missingParentData = err2 ? [] : (missingParentOpps ?? []);
      
      const type1Opps = (orphanedOpps ?? []).map(o => ({ ...o, orphanType: 'missing_account' as const }));
      const type2Opps = (missingParentData as any[]).map(o => ({ ...o, orphanType: 'missing_parent' as const }));
      
      // Combine both types
      const allOrphans = [...type1Opps, ...type2Opps];
      const count = allOrphans.length;
      
      // Break down by opportunity type (across both orphan types)
      const renewals = allOrphans.filter(o => o.opportunity_type === 'Renewals');
      const expansions = allOrphans.filter(o => o.opportunity_type === 'Expansion');
      const newSubs = allOrphans.filter(o => o.opportunity_type === 'New Subscription');
      
      const missingATR = renewals.reduce((sum, o) => sum + (o.available_to_renew ?? 0), 0);
      const missingPipeline = [...expansions, ...newSubs].reduce((sum, o) => sum + (o.net_arr ?? 0), 0);
      
      // Count by orphan type
      const missingAccountCount = type1Opps.length;
      const missingParentCount = type2Opps.length;
      
      return { 
        count, 
        missingATR,
        missingPipeline,
        renewalCount: renewals.length,
        expansionCount: expansions.length,
        newSubCount: newSubs.length,
        missingAccountCount,
        missingParentCount,
        opportunities: allOrphans,
      };
    },
    enabled: !!buildId,
  });
  
  // Query for orphaned accounts (child accounts whose parent doesn't exist)
  const { data: orphanAcctStats } = useQuery({
    queryKey: ['orphanedAccountStats', buildId],
    queryFn: async () => {
      // Get summary stats
      const { data: summaryData, error: summaryErr } = await supabase
        .from('accounts')
        .select('sfdc_account_id, calculated_arr, arr, calculated_atr, ultimate_parent_id')
        .eq('build_id', buildId)
        .eq('is_parent', false)
        .not('ultimate_parent_id', 'is', null);
      
      if (summaryErr) throw summaryErr;
      
      // Get all parent IDs in this build
      const { data: parentIds, error: parentErr } = await supabase
        .from('accounts')
        .select('sfdc_account_id')
        .eq('build_id', buildId)
        .eq('is_parent', true);
      
      if (parentErr) throw parentErr;
      
      const parentIdSet = new Set((parentIds ?? []).map(p => p.sfdc_account_id));
      
      // Find children whose parent doesn't exist
      const orphanedChildren = (summaryData ?? []).filter(
        child => child.ultimate_parent_id && !parentIdSet.has(child.ultimate_parent_id)
      );
      
      const count = orphanedChildren.length;
      const orphanARR = orphanedChildren.reduce((sum, a) => sum + (a.calculated_arr ?? a.arr ?? 0), 0);
      const orphanATR = orphanedChildren.reduce((sum, a) => sum + (a.calculated_atr ?? 0), 0);
      
      // Get detailed list (limited for UI)
      const { data: detailData, error: detailErr } = await (supabase
        .rpc as any)('get_accounts_with_missing_parent', { p_build_id: buildId });
      
      const accounts = detailErr ? [] : (detailData ?? []);
      
      return {
        count,
        orphanARR,
        orphanATR,
        accounts,
      };
    },
    enabled: !!buildId,
  });

  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  if (error) {
    return (
      <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <AlertDescription className="text-red-900 dark:text-red-200">
          Error loading analytics: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!metrics) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No analytics data available</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Balance Analytics
        </h3>
        <p className="text-sm text-muted-foreground">
          Current state analysis based on imported data (original owner assignments)
        </p>
      </div>

      {/* Two Charts Side-by-Side: Financial + Accounts Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Financial Distribution (ARR/ATR/Pipeline) */}
        <RepDistributionChart 
          data={metrics.repDistribution}
          allowedMetrics={['arr', 'atr', 'pipeline']}
          showStats={true}
        />
        
        {/* Right: Account Distribution (Customer vs Prospect) */}
        <RepDistributionChart 
          data={metrics.repDistribution}
          allowedMetrics={['accounts']}
          showStats={true}
        />
      </div>

      {/* Data Quality Section - only show if there are issues */}
      {((orphanStats && orphanStats.count > 0) || (orphanAcctStats && orphanAcctStats.count > 0)) && (
        <div className="space-y-4 border border-amber-200 dark:border-amber-800 rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/20">
          {/* Section Header */}
          <div className="border-b border-amber-200 dark:border-amber-700 pb-3">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Data Quality Issues
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
              Revenue from these records is excluded from book balancing
            </p>
          </div>

          {/* Orphaned Opportunities Warning */}
          {orphanStats && orphanStats.count > 0 && (
            <Collapsible open={isOppWarningOpen} onOpenChange={setIsOppWarningOpen}>
              <div className="bg-white dark:bg-slate-900 rounded-md border border-amber-200 dark:border-amber-700 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-amber-900 dark:text-amber-200 font-medium">
                    Orphaned Opportunities ({orphanStats.count.toLocaleString()})
                  </span>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 flex-shrink-0">
                      {isOppWarningOpen ? (
                        <><ChevronUp className="h-4 w-4 mr-1" /> Hide</>
                      ) : (
                        <><ChevronDown className="h-4 w-4 mr-1" /> Details</>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                
                {/* Preview breakdown - always visible */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {/* Orphan type breakdown */}
                  {orphanStats.missingAccountCount > 0 && (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 text-xs">
                      {orphanStats.missingAccountCount} missing account
                    </Badge>
                  )}
                  {orphanStats.missingParentCount > 0 && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800 text-xs">
                      {orphanStats.missingParentCount} missing parent
                    </Badge>
                  )}
                  <span className="text-amber-700 dark:text-amber-400 font-medium ml-auto">
                    {formatCurrency(orphanStats.missingATR)} ATR
                    {orphanStats.missingPipeline > 0 && <> • {formatCurrency(orphanStats.missingPipeline)} Pipeline</>}
                  </span>
                </div>
                
                <CollapsibleContent className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700">
                  <div className="text-sm text-amber-800 dark:text-amber-300 mb-3 space-y-2">
                    <p><strong>Why these opportunities can't be balanced:</strong></p>
                    <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-400">
                      {orphanStats.missingAccountCount > 0 && (
                        <li><strong>Missing Account:</strong> Opportunity references an account ID that doesn't exist in the accounts import</li>
                      )}
                      {orphanStats.missingParentCount > 0 && (
                        <li><strong>Missing Parent:</strong> Opportunity is on a child account, but the child's <code className="bg-amber-200 dark:bg-amber-800 px-1 rounded">ultimate_parent_id</code> doesn't exist - so ATR can't roll up</li>
                      )}
                    </ul>
                  </div>
                  
                  {/* Data Table Preview */}
                  {orphanStats.opportunities && orphanStats.opportunities.length > 0 && (
                    <ScrollArea className="h-[280px] rounded-md border border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-900">
                      <Table>
                        <TableHeader className="sticky top-0 bg-amber-100 dark:bg-amber-900/50">
                          <TableRow>
                            <TableHead className="text-amber-900 dark:text-amber-200 w-[180px]">Opportunity</TableHead>
                            <TableHead className="text-amber-900 dark:text-amber-200">Issue</TableHead>
                            <TableHead className="text-amber-900 dark:text-amber-200">Missing ID</TableHead>
                            <TableHead className="text-amber-900 dark:text-amber-200">Opp Type</TableHead>
                            <TableHead className="text-amber-900 dark:text-amber-200 text-right">ATR</TableHead>
                            <TableHead className="text-amber-900 dark:text-amber-200 text-right">Net ARR</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orphanStats.opportunities.map((opp: any) => (
                            <TableRow key={opp.sfdc_opportunity_id} className="text-sm">
                              <TableCell className="font-medium truncate max-w-[180px]" title={opp.opportunity_name || opp.sfdc_opportunity_id}>
                                {opp.opportunity_name || opp.sfdc_opportunity_id}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={
                                  opp.orphanType === 'missing_account'
                                    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 text-xs'
                                    : 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800 text-xs'
                                }>
                                  {opp.orphanType === 'missing_account' ? 'Missing Account' : 'Missing Parent'}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[140px]" title={opp.orphanType === 'missing_parent' ? opp.ultimate_parent_id : opp.sfdc_account_id}>
                                {opp.orphanType === 'missing_parent' ? opp.ultimate_parent_id : opp.sfdc_account_id}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={
                                  opp.opportunity_type === 'Renewals' 
                                    ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 text-xs'
                                    : opp.opportunity_type === 'Expansion'
                                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800 text-xs'
                                    : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800 text-xs'
                                }>
                                  {opp.opportunity_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {opp.available_to_renew ? formatCurrency(opp.available_to_renew) : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {opp.net_arr ? formatCurrency(opp.net_arr) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                  
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                    This typically happens when opportunities reference child accounts that weren't included 
                    in the accounts import, or when account IDs don't match between imports.
                  </p>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {/* Orphaned Accounts Warning */}
          {orphanAcctStats && orphanAcctStats.count > 0 && (
            <Collapsible open={isAcctWarningOpen} onOpenChange={setIsAcctWarningOpen}>
              <div className="bg-white dark:bg-slate-900 rounded-md border border-orange-200 dark:border-orange-700 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-orange-900 dark:text-orange-200 font-medium">
                    Orphaned Child Accounts ({orphanAcctStats.count.toLocaleString()})
                  </span>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-orange-700 hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-100 flex-shrink-0">
                      {isAcctWarningOpen ? (
                        <><ChevronUp className="h-4 w-4 mr-1" /> Hide</>
                      ) : (
                        <><ChevronDown className="h-4 w-4 mr-1" /> Details</>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                
                {/* Preview breakdown - always visible */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800 text-xs">
                    parent account doesn't exist
                  </Badge>
                  <span className="text-orange-700 dark:text-orange-400 font-medium ml-auto">
                    {formatCurrency(orphanAcctStats.orphanARR)} ARR
                    {orphanAcctStats.orphanATR > 0 && <> • {formatCurrency(orphanAcctStats.orphanATR)} ATR</>}
                  </span>
                </div>
                
                <CollapsibleContent className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-700">
                  <div className="text-sm text-orange-800 dark:text-orange-300 mb-3 space-y-2">
                    <p>These child accounts have an <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">ultimate_parent_id</code> that doesn't exist in the accounts table.</p>
                    <p className="text-orange-700 dark:text-orange-400">Their ARR/ATR cannot roll up to any parent and they won't be included in book balancing.</p>
                  </div>
                  
                  {/* Data Table Preview */}
                  {orphanAcctStats.accounts && orphanAcctStats.accounts.length > 0 && (
                    <ScrollArea className="h-[280px] rounded-md border border-orange-200 dark:border-orange-700 bg-white dark:bg-slate-900">
                      <Table>
                        <TableHeader className="sticky top-0 bg-orange-100 dark:bg-orange-900/50">
                          <TableRow>
                            <TableHead className="text-orange-900 dark:text-orange-200 w-[200px]">Account</TableHead>
                            <TableHead className="text-orange-900 dark:text-orange-200">Missing Parent ID</TableHead>
                            <TableHead className="text-orange-900 dark:text-orange-200">Owner</TableHead>
                            <TableHead className="text-orange-900 dark:text-orange-200 text-right">ARR</TableHead>
                            <TableHead className="text-orange-900 dark:text-orange-200 text-right">ATR</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orphanAcctStats.accounts.map((acct: any) => (
                            <TableRow key={acct.sfdc_account_id} className="text-sm">
                              <TableCell className="font-medium truncate max-w-[200px]" title={acct.account_name || acct.sfdc_account_id}>
                                {acct.account_name || acct.sfdc_account_id}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[150px]" title={acct.ultimate_parent_id}>
                                {acct.ultimate_parent_id}
                              </TableCell>
                              <TableCell className="text-muted-foreground truncate max-w-[120px]" title={acct.owner_name || '-'}>
                                {acct.owner_name || '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {acct.arr ? formatCurrency(acct.arr) : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {acct.calculated_atr ? formatCurrency(acct.calculated_atr) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                  
                  {orphanAcctStats.accounts && orphanAcctStats.accounts.length < orphanAcctStats.count && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                      Showing top {orphanAcctStats.accounts.length} of {orphanAcctStats.count.toLocaleString()} orphaned accounts (sorted by ARR)
                    </p>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>
      )}

    </div>
  );
};

export default DataOverviewAnalytics;



