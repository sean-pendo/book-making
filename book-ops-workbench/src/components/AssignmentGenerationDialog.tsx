import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  CheckCircle, 
  XCircle, 
  Target, 
  Users, 
  TrendingUp, 
  Database, 
  Loader2, 
  AlertTriangle,
  Clock,
  Cpu,
  Activity,
  Zap,
  Server,
  Info,
  Bell,
  PartyPopper
} from "lucide-react";
import type { AssignmentProgress } from '@/services/enhancedAssignmentService';

interface AssignmentGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: AssignmentProgress | null;
  isGenerating: boolean;
  onCancel?: () => void;
  /** Callback when optimization completes - used for Slack notification */
  onComplete?: (elapsedTime: string, proposalCount: number) => void;
}

// Helpful tips to show during long optimization runs
const OPTIMIZATION_TIPS = [
  "The optimizer is finding the best assignment for each account based on continuity, geography, and team alignment scores.",
  "Larger datasets require more computation time to ensure optimal assignments.",
  "The solver considers thousands of possible combinations to minimize disruption while balancing workloads.",
  "Stability locks are being respected to keep high-value accounts with their current reps.",
  "Geographic proximity and territory alignment are being optimized for each assignment.",
  "The algorithm balances ARR across reps while respecting capacity constraints.",
];

// Benchmark-based time estimation constants
// Based on production testing: 35K accounts ≈ 6 minutes
const BENCHMARK_ACCOUNTS = 35000;
const BENCHMARK_MINUTES = 6;
const SECONDS_PER_ACCOUNT = (BENCHMARK_MINUTES * 60) / BENCHMARK_ACCOUNTS; // ~0.01 seconds per account

// localStorage key for Slack notification preference
const SLACK_NOTIFY_KEY = 'book-builder-notify-on-complete';

