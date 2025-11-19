// Enhanced Calculation Controls Component with Progress Dialog
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RotateCcw, CheckCircle, RefreshCw, Activity } from 'lucide-react';
import { useEnhancedAccountCalculations } from '@/hooks/useEnhancedAccountCalculations';
import { CalculationProgressDialog } from '@/components/CalculationProgressDialog';
import { MonitoringDashboard } from '@/components/MonitoringDashboard';

interface EnhancedCalculationControlsProps {
  buildId?: string;
}

export const EnhancedCalculationControls = ({ buildId }: EnhancedCalculationControlsProps) => {
  const [showProgress, setShowProgress] = useState(false);
  
  const { 
    recalculateAccountValues, 
    isCalculating, 
    progress, 
    forceRefresh, 
    validateCalculations 
  } = useEnhancedAccountCalculations(buildId);

  const handleRecalculate = () => {
    if (!buildId) return;
    setShowProgress(true);
    recalculateAccountValues(buildId);
  };

  const handleValidate = async () => {
    if (!buildId) return;
    const isValid = await validateCalculations();
    return isValid;
  };

  if (!buildId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground text-center">
            No build selected
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {/* Calculation Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Account Calculation Controls
            </CardTitle>
            <CardDescription>
              Manage ARR, ATR, and CRE calculations for all accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={handleRecalculate}
                disabled={isCalculating}
                className="flex items-center gap-2"
              >
                <RotateCcw className={`h-4 w-4 ${isCalculating ? 'animate-spin' : ''}`} />
                {isCalculating ? 'Calculating...' : 'Recalculate All'}
              </Button>
              
              <Button 
                variant="outline"
                onClick={forceRefresh}
                disabled={isCalculating}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Data
              </Button>
              
              <Button 
                variant="outline"
                onClick={handleValidate}
                disabled={isCalculating}
                className="flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Validate
              </Button>
            </div>

            {progress.isRunning && (
              <div className="mt-4 p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2 text-sm">
                  <div className="animate-pulse h-2 w-2 bg-primary rounded-full"></div>
                  <span className="font-medium">{progress.status}</span>
                  <span className="text-muted-foreground">({progress.progress}%)</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monitoring Dashboard */}
        <MonitoringDashboard buildId={buildId} />
      </div>

      {/* Progress Dialog */}
      <CalculationProgressDialog
        open={showProgress}
        onOpenChange={setShowProgress}
        progress={progress}
        onForceRefresh={forceRefresh}
        onValidate={handleValidate}
      />
    </>
  );
};