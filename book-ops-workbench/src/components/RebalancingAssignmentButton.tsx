import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RebalancingAssignmentService } from '@/services/rebalancingAssignmentService';
import type { AssignmentProgress, AssignmentResult } from '@/services/rebalancingAssignmentService';

interface RebalancingAssignmentButtonProps {
  buildId: string;
  onComplete?: (result: AssignmentResult) => void;
}

export const RebalancingAssignmentButton = ({ 
  buildId, 
  onComplete 
}: RebalancingAssignmentButtonProps) => {
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [progress, setProgress] = useState<AssignmentProgress | null>(null);
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const { toast } = useToast();

  const handleRebalance = async (accountType: 'customers' | 'prospects' | 'all') => {
    if (!buildId) return;

    setIsRebalancing(true);
    setProgress(null);
    setResult(null);

    try {
      console.log(`[REBALANCE] 🚀 Starting complete rebalancing for ${accountType}`);
      
      const rebalancingService = RebalancingAssignmentService.getInstance();
      
      // Set up progress callback
      rebalancingService.setProgressCallback((progressUpdate: AssignmentProgress) => {
        setProgress(progressUpdate);
      });

      const assignmentResult = await rebalancingService.generateRebalancedAssignments(
        buildId,
        accountType
      );

      setResult(assignmentResult);
      setProgress(null);

      toast({
        title: "Complete Rebalancing Successful!",
        description: `✅ Rebalanced ${assignmentResult.assignedAccounts} accounts to achieve $2M ARR per rep with ${assignmentResult.conflicts.length} conflicts`,
      });

      onComplete?.(assignmentResult);
      
    } catch (error) {
      console.error('[REBALANCE] Rebalancing failed:', error);
      
      toast({
        title: "Rebalancing Failed",
        description: error.message || "An error occurred during rebalancing",
        variant: "destructive",
      });
      
      setProgress(null);
    } finally {
      setIsRebalancing(false);
    }
  };

  const getPhaseDescription = (stage: string) => {
    switch (stage) {
      case 'loading': return 'Loading account and rep data...';
      case 'resetting': return 'Phase 1: Creating clean slate - resetting all assignments';
      case 'analyzing': return 'Phase 2: Grouping accounts by geography';
      case 'balancing': return 'Phase 3: Smart rebalancing to $2M ARR targets';
      case 'continuity': return 'Phase 4: Optimizing for account continuity';
      case 'finalizing': return 'Phase 5: Final tier and risk balancing';
      case 'complete': return 'Rebalancing complete!';
      default: return stage;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5" />
          Complete Assignment Rebalancing
        </CardTitle>
        <CardDescription>
          Implement true $2M ARR per rep rebalancing with 6-8 parent accounts. 
          This will reset ALL existing assignments and redistribute for perfect balance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Display */}
        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {getPhaseDescription(progress.stage)}
              </span>
              <Badge variant="outline">
                Phase {progress.rulesCompleted + 1}/5
              </Badge>
            </div>
            <Progress value={progress.progress} className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.assignmentsMade} assignments made</span>
              <span>{progress.conflicts} conflicts</span>
              <span>{Math.round(progress.progress)}%</span>
            </div>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="font-medium text-sm">Rebalancing Complete</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-center">
                <div className="font-bold text-lg text-primary">{result.assignedAccounts}</div>
                <div className="text-xs text-muted-foreground">Accounts Assigned</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg text-primary">$2M</div>
                <div className="text-xs text-muted-foreground">Target ARR/Rep</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg text-orange-500">{result.conflicts.length}</div>
                <div className="text-xs text-muted-foreground">Conflicts</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button 
            onClick={() => handleRebalance('customers')}
            disabled={isRebalancing}
            variant="default"
            className="w-full"
          >
            {isRebalancing ? 'Rebalancing...' : 'Rebalance Customers'}
          </Button>
          
          <Button 
            onClick={() => handleRebalance('prospects')}
            disabled={isRebalancing}
            variant="outline"
            className="w-full"
          >
            {isRebalancing ? 'Rebalancing...' : 'Rebalance Prospects'}
          </Button>
          
          <Button 
            onClick={() => handleRebalance('all')}
            disabled={isRebalancing}
            variant="secondary"
            className="w-full"
          >
            {isRebalancing ? 'Rebalancing...' : 'Rebalance All'}
          </Button>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>Warning:</strong> This will completely reset all existing assignments and 
            redistribute accounts to achieve perfect $2M ARR balance per rep. Historical 
            assignments will be overridden where necessary to achieve balance.
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <div className="text-xs font-medium">Target Distribution:</div>
            <div className="text-xs text-muted-foreground">
              • $2M ARR per rep<br/>
              • 6-8 parent accounts<br/>
              • Balanced tiers & risks
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium">Smart Logic:</div>
            <div className="text-xs text-muted-foreground">
              • Geographic continuity<br/>
              • Historical ownership<br/>
              • Balance over history
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};