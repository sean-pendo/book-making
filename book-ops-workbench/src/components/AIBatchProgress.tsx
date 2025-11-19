import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AIBatchProgressProps {
  currentBatch: number;
  totalBatches: number;
  accountsPerBatch?: number;
  estimatedTimeRemaining?: number;
  isComplete?: boolean;
}

export const AIBatchProgress: React.FC<AIBatchProgressProps> = ({
  currentBatch,
  totalBatches,
  accountsPerBatch = 25,
  estimatedTimeRemaining,
  isComplete = false
}) => {
  const progress = (currentBatch / totalBatches) * 100;
  const accountsProcessed = currentBatch * accountsPerBatch;
  const totalAccounts = totalBatches * accountsPerBatch;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            <CardTitle className="text-lg">AI Assignment Processing</CardTitle>
          </div>
          <Badge variant={isComplete ? "default" : "secondary"} className="gap-1">
            <Sparkles className="h-3 w-3" />
            {isComplete ? 'Complete' : 'Processing'}
          </Badge>
        </div>
        <CardDescription>
          {isComplete 
            ? `All ${totalAccounts} assignments reviewed by AI`
            : `Processing ${currentBatch} of ${totalBatches} batches`
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Batches</div>
            <div className="text-2xl font-bold text-primary">
              {currentBatch} / {totalBatches}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Accounts</div>
            <div className="text-2xl font-bold text-primary">
              {accountsProcessed.toLocaleString()} / {totalAccounts.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Time Remaining */}
        {!isComplete && estimatedTimeRemaining && estimatedTimeRemaining > 0 && (
          <div className="bg-muted/50 rounded-md p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Est. Time Remaining</span>
              <span className="text-sm font-medium">{formatTime(estimatedTimeRemaining)}</span>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          {isComplete ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              AI has reviewed all assignments for optimal territory balance
            </span>
          ) : (
            <>
              AI is reviewing proposals using GPT-4.1 Mini for optimal balance, ARR distribution, and CRE risk management
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
