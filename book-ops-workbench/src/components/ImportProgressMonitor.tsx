import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, Zap, Database, Activity } from 'lucide-react';
import { ImportProgress, BatchImportResult } from '@/services/batchImportService';
import { StreamingProgress } from '@/services/streamingCsvParser';

interface ImportProgressMonitorProps {
  progress?: ImportProgress;
  streamingProgress?: StreamingProgress;
  result?: BatchImportResult;
  isActive: boolean;
  stage: 'parsing' | 'importing' | 'completed' | 'error';
}

export const ImportProgressMonitor: React.FC<ImportProgressMonitorProps> = ({
  progress,
  streamingProgress,
  result,
  isActive,
  stage
}) => {
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  };

  const formatRate = (rate: number): string => {
    if (rate < 1000) return `${rate.toFixed(0)} rps`;
    return `${(rate / 1000).toFixed(1)}k rps`;
  };

  const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getStageDescription = (): string => {
    switch (stage) {
      case 'parsing':
        return 'Parsing CSV file and validating data...';
      case 'importing':
        return 'Importing records to database...';
      case 'completed':
        return 'Import completed successfully!';
      case 'error':
        return 'Import encountered errors';
      default:
        return 'Preparing import...';
    }
  };

  const getProgressPercentage = (): number => {
    if (streamingProgress) {
      return (streamingProgress.bytesProcessed / streamingProgress.totalBytes) * 100;
    }
    if (progress) {
      return (progress.processed / progress.total) * 100;
    }
    return 0;
  };

  const renderStreamingStats = () => {
    if (!streamingProgress) return null;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <div className="flex items-center space-x-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{streamingProgress.rowsProcessed.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Rows Processed</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{formatRate(streamingProgress.parseRate)}</p>
            <p className="text-xs text-muted-foreground">Parse Rate</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{formatBytes(streamingProgress.memoryUsage)}</p>
            <p className="text-xs text-muted-foreground">Memory Usage</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{streamingProgress.chunksProcessed}</p>
            <p className="text-xs text-muted-foreground">Chunks</p>
          </div>
        </div>
      </div>
    );
  };

  const renderImportStats = () => {
    if (!progress) return null;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <div className="flex items-center space-x-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{progress.imported.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Imported</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {progress.recordsPerSecond ? formatRate(progress.recordsPerSecond) : 'Calculating...'}
            </p>
            <p className="text-xs text-muted-foreground">Import Rate</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {progress.currentBatch}/{progress.totalBatches}
            </p>
            <p className="text-xs text-muted-foreground">Batches</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {progress.estimatedTimeRemaining ? formatDuration(progress.estimatedTimeRemaining) : 'Calculating...'}
            </p>
            <p className="text-xs text-muted-foreground">ETA</p>
          </div>
        </div>
      </div>
    );
  };

  const renderCompletedStats = () => {
    if (!result) return null;

    const successRate = ((result.recordsImported / result.recordsProcessed) * 100).toFixed(1);
    const durationSeconds = result.duration / 1000;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 border rounded-lg">
            <p className="text-2xl font-bold text-primary">{result.recordsImported.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Records Imported</p>
          </div>
          
          <div className="text-center p-3 border rounded-lg">
            <p className="text-2xl font-bold text-green-600">{successRate}%</p>
            <p className="text-sm text-muted-foreground">Success Rate</p>
          </div>
          
          <div className="text-center p-3 border rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{formatRate(result.averageRps)}</p>
            <p className="text-sm text-muted-foreground">Average Rate</p>
          </div>
          
          <div className="text-center p-3 border rounded-lg">
            <p className="text-2xl font-bold text-purple-600">{formatDuration(durationSeconds)}</p>
            <p className="text-sm text-muted-foreground">Total Time</p>
          </div>
        </div>

        {result.errors.length > 0 && (
          <Alert>
            <AlertDescription>
              {result.errors.length} error{result.errors.length > 1 ? 's' : ''} occurred during import.
              {result.errors.slice(0, 3).map((error, index) => (
                <div key={index} className="text-sm mt-1">• {error}</div>
              ))}
              {result.errors.length > 3 && (
                <div className="text-sm mt-1">• ... and {result.errors.length - 3} more</div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>Import Progress</span>
            </CardTitle>
            <CardDescription>{getStageDescription()}</CardDescription>
          </div>
          <Badge variant={stage === 'completed' ? 'default' : stage === 'error' ? 'destructive' : 'secondary'}>
            {stage.charAt(0).toUpperCase() + stage.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isActive && stage !== 'completed' && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{getProgressPercentage().toFixed(1)}%</span>
              </div>
              <Progress value={getProgressPercentage()} className="h-2" />
              {progress && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress.processed.toLocaleString()} / {progress.total.toLocaleString()}</span>
                  {progress.failed > 0 && (
                    <span className="text-destructive">{progress.failed} failed</span>
                  )}
                </div>
              )}
            </div>

            {stage === 'parsing' && renderStreamingStats()}
            {stage === 'importing' && renderImportStats()}
          </>
        )}

        {stage === 'completed' && renderCompletedStats()}
      </CardContent>
    </Card>
  );
};