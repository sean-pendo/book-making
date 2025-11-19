import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, RefreshCw, Target, Users, TrendingUp, Database } from "lucide-react";

interface AssignmentProgressStage {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  progress: number;
  isActive: boolean;
  isCompleted: boolean;
}

interface AssignmentProgress {
  isRunning: boolean;
  progress: number;
  status: string;
  error?: string;
  completedAt?: Date;
  stages: AssignmentProgressStage[];
  accountsProcessed?: number;
  totalAccounts?: number;
  processingRate?: number;
  estimatedTimeRemaining?: number;
}

interface AssignmentProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: AssignmentProgress;
  title: string;
  description: string;
  onCancel?: () => void;
}

export const AssignmentProgressDialog: React.FC<AssignmentProgressDialogProps> = ({
  open,
  onOpenChange,
  progress,
  title,
  description,
  onCancel
}) => {
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
    return <Target className="h-6 w-6 text-muted-foreground" />;
  };

  const getStatusColor = () => {
    if (progress.error) return "text-destructive";
    if (progress.completedAt) return "text-green-600";
    if (progress.isRunning) return "text-primary";
    return "text-muted-foreground";
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatRate = (rate: number) => {
    return `${rate.toFixed(1)} accounts/sec`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon()}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span>{Math.round(progress.progress)}%</span>
            </div>
            <Progress value={progress.progress} className="w-full" />
          </div>

          {/* Current Status */}
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
              <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-3 rounded-md">
                <strong>Completed at:</strong> {progress.completedAt.toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Processing Statistics */}
          {progress.isRunning && (progress.accountsProcessed !== undefined || progress.processingRate !== undefined) && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {progress.accountsProcessed !== undefined && progress.totalAccounts !== undefined && (
                <div className="bg-muted/50 p-3 rounded-md">
                  <div className="font-medium">Accounts Processed</div>
                  <div className="text-lg font-bold text-primary">
                    {progress.accountsProcessed.toLocaleString()} / {progress.totalAccounts.toLocaleString()}
                  </div>
                </div>
              )}
              {progress.processingRate !== undefined && (
                <div className="bg-muted/50 p-3 rounded-md">
                  <div className="font-medium">Processing Rate</div>
                  <div className="text-lg font-bold text-primary">
                    {formatRate(progress.processingRate)}
                  </div>
                </div>
              )}
              {progress.estimatedTimeRemaining !== undefined && progress.estimatedTimeRemaining > 0 && (
                <div className="bg-muted/50 p-3 rounded-md col-span-2">
                  <div className="font-medium">Estimated Time Remaining</div>
                  <div className="text-lg font-bold text-primary">
                    {formatDuration(progress.estimatedTimeRemaining)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stages */}
          <div className="space-y-3">
            <div className="text-sm font-medium">Processing Stages</div>
            {progress.stages.map((stage, index) => (
              <div key={stage.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                <div className={`flex-shrink-0 ${
                  stage.isCompleted ? 'text-green-600' : 
                  stage.isActive ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {stage.isCompleted ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : stage.isActive ? (
                    <div className="animate-pulse">{stage.icon}</div>
                  ) : (
                    stage.icon
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${
                    stage.isCompleted ? 'text-green-600' : 
                    stage.isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {stage.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{stage.description}</div>
                  {stage.isActive && stage.progress > 0 && (
                    <div className="mt-1">
                      <Progress value={stage.progress} className="h-1" />
                    </div>
                  )}
                </div>
                <div className={`text-xs ${
                  stage.isCompleted ? 'text-green-600' : 
                  stage.isActive ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {stage.isCompleted ? '✓' : stage.isActive ? `${Math.round(stage.progress)}%` : ''}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {progress.isRunning && onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="flex-1"
              >
                Cancel
              </Button>
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Helper function to create default assignment progress stages
export const createAssignmentStages = (type: 'generation' | 'execution'): AssignmentProgressStage[] => {
  if (type === 'generation') {
    return [
      {
        id: 'loading',
        name: 'Loading Account Data',
        description: 'Fetching accounts and representatives',
        icon: <Database className="h-4 w-4" />,
        progress: 0,
        isActive: false,
        isCompleted: false
      },
      {
        id: 'analyzing',
        name: 'Analyzing Accounts',
        description: 'Evaluating account attributes and territories',
        icon: <Target className="h-4 w-4" />,
        progress: 0,
        isActive: false,
        isCompleted: false
      },
      {
        id: 'applying',
        name: 'Applying Rules',
        description: 'Geo-first, continuity, and load balancing',
        icon: <TrendingUp className="h-4 w-4" />,
        progress: 0,
        isActive: false,
        isCompleted: false
      },
      {
        id: 'finalizing',
        name: 'Generating Proposals',
        description: 'Creating assignment proposals and conflict analysis',
        icon: <Users className="h-4 w-4" />,
        progress: 0,
        isActive: false,
        isCompleted: false
      }
    ];
  } else {
    return [
      {
        id: 'updating',
        name: 'Updating Accounts',
        description: 'Applying new owner assignments to accounts',
        icon: <Database className="h-4 w-4" />,
        progress: 0,
        isActive: false,
        isCompleted: false
      },
      {
        id: 'cascading',
        name: 'Cascading to Opportunities',
        description: 'Updating related opportunity assignments',
        icon: <TrendingUp className="h-4 w-4" />,
        progress: 0,
        isActive: false,
        isCompleted: false
      },
      {
        id: 'recording',
        name: 'Recording Rationale',
        description: 'Saving assignment reasoning for future reference',
        icon: <Users className="h-4 w-4" />,
        progress: 0,
        isActive: false,
        isCompleted: false
      }
    ];
  }
};