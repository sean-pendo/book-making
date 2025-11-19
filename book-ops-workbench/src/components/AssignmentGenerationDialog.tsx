import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, RefreshCw, Target, Users, TrendingUp, Database, Loader2, AlertTriangle } from "lucide-react";
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
  const [elapsedTime, setElapsedTime] = React.useState(0);
  const [startTime] = React.useState(Date.now());
  
  // Update elapsed time every second
  React.useEffect(() => {
    if (!isGenerating) return;
    
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isGenerating, startTime]);
  
  // Format elapsed time as MM:SS
  const formatElapsedTime = () => {
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
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
  const isAIProcessing = batchProgress !== null;

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
            {isGenerating && (
              <Badge variant="outline" className="ml-auto">
                <Clock className="h-3 w-3 mr-1" />
                {formatElapsedTime()}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Real-time progress of the assignment generation process
            {progress && progress.totalAccounts > 500 && isAIProcessing && (
              <div className="mt-1 text-amber-600 text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Large dataset - AI processing may take 15-20 minutes
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
                {Math.round(progress?.progress || 0)}%
              </span>
            </div>
            
            <Progress value={progress?.progress || 0} className="w-full" />
            
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
                { id: 'ai-optimization', name: 'AI Optimization', icon: <RefreshCw className="h-4 w-4" /> },
                { id: 'finalizing', name: 'Finalizing', icon: <Users className="h-4 w-4" /> }
              ].map((stage, index) => {
                // Special handling for AI Optimization stage
                const isAIOptimizationStage = stage.id === 'ai-optimization';
                const isAIOptimizationActive = isAIOptimizationStage && isAIProcessing;
                const isAIOptimizationCompleted = isAIOptimizationStage && !isAIProcessing && 
                  (progress?.stage === 'finalizing' || progress?.stage === 'saving' || progress?.stage === 'complete');
                
                // Mark "Applying Rules" as complete when AI processing starts
                const isApplyingStage = stage.id === 'applying';
                const isApplyingCompleted = isApplyingStage && isAIProcessing;
                
                // Regular stage logic - map 'assigning' and 'initializing' to their UI equivalents
                const currentStage = progress?.stage === 'assigning' ? 'applying' : 
                                   progress?.stage === 'initializing' ? 'loading' :
                                   progress?.stage === 'saving' ? 'finalizing' :
                                   progress?.stage;
                                   
                const stageOrder = ['loading', 'analyzing', 'applying', 'ai-optimization', 'finalizing'];
                const currentIndex = stageOrder.indexOf(currentStage || '');
                const isCompleted = currentIndex > index;
                const isActive = currentStage === stage.id && !isAIOptimizationStage;
                
                // Final state determination
                const finalIsCompleted = isCompleted || isApplyingCompleted || isAIOptimizationCompleted;
                const finalIsActive = isActive || isAIOptimizationActive;
                
                // Calculate progress percentage for AI stage
                const aiProgressPercentage = isAIOptimizationActive && batchProgress 
                  ? Math.round((batchProgress.current / batchProgress.total) * 100)
                  : 0;
                
                return (
                  <div key={stage.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                    <div className={`flex-shrink-0 ${
                      finalIsCompleted ? 'text-green-600' : 
                      finalIsActive ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {finalIsCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : finalIsActive ? (
                        <div className="animate-pulse">{stage.icon}</div>
                      ) : (
                        stage.icon
                      )}
                    </div>
                    <div className={`flex-1 text-sm font-medium ${
                      finalIsCompleted ? 'text-green-600' : 
                      finalIsActive ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {stage.name}
                      {isAIOptimizationActive && batchProgress && (
                        <span className="text-xs ml-2 text-muted-foreground">
                          (Batch {batchProgress.current}/{batchProgress.total})
                        </span>
                      )}
                    </div>
                    <div className={`text-xs ${
                      finalIsCompleted ? 'text-green-600' : 
                      finalIsActive ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {finalIsCompleted ? '✓' : 
                       isAIOptimizationActive ? `${aiProgressPercentage}%` :
                       finalIsActive && progress ? `${Math.round(progress.progress)}%` : ''}
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