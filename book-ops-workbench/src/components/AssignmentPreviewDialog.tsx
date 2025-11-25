import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertTriangle, TrendingUp, Users, Globe, Play, Loader2, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RuleUsageByRegionChart } from './RuleUsageByRegionChart';
import { RebalancingSuggestionsDialog } from './RebalancingSuggestionsDialog';
import type { AssignmentResult } from '@/services/assignmentService';

interface AssignmentPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  onExecute: () => void;
  result: AssignmentResult | null;
  isExecuting?: boolean;
  assignmentType?: 'customer' | 'prospect';
  buildId?: string;
}

export const AssignmentPreviewDialog: React.FC<AssignmentPreviewDialogProps> = ({
  open,
  onClose,
  onExecute,
  result,
  isExecuting = false,
  assignmentType = 'customer',
  buildId
}) => {
  const [showRebalanceSuggestions, setShowRebalanceSuggestions] = useState(false);
  
  if (!result) return null;

  const hasRebalanceSuggestions = result.rebalancingSuggestions && result.rebalancingSuggestions.length > 0;
  const hasRebalanceWarnings = result.rebalanceWarnings && result.rebalanceWarnings.length > 0;

  const handleApplyRebalanceSuggestions = (suggestions: any[]) => {
    console.log('Applying rebalancing suggestions:', suggestions);
    // TODO: Implement applying rebalancing suggestions
    setShowRebalanceSuggestions(false);
  };

  const getConflictRiskBadge = (risk: 'LOW' | 'MEDIUM' | 'HIGH') => {
    switch (risk) {
      case 'HIGH':
        return <Badge variant="destructive">High Risk</Badge>;
      case 'MEDIUM':
        return <Badge className="bg-orange-500">Medium Risk</Badge>;
      case 'LOW':
        return <Badge className="bg-green-500">Low Risk</Badge>;
    }
  };

  const getRuleAppliedBadge = (rule: string) => {
    switch (rule) {
      case 'GEO_FIRST':
        return <Badge variant="outline"><Globe className="w-3 h-3 mr-1" />Geo-First</Badge>;
      case 'CONTINUITY':
        return <Badge variant="outline"><Users className="w-3 h-3 mr-1" />Continuity</Badge>;
      case 'LOAD_BALANCE':
        return <Badge variant="outline"><TrendingUp className="w-3 h-3 mr-1" />Load Balance</Badge>;
      case 'RISK_DISTRIBUTION':
        return <Badge variant="outline" className="border-orange-500 text-orange-600"><AlertTriangle className="w-3 h-3 mr-1" />Risk Distribution</Badge>;
      case 'TIER_BALANCING':
        return <Badge variant="outline" className="border-purple-500 text-purple-600">Tier Balance</Badge>;
      case 'CAPACITY_OVERFLOW':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Capacity Overflow</Badge>;
      case 'MIN_THRESHOLDS_OVERFLOW':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Cutoff Violation</Badge>;
      default:
        return <Badge variant="outline">{rule}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🔍 Assignment Preview</DialogTitle>
          <DialogDescription className="space-y-2">
            <div>Review proposed assignments before applying changes to the database</div>
            <div className="text-xs bg-blue-50 dark:bg-blue-900/20 p-2 rounded border-l-4 border-blue-500">
              <strong>What happens when you Apply:</strong><br />
              • New owner assignments will be saved to the database<br />
              • Assignment reasoning will be preserved for audit trail<br />
              • All tabs (Owner Assignment, Balancing, Review) will refresh with current data<br />
              • Changes will be visible immediately across the application
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Top Action Bar - Apply button prominently at top */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800 mb-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-900 dark:text-green-100">
                {result.proposals.length} assignments ready to apply
              </p>
              <p className="text-xs text-green-700 dark:text-green-300">
                Click Apply to save these assignments to the database
              </p>
            </div>
          </div>
          <Button 
            onClick={onExecute} 
            disabled={result.proposals.length === 0 || isExecuting}
            size="lg"
            className="bg-green-600 hover:bg-green-700"
          >
            {isExecuting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {isExecuting ? 'Applying...' : `Apply ${result.proposals.length} Assignments`}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Proposals</p>
                  <p className="text-2xl font-bold">{result.assignedAccounts}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Conflicts</p>
                  <p className="text-2xl font-bold">{result.conflicts.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Unassigned</p>
                  <p className="text-2xl font-bold">{result.unassignedAccounts}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{result.totalAccounts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* How It Worked Summary */}
        {result.statistics && (
          <Card className="mb-6 border-blue-500 bg-blue-50/50 dark:bg-blue-900/10">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                How It Worked
              </CardTitle>
              <CardDescription>
                Assignment generation applied these rules and configurations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-semibold mb-2">Rules Applied:</h4>
                  <ul className="space-y-1">
                    {result.proposals.filter(p => p.ruleApplied === 'CONTINUITY').length > 0 && (
                      <li className="flex items-center gap-2">
                        <Users className="w-3 h-3" />
                        <span><strong>{result.proposals.filter(p => p.ruleApplied === 'CONTINUITY').length}</strong> Continuity assignments</span>
                      </li>
                    )}
                    {result.proposals.filter(p => p.ruleApplied === 'GEO_FIRST').length > 0 && (
                      <li className="flex items-center gap-2">
                        <Globe className="w-3 h-3" />
                        <span><strong>{result.proposals.filter(p => p.ruleApplied === 'GEO_FIRST').length}</strong> Geographic matches</span>
                      </li>
                    )}
                    {result.proposals.filter(p => p.ruleApplied === 'LOAD_BALANCE').length > 0 && (
                      <li className="flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" />
                        <span><strong>{result.proposals.filter(p => p.ruleApplied === 'LOAD_BALANCE').length}</strong> Load balanced</span>
                      </li>
                    )}
                    {result.proposals.filter(p => p.ruleApplied === 'RISK_DISTRIBUTION').length > 0 && (
                      <li className="flex items-center gap-2 text-orange-600">
                        <AlertTriangle className="w-3 h-3" />
                        <span><strong>{result.proposals.filter(p => p.ruleApplied === 'RISK_DISTRIBUTION').length}</strong> Risk distributions</span>
                      </li>
                    )}
                    {result.proposals.filter(p => p.ruleApplied === 'TIER_BALANCING').length > 0 && (
                      <li className="flex items-center gap-2 text-purple-600">
                        <Sparkles className="w-3 h-3" />
                        <span><strong>{result.proposals.filter(p => p.ruleApplied === 'TIER_BALANCING').length}</strong> Tier balanced</span>
                      </li>
                    )}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Configuration Used:</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    {assignmentType === 'customer' ? (
                      <>
                        <li>Target ARR per rep from your settings</li>
                        <li>Max ARR per rep from your settings</li>
                        <li>Max CRE per rep enforced</li>
                        <li>Geographic territory mappings</li>
                        <li>Account capacity limits applied</li>
                      </>
                    ) : (
                      <>
                        <li>Distributed evenly by account count</li>
                        <li>Geography match preferred</li>
                        <li>No hard capacity limits</li>
                        <li>No CRE tracking for prospects</li>
                        <li>Natural load balancing</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rebalancing Warnings and Suggestions */}
        {(hasRebalanceWarnings || hasRebalanceSuggestions) && (
          <Alert className="bg-purple-50 dark:bg-purple-900/20 border-purple-500">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <AlertTitle className="text-purple-900 dark:text-purple-100">
              {hasRebalanceSuggestions ? 'AI Rebalancing Available' : 'Regional Balance Alert'}
            </AlertTitle>
            <AlertDescription className="text-purple-800 dark:text-purple-200">
              {hasRebalanceWarnings && result.rebalanceWarnings?.[0]}
              {hasRebalanceSuggestions && (
                <div className="mt-2">
                  AI has generated {result.rebalancingSuggestions?.length} suggestions to improve regional balance.
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="ml-3"
                    onClick={() => setShowRebalanceSuggestions(true)}
                  >
                    <Sparkles className="w-4 h-4 mr-1" />
                    View AI Suggestions
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="proposals" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="proposals">Proposals ({result.proposals.length})</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts ({result.conflicts.length})</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="proposals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Assignment Proposals</CardTitle>
                <CardDescription>
                  Recommended assignments based on geo-first, tier, continuity, and load balancing rules
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Current Owner</TableHead>
                      <TableHead>Proposed Owner</TableHead>
                      <TableHead>Rule Applied</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.proposals.map((proposal) => (
                      <TableRow key={proposal.accountId}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{proposal.accountName}</div>
                            <div className="text-sm text-muted-foreground">
                              {proposal.accountId}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {proposal.currentOwnerName || (
                            <Badge variant="outline">Unassigned</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{proposal.proposedOwnerName}</div>
                        </TableCell>
                        <TableCell>
                          {getRuleAppliedBadge(proposal.ruleApplied)}
                        </TableCell>
                        <TableCell>
                          {getConflictRiskBadge(proposal.conflictRisk)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{proposal.assignmentReason}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conflicts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Assignment Conflicts</CardTitle>
                <CardDescription>
                  High-risk assignments that require manual review, including cutoff violations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.conflicts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Current Owner</TableHead>
                        <TableHead>Proposed Owner</TableHead>
                        <TableHead>Risk Level</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.conflicts.map((conflict) => (
                        <TableRow key={conflict.accountId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{conflict.accountName}</div>
                              <div className="text-sm text-muted-foreground">
                                {conflict.accountId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{conflict.currentOwnerName}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{conflict.proposedOwnerName}</div>
                          </TableCell>
                          <TableCell>
                            {getConflictRiskBadge(conflict.conflictRisk)}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{conflict.assignmentReason}</div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                    <h3 className="mt-4 text-lg font-semibold">No Conflicts Found</h3>
                    <p className="text-muted-foreground">
                      All assignments are low risk and can be applied safely.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="statistics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Geography Analysis */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Geography Analysis
                    </CardTitle>
                    <CardDescription>Rep distribution and workload by region</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(result.statistics.byGeo || {}).length > 0 ? (
                      <div className="space-y-4">
                        {Object.entries(result.statistics.byGeo || {}).map(([geo, geoStats]) => (
                          <div key={geo} className="border rounded p-3">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-medium">{geo}</span>
                              <Badge variant="outline">{geoStats.repCount} reps</Badge>
                            </div>
                             <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                               <div>Customers: {geoStats.customerAccounts}</div>
                               <div>
                                 Current ATR: ${((geoStats.totalATR || 0) / 1000000).toFixed(1)}M
                                 {(geoStats as any).projectedATR > 0 && (
                                   <div className="font-medium text-foreground">
                                     Projected ATR: ${(((geoStats as any).projectedATR || 0) / 1000000).toFixed(1)}M
                                   </div>
                                 )}
                               </div>
                               <div>Avg per Rep: {Math.round(geoStats.customerAccounts / geoStats.repCount)}</div>
                               <div>ARR: ${(geoStats.totalARR / 1000000).toFixed(1)}M</div>
                             </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Globe className="mx-auto h-8 w-8 mb-2 opacity-50" />
                        <p>No geography data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Rule Usage Chart - show only if we have rule usage data */}
                {result.statistics.ruleUsageByRegion && (
                  <RuleUsageByRegionChart 
                    data={Object.entries(result.statistics.ruleUsageByRegion || {}).map(([region, rules]) => ({
                      region,
                      ...rules
                    }))}
                  />
                )}
              </div>

              {/* Rep Workload */}
              <Card>
                <CardHeader>
                  <CardTitle>Rep Workload Distribution</CardTitle>
                  <CardDescription>
                    Customer and prospect distribution by representative
                  </CardDescription>
                </CardHeader>
                   <CardContent>
                      {Object.keys(result.statistics.byRep || {}).length > 0 ? (
                        <div className="space-y-3">
                          <div className="text-xs text-muted-foreground mb-3">
                            Rep workload distribution from new assignments
                          </div>
                          {Object.entries(result.statistics.byRep || {})
                            .sort(([,a], [,b]) => (b.totalAccounts || 0) - (a.totalAccounts || 0))
                            .filter(([,stats]) => (stats.totalAccounts || 0) > 0)
                            .map(([rep, stats]) => (
                              <div key={rep} className="border rounded p-3">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-medium text-sm">{rep}</span>
                                  <Badge variant="default" className="text-xs">
                                    {stats.totalAccounts || 0} accounts
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                  <div className="space-y-1">
                                    <div className="flex justify-between">
                                      <span>ARR:</span>
                                      <span className="font-medium">
                                        ${((stats.totalARR || 0) / 1000000).toFixed(1)}M
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>ATR:</span>
                                      <span className="font-medium">
                                        ${((stats.totalATR || 0) / 1000000).toFixed(1)}M
                                      </span>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between">
                                      <span>Tiers:</span>
                                      <span className="font-medium">
                                        T1:{stats.tier1Count || 0} T2:{stats.tier2Count || 0}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Risk:</span>
                                      <span className="font-medium">
                                        {stats.riskCount || 0}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                       </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
                          <p>No rep workload data available</p>
                        </div>
                      )}
                   </CardContent>
              </Card>
            </div>
          </TabsContent>

        </Tabs>

        {/* Rebalancing Suggestions Dialog */}
        {hasRebalanceSuggestions && (
          <RebalancingSuggestionsDialog
            open={showRebalanceSuggestions}
            onClose={() => setShowRebalanceSuggestions(false)}
            onApply={handleApplyRebalanceSuggestions}
            suggestions={result.rebalancingSuggestions || []}
            warnings={result.rebalanceWarnings}
            isApplying={false}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={onExecute} 
            disabled={result.proposals.length === 0 || isExecuting}
          >
            {isExecuting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {isExecuting ? 'Applying...' : `Apply ${result.proposals.length} Assignments`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};