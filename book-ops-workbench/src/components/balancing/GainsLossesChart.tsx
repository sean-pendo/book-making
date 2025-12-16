import React, { useState, useMemo } from 'react';
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
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Hash, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Types for the chart modes
type Direction = 'gains' | 'losses';
type ValueType = 'dollar' | 'count';
type Metric = 'arr' | 'atr' | 'pipeline';

interface RepChange {
  repId: string;
  repName: string;
  region: string;
  // Before values (from owner_id)
  beforeARR: number;
  beforeATR: number;
  beforePipeline: number;
  beforeCustomerCount: number;
  beforeProspectCount: number;
  // After values (from new_owner_id)
  afterARR: number;
  afterATR: number;
  afterPipeline: number;
  afterCustomerCount: number;
  afterProspectCount: number;
}

interface GainsLossesChartProps {
  repChanges: RepChange[];
  isLoading?: boolean;
}

/**
 * Gains/Losses Analysis Chart
 * 
 * Shows top 10 reps who gained or lost the most based on various metrics.
 * 
 * Toggle Controls:
 * - Direction: Gains | Losses
 * - Value Type: Dollar | Count
 * - Metric: ARR | ATR | Pipeline
 * 
 * Total: 2 × 2 × 3 = 12 combinations
 */
export const GainsLossesChart: React.FC<GainsLossesChartProps> = ({
  repChanges,
  isLoading = false,
}) => {
  // Toggle states
  const [direction, setDirection] = useState<Direction>('gains');
  const [valueType, setValueType] = useState<ValueType>('dollar');
  const [metric, setMetric] = useState<Metric>('arr');

  // Calculate changes and sort data
  const chartData = useMemo(() => {
    if (!repChanges || repChanges.length === 0) return [];

    // Calculate change values for each rep
    const withChanges = repChanges.map(rep => {
      let change = 0;
      
      if (valueType === 'dollar') {
        switch (metric) {
          case 'arr':
            change = rep.afterARR - rep.beforeARR;
            break;
          case 'atr':
            change = rep.afterATR - rep.beforeATR;
            break;
          case 'pipeline':
            change = rep.afterPipeline - rep.beforePipeline;
            break;
        }
      } else {
        // Count mode - use customer count for ARR/ATR, prospect for Pipeline
        if (metric === 'pipeline') {
          change = rep.afterProspectCount - rep.beforeProspectCount;
        } else {
          change = rep.afterCustomerCount - rep.beforeCustomerCount;
        }
      }

      return {
        ...rep,
        change,
        absChange: Math.abs(change),
        name: formatRepName(rep.repName),
        fullName: rep.repName,
      };
    });

    // Filter by direction and sort
    const filtered = direction === 'gains'
      ? withChanges.filter(r => r.change > 0).sort((a, b) => b.change - a.change)
      : withChanges.filter(r => r.change < 0).sort((a, b) => a.change - b.change);

    // Return top 10
    return filtered.slice(0, 10);
  }, [repChanges, direction, valueType, metric]);

  // Format rep name to initials
  function formatRepName(fullName: string): string {
    const parts = fullName.trim().split(' ').filter(p => p.length > 0);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 3);
    return `${parts[0][0]}${parts[parts.length - 1][0]}`;
  }

  // Format value for display
  const formatValue = (value: number): string => {
    if (valueType === 'count') {
      const sign = value > 0 ? '+' : '';
      return `${sign}${value}`;
    }
    // Dollar format
    const sign = value > 0 ? '+' : '';
    if (Math.abs(value) >= 1000000) {
      return `${sign}$${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `${sign}$${(value / 1000).toFixed(0)}K`;
    }
    return `${sign}$${value.toFixed(0)}`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm">
          <p className="font-medium">{data.fullName}</p>
          <p className="text-xs text-muted-foreground">{data.region}</p>
          <div className="mt-2 pt-2 border-t">
            <p className={direction === 'gains' ? 'text-emerald-600' : 'text-red-600'}>
              {formatValue(data.change)}
              <span className="text-muted-foreground ml-1">
                {valueType === 'dollar' ? metric.toUpperCase() : 'accounts'}
              </span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Get metric label
  const getMetricLabel = (): string => {
    if (valueType === 'count') {
      return metric === 'pipeline' ? 'Prospect Accounts' : 'Customer Accounts';
    }
    return metric.toUpperCase();
  };

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {direction === 'gains' ? (
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            {direction === 'gains' ? 'Biggest Gains' : 'Biggest Losses'} - Top 10
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  Shows reps who {direction === 'gains' ? 'gained' : 'lost'} the most{' '}
                  {valueType === 'dollar' ? getMetricLabel() : 'accounts'} compared to before assignment.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Toggle Controls */}
        <div className="flex flex-wrap gap-3 mb-4">
          {/* Direction Toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <Button
              variant={direction === 'gains' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setDirection('gains')}
            >
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              Gains
            </Button>
            <Button
              variant={direction === 'losses' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setDirection('losses')}
            >
              <TrendingDown className="h-3.5 w-3.5 mr-1" />
              Losses
            </Button>
          </div>

          {/* Value Type Toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <Button
              variant={valueType === 'dollar' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setValueType('dollar')}
            >
              <DollarSign className="h-3.5 w-3.5 mr-1" />
              Dollar
            </Button>
            <Button
              variant={valueType === 'count' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setValueType('count')}
            >
              <Hash className="h-3.5 w-3.5 mr-1" />
              Count
            </Button>
          </div>

          {/* Metric Toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <Button
              variant={metric === 'arr' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMetric('arr')}
            >
              ARR
            </Button>
            <Button
              variant={metric === 'atr' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMetric('atr')}
            >
              ATR
            </Button>
            <Button
              variant={metric === 'pipeline' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMetric('pipeline')}
            >
              Pipeline
            </Button>
          </div>

          {/* Mode indicator */}
          <div className="ml-auto text-xs text-muted-foreground self-center">
            Showing: {getMetricLabel()} by {valueType === 'dollar' ? 'value' : 'count'}
          </div>
        </div>
        
        {/* Summary stats */}
        {chartData.length > 0 && (
          <div className="flex items-center gap-4 text-xs mb-3 py-2 px-3 bg-muted/30 rounded-md">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Top {direction === 'gains' ? 'gainer' : 'loser'}:</span>
              <span className="font-semibold">{chartData[0]?.fullName}</span>
              <span className={direction === 'gains' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                {formatValue(direction === 'gains' ? chartData[0]?.change : -chartData[0]?.absChange)}
              </span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Total change (Top 10):</span>
              <span className={`font-bold ${direction === 'gains' ? 'text-emerald-500' : 'text-red-500'}`}>
                {formatValue(direction === 'gains' 
                  ? chartData.reduce((sum, r) => sum + r.change, 0)
                  : -chartData.reduce((sum, r) => sum + r.absChange, 0)
                )}
              </span>
            </div>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 0 ? (
          <div className="h-[400px] overflow-y-auto">
            <ResponsiveContainer width="100%" height={Math.max(400, chartData.length * 40)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 0, right: 80, top: 10, bottom: 5 }}
              >
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fontWeight: 500 }}
                  width={50}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar
                  dataKey={direction === 'gains' ? 'change' : 'absChange'}
                  fill={direction === 'gains' ? '#22c55e' : '#ef4444'}
                  stroke={direction === 'gains' ? '#16a34a' : '#dc2626'}
                  strokeWidth={1}
                  radius={[0, 6, 6, 0]}
                  barSize={24}
                  label={{
                    position: 'right',
                    fontSize: 11,
                    fontWeight: 600,
                    fill: direction === 'gains' ? '#22c55e' : '#ef4444',
                    formatter: (value: number) => formatValue(direction === 'gains' ? value : -value),
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[350px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">No {direction} data available</p>
              <p className="text-xs mt-1">
                {direction === 'gains' 
                  ? 'No reps gained value - try switching to Losses' 
                  : 'No reps lost value - try switching to Gains'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GainsLossesChart;

