import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertTriangle, Users, Loader2, Sparkles, Info, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RebalancingSuggestionsDialog } from './RebalancingSuggestionsDialog';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import type { AssignmentResult } from '@/services/assignmentService';

// Pagination constants - rendering 100K+ rows would crash the browser
const PROPOSALS_PER_PAGE = 100;
const CONFLICTS_PER_PAGE = 50;

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
  
  // Pagination state - critical for large datasets (100K+ proposals)
  const [proposalsPage, setProposalsPage] = useState(0);
  const [conflictsPage, setConflictsPage] = useState(0);
  
  // Sorting state for proposals table
  type SortField = 'accountName' | 'currentOwnerName' | 'proposedOwnerName' | 'confidence';
  const [sortField, setSortField] = useState<SortField>('accountName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4" /> : 
      <ChevronDown className="h-4 w-4" />;
  };
  
  if (!result) return null;
  
  // Sort proposals - memoized to avoid re-sorting on every render
  const sortedProposals = useMemo(() => {
    return [...result.proposals].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'accountName':
          comparison = (a.accountName || '').localeCompare(b.accountName || '');
          break;
        case 'currentOwnerName':
          comparison = (a.currentOwnerName || '').localeCompare(b.currentOwnerName || '');
          break;
        case 'proposedOwnerName':
          comparison = (a.proposedOwnerName || '').localeCompare(b.proposedOwnerName || '');
          break;
        case 'confidence':
          // Sort order: HIGH > MEDIUM > LOW
          const confidenceOrder: Record<string, number> = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
          comparison = (confidenceOrder[b.confidence || ''] || 0) - (confidenceOrder[a.confidence || ''] || 0);
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [result.proposals, sortField, sortDirection]);
  
  // Paginated proposals - only render PROPOSALS_PER_PAGE at a time
  const totalProposalsPages = Math.ceil(sortedProposals.length / PROPOSALS_PER_PAGE);
  const paginatedProposals = sortedProposals.slice(
    proposalsPage * PROPOSALS_PER_PAGE,
    (proposalsPage + 1) * PROPOSALS_PER_PAGE
  );
  
  // Paginated conflicts
  const totalConflictsPages = Math.ceil(result.conflicts.length / CONFLICTS_PER_PAGE);
  const paginatedConflicts = result.conflicts.slice(
    conflictsPage * CONFLICTS_PER_PAGE,
    (conflictsPage + 1) * CONFLICTS_PER_PAGE
  );

  const hasRebalanceSuggestions = result.rebalancingSuggestions && result.rebalancingSuggestions.length > 0;
  const hasRebalanceWarnings = result.rebalanceWarnings && result.rebalanceWarnings.length > 0;

  const handleApplyRebalanceSuggestions = (suggestions: any[]) => {
    console.log('Applying rebalancing suggestions:', suggestions);
    // TODO: Implement applying rebalancing suggestions
    setShowRebalanceSuggestions(false);
  };

  /** Get badge for assignment confidence level @see MASTER_LOGIC.mdc §13.4.1 */
  const getConfidenceBadge = (confidence: 'LOW' | 'MEDIUM' | 'HIGH') => {
    const confidenceInfo = {
      HIGH: {
        label: 'High Confidence',
        className: '',
        variant: 'outline' as const,
        description: 'Clean assignment with no concerns. Safe to approve.'
      },
      MEDIUM: {
        label: 'Medium Confidence',
        className: 'bg-orange-500 text-white border-orange-500',
        variant: 'default' as const,
        description: 'Some concerns detected (geo mismatch, tier concentration). Review before approving.'
      },
      LOW: {
        label: 'Low Confidence',
        className: '',
        variant: 'destructive' as const,
        description: 'Significant issues (capacity exceeded, changing customer owner). May disrupt established relationships.'
      }
    };
    
    const info = confidenceInfo[confidence];
    
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
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('accountName')}
                      >
                        <div className="flex items-center gap-1">
                          Account
                          {getSortIcon('accountName')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('currentOwnerName')}
                      >
                        <div className="flex items-center gap-1">
                          Current Owner
                          {getSortIcon('currentOwnerName')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('proposedOwnerName')}
                      >
                        <div className="flex items-center gap-1">
                          Proposed Owner
                          {getSortIcon('proposedOwnerName')}
                        </div>
                      </TableHead>
                      <TableHead>Rule Applied</TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('confidence')}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help">
                              Confidence
                              {getSortIcon('confidence')}
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[280px]">
                            <p className="font-semibold mb-1">Assignment Confidence</p>
                            <p className="text-xs text-muted-foreground">
                              How confident is the system in this assignment? Based on warning severity.
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
                    {paginatedProposals.map((proposal) => (
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
                          <PriorityBadge ruleApplied={proposal.ruleApplied} />
                        </TableCell>
                        <TableCell>
                          {getConfidenceBadge(proposal.confidence)}
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
                
                {/* Pagination controls for proposals */}
                {totalProposalsPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Showing {proposalsPage * PROPOSALS_PER_PAGE + 1} - {Math.min((proposalsPage + 1) * PROPOSALS_PER_PAGE, sortedProposals.length)} of {sortedProposals.length.toLocaleString()} proposals
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setProposalsPage(0)}
                        disabled={proposalsPage === 0}
                      >
                        First
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setProposalsPage(p => Math.max(0, p - 1))}
                        disabled={proposalsPage === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm px-2">
                        Page {proposalsPage + 1} of {totalProposalsPages.toLocaleString()}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setProposalsPage(p => Math.min(totalProposalsPages - 1, p + 1))}
                        disabled={proposalsPage >= totalProposalsPages - 1}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setProposalsPage(totalProposalsPages - 1)}
                        disabled={proposalsPage >= totalProposalsPages - 1}
                      >
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conflicts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Assignment Conflicts</CardTitle>
                <CardDescription>
                  Low-confidence assignments that require manual review, including cutoff violations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.conflicts.length > 0 ? (
                  <>
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
                                Confidence
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px]">
                              <p className="font-semibold mb-1">Assignment Confidence</p>
                              <p className="text-xs text-muted-foreground">
                                How confident is the system in this assignment? Based on warning severity.
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
                      {paginatedConflicts.map((conflict) => (
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
                            {getConfidenceBadge(conflict.confidence)}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{conflict.assignmentReason}</div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {/* Pagination controls for conflicts */}
                  {totalConflictsPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {conflictsPage * CONFLICTS_PER_PAGE + 1} - {Math.min((conflictsPage + 1) * CONFLICTS_PER_PAGE, result.conflicts.length)} of {result.conflicts.length.toLocaleString()} conflicts
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConflictsPage(0)}
                          disabled={conflictsPage === 0}
                        >
                          First
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConflictsPage(p => Math.max(0, p - 1))}
                          disabled={conflictsPage === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm px-2">
                          Page {conflictsPage + 1} of {totalConflictsPages.toLocaleString()}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConflictsPage(p => Math.min(totalConflictsPages - 1, p + 1))}
                          disabled={conflictsPage >= totalConflictsPages - 1}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConflictsPage(totalConflictsPages - 1)}
                          disabled={conflictsPage >= totalConflictsPages - 1}
                        >
                          Last
                        </Button>
                      </div>
                    </div>
                  )}
                </>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                    <h3 className="mt-4 text-lg font-semibold">No Conflicts Found</h3>
                    <p className="text-muted-foreground">
                      All assignments are high confidence and can be applied safely.
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