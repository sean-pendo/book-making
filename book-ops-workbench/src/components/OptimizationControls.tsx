import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  Settings2, 
  RotateCcw, 
  Save, 
  Loader2,
  Zap,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface OptimizationControlsConfig {
  targetArr: number;
  variancePercent: number;
  maxArr: number;
  maxCrePerRep: number;
}

interface OptimizationControlsProps {
  config: OptimizationControlsConfig;
  onConfigChange: (config: OptimizationControlsConfig) => void;
  onRunOptimization: () => Promise<void>;
  onApplyResults: () => Promise<void>;
  onReset: () => void;
  isOptimizing: boolean;
  hasResults: boolean;
  hasUnappliedChanges: boolean;
  disabled?: boolean;
  assignmentType: 'customer' | 'prospect';
}

const formatCurrency = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
};

export const OptimizationControls: React.FC<OptimizationControlsProps> = ({
  config,
  onConfigChange,
  onRunOptimization,
  onApplyResults,
  onReset,
  isOptimizing,
  hasResults,
  hasUnappliedChanges,
  disabled = false,
  assignmentType,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const preferredMax = config.targetArr * (1 + config.variancePercent / 100);
  const minThreshold = config.targetArr * (1 - config.variancePercent / 100);

  const handleSliderChange = (key: keyof OptimizationControlsConfig, value: number) => {
    const newConfig = { ...config, [key]: value };
    
    // Ensure maxArr is always >= preferredMax
    if (key === 'targetArr' || key === 'variancePercent') {
      const newPreferredMax = newConfig.targetArr * (1 + newConfig.variancePercent / 100);
      if (newConfig.maxArr < newPreferredMax) {
        newConfig.maxArr = Math.ceil(newPreferredMax / 100000) * 100000; // Round up to nearest 100k
      }
    }
    
    onConfigChange(newConfig);
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Optimization Engine
            </CardTitle>
            <CardDescription>
              Run priority-level optimization to balance {assignmentType} assignments
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasUnappliedChanges && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Unapplied
              </Badge>
            )}
            {hasResults && !hasUnappliedChanges && (
              <Badge variant="outline" className="text-green-600 border-green-300">
                <CheckCircle className="h-3 w-3 mr-1" />
                Applied
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onRunOptimization}
            disabled={disabled || isOptimizing}
            className="flex-1 min-w-[140px]"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Optimization
              </>
            )}
          </Button>

          {hasResults && hasUnappliedChanges && (
            <Button
              variant="default"
              onClick={onApplyResults}
              disabled={disabled || isOptimizing}
              className="bg-green-600 hover:bg-green-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Apply Results
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Settings2 className="h-4 w-4 mr-2" />
            {isExpanded ? 'Hide' : 'Config'}
          </Button>

          <Button
            variant="ghost"
            onClick={onReset}
            disabled={disabled || isOptimizing}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>

        {/* Expandable Configuration */}
        {isExpanded && (
          <>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Target ARR */}
              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>Target {assignmentType === 'customer' ? 'ARR' : 'Pipeline'} per Rep</span>
                  <span className="text-muted-foreground font-normal">
                    {formatCurrency(config.targetArr)}
                  </span>
                </Label>
                <Slider
                  value={[config.targetArr]}
                  onValueChange={([v]) => handleSliderChange('targetArr', v)}
                  min={500000}
                  max={5000000}
                  step={100000}
                  disabled={disabled}
                />
              </div>

              {/* Variance Percent */}
              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 cursor-help">
                      Capacity Variance %
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Controls how evenly ARR is distributed. Lower = tighter balance.</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-muted-foreground font-normal">
                    {config.variancePercent}%
                  </span>
                </Label>
                <Slider
                  value={[config.variancePercent]}
                  onValueChange={([v]) => handleSliderChange('variancePercent', v)}
                  min={5}
                  max={30}
                  step={1}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Band: {formatCurrency(minThreshold)} – {formatCurrency(preferredMax)}
                </p>
              </div>

              {/* Max ARR (Hard Cap) */}
              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>Maximum {assignmentType === 'customer' ? 'ARR' : 'Pipeline'} (Hard Cap)</span>
                  <span className="text-muted-foreground font-normal">
                    {formatCurrency(config.maxArr)}
                  </span>
                </Label>
                <Slider
                  value={[config.maxArr]}
                  onValueChange={([v]) => handleSliderChange('maxArr', Math.max(v, preferredMax))}
                  min={Math.ceil(preferredMax / 100000) * 100000}
                  max={10000000}
                  step={100000}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Must be ≥ {formatCurrency(preferredMax)} (preferred max)
                </p>
              </div>

              {/* Max CRE per Rep */}
              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>Max CRE per Rep</span>
                  <span className="text-muted-foreground font-normal">
                    {config.maxCrePerRep}
                  </span>
                </Label>
                <Slider
                  value={[config.maxCrePerRep]}
                  onValueChange={([v]) => handleSliderChange('maxCrePerRep', v)}
                  min={1}
                  max={10}
                  step={1}
                  disabled={disabled}
                />
              </div>
            </div>
          </>
        )}

        {/* Priority Explanation */}
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3">
          <p className="font-medium mb-1">Priority Waterfall:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <span><strong>P1:</strong> Continuity + Geo</span>
            <span><strong>P2:</strong> Geo Match</span>
            <span><strong>P3b:</strong> Continuity Any-Geo</span>
            <span><strong>P4:</strong> Fallback</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OptimizationControls;

