import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertTriangle, TrendingUp, Users, Loader2, Sparkles, Shield, Globe, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
    const riskInfo = {
      HIGH: {
        label: 'High Risk',
        className: '',
        variant: 'destructive' as const,
        description: 'Reassigning an existing customer account. This may disrupt established relationships.'
      },
      MEDIUM: {
        label: 'Medium Risk',
        className: 'bg-orange-500',
        variant: 'default' as const,
        description: 'High-value account (ARR > $100K) or has a risk flag. Review before approving.'
      },
      LOW: {
        label: 'Low Risk',
        className: 'bg-green-500',
        variant: 'default' as const,
        description: 'Safe to reassign. Typically a prospect or low-value account with no relationship disruption.'
      }
    };
    
    const info = riskInfo[risk];
    
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={info.variant} 
            className={`${info.className} cursor-help`}
          >
            {info.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[250px]">
          <p className="text-xs">{info.description}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const getRuleAppliedBadge = (rule: string) => {
    // Sales Tools Bucket - distinct from protected
    if (rule.includes('Sales Tools')) {
      return <Badge variant="outline" className="border-orange-500 text-orange-600"><TrendingUp className="w-3 h-3 mr-1" />Sales Tools</Badge>;
    }
    // P0: Protected accounts (Strategic, Manual Holdover)
    if (rule.startsWith('P0:') || rule.includes('Manual') || rule.includes('Strategic')) {
      return <Badge variant="outline" className="border-amber-500 text-amber-700"><Shield className="w-3 h-3 mr-1" />Protected</Badge>;
    }
    // P1: Continuity + Geography
    if (rule.startsWith('P1:') || rule.includes('Continuity + Geo')) {
      return <Badge variant="outline" className="border-green-500 text-green-700"><Users className="w-3 h-3 mr-1" />Continuity+Geo</Badge>;
    }
    // P2: Geography Match
    if (rule.startsWith('P2:') || rule.includes('Geographic')) {
      return <Badge variant="outline" className="border-blue-500 text-blue-700"><Globe className="w-3 h-3 mr-1" />Geography</Badge>;
    }
    // P3: Continuity (any geo)
    if (rule.startsWith('P3:') || (rule.includes('Continuity') && !rule.includes('+'))) {
      return <Badge variant="outline" className="border-purple-500 text-purple-700"><Users className="w-3 h-3 mr-1" />Continuity</Badge>;
    }
    // P4/RO: Load Balance / Residual
    if (rule.startsWith('P4:') || rule.startsWith('RO:') || rule.includes('Residual') || rule.includes('Best Available')) {
      return <Badge variant="outline" className="border-cyan-500 text-cyan-700"><TrendingUp className="w-3 h-3 mr-1" />Balance</Badge>;
    }
    // Legacy exact matches for backward compatibility
    if (rule === 'GEO_FIRST') {
      return <Badge variant="outline"><Globe className="w-3 h-3 mr-1" />Geo-First</Badge>;
    }
    if (rule === 'CONTINUITY') {
      return <Badge variant="outline"><Users className="w-3 h-3 mr-1" />Continuity</Badge>;
    }
    if (rule === 'LOAD_BALANCE') {
      return <Badge variant="outline"><TrendingUp className="w-3 h-3 mr-1" />Load Balance</Badge>;
    }
    if (rule === 'CAPACITY_OVERFLOW' || rule === 'MIN_THRESHOLDS_OVERFLOW') {
      return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Overflow</Badge>;
    }
    // Default fallback
    return <Badge variant="outline">{rule}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assignment Preview</DialogTitle>
          <DialogDescription>
            Review proposed assignments before saving to the database
          </DialogDescription>
        </DialogHeader>

        {/* Compact Summary Row with Apply Button */}
        <div className="flex items-center justify-between gap-4 text-sm mb-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span><strong>{result.proposals.length}</strong> proposals</span>
            </div>
            {result.conflicts.length > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span><strong>{result.conflicts.length}</strong> conflicts</span>
              </div>
            )}
            {result.unassignedAccounts > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{result.unassignedAccounts} unassigned</span>
              </div>
            )}
          </div>
          <Button 
            onClick={onExecute} 
            disabled={result.proposals.length === 0 || isExecuting}
            className="bg-green-600 hover:bg-green-700"
            size="sm"
          >
            {isExecuting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            {isExecuting ? 'Applying...' : 'Apply Assignments'}
          </Button>
        </div>

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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="proposals">Proposals ({result.proposals.length})</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts ({result.conflicts.length})</TabsTrigger>
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
                      <TableHead>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help">
                              Risk
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[280px]">
                            <p className="font-semibold mb-1">Assignment Risk</p>
                            <p className="text-xs text-muted-foreground">
                              How risky is this ownership change? Based on account value and customer status.
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              Not the same as CRE Risk (customer churn probability).
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
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
                          {(proposal as any).warningDetails ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-sm cursor-help flex items-center gap-1">
                                  {proposal.assignmentReason}
                                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs font-medium mb-1">Warning Details:</p>
                                <p className="text-xs">{(proposal as any).warningDetails}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="text-sm">{proposal.assignmentReason}</div>
                          )}
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
                        <TableHead>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 cursor-help">
                                Risk Level
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px]">
                              <p className="font-semibold mb-1">Assignment Risk</p>
                              <p className="text-xs text-muted-foreground">
                                How risky is this ownership change? Based on account value and customer status.
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                Not the same as CRE Risk (customer churn probability).
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
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
            className="bg-green-600 hover:bg-green-700"
          >
            {isExecuting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            {isExecuting ? 'Applying...' : 'Apply Assignments'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};