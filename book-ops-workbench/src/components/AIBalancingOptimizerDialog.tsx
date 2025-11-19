import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Sparkles, TrendingUp, AlertTriangle, Users, DollarSign } from 'lucide-react';

interface ProblemRep {
  repId: string;
  repName: string;
  currentARR: number;
  deficit: number;
  accountCount: number;
}

interface OptimizationSuggestion {
  accountId: string;
  accountName: string;
  fromRepId: string;
  fromRepName: string;
  toRepId: string;
  toRepName: string;
  arr: number;
  reasoning: string;
  priority: number;
}

interface AIBalancingOptimizerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  buildId: string;
  problemReps: ProblemRep[];
  suggestions: OptimizationSuggestion[];
  aiReasoning?: string;
  onApply: (selectedSuggestions: OptimizationSuggestion[]) => Promise<void>;
  onRegenerate?: () => Promise<void>;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

export const AIBalancingOptimizerDialog: React.FC<AIBalancingOptimizerDialogProps> = ({
  isOpen,
  onClose,
  problemReps,
  suggestions,
  aiReasoning,
  onApply,
  onRegenerate
}) => {
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(
    new Set(suggestions.map(s => s.accountId))
  );
  const [isApplying, setIsApplying] = useState(false);

  const toggleSuggestion = (accountId: string) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId);
    } else {
      newSelected.add(accountId);
    }
    setSelectedSuggestions(newSelected);
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const selected = suggestions.filter(s => selectedSuggestions.has(s.accountId));
      await onApply(selected);
      onClose();
    } catch (error) {
      console.error('Failed to apply AI optimizations:', error);
    } finally {
      setIsApplying(false);
    }
  };

  const getPriorityBadge = (priority: number) => {
    if (priority <= 2) return <Badge variant="destructive">Critical</Badge>;
    if (priority <= 4) return <Badge variant="default">High</Badge>;
    return <Badge variant="secondary">Medium</Badge>;
  };

  const selectedCount = selectedSuggestions.size;
  const totalImpact = suggestions
    .filter(s => selectedSuggestions.has(s.accountId))
    .reduce((sum, s) => sum + s.arr, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Territory Optimization
          </DialogTitle>
          <DialogDescription>
            Review AI-generated suggestions to balance territory workload
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Problem Summary */}
          {problemReps.length > 0 && (
            <Card className="p-4 bg-destructive/10 border-destructive/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm mb-2">Workload Imbalance Detected</h3>
                  <div className="space-y-2">
                    {problemReps.map(rep => (
                      <div key={rep.repId} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{rep.repName}</span>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {formatCurrency(rep.currentARR)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {rep.accountCount} accounts
                          </span>
                          <Badge variant="destructive" className="text-xs">
                            {formatCurrency(rep.deficit)} below target
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* AI Reasoning */}
          {aiReasoning && (
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm mb-2">AI Analysis</h3>
                  <p className="text-sm text-muted-foreground">{aiReasoning}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Suggestions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                Suggested Account Moves ({suggestions.length})
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSuggestions(new Set())}
                  disabled={selectedCount === 0}
                >
                  Clear All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSuggestions(new Set(suggestions.map(s => s.accountId)))}
                  disabled={selectedCount === suggestions.length}
                >
                  Select All
                </Button>
              </div>
            </div>

            {suggestions.map(suggestion => (
              <Card
                key={suggestion.accountId}
                className={`p-4 transition-colors ${
                  selectedSuggestions.has(suggestion.accountId)
                    ? 'bg-primary/5 border-primary/30'
                    : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedSuggestions.has(suggestion.accountId)}
                    onCheckedChange={() => toggleSuggestion(suggestion.accountId)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-semibold text-sm">{suggestion.accountName}</h4>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(suggestion.arr)} ARR
                        </p>
                      </div>
                      {getPriorityBadge(suggestion.priority)}
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">From:</span>
                      <span className="font-medium">{suggestion.fromRepName}</span>
                      <TrendingUp className="h-4 w-4 text-muted-foreground mx-2" />
                      <span className="text-muted-foreground">To:</span>
                      <span className="font-medium text-primary">{suggestion.toRepName}</span>
                    </div>

                    <p className="text-xs text-muted-foreground italic">
                      {suggestion.reasoning}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Impact Summary */}
          <Card className="p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm mb-1">Selected Impact</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedCount} moves will redistribute {formatCurrency(totalImpact)} in ARR
                </p>
              </div>
              {onRegenerate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRegenerate}
                  disabled={isApplying}
                >
                  Regenerate Suggestions
                </Button>
              )}
            </div>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={selectedCount === 0 || isApplying}
          >
            {isApplying ? 'Applying...' : `Apply ${selectedCount} Move${selectedCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
