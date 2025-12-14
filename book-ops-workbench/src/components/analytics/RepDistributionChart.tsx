import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  ReferenceArea,
} from 'recharts';
import { ChevronLeft, ChevronRight, Info, DollarSign, TrendingUp, Building2, Users } from 'lucide-react';
import type { RepDistributionData, RepDistributionMetric } from '@/types/analytics';

/**
 * Threshold configuration for distribution charts
 * Used to display min/max/target reference lines from assignment_configuration
 */
export interface ThresholdConfig {
  /** Lower bound of target zone (target - variance) - used for green shaded area */
  min?: number;
  /** Upper bound of target zone (target + variance) - used for green shaded area */
  max?: number;
  /** Target value - shown as green solid line */
  target?: number;
  /** Optional label override for the target line */
  targetLabel?: string;
  /** Absolute minimum - hard floor, shown as blue dotted line */
  absoluteMin?: number;
  /** Absolute maximum - hard ceiling, shown as red dotted line */
  absoluteMax?: number;
}

interface RepDistributionChartProps {
  data: RepDistributionData[];
  title?: string;
  allowedMetrics?: RepDistributionMetric[];  // Controls which metrics are available
  showStats?: boolean;  // Shows Total/Avg/CV header
  className?: string;
  /** Threshold lines to display (min/max/target from config) */
  thresholds?: ThresholdConfig;
  /** Whether to show threshold legend */
  showThresholdLegend?: boolean;
}

