import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, RefreshCw, Target, Users, TrendingUp, Database, Loader2, AlertTriangle } from "lucide-react";
import type { AssignmentProgress } from '@/services/enhancedAssignmentService';

interface AssignmentGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: AssignmentProgress | null;
  isGenerating: boolean;
  onCancel?: () => void;
}

export const AssignmentGenerationDialog: React.FC<AssignmentGenerationDialogProps> = ({
  open,
  onOpenChange,
  progress,
  isGenerating,
  onCancel
}) => {
  const [maxProgress, setMaxProgress] = React.useState(0);
  
  // Track maximum progress to prevent backwards jumps
  React.useEffect(() => {
    const currentProgress = progress?.progress || 0;
    if (currentProgress > maxProgress) {
      setMaxProgress(currentProgress);
    }
    // Reset when dialog closes or new generation starts
    if (!open || (!isGenerating && currentProgress === 0)) {
      setMaxProgress(0);
    }
  }, [progress?.progress, open, isGenerating, maxProgress]);
  
  // Use the higher of current progress or max progress (prevents going backwards)
  const displayProgress = Math.max(progress?.progress || 0, maxProgress);
  
  // Parse batch progress from status string
  const parseBatchProgress = () => {
    if (!progress?.status) return null;
    const batchMatch = progress.status.match(/batch (\d+)\/(\d+)/i);
    if (batchMatch) {
      return {
        current: parseInt(batchMatch[1]),
        total: parseInt(batchMatch[2])
      };
    }
    return null;
  };

  const batchProgress = parseBatchProgress();

  const getStageIcon = () => {
    if (progress?.error) {
      return <XCircle className="h-6 w-6 text-destructive" />;
    }
    if (!isGenerating && progress?.progress === 100) {
      return <CheckCircle className="h-6 w-6 text-green-600" />;
    }
    if (isGenerating) {
      return <Loader2 className="h-6 w-6 text-primary animate-spin" />;
    }
    return <Target className="h-6 w-6 text-muted-foreground" />;
  };

  const getStageColor = () => {
    if (progress?.error) return "text-destructive";
    if (!isGenerating && progress?.progress === 100) return "text-green-600";
    if (isGenerating) return "text-primary";
    return "text-muted-foreground";
  };

  const getStageDetails = () => {
    if (!progress) return { name: 'Initializing', description: 'Preparing to generate assignments...' };
    
    switch (progress.stage) {
      case 'loading':
      case 'initializing':
        return { 
          name: 'Loading Data', 
          description: 'Fetching accounts, sales representatives, and assignment rules...' 
        };
      case 'analyzing':
        return { 
          name: 'Analyzing Data', 
          description: 'Validating data integrity and preparing for assignment processing...' 
        };
      case 'applying':
      case 'assigning':
        return { 
          name: 'Applying Rules', 
          description: progress.currentRule 
            ? `Processing ${progress.currentRule} rule (${progress.rulesCompleted}/${progress.totalRules})`
            : 'Applying assignment rules across regions...' 
        };
      case 'saving':
      case 'finalizing':
        return { 
          name: 'Finalizing', 
          description: 'Generating final proposals and conflict analysis...' 
        };
      default:
        return { name: 'Processing', description: 'Assignment generation in progress...' };
    }
  };

  const stageDetails = getStageDetails();

  return (
    <Dialog open={open} onOpenChange={!isGenerating ? onOpenChange : () => {}}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStageIcon()}
            Assignment Generation
          </DialogTitle>
          <DialogDescription>
            Real-time progress of the assignment generation process
            {progress && progress.totalAccounts > 500 && (
              <div className="mt-1 text-amber-600 text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Large dataset - optimization may take several minutes
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Stage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={progress?.error ? "destructive" : isGenerating ? "default" : "secondary"}>
                  {stageDetails.name}
                </Badge>
                {progress?.currentRule && (
                  <Badge variant="outline">
                    {progress.currentRule}
                  </Badge>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {Math.round(displayProgress)}%
              </span>
            </div>
            
            <Progress value={displayProgress} className="w-full" />
            
            <div className={`text-sm ${getStageColor()}`}>
              {progress?.status || stageDetails.description}
            </div>
          </div>


          {/* Error Display with expandable details */}
          {progress?.error && (
            <div className="bg-destructive/10 border-destructive/20 border rounded-md p-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Assignment Generation Failed</span>
              </div>
              <div className="text-sm mt-1 text-destructive/80">
                {progress.error}
              </div>
              {progress.error.includes('timeout') && (
                <div className="text-xs mt-2 text-muted-foreground">
                  The assignment process took longer than expected. Try reducing the number of accounts or simplifying assignment rules.
                </div>
              )}
            </div>
          )}

          {/* Progress Statistics */}
          {progress && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 p-3 rounded-md">
                <div className="text-xs font-medium text-muted-foreground">Accounts Processed</div>
                <div className="text-xl font-bold text-primary">
                  {(progress.accountsProcessed || 0).toLocaleString()} / {(progress.totalAccounts || 0).toLocaleString()}
                </div>
              </div>
              
              <div className="bg-muted/50 p-3 rounded-md">
                <div className="text-xs font-medium text-muted-foreground">Assignments Made</div>
                <div className="text-xl font-bold text-green-600">
                  {(progress.assignmentsMade || 0).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Processing Stages Visualization */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Processing Stages</div>
            <div className="space-y-1.5">
              {[
                { id: 'loading', name: 'Loading Data', icon: <Database className="h-4 w-4" /> },
                { id: 'analyzing', name: 'Analyzing', icon: <Target className="h-4 w-4" /> },
                { id: 'applying', name: 'Applying Rules', icon: <TrendingUp className="h-4 w-4" /> },
                { id: 'finalizing', name: 'Finalizing', icon: <Users className="h-4 w-4" /> }
              ].map((stage, index) => {
                // Map internal stages to UI stages
                const currentStage = progress?.stage === 'assigning' ? 'applying' :
                                   progress?.stage === 'initializing' ? 'loading' :
                                   progress?.stage === 'saving' ? 'finalizing' :
                                   progress?.stage === 'solving' ? 'applying' :
                                   progress?.stage === 'postprocessing' ? 'finalizing' :
                                   progress?.stage;

                const stageOrder = ['loading', 'analyzing', 'applying', 'finalizing'];
                const currentIndex = stageOrder.indexOf(currentStage || '');
                const isCompleted = currentIndex > index;
                const isActive = currentStage === stage.id;

                return (
                  <div key={stage.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                    <div className={`flex-shrink-0 ${
                      isCompleted ? 'text-green-600' :
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : isActive ? (
                        <div className="animate-pulse">{stage.icon}</div>
                      ) : (
                        stage.icon
                      )}
                    </div>
                    <div className={`flex-1 text-sm font-medium ${
                      isCompleted ? 'text-green-600' :
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {stage.name}
                    </div>
                    <div className={`text-xs ${
                      isCompleted ? 'text-green-600' :
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {isCompleted ? '✓' :
                       isActive && progress ? `${Math.round(displayProgress)}%` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {isGenerating && onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Attempt to cancel the generation process
                  try {
                    const { EnhancedAssignmentService } = require('../services/enhancedAssignmentService');
                    const service = EnhancedAssignmentService.getInstance();
                    if (service && typeof service.cancelGeneration === 'function') {
                      service.cancelGeneration();
                    }
                  } catch (error) {
                    console.warn('Could not cancel assignment service:', error);
                  }
                  // Call the parent cancel handler
                  onCancel();
                }}
                className="flex-1"
              >
                Cancel Generation
              </Button>
            )}
            <Button
              variant={isGenerating ? "ghost" : "secondary"}
              size="sm"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isGenerating}
            >
              {isGenerating ? "Processing..." : "Close"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};