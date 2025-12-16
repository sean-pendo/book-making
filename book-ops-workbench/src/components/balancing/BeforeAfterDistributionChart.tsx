import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, DollarSign, TrendingUp, Building2, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThresholdConfig } from '@/components/analytics/RepDistributionChart';

// ============================================
// TYPES
// ============================================

export interface BeforeAfterRepData {
  repId: string;
  repName: string;
  region: string;
  beforeArr: number;
  afterArr: number;
  beforeAtr: number;
  afterAtr: number;
  beforePipeline: number;
  afterPipeline: number;
}

type MetricType = 'arr' | 'atr' | 'pipeline';

interface BeforeAfterDistributionChartProps {
  data: BeforeAfterRepData[];
  thresholds?: ThresholdConfig;
  className?: string;
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (value: number): string => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatRepName = (fullName: string): string => {
  const parts = fullName.trim().split(' ').filter(p => p.length > 0);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const getBarColor = (value: number, thresholds?: ThresholdConfig): string => {
  if (!thresholds) return '#22c55e';
  const min = thresholds.min ?? 0;
  const max = thresholds.max ?? Infinity;
  
  if (value > max) return '#ef4444'; // Red - over ceiling
  if (value >= min && value <= max) return '#22c55e'; // Green - in range
  return '#3b82f6'; // Blue - below floor
};

const getStatusText = (value: number, thresholds?: ThresholdConfig): { text: string; color: string } => {
  if (!thresholds) return { text: '', color: '' };
  const min = thresholds.min ?? 0;
  const max = thresholds.max ?? Infinity;
  
  if (value > max) return { text: 'Over ceiling', color: 'text-red-500' };
  if (value >= min && value <= max) return { text: 'In target range', color: 'text-green-500' };
  return { text: 'Below floor', color: 'text-blue-500' };
};

const getCVStatusColor = (cv: number): string => {
  if (cv < 15) return 'text-green-600 dark:text-green-400';
  if (cv < 25) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

const METRIC_CONFIG: Record<MetricType, {
  label: string;
  icon: React.ElementType;
  beforeKey: keyof BeforeAfterRepData;
  afterKey: keyof BeforeAfterRepData;
}> = {
  arr: {
    label: 'ARR',
    icon: DollarSign,
    beforeKey: 'beforeArr',
    afterKey: 'afterArr',
  },
  atr: {
    label: 'ATR',
    icon: TrendingUp,
    beforeKey: 'beforeAtr',
    afterKey: 'afterAtr',
  },
  pipeline: {
    label: 'Pipeline',
    icon: Building2,
    beforeKey: 'beforePipeline',
    afterKey: 'afterPipeline',
  },
};

// ============================================
// COMPONENT
// ============================================

export const BeforeAfterDistributionChart: React.FC<BeforeAfterDistributionChartProps> = ({
  data,
  thresholds,
  className,
}) => {
  const [currentMetric, setCurrentMetric] = useState<MetricType>('arr');
  const config = METRIC_CONFIG[currentMetric];

  // Calculate stats for before and after
  const stats = useMemo(() => {
    const beforeValues = data.map(r => r[config.beforeKey] as number);
    const afterValues = data.map(r => r[config.afterKey] as number);
    
    const calcStats = (values: number[]) => {
      if (values.length === 0) return { total: 0, average: 0, cv: 0 };
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
      return { total: sum, average: mean, cv };
    };
    
    return {
      before: calcStats(beforeValues),
      after: calcStats(afterValues),
    };
  }, [data, config]);

  // Sort data by after value descending
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => 
      (b[config.afterKey] as number) - (a[config.afterKey] as number)
    );
  }, [data, config]);

  // Calculate max value for scaling
  const maxValue = useMemo(() => {
    const allValues = data.flatMap(r => [
      r[config.beforeKey] as number,
      r[config.afterKey] as number,
    ]);
    const maxData = Math.max(...allValues, 0);
    // Include absolute max and zone max if defined
    const absoluteMax = thresholds?.absoluteMax ?? 0;
    const zoneMax = thresholds?.max ?? 0;
    return Math.max(maxData, absoluteMax, zoneMax) * 1.1;
  }, [data, config, thresholds]);

  // Calculate threshold positions as percentages
  const minPos = thresholds?.min ? (thresholds.min / maxValue) * 100 : null;
  const maxPos = thresholds?.max ? (thresholds.max / maxValue) * 100 : null;
  const targetPos = thresholds?.target ? (thresholds.target / maxValue) * 100 : null;
  const absoluteMinPos = thresholds?.absoluteMin ? (thresholds.absoluteMin / maxValue) * 100 : null;
  const absoluteMaxPos = thresholds?.absoluteMax ? (thresholds.absoluteMax / maxValue) * 100 : null;