export const AssignmentGenerationDialog: React.FC<AssignmentGenerationDialogProps> = ({
  open,
  onOpenChange,
  progress,
  isGenerating,
  onCancel,
  onComplete
}) => {
  const [maxProgress, setMaxProgress] = React.useState(0);
  const [startTime, setStartTime] = React.useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [currentTipIndex, setCurrentTipIndex] = React.useState(0);
  const [pulseCount, setPulseCount] = React.useState(0);
  const [notifyOnSlack, setNotifyOnSlack] = React.useState(() => {
    // Load preference from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem(SLACK_NOTIFY_KEY) === 'true';
    }
    return false;
  });
  const [hasNotifiedCompletion, setHasNotifiedCompletion] = React.useState(false);
  
  // Track start time when generation begins
  React.useEffect(() => {
    if (isGenerating && !startTime) {
      setStartTime(Date.now());
      setElapsedSeconds(0);
      setHasNotifiedCompletion(false); // Reset notification flag on new generation
    }
    if (!isGenerating) {
      setStartTime(null);
    }
  }, [isGenerating, startTime]);

  // Handle Slack notification preference change
  const handleNotifyChange = (checked: boolean) => {
    setNotifyOnSlack(checked);
    localStorage.setItem(SLACK_NOTIFY_KEY, String(checked));
  };

  // Trigger completion callback when optimization finishes
  React.useEffect(() => {
    const isComplete = !isGenerating && progress?.progress === 100 && !progress?.error;
    if (isComplete && !hasNotifiedCompletion && onComplete && notifyOnSlack) {
      setHasNotifiedCompletion(true);
      const proposalCount = progress?.assignmentsMade || 0;
      onComplete(formatTime(elapsedSeconds), proposalCount);
    }
  }, [isGenerating, progress?.progress, progress?.error, progress?.assignmentsMade, hasNotifiedCompletion, onComplete, notifyOnSlack, elapsedSeconds]);
  
  // Update elapsed time every second
  React.useEffect(() => {
    if (!isGenerating || !startTime) return;
    
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      setPulseCount(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isGenerating, startTime]);
  
  // Rotate tips every 8 seconds during solving stage
  React.useEffect(() => {
    if (!isGenerating || progress?.stage !== 'solving') return;
    
    const interval = setInterval(() => {
      setCurrentTipIndex(prev => (prev + 1) % OPTIMIZATION_TIPS.length);
    }, 8000);
    
    return () => clearInterval(interval);
  }, [isGenerating, progress?.stage]);
  
  // Track maximum progress to prevent backwards jumps within a batch
  // But allow reset when a new batch starts (indicated by significant progress drop)
  React.useEffect(() => {
    const currentProgress = progress?.progress || 0;
    
    // If progress drops significantly (more than 40%), it's likely a new batch starting
    // Allow the reset to show accurate progress for the new batch
    const isNewBatch = maxProgress > 50 && currentProgress < maxProgress - 40;
    
    if (isNewBatch) {
      // Reset maxProgress to allow new batch to show its own progress
      setMaxProgress(currentProgress);
    } else if (currentProgress > maxProgress) {
      setMaxProgress(currentProgress);
    }
    
    // Reset when dialog closes or new generation starts
    if (!open || (!isGenerating && currentProgress === 0)) {
      setMaxProgress(0);
      setCurrentTipIndex(0);
    }
  }, [progress?.progress, open, isGenerating, maxProgress]);
  
  // Use the higher of current progress or max progress (prevents going backwards)
  const displayProgress = Math.max(progress?.progress || 0, maxProgress);
  
  // Format elapsed time
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };
  
  // Estimate remaining time based on progress (uses actual progress rate when available)
  const getEstimatedRemaining = (): string | null => {
    if (!isGenerating || displayProgress >= 95) return null;
    
    // If we have enough progress data, use actual rate
    if (displayProgress >= 10 && elapsedSeconds >= 5) {
      const progressRate = displayProgress / elapsedSeconds;
      const remainingProgress = 100 - displayProgress;
      const estimatedRemaining = Math.ceil(remainingProgress / progressRate);
      
      if (estimatedRemaining > 600) return ">10 min";
      if (estimatedRemaining > 300) return "~5-10 min";
      if (estimatedRemaining > 120) return "~2-5 min";
      if (estimatedRemaining > 60) return "~1-2 min";
      return `~${formatTime(estimatedRemaining)}`;
    }
    
    return null;
  };
  
  // Get benchmark-based time estimate for initial display (before progress data is available)
  const getBenchmarkEstimate = (): string | null => {
    const totalAccounts = progress?.totalAccounts || 0;
    if (totalAccounts < 100) return null; // Don't show for small datasets
    
    const estimatedSeconds = Math.ceil(totalAccounts * SECONDS_PER_ACCOUNT);
    
    // Add some buffer for overhead
    const bufferedSeconds = Math.ceil(estimatedSeconds * 1.2);
    
    if (bufferedSeconds > 600) return "~10+ min";
    if (bufferedSeconds > 300) return "~5-8 min";
    if (bufferedSeconds > 120) return "~2-5 min";
    if (bufferedSeconds > 60) return "~1-2 min";
    if (bufferedSeconds > 30) return "~30-60s";
    return "<30s";
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
  const estimatedRemaining = getEstimatedRemaining();
  const benchmarkEstimate = getBenchmarkEstimate();
  
  // Show benchmark estimate initially, then switch to progress-based estimate
  const timeEstimateLabel = estimatedRemaining ? "Est. Remaining" : "Est. Total";
  const timeEstimateValue = estimatedRemaining || benchmarkEstimate;
  
  // Determine if this is a long-running optimization (solving stage with elapsed > 10s)
  const isLongRunning = isGenerating && 
    (progress?.stage === 'solving' || progress?.stage === 'applying' || progress?.stage === 'assigning') && 
    elapsedSeconds > 10;
    
  // Check if optimization is complete (not generating, 100% progress, no error)
  const isComplete = !isGenerating && progress?.progress === 100 && !progress?.error;
  
  // Show Slack notification option for larger datasets
  const showSlackOption = (progress?.totalAccounts || 0) > 500;

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
                Large dataset ({progress.totalAccounts.toLocaleString()} accounts) - optimization may take several minutes
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Timer and Progress Header */}
          <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-4">
              {/* Elapsed Time */}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Elapsed</div>
                  <div className="text-sm font-mono font-medium">{formatTime(elapsedSeconds)}</div>
                </div>
              </div>
              
              {/* Time Estimate - shows benchmark initially, then remaining time */}
              {timeEstimateValue && isGenerating && (
                <div className="flex items-center gap-2 border-l pl-4">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <div>
                    <div className="text-xs text-muted-foreground">{timeEstimateLabel}</div>
                    <div className="text-sm font-mono font-medium text-amber-600">{timeEstimateValue}</div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Progress Percentage */}
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">{Math.round(displayProgress)}%</div>
              <div className="text-xs text-muted-foreground">Complete</div>
            </div>
          </div>

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
            </div>
            
            <Progress value={displayProgress} className="w-full h-2" />
            
            <div className={`text-sm ${getStageColor()}`}>
              {progress?.status || stageDetails.description}
            </div>
          </div>

          {/* Success Banner - Shows when optimization completes */}
          {isComplete && (
            <div className="bg-gradient-to-r from-emerald-500/20 via-green-500/20 to-emerald-500/20 border border-emerald-300 dark:border-emerald-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="relative">
                  <PartyPopper className="h-8 w-8 text-emerald-500" />
                </div>
                
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      Optimization Complete!
                    </span>
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  </div>
                  
                  <div className="text-xs text-emerald-600 dark:text-emerald-400">
                    Generated {(progress?.assignmentsMade || 0).toLocaleString()} assignments in {formatTime(elapsedSeconds)}
                  </div>
                  
                  {/* Warning about not closing */}
                  <div className="flex items-start gap-2 mt-3 p-2 bg-amber-100 dark:bg-amber-900/30 rounded border border-amber-300 dark:border-amber-700">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                      <span className="font-semibold">Don't close this tab!</span> Assignments are not saved until you click <span className="font-semibold">Apply</span> in the preview dialog.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Slack Notification Option - Shows for large datasets */}
          {showSlackOption && isGenerating && (
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
              <Checkbox
                id="notify-slack"
                checked={notifyOnSlack}
                onCheckedChange={handleNotifyChange}
              />
              <Label 
                htmlFor="notify-slack" 
                className="text-sm text-muted-foreground cursor-pointer flex items-center gap-2"
              >
                <Bell className="h-4 w-4" />
                Notify me on Slack when complete
              </Label>
            </div>
          )}

          {/* Solver Activity Indicator - Shows during solving stage */}
          {isLongRunning && (
            <div className="bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 border border-blue-200/50 dark:border-blue-800/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                {/* Animated solver icon */}
                <div className="relative">
                  <Server className="h-8 w-8 text-blue-500" />
                  <Activity 
                    className={`h-4 w-4 text-green-500 absolute -top-1 -right-1 ${
                      pulseCount % 2 === 0 ? 'opacity-100' : 'opacity-60'
                    } transition-opacity`} 
                  />
                </div>
                
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Optimization Engine Active
                    </span>
                    <span className="flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                  </div>
                  
                  {/* Rotating helpful tip */}
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="transition-opacity duration-300">
                      {OPTIMIZATION_TIPS[currentTipIndex]}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                { id: 'loading', name: 'Loading Data', icon: <Database className="h-4 w-4" />, description: 'Fetching accounts & reps' },
                { id: 'analyzing', name: 'Analyzing', icon: <Target className="h-4 w-4" />, description: 'Building optimization model' },
                { id: 'applying', name: 'Optimizing', icon: <Cpu className="h-4 w-4" />, description: progress?.currentRule ? `${progress.currentRule}` : 'Running solver algorithm' },
                { id: 'finalizing', name: 'Finalizing', icon: <Users className="h-4 w-4" />, description: 'Generating proposals' }
              ].map((stage, index) => {
                // Map internal stages to UI stages
                const currentStage = progress?.stage === 'assigning' ? 'applying' :
                                   progress?.stage === 'initializing' ? 'loading' :
                                   progress?.stage === 'saving' ? 'finalizing' :
                                   progress?.stage === 'solving' ? 'applying' :
                                   progress?.stage === 'building' ? 'analyzing' :
                                   progress?.stage === 'preprocessing' ? 'analyzing' :
                                   progress?.stage === 'postprocessing' ? 'finalizing' :
                                   progress?.stage;

                const stageOrder = ['loading', 'analyzing', 'applying', 'finalizing'];
                const currentIndex = stageOrder.indexOf(currentStage || '');
                const isCompleted = currentIndex > index;
                const isActive = currentStage === stage.id;

                return (
                  <div key={stage.id} className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                    isActive ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'
                  }`}>
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
                    <div className="flex-1">
                      <div className={`text-sm font-medium ${
                        isCompleted ? 'text-green-600' :
                        isActive ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        {stage.name}
                      </div>
                      {isActive && (
                        <div className="text-xs text-muted-foreground">{stage.description}</div>
                      )}
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