const METRIC_CONFIG: Record<RepDistributionMetric, {
  label: string;
  icon: React.ElementType;
  color: string;
  format: (v: number) => string;
  dataKey: string;
  description: string;
}> = {
  arr: {
    label: 'ARR Distribution',
    icon: DollarSign,
    color: '#22c55e', // emerald
    format: (v) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`,
    dataKey: 'arr',
    description: 'Annual Recurring Revenue per rep based on original owner assignments',
  },
  atr: {
    label: 'ATR Distribution',
    icon: TrendingUp,
    color: '#f59e0b', // amber
    format: (v) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`,
    dataKey: 'atr',
    description: 'Available to Renew per rep based on original owner assignments',
  },
  pipeline: {
    label: 'Pipeline Distribution',
    icon: Building2,
    color: '#3b82f6', // blue
    format: (v) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`,
    dataKey: 'pipeline',
    description: 'Prospect Pipeline Value per rep based on original owner assignments',
  },
  accounts: {
    label: 'Account Distribution',
    icon: Users,
    color: '#a855f7', // purple (not used, we have stacked colors)
    format: (v) => v.toLocaleString(),
    dataKey: 'totalAccounts',
    description: 'Customer and Prospect account counts per rep',
  },
};

const DEFAULT_METRICS_ORDER: RepDistributionMetric[] = ['arr', 'atr', 'pipeline', 'accounts'];

// Format rep name to initials (e.g., "John Doe" -> "JD")
const formatRepName = (fullName: string) => {
  const parts = fullName.trim().split(' ').filter(p => p.length > 0);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  // First initial + last initial
  const firstInitial = parts[0][0].toUpperCase();
  const lastInitial = parts[parts.length - 1][0].toUpperCase();
  return `${firstInitial}${lastInitial}`;
};

// Get CV status color
const getCVStatusColor = (cv: number): string => {
  if (cv < 15) return 'text-green-600 dark:text-green-400';
  if (cv < 25) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

// Get bar color based on value vs thresholds
// Uses target zone (min/max) for "in range" coloring
const getBarColorByThreshold = (value: number, thresholds?: ThresholdConfig): string => {
  if (!thresholds) return '#6b7280'; // Default gray if no thresholds
  
  // Use target zone bounds for coloring (target ± variance)
  const zoneMin = thresholds.min ?? 0;
  const zoneMax = thresholds.max ?? Infinity;
  
  if (value > zoneMax) {
    return '#ef4444'; // Red - over target zone ceiling
  }
  if (value >= zoneMin && value <= zoneMax) {
    return '#22c55e'; // Green - in target range
  }
  return '#3b82f6'; // Blue - below target zone floor
};

// Get status text based on value vs thresholds
const getThresholdStatus = (value: number, thresholds?: ThresholdConfig): { text: string; color: string } => {
  if (!thresholds) return { text: '', color: '' };
  
  // Use target zone bounds for status
  const zoneMin = thresholds.min ?? 0;
  const zoneMax = thresholds.max ?? Infinity;
  
  if (value > zoneMax) {
    return { text: 'Over target zone - needs rebalancing', color: 'text-red-500' };
  }
  if (value >= zoneMin && value <= zoneMax) {
    return { text: 'In target range', color: 'text-green-500' };
  }
  return { text: 'Below floor - can take more', color: 'text-blue-500' };
};

export const RepDistributionChart: React.FC<RepDistributionChartProps> = ({
  data,
  title = 'Rep Distribution',
  allowedMetrics,
  showStats = false,
  className,
  thresholds,
  showThresholdLegend = false,
}) => {
  // Use allowedMetrics if provided, otherwise use default order
  const metricsOrder = allowedMetrics && allowedMetrics.length > 0 
    ? allowedMetrics 
    : DEFAULT_METRICS_ORDER;
  
  const [currentMetric, setCurrentMetric] = useState<RepDistributionMetric>(metricsOrder[0]);

  // Reset to first allowed metric if current metric is not in allowed list
  useEffect(() => {
    if (!metricsOrder.includes(currentMetric)) {
      setCurrentMetric(metricsOrder[0]);
    }
  }, [metricsOrder, currentMetric]);

  const config = METRIC_CONFIG[currentMetric];
  const Icon = config.icon;

  // Navigate to previous/next metric within allowed metrics
  const goToPrev = () => {
    const currentIndex = metricsOrder.indexOf(currentMetric);
    const prevIndex = (currentIndex - 1 + metricsOrder.length) % metricsOrder.length;
    setCurrentMetric(metricsOrder[prevIndex]);
  };

  const goToNext = () => {
    const currentIndex = metricsOrder.indexOf(currentMetric);
    const nextIndex = (currentIndex + 1) % metricsOrder.length;
    setCurrentMetric(metricsOrder[nextIndex]);
  };

  // Calculate statistics for current metric (Total, Average, CV)
  const stats = useMemo(() => {
    const values = data.map(r => {
      if (currentMetric === 'accounts') return r.totalAccounts;
      return r[currentMetric] as number;
    });
    
    if (values.length === 0) {
      return { total: 0, average: 0, cv: 0 };
    }
    
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
    
    return { total: sum, average: mean, cv };
  }, [data, currentMetric]);

  // Sort and format data for chart
  const chartData = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      if (currentMetric === 'accounts') {
        return b.totalAccounts - a.totalAccounts;
      }
      return (b[currentMetric] as number) - (a[currentMetric] as number);
    });

    return sorted.map(rep => ({
      ...rep,
      name: formatRepName(rep.repName),
      fullName: rep.repName,
    }));
  }, [data, currentMetric]);

  // Calculate totals for the current metric
  const totals = useMemo(() => {
    return {
      arr: data.reduce((sum, r) => sum + r.arr, 0),
      atr: data.reduce((sum, r) => sum + r.atr, 0),
      pipeline: data.reduce((sum, r) => sum + r.pipeline, 0),
      customers: data.reduce((sum, r) => sum + r.customerAccounts, 0),
      prospects: data.reduce((sum, r) => sum + r.prospectAccounts, 0),
    };
  }, [data]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const repData = payload[0].payload;
      
      if (currentMetric === 'accounts') {
        // Check if parent/child data exists
        const hasParentChildData = 'parentCustomers' in repData;
        
        return (
          <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm">
            <p className="font-medium">{repData.fullName}</p>
            <p className="text-muted-foreground text-xs">{repData.region}</p>
            <div className="mt-2 space-y-1">
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 rounded bg-emerald-500" />
                Customers: <span className="font-medium">{repData.customerAccounts}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 rounded bg-blue-500" />
                Prospects: <span className="font-medium">{repData.prospectAccounts}</span>
              </p>
              <p className="text-muted-foreground border-t pt-1 mt-1">
                Total: <span className="font-medium">{repData.totalAccounts}</span>
              </p>
              {/* Parent/Child breakdown if data exists */}
              {hasParentChildData && (
                <div className="border-t pt-1 mt-1 space-y-0.5">
                  <p><strong>Parent Accounts: {(repData.parentCustomers || 0) + (repData.parentProspects || 0)}</strong></p>
                  <p className="text-muted-foreground">Children: {(repData.childCustomers || 0) + (repData.childProspects || 0)}</p>
                </div>
              )}
            </div>
          </div>
        );
      }

      const value = repData[currentMetric] as number;
      const status = getThresholdStatus(value, thresholds);
      
      return (
        <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm">
          <p className="font-medium">{repData.fullName}</p>
          <p className="text-muted-foreground text-xs">{repData.region}</p>
          <p className="mt-1">
            {config.label.replace(' Distribution', '')}: 
            <span className="font-medium ml-1">{config.format(value)}</span>
          </p>
          {thresholds && status.text && (
            <p className={`text-xs mt-1 ${status.color}`}>
              {status.text}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const currentIndex = metricsOrder.indexOf(currentMetric);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {config.label}
            </CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">{config.description}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          {/* Only show toggle when multiple metrics available */}
          {metricsOrder.length > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={goToPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {currentIndex + 1}/{metricsOrder.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={goToNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        
        {/* Stats row with Total, Average, CV */}
        {showStats && currentMetric !== 'accounts' && (
          <div className="flex items-center gap-4 text-xs mt-2 py-2 px-3 bg-muted/30 rounded-md">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-semibold">{config.format(stats.total)}</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Avg:</span>
              <span className="font-semibold">{config.format(stats.average)}</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">CV:</span>
              <span className={`font-semibold ${getCVStatusColor(stats.cv)}`}>
                {stats.cv.toFixed(1)}%
              </span>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground hover:text-foreground ml-0.5" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm font-medium mb-1">Coefficient of Variation</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Measures how spread out values are. Lower = more balanced.
                  </p>
                  <ul className="text-xs space-y-0.5">
                    <li className="text-green-600 dark:text-green-400">• &lt;15% = Good balance</li>
                    <li className="text-amber-600 dark:text-amber-400">• 15-25% = Fair</li>
                    <li className="text-red-600 dark:text-red-400">• &gt;25% = Needs attention</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
        
        {/* Stats for accounts mode */}
        {showStats && currentMetric === 'accounts' && (
          <div className="flex items-center gap-4 text-xs mt-2 py-2 px-3 bg-muted/30 rounded-md">
            <div className="flex items-center gap-1">
              <span className="font-semibold">{stats.total.toLocaleString()}</span>
              <span className="text-muted-foreground">assigned to {data.length} reps</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{totals.customers}</span>
              <span className="text-muted-foreground">customers</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-blue-500" />
              <span className="text-blue-600 dark:text-blue-400 font-medium">{totals.prospects}</span>
              <span className="text-muted-foreground">prospects</span>
            </div>
          </div>
        )}
        
        {/* Simple summary stats when showStats is false */}
        {!showStats && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span>{data.length} reps</span>
            {currentMetric === 'accounts' ? (
              <>
                <span>•</span>
                <span className="text-emerald-600 dark:text-emerald-400">{totals.customers} customers</span>
                <span>•</span>
                <span className="text-blue-600 dark:text-blue-400">{totals.prospects} prospects</span>
              </>
            ) : (
              <>
                <span>•</span>
                <span>Total: {config.format(totals[currentMetric === 'arr' ? 'arr' : currentMetric === 'atr' ? 'atr' : 'pipeline'])}</span>
              </>
            )}
          </div>
        )}
        
        {/* Threshold legend - shows bar color meanings, lines, and target zone */}
        {showThresholdLegend && thresholds && currentMetric !== 'accounts' && (
          <div className="flex flex-wrap items-center gap-3 text-xs mt-2 py-2 px-3 bg-muted/20 rounded-md border border-muted">
            {/* Bar color legend */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-blue-500" />
                <span className="text-muted-foreground">Below Floor</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-500" />
                <span className="text-muted-foreground">In Range</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-500" />
                <span className="text-muted-foreground">Over Ceiling</span>
              </div>
            </div>
            <div className="h-4 w-px bg-border" />
            {/* Target and Target Zone together */}
            <div className="flex items-center gap-3">
              {thresholds.target != null && (
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5 bg-green-500" />
                  <span className="text-green-500 font-medium">Target: {config.format(thresholds.target)}</span>
                </div>
              )}
              {/* Target zone */}
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-4 bg-green-500/20 border border-dashed border-green-500/40 rounded-sm" />
                <span className="text-green-600 dark:text-green-400 font-medium">
                  Zone: {config.format(thresholds.min || 0)} - {config.format(thresholds.max || 0)}
                </span>
              </div>
            </div>
            <div className="h-4 w-px bg-border" />
            {/* Absolute limit indicators */}
            <div className="flex items-center gap-3">
              {thresholds.absoluteMin != null && (
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5 border-t-2 border-dashed border-blue-500" />
                  <span className="text-blue-500 font-medium">Min: {config.format(thresholds.absoluteMin)}</span>
                </div>
              )}
              {thresholds.absoluteMax != null && (
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5 border-t-2 border-dashed border-red-500" />
                  <span className="text-red-500 font-medium">Max: {config.format(thresholds.absoluteMax)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {chartData.length > 0 ? (
          <div className="h-[400px] overflow-y-auto overflow-x-hidden">
            <ResponsiveContainer width="100%" height={Math.max(400, chartData.length * 22 + 20)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 25, bottom: 5 }}
              >
                <XAxis 
                  type="number" 
                  hide 
                  domain={[0, (dataMax: number) => {
                    // Extend domain to include absolute max if it exists, with 10% padding
                    const absoluteMax = thresholds?.absoluteMax || 0;
                    const zoneMax = thresholds?.max || 0;
                    const upperBound = Math.max(dataMax, absoluteMax, zoneMax);
                    return upperBound * 1.1; // 10% padding
                  }]}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={40}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                
                {/* Target zone background (green shaded area between min and max) - rendered FIRST so it's behind everything */}
                {thresholds?.min != null && thresholds?.max != null && currentMetric !== 'accounts' && (
                  <ReferenceArea
                    x1={thresholds.min}
                    x2={thresholds.max}
                    fill="#22c55e"
                    fillOpacity={0.12}
                    stroke="none"
                    ifOverflow="extendDomain"
                  />
                )}
                
                {currentMetric === 'accounts' ? (
                  // Stacked bar for accounts - no legend needed since header shows counts
                  <>
                    <Bar 
                      dataKey="customerAccounts" 
                      name="Customers"
                      stackId="accounts"
                      fill="#22c55e" 
                      radius={[0, 0, 0, 0]} 
                      barSize={16}
                    />
                    <Bar 
                      dataKey="prospectAccounts"
                      name="Prospects" 
                      stackId="accounts"
                      fill="#3b82f6" 
                      radius={[0, 4, 4, 0]} 
                      barSize={16}
                    />
                  </>
                ) : (
                  // Single bar for monetary metrics - dynamic coloring based on thresholds
                  <Bar 
                    dataKey={config.dataKey} 
                    radius={[0, 4, 4, 0]} 
                    barSize={16}
                  >
                    {chartData.map((entry, index) => {
                      const value = entry[currentMetric] as number;
                      const color = thresholds 
                        ? getBarColorByThreshold(value, thresholds)
                        : config.color;
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                )}
                
                {/* Reference lines rendered AFTER bars so they appear on top */}
                
                {/* Average reference line - gray dashed */}
                {showStats && currentMetric !== 'accounts' && stats.average > 0 && (
                  <ReferenceLine 
                    x={stats.average} 
                    stroke="#6b7280"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                    label={{
                      value: `Average: ${config.format(stats.average)}`,
                      position: 'top',
                      fontSize: 11,
                      fontWeight: 'bold',
                      fill: '#6b7280',
                    }}
                  />
                )}
                
                {/* Absolute Minimum - BLUE dotted (hard floor) */}
                {thresholds?.absoluteMin != null && currentMetric !== 'accounts' && (
                  <ReferenceLine 
                    x={thresholds.absoluteMin} 
                    stroke="#3b82f6"
                    strokeDasharray="8 4"
                    strokeWidth={2.5}
                    ifOverflow="extendDomain"
                  />
                )}
                
                {/* Absolute Maximum - RED dotted (hard ceiling) */}
                {thresholds?.absoluteMax != null && currentMetric !== 'accounts' && (
                  <ReferenceLine 
                    x={thresholds.absoluteMax} 
                    stroke="#ef4444"
                    strokeDasharray="8 4"
                    strokeWidth={2.5}
                    ifOverflow="extendDomain"
                  />
                )}
                
                {/* Target center line - GREEN solid */}
                {thresholds?.target != null && currentMetric !== 'accounts' && (
                  <ReferenceLine 
                    x={thresholds.target} 
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    ifOverflow="extendDomain"
                    label={{
                      value: `Target: ${config.format(thresholds.target)}`,
                      position: 'top',
                      fontSize: 10,
                      fontWeight: 'bold',
                      fill: '#22c55e',
                    }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[350px] flex items-center justify-center text-sm text-muted-foreground">
            No rep data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RepDistributionChart;









