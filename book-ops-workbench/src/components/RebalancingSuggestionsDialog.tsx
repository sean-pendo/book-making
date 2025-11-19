import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, TrendingUp, AlertTriangle, Sparkles, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface RebalanceSuggestion {
  accountId: string;
  accountName: string;
  accountARR: number;
  fromRepId: string;
  fromRepName: string;
  toRepId: string;
  toRepName: string;
  reason: string;
  estimatedImpact: string;
}

interface RebalancingSuggestionsDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (selectedSuggestions: RebalanceSuggestion[]) => void;
  suggestions: RebalanceSuggestion[];
  warnings?: string[];
  isApplying?: boolean;
}

export const RebalancingSuggestionsDialog: React.FC<RebalancingSuggestionsDialogProps> = ({
  open,
  onClose,
  onApply,
  suggestions,
  warnings = [],
  isApplying = false
}) => {
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  const toggleSuggestion = (accountId: string) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId);
    } else {
      newSelected.add(accountId);
    }
    setSelectedSuggestions(newSelected);
  };

  const selectAll = () => {
    setSelectedSuggestions(new Set(suggestions.map(s => s.accountId)));
  };

  const deselectAll = () => {
    setSelectedSuggestions(new Set());
  };

  const handleApply = () => {
    const selected = suggestions.filter(s => selectedSuggestions.has(s.accountId));
    onApply(selected);
  };

  if (suggestions.length === 0 && warnings.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              No Rebalancing Needed
            </DialogTitle>
            <DialogDescription>
              All regions are balanced within ±10% of target ARR. No adjustments required.
            </DialogDescription>
          </DialogHeader>
          <div className="text-center py-8">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Perfect Balance!</h3>
            <p className="text-muted-foreground">
              Your assignments are well-balanced across all regions.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            AI Rebalancing Suggestions
          </DialogTitle>
          <DialogDescription>
            AI detected regional imbalances and suggests these account moves to achieve better balance
          </DialogDescription>
        </DialogHeader>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((warning, index) => (
              <Alert key={index} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Suggestions</p>
                  <p className="text-2xl font-bold">{suggestions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Selected</p>
                  <p className="text-2xl font-bold">{selectedSuggestions.size}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Est. Improvement</p>
                  <p className="text-2xl font-bold text-green-600">+Balance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Selection Controls */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>
            Deselect All
          </Button>
        </div>

        {/* Suggestions List */}
        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <Card key={suggestion.accountId} className={selectedSuggestions.has(suggestion.accountId) ? 'border-primary' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedSuggestions.has(suggestion.accountId)}
                      onCheckedChange={() => toggleSuggestion(suggestion.accountId)}
                      className="mt-1"
                    />
                    <div>
                      <CardTitle className="text-base font-semibold">
                        {suggestion.accountName}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        ARR: ${(suggestion.accountARR / 1000000).toFixed(2)}M
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-purple-500 text-purple-600">
                    <Sparkles className="w-3 h-3 mr-1" />
                    AI Suggested
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Move Details */}
                <div className="flex items-center gap-4 mb-3 p-3 bg-muted rounded-lg">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">From</p>
                    <p className="font-medium">{suggestion.fromRepName}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">To</p>
                    <p className="font-medium">{suggestion.toRepName}</p>
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium mb-1">Reasoning:</p>
                    <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
                  </div>

                  {/* Impact */}
                  <div>
                    <p className="text-sm font-medium mb-1">Estimated Impact:</p>
                    <p className="text-sm text-green-600">{suggestion.estimatedImpact}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button 
            onClick={handleApply} 
            disabled={selectedSuggestions.size === 0 || isApplying}
          >
            {isApplying ? (
              <>Applying {selectedSuggestions.size} moves...</>
            ) : (
              <>Apply {selectedSuggestions.size} Selected Moves</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