  // CV delta
  const cvDelta = stats.after.cv - stats.before.cv;
  const cvImproved = cvDelta < 0; // Lower CV is better

  // Count by status
  const statusCounts = useMemo(() => {
    if (!thresholds) return null;
    const min = thresholds.min ?? 0;
    const max = thresholds.max ?? Infinity;
    
    let belowFloor = 0;
    let inRange = 0;
    let overCeiling = 0;
    
    sortedData.forEach(r => {
      const val = r[config.afterKey] as number;
      if (val > max) overCeiling++;
      else if (val >= min) inRange++;
      else belowFloor++;
    });
    
    return { belowFloor, inRange, overCeiling };
  }, [sortedData, config, thresholds]);

  return (
    <Card className={cn('card-elevated', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">
              Before vs After Distribution
            </CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  Gray bars show original assignment values. Colored bars show proposed values.
                  Colors indicate threshold status: Blue = below floor, Green = in range, Red = over ceiling.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          
          {/* Metric toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            {(Object.keys(METRIC_CONFIG) as MetricType[]).map(metric => (
              <Button
                key={metric}
                variant={currentMetric === metric ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setCurrentMetric(metric)}
              >
                {METRIC_CONFIG[metric].label}
              </Button>
            ))}
          </div>
        </div>
        
        {/* Summary stats row */}
        <div className="flex items-center gap-4 text-xs mt-2 py-2 px-3 bg-muted/30 rounded-md">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-semibold">{formatCurrency(stats.after.total)}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Avg:</span>
            <span className="font-semibold">{formatCurrency(stats.after.average)}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">CV:</span>
            <span className={cn('font-semibold', getCVStatusColor(stats.after.cv))}>
              {stats.after.cv.toFixed(1)}%
            </span>
            {/* CV delta indicator */}
            {Math.abs(cvDelta) >= 0.1 && (
              <span className={cn(
                'flex items-center gap-0.5 ml-1',
                cvImproved ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}>
                {cvImproved ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                <span>{cvDelta > 0 ? '+' : ''}{cvDelta.toFixed(1)}%</span>
              </span>
            )}
          </div>
        </div>
        
        {/* Threshold legend and status counts */}
        {thresholds && (
          <div className="flex flex-wrap items-center gap-3 text-xs mt-2 py-2 px-3 bg-muted/20 rounded-md border border-muted">
            {/* Color legend with counts */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-blue-500" />
                <span className="text-muted-foreground">Below Floor: {statusCounts?.belowFloor ?? 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-500" />
                <span className="text-muted-foreground">In Range: {statusCounts?.inRange ?? 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-500" />
                <span className="text-muted-foreground">Over Ceiling: {statusCounts?.overCeiling ?? 0}</span>
              </div>
            </div>
            <div className="h-4 w-px bg-border" />
            {/* Target and Target Zone together */}
            <div className="flex items-center gap-3">
              {thresholds.target != null && (
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5 bg-green-500" />
                  <span className="text-green-500 font-medium">Target: {formatCurrency(thresholds.target)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-4 bg-green-500/20 border border-dashed border-green-500/40 rounded-sm" />
                <span className="text-green-600 dark:text-green-400 font-medium">
                  Zone: {formatCurrency(thresholds.min || 0)} - {formatCurrency(thresholds.max || 0)}
                </span>
              </div>
            </div>
            <div className="h-4 w-px bg-border" />
            {/* Absolute limits */}
            <div className="flex items-center gap-3">
              {thresholds.absoluteMin != null && (
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5 border-t-2 border-dashed border-blue-500" />
                  <span className="text-blue-500 font-medium">Min: {formatCurrency(thresholds.absoluteMin)}</span>
                </div>
              )}
              {thresholds.absoluteMax != null && (
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5 border-t-2 border-dashed border-red-500" />
                  <span className="text-red-500 font-medium">Max: {formatCurrency(thresholds.absoluteMax)}</span>
                </div>
              )}
            </div>
            <div className="h-4 w-px bg-border" />
            {/* Ghost bar legend */}
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded bg-gray-400/50 border border-gray-400" />
              <span className="text-muted-foreground">Original</span>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="pt-2">
        {sortedData.length > 0 ? (
          <div className="h-[400px] overflow-y-auto space-y-1">
            {sortedData.map((rep) => {
              const beforeVal = rep[config.beforeKey] as number;
              const afterVal = rep[config.afterKey] as number;
              const beforeWidth = maxValue > 0 ? (beforeVal / maxValue) * 100 : 0;
              const afterWidth = maxValue > 0 ? (afterVal / maxValue) * 100 : 0;
              const barColor = getBarColor(afterVal, thresholds);
              const status = getStatusText(afterVal, thresholds);
              
              return (
                <Tooltip key={rep.repId}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 group cursor-pointer py-0.5">
                      {/* Rep initials */}
                      <div className="w-8 text-xs font-medium text-right text-muted-foreground group-hover:text-foreground">
                        {formatRepName(rep.repName)}
                      </div>
                      
                      {/* Bar container */}
                      <div className="flex-1 bg-muted rounded-full h-5 relative overflow-hidden">
                        {/* Target zone background - green band */}
                        {minPos !== null && maxPos !== null && (
                          <div 
                            className="absolute top-0 bottom-0 bg-green-500/15"
                            style={{ 
                              left: `${minPos}%`, 
                              width: `${maxPos - minPos}%` 
                            }}
                          />
                        )}
                        
                        {/* Absolute Min line - BLUE dashed */}
                        {absoluteMinPos !== null && (
                          <div 
                            className="absolute top-0 bottom-0 w-0.5 border-l-2 border-dashed border-blue-500"
                            style={{ left: `${absoluteMinPos}%` }}
                          />
                        )}
                        
                        {/* Absolute Max line - RED dashed */}
                        {absoluteMaxPos !== null && (
                          <div 
                            className="absolute top-0 bottom-0 w-0.5 border-l-2 border-dashed border-red-500"
                            style={{ left: `${absoluteMaxPos}%` }}
                          />
                        )}
                        
                        {/* Target center line - GREEN solid */}
                        {targetPos !== null && (
                          <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-green-600"
                            style={{ left: `${targetPos}%` }}
                          />
                        )}
                        
                        {/* Render bars in order: longer bar first (behind), shorter bar on top */}
                        {beforeVal >= afterVal ? (
                          <>
                            {/* Ghost bar (before) - LONGER, render first (behind) */}
                            <div
                              className="absolute top-0.5 h-4 rounded-full bg-gray-400/50 border border-gray-500/60 transition-all"
                              style={{ width: `${beforeWidth}%`, left: 0 }}
                            />
                            {/* Actual bar (after) - SHORTER, render second (on top) */}
                            <div
                              className="absolute top-0.5 h-4 rounded-full transition-all group-hover:opacity-80"
                              style={{ 
                                width: `${afterWidth}%`, 
                                left: 0,
                                backgroundColor: barColor,
                              }}
                            />
                          </>
                        ) : (
                          <>
                            {/* Actual bar (after) - LONGER, render first (behind) */}
                            <div
                              className="absolute top-0.5 h-4 rounded-full transition-all group-hover:opacity-80"
                              style={{ 
                                width: `${afterWidth}%`, 
                                left: 0,
                                backgroundColor: barColor,
                              }}
                            />
                            {/* Ghost bar (before) - SHORTER, render second (on top) */}
                            <div
                              className="absolute top-0.5 h-4 rounded-full bg-gray-400/50 border border-gray-500/60 transition-all"
                              style={{ width: `${beforeWidth}%`, left: 0 }}
                            />
                          </>
                        )}
                      </div>
                      
                      {/* Value */}
                      <div className="w-16 text-xs font-medium text-right">
                        {formatCurrency(afterVal)}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="text-sm">
                      <div className="font-medium">{rep.repName}</div>
                      <div className="text-muted-foreground text-xs">{rep.region}</div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded bg-gray-400" />
                          <span>Before: {formatCurrency(beforeVal)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded" 
                            style={{ backgroundColor: barColor }}
                          />
                          <span>After: {formatCurrency(afterVal)}</span>
                        </div>
                        {beforeVal !== afterVal && (
                          <div className={cn(
                            'text-xs pt-1 border-t',
                            afterVal > beforeVal ? 'text-emerald-600' : 'text-red-600'
                          )}>
                            Change: {afterVal > beforeVal ? '+' : ''}{formatCurrency(afterVal - beforeVal)}
                          </div>
                        )}
                        {status.text && (
                          <div className={cn('text-xs', status.color)}>
                            {status.text}
                          </div>
                        )}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <div className="h-[350px] flex items-center justify-center text-sm text-muted-foreground">
            No comparison data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BeforeAfterDistributionChart;

