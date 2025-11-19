import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, RefreshCw, Trash2 } from "lucide-react";

export interface ResetProgress {
  isRunning: boolean;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  stepProgress: number;
  totalProgress: number;
  accountsProcessed: number;
  opportunitiesProcessed: number;
  totalAccounts: number;
  totalOpportunities: number;
  processingRate: number;
  error?: string;
  completedAt?: Date;
  estimatedTimeRemaining: number;
  // Enhanced status tracking
  statusDetails?: string;
  timeoutCount?: number;
  retryCount?: number;
  currentBatchSize?: number;
  emergencyBypass?: boolean;
  isRetrying?: boolean;
  nextRetryIn?: number;
}

interface ResetProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: ResetProgress;
  onClose: () => void;
  onCancel?: () => void;
}

export const ResetProgressDialog = ({
  open,
  onOpenChange,
  progress,
  onClose,
  onCancel
}: ResetProgressDialogProps) => {
  const getStatusIcon = () => {
    if (progress.error) {
      return <XCircle className="h-6 w-6 text-destructive" />;
    }
    if (progress.completedAt) {
      return <CheckCircle className="h-6 w-6 text-green-600" />;
    }
    if (progress.isRunning) {
      return <Clock className="h-6 w-6 text-primary animate-pulse" />;
    }
    return <Trash2 className="h-6 w-6 text-muted-foreground" />;
  };

  const getStatusColor = () => {
    if (progress.error) return "text-destructive";
    if (progress.completedAt) return "text-green-600";
    if (progress.isRunning) return "text-primary";
    return "text-muted-foreground";
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatRate = (rate: number) => {
    if (rate < 1) return "< 1 records/sec";
    return `${Math.round(rate)} records/sec`;
  };

  const getStepDescription = () => {
    // Show enhanced status details if available
    if (progress.statusDetails) {
      return progress.statusDetails;
    }
    
    switch (progress.currentStep) {
      case 1:
        return "Clearing assignment proposals from database";
      case 2:
        return `Resetting account assignments (${progress.accountsProcessed.toLocaleString()} / ${progress.totalAccounts.toLocaleString()})`;
      case 3:
        return `Resetting opportunity assignments (${progress.opportunitiesProcessed.toLocaleString()} / ${progress.totalOpportunities.toLocaleString()})`;
      case 4:
        return "Clearing balancing metrics and refreshing cache";
      default:
        return progress.stepName;
    }
  };

  const getDetailedStatus = () => {
    const details = [];
    
    if (progress.isRetrying && progress.nextRetryIn) {
      details.push(`Retrying in ${Math.ceil(progress.nextRetryIn / 1000)}s`);
    }
    
    if (progress.timeoutCount && progress.timeoutCount > 0) {
      details.push(`${progress.timeoutCount} timeout(s) encountered`);
    }
    
    if (progress.currentBatchSize && progress.currentBatchSize < 100) {
      details.push(`Batch size: ${progress.currentBatchSize} (adaptive)`);
    }
    
    if (progress.emergencyBypass) {
      details.push("Emergency bypass activated");
    }
    
    return details.length > 0 ? details.join(" • ") : null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => progress.isRunning && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon()}
            Reset Assignments Progress
          </DialogTitle>
          <DialogDescription>
            Clearing all account and opportunity assignments for this build
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span>{Math.round(progress.totalProgress)}%</span>
            </div>
            <Progress value={progress.totalProgress} className="w-full" />
          </div>

          {/* Current Step */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Current Step</span>
              <span>{progress.currentStep} / {progress.totalSteps}</span>
            </div>
            <div className={`text-sm font-medium ${getStatusColor()}`}>
              {progress.stepName}
              {progress.isRetrying && <RefreshCw className="inline h-3 w-3 ml-1 animate-spin" />}
            </div>
            <div className="text-xs text-muted-foreground">
              {getStepDescription()}
            </div>
            {getDetailedStatus() && (
              <div className="text-xs text-primary/70 bg-primary/5 px-2 py-1 rounded">
                {getDetailedStatus()}
              </div>
            )}
          </div>

          {/* Step Progress (for batch operations) */}
          {(progress.currentStep === 2 || progress.currentStep === 3) && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Step Progress</span>
                <span>{Math.round(progress.stepProgress)}%</span>
              </div>
              <Progress value={progress.stepProgress} className="w-full" />
            </div>
          )}

          {/* Enhanced Statistics */}
          {progress.isRunning && (progress.accountsProcessed > 0 || progress.opportunitiesProcessed > 0) && (
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <div className="font-medium">Processing Rate</div>
                <div className="text-muted-foreground">
                  {formatRate(progress.processingRate)}
                  {progress.currentBatchSize && progress.currentBatchSize < 100 && (
                    <span className="text-amber-600 ml-1">(reduced)</span>
                  )}
                </div>
              </div>
              {progress.estimatedTimeRemaining > 0 && !progress.isRetrying && (
                <div className="space-y-1">
                  <div className="font-medium">Time Remaining</div>
                  <div className="text-muted-foreground">{formatTime(progress.estimatedTimeRemaining)}</div>
                </div>
              )}
              {progress.isRetrying && progress.nextRetryIn && (
                <div className="space-y-1">
                  <div className="font-medium text-amber-600">Next Retry</div>
                  <div className="text-amber-600">{formatTime(progress.nextRetryIn / 1000)}</div>
                </div>
              )}
            </div>
          )}
          
          {/* Performance Status */}
          {progress.isRunning && (progress.timeoutCount || progress.retryCount || progress.emergencyBypass) && (
            <div className="bg-amber-50 border border-amber-200 p-2 rounded text-xs">
              <div className="font-medium text-amber-800 mb-1">Performance Adaptations</div>
              <div className="text-amber-700 space-y-1">
                {progress.timeoutCount && progress.timeoutCount > 0 && (
                  <div>• Database timeouts encountered: {progress.timeoutCount}</div>
                )}
                {progress.retryCount && progress.retryCount > 0 && (
                  <div>• Retries performed: {progress.retryCount}</div>
                )}
                {progress.currentBatchSize && progress.currentBatchSize < 100 && (
                  <div>• Batch size reduced to {progress.currentBatchSize} for reliability</div>
                )}
                {progress.emergencyBypass && (
                  <div>• Emergency bypass activated for problematic records</div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {progress.error && (
            <div className={`text-sm p-3 rounded-md ${
              progress.error.includes('Emergency bypass') || progress.error.includes('partially completed')
                ? 'text-amber-700 bg-amber-50 border border-amber-200'
                : 'text-destructive bg-destructive/10'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {progress.error.includes('Emergency bypass') || progress.error.includes('partially completed') ? (
                  <CheckCircle className="h-4 w-4 text-amber-600" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <strong>{
                  progress.error.includes('Emergency bypass') || progress.error.includes('partially completed')
                    ? 'Reset Partially Completed'
                    : 'Reset Failed'
                }</strong>
              </div>
              <div className="text-xs mb-2">{progress.error}</div>
              {(progress.error.includes('timeout') || progress.error.includes('partially completed') || progress.error.includes('Emergency bypass')) && (
                <div className="text-xs text-muted-foreground">
                  <strong>Progress saved:</strong> {progress.accountsProcessed} accounts, {progress.opportunitiesProcessed} opportunities completed.
                </div>
              )}
            </div>
          )}

          {/* Completion Display */}
          {progress.completedAt && (
            <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">
              <div className="font-medium">Reset Completed Successfully</div>
              <div className="text-xs mt-1">
                • {progress.accountsProcessed.toLocaleString()} accounts reset
              </div>
              <div className="text-xs">
                • {progress.opportunitiesProcessed.toLocaleString()} opportunities reset
              </div>
              <div className="text-xs">
                • Completed at {progress.completedAt.toLocaleTimeString()}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {progress.completedAt && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="flex-1"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Close
              </Button>
            )}
            {progress.error && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Close
              </Button>
            )}
            {progress.isRunning && (
              <div className="flex gap-2 w-full">
                {onCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCancel}
                    className="flex-1"
                  >
                    Cancel Reset
                  </Button>
                )}
                <div className="flex-1 text-xs text-center text-muted-foreground py-2">
                  {onCancel ? "You can cancel if the process gets stuck" : "Reset in progress..."}
                </div>
              </div>
            )}
          </div>

          {/* Information Box */}
          <div className="bg-muted/50 p-3 rounded-md text-xs text-muted-foreground">
            <div className="font-medium mb-1">What this process does:</div>
            <ul className="space-y-1">
              <li>• Removes all assignment proposals from the database</li>
              <li>• Clears new_owner_id and new_owner_name from all accounts</li>
              <li>• Clears new_owner_id and new_owner_name from all opportunities</li>
              <li>• Removes balancing metrics and refreshes the data cache</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};