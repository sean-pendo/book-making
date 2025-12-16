import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { getAccountARR } from '@/_domain';
import { useToast } from '@/hooks/use-toast';
import { 
  Bug, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Info,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';

interface DebugInfo {
  timestamp: string;
  stage: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  data?: any;
}

interface RepWorkloadDebug {
  repId: string;
  repName: string;
  region: string;
  existingARR: number;
  newARR: number;
  totalARR: number;
  accountCount: number;
  overCutoff: boolean;
  cutoffAmount: number;
}

interface EnhancedAssignmentDebuggerProps {
  buildId: string;
  isAssignmentRunning?: boolean;
  onResetAssignments?: () => void;
  onRegenerateAssignments?: () => void;
}

export const EnhancedAssignmentDebugger: React.FC<EnhancedAssignmentDebuggerProps> = ({
  buildId,
  isAssignmentRunning = false,
  onResetAssignments,
  onRegenerateAssignments
}) => {
  const [debugLogs, setDebugLogs] = useState<DebugInfo[]>([]);
  const [repWorkloads, setRepWorkloads] = useState<RepWorkloadDebug[]>([]);
  const [hardCutoff, setHardCutoff] = useState<number>(2500000);
  const [validationResults, setValidationResults] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch current hard cutoff from assignment rules
  const fetchHardCutoff = async () => {
    try {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('conditions')
        .eq('build_id', buildId)
        .eq('rule_type', 'MIN_THRESHOLDS')
        .eq('enabled', true)
        .single();

      if (error) throw error;
      
      const cutoff = (data?.conditions as any)?.minCustomerARR || 2500000;
      setHardCutoff(cutoff);
      
      addDebugLog('info', 'Hard Cutoff Detection', `Current hard cutoff: $${(cutoff/1000000).toFixed(1)}M ARR`);
    } catch (error) {
      console.error('Failed to fetch hard cutoff:', error);
      addDebugLog('warning', 'Hard Cutoff Detection', 'Using default $2.5M hard cutoff (no MIN_THRESHOLDS rule found)');
    }
  };

  // Fetch current rep workloads with existing vs new ARR breakdown
  const fetchRepWorkloads = async () => {
    setLoading(true);
    try {
      // Get existing assignments (current state)
      const { data: existingAccounts, error: existingError } = await supabase
        .from('accounts')
        .select('owner_id, owner_name, calculated_arr, arr')
        .eq('build_id', buildId)
        .not('owner_id', 'is', null);

      if (existingError) throw existingError;

      // Get new assignments (proposed state)
      const { data: newAccounts, error: newError } = await supabase
        .from('accounts') 
        .select('new_owner_id, new_owner_name, calculated_arr, arr')
        .eq('build_id', buildId)
        .not('new_owner_id', 'is', null);

      if (newError) throw newError;

      // Get sales reps for region mapping
      const { data: salesReps, error: repsError } = await supabase
        .from('sales_reps')
        .select('rep_id, name, region')
        .eq('build_id', buildId);

      if (repsError) throw repsError;

      // Calculate workloads
      const workloadMap = new Map<string, RepWorkloadDebug>();

      // Initialize with existing assignments
      existingAccounts?.forEach(acc => {
        if (!acc.owner_id) return;
        
        const existing = workloadMap.get(acc.owner_id) || {
          repId: acc.owner_id,
          repName: acc.owner_name || 'Unknown',
          region: salesReps?.find(r => r.rep_id === acc.owner_id)?.region || 'Unknown',
          existingARR: 0,
          newARR: 0,
          totalARR: 0,
          accountCount: 0,
          overCutoff: false,
          cutoffAmount: hardCutoff
        };

        const arr = getAccountARR(acc);
        existing.existingARR += arr;
        existing.totalARR += arr;
        existing.accountCount += 1;
        
        workloadMap.set(acc.owner_id, existing);
      });

      // Add new assignments
      newAccounts?.forEach(acc => {
        if (!acc.new_owner_id) return;
        
        const existing = workloadMap.get(acc.new_owner_id) || {
          repId: acc.new_owner_id,
          repName: acc.new_owner_name || 'Unknown',
          region: salesReps?.find(r => r.rep_id === acc.new_owner_id)?.region || 'Unknown',
          existingARR: 0,
          newARR: 0,
          totalARR: 0,
          accountCount: 0,
          overCutoff: false,
          cutoffAmount: hardCutoff
        };

        const arr = getAccountARR(acc);
        existing.newARR += arr;
        existing.totalARR += arr;
        existing.accountCount += 1;
        
        workloadMap.set(acc.new_owner_id, existing);
      });

      // Mark over-cutoff reps and sort
      const workloads = Array.from(workloadMap.values())
        .map(workload => ({
          ...workload,
          overCutoff: workload.totalARR >= hardCutoff
        }))
        .sort((a, b) => b.totalARR - a.totalARR);

      setRepWorkloads(workloads);

      const overCutoffCount = workloads.filter(w => w.overCutoff).length;
      addDebugLog(
        overCutoffCount > 0 ? 'warning' : 'success',
        'Workload Analysis',
        `Analyzed ${workloads.length} reps: ${overCutoffCount} over cutoff, ${workloads.length - overCutoffCount} under cutoff`
      );

    } catch (error) {
      console.error('Failed to fetch rep workloads:', error);
      addDebugLog('error', 'Workload Analysis', `Failed to analyze rep workloads: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Validate final distribution
  const validateDistribution = async () => {
    try {
      addDebugLog('info', 'Validation', 'Starting distribution validation...');

      const results = {
        totalReps: repWorkloads.length,
        repsOverCutoff: repWorkloads.filter(w => w.overCutoff).length,
        repsUnderCutoff: repWorkloads.filter(w => !w.overCutoff).length,
        avgARRPerRep: repWorkloads.reduce((sum, w) => sum + w.totalARR, 0) / repWorkloads.length,
        maxARR: Math.max(...repWorkloads.map(w => w.totalARR)),
        minARR: Math.min(...repWorkloads.map(w => w.totalARR)),
        hardCutoff
      };

      setValidationResults(results);

      if (results.repsOverCutoff > 0) {
        addDebugLog('warning', 'Validation', `${results.repsOverCutoff} reps exceed $${(hardCutoff/1000000).toFixed(1)}M cutoff`);
      } else {
        addDebugLog('success', 'Validation', 'All reps are under the hard cutoff');
      }

    } catch (error) {
      addDebugLog('error', 'Validation', `Validation failed: ${error.message}`);
    }
  };

  // Add debug log entry
  const addDebugLog = (level: 'info' | 'warning' | 'error' | 'success', stage: string, message: string, data?: any) => {
    const newLog: DebugInfo = {
      timestamp: new Date().toLocaleTimeString(),
      stage,
      message,
      level,
      data
    };
    
    setDebugLogs(prev => [newLog, ...prev.slice(0, 49)]); // Keep last 50 logs
  };

  // Auto-refresh logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (autoRefresh && isAssignmentRunning) {
      interval = setInterval(() => {
        fetchRepWorkloads();
      }, 5000); // Refresh every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, isAssignmentRunning]);

  // Load initial data
  useEffect(() => {
    if (buildId) {
      fetchHardCutoff();
      fetchRepWorkloads();
    }
  }, [buildId, hardCutoff]);

  const levelIcons = {
    info: <Info className="h-4 w-4 text-blue-500" />,
    warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    error: <AlertTriangle className="h-4 w-4 text-red-500" />,
    success: <CheckCircle className="h-4 w-4 text-green-500" />
  };

  return (
    <div className="space-y-4">
      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Assignment Debugger & Monitor
          </CardTitle>
          <CardDescription>
            Real-time monitoring and validation of assignment logic with workload analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={fetchRepWorkloads} 
              variant="outline" 
              size="sm"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </Button>
            
            <Button 
              onClick={validateDistribution} 
              variant="outline" 
              size="sm"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Validate Distribution
            </Button>
            
            <Button
              onClick={() => setAutoRefresh(!autoRefresh)}
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
            >
              {autoRefresh ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Auto Refresh
            </Button>

            {onResetAssignments && (
              <Button 
                onClick={onResetAssignments} 
                variant="destructive" 
                size="sm"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Assignments
              </Button>
            )}

            {onRegenerateAssignments && (
              <Button 
                onClick={onRegenerateAssignments} 
                variant="default" 
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Validation Results */}
      {validationResults && (
        <Card>
          <CardHeader>
            <CardTitle>Distribution Validation Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{validationResults.totalReps}</div>
                <div className="text-sm text-muted-foreground">Total Reps</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${validationResults.repsOverCutoff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {validationResults.repsOverCutoff}
                </div>
                <div className="text-sm text-muted-foreground">Over Cutoff</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">{validationResults.repsUnderCutoff}</div>
                <div className="text-sm text-muted-foreground">Under Cutoff</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">${(validationResults.avgARRPerRep/1000000).toFixed(1)}M</div>
                <div className="text-sm text-muted-foreground">Avg ARR/Rep</div>
              </div>
            </div>
            
            <Alert className="mt-4">
              <AlertDescription>
                Hard Cutoff: <strong>${(hardCutoff/1000000).toFixed(1)}M ARR per rep</strong> | 
                Range: ${(validationResults.minARR/1000000).toFixed(1)}M - ${(validationResults.maxARR/1000000).toFixed(1)}M
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Rep Workload Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Rep Workload Analysis (Top 10)</CardTitle>
          <CardDescription>
            Breakdown of existing vs new ARR assignments per representative
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {repWorkloads.slice(0, 10).map((workload) => (
              <div key={workload.repId} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{workload.repName}</span>
                    <Badge variant="outline">{workload.region}</Badge>
                    {workload.overCutoff && <Badge variant="destructive">Over Cutoff</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {workload.accountCount} accounts
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Existing ARR:</span>
                    <span>${(workload.existingARR/1000).toFixed(0)}K</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>New ARR:</span>
                    <span className="text-blue-600">${(workload.newARR/1000).toFixed(0)}K</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total ARR:</span>
                    <span className={workload.overCutoff ? 'text-red-600' : 'text-green-600'}>
                      ${(workload.totalARR/1000).toFixed(0)}K
                    </span>
                  </div>
                  
                  <Progress 
                    value={(workload.totalARR / hardCutoff) * 100} 
                    className="h-2"
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {((workload.totalARR / hardCutoff) * 100).toFixed(1)}% of cutoff
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Debug Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Debug Logs</CardTitle>
          <CardDescription>
            Real-time assignment processing logs and validation messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {debugLogs.map((log, index) => (
              <div key={index} className="flex items-start gap-3 p-2 border rounded text-sm">
                {levelIcons[log.level]}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{log.stage}</span>
                    <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                  </div>
                  <p className="text-muted-foreground">{log.message}</p>
                  {log.data && (
                    <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
            
            {debugLogs.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No debug logs yet. Start an assignment process to see real-time logs.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};