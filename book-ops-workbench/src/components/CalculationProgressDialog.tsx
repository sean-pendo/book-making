// Phase 4: Progress Dialog Component for Account Calculations
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";

interface CalculationProgress {
  isRunning: boolean;
  progress: number;
  status: string;
  error?: string;
  completedAt?: Date;
}

interface CalculationProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: CalculationProgress;
  onForceRefresh?: () => void;
  onValidate?: () => Promise<boolean>;
}

export const CalculationProgressDialog = ({
  open,
  onOpenChange,
  progress,
  onForceRefresh,
  onValidate
}: CalculationProgressDialogProps) => {
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
    return null;
  };

  const getStatusColor = () => {
    if (progress.error) return "text-destructive";
    if (progress.completedAt) return "text-green-600";
    if (progress.isRunning) return "text-primary";
    return "text-muted-foreground";
  };

  const handleValidate = async () => {
    if (onValidate) {
      const isValid = await onValidate();
      if (isValid) {
        alert("✅ Validation successful! All calculations appear correct.");
      } else {
        alert("❌ Validation failed. Some calculations may be incorrect.");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon()}
            Account Calculation Progress
          </DialogTitle>
          <DialogDescription>
            Monitoring the recalculation of account ARR, ATR, and CRE values
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{Math.round(progress.progress)}%</span>
            </div>
            <Progress value={progress.progress} className="w-full" />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Status</div>
            <div className={`text-sm ${getStatusColor()}`}>
              {progress.status}
            </div>
            {progress.error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <strong>Error:</strong> {progress.error}
              </div>
            )}
            {progress.completedAt && (
              <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">
                <strong>Completed at:</strong> {progress.completedAt.toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {progress.completedAt && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onForceRefresh}
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Data
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  className="flex-1"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Validate
                </Button>
              </>
            )}
            {!progress.isRunning && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Close
              </Button>
            )}
          </div>

          {/* Information Box */}
          <div className="bg-muted/50 p-3 rounded-md text-xs text-muted-foreground">
            <div className="font-medium mb-1">What this does:</div>
            <ul className="space-y-1">
              <li>• Recalculates ARR from opportunities and hierarchy data</li>
              <li>• Calculates ATR ONLY from "Renewals" opportunities</li>
              <li>• Updates CRE counts from opportunity risk status</li>
              <li>• Validates results to ensure accuracy</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};