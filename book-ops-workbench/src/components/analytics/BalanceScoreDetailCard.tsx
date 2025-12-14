import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Info, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Cell, Tooltip as RechartsTooltip } from 'recharts';
import type { BalanceMetricsDetail } from '@/types/analytics';
import { cn } from '@/lib/utils';

interface BalanceScoreDetailCardProps {
  balanceDetail: BalanceMetricsDetail | undefined;
  showDrilldown?: boolean;
  compact?: boolean;
}

const formatCurrency = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const getScoreColor = (score: number) => {
  if (score >= 0.7) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

const getScoreBarColor = (score: number) => {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.4) return 'bg-amber-500';
  return 'bg-red-500';
};

const getBarColor = (value: number, min: number, max: number) => {
  if (value < min) return '#ef4444'; // red - underloaded
  if (value > max) return '#f59e0b'; // amber - overloaded  
  return '#10b981'; // emerald - in range
};

export const BalanceScoreDetailCard: React.FC<BalanceScoreDetailCardProps> = ({
  balanceDetail,
  showDrilldown = true,
  compact = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!balanceDetail) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="text-sm text-muted-foreground text-center">
            No balance data available
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const { 
    score, mean, stdDev, variance, coeffOfVariation, mse, rmse,
    targetLoad, tolerancePct, minAcceptable, maxAcceptable,
    distribution, outliers, repCount, totalARR
  } = balanceDetail;
  
  const scorePercent = Math.round(score * 100);
  const inRangePercent = repCount > 0 ? Math.round((outliers.inRange / repCount) * 100) : 0;
  
  // Prepare bell curve data (sorted by ARR load for bar chart)
  const chartData = distribution.map(d => ({
    name: d.repName?.split(' ')[0] || d.repId.slice(0, 8),
    fullName: d.repName,
    value: d.arrLoad,
    inRange: d.inRange,
    deviation: d.deviation,
    zScore: d.zScore
  }));

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(
        'transition-all',
        isOpen && 'ring-1 ring-primary/20'
      )}>
        <CardHeader className={cn('pb-2', compact && 'py-3')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Balance</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p className="text-xs">
                      MSE-based score measuring how evenly ARR is distributed across reps.
                      Higher score = closer to equal distribution.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {showDrilldown && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </CardHeader>
        
        <CardContent className={cn('space-y-3', compact && 'pb-3')}>
          {/* Main Score */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className={cn('text-2xl font-bold', getScoreColor(score))}>
                {scorePercent}%
              </span>
              <span className="text-xs text-muted-foreground">
                {outliers.inRange}/{repCount} reps in range
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn('h-full transition-all', getScoreBarColor(score))}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center p-1.5 bg-muted/50 rounded">
              <div className="text-muted-foreground">Avg/Rep</div>
              <div className="font-medium">{formatCurrency(mean)}</div>
            </div>
            <div className="text-center p-1.5 bg-muted/50 rounded">
              <div className="text-muted-foreground">Std Dev</div>
              <div className="font-medium">{formatCurrency(stdDev)}</div>
            </div>
            <div className="text-center p-1.5 bg-muted/50 rounded">
              <div className="text-muted-foreground">CV</div>
              <div className="font-medium">{(coeffOfVariation * 100).toFixed(1)}%</div>
            </div>
          </div>
          
          {/* Outlier Summary */}
          <div className="flex items-center gap-2 flex-wrap">
            {outliers.underloaded > 0 && (
              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30">
                <TrendingDown className="h-3 w-3 mr-1" />
                {outliers.underloaded} under
              </Badge>
            )}
            {outliers.overloaded > 0 && (
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                <TrendingUp className="h-3 w-3 mr-1" />
                {outliers.overloaded} over
              </Badge>
            )}
            {outliers.inRange > 0 && (
              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                {outliers.inRange} balanced
              </Badge>
            )}
          </div>
          
          {/* Drilldown Content */}
          <CollapsibleContent className="space-y-4 pt-2">
            {/* Distribution Bar Chart */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Rep ARR Distribution</span>
                <span>±{Math.round(tolerancePct * 100)}% tolerance</span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 20, left: 5 }}>
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 9 }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis 
                      tick={{ fontSize: 9 }}
                      tickFormatter={formatCurrency}
                      width={50}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs">
                            <div className="font-medium">{data.fullName}</div>
                            <div>ARR: {formatCurrency(data.value)}</div>
                            <div>vs Target: {data.deviation >= 0 ? '+' : ''}{formatCurrency(data.deviation)}</div>
                            <div>Z-Score: {data.zScore.toFixed(2)}</div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine 
                      y={targetLoad} 
                      stroke="#6366f1" 
                      strokeDasharray="4 4"
                      label={{ value: 'Target', fontSize: 9, fill: '#6366f1' }}
                    />
                    <ReferenceLine y={minAcceptable} stroke="#ef4444" strokeDasharray="2 2" strokeOpacity={0.5} />
                    <ReferenceLine y={maxAcceptable} stroke="#f59e0b" strokeDasharray="2 2" strokeOpacity={0.5} />
                    <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`}
                          fill={getBarColor(entry.value, minAcceptable, maxAcceptable)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Detailed Stats */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                <div className="text-muted-foreground font-medium">Statistics</div>
                <div className="grid grid-cols-2 gap-1">
                  <span className="text-muted-foreground">Total ARR:</span>
                  <span className="font-medium text-right">{formatCurrency(totalARR)}</span>
                  <span className="text-muted-foreground">Mean:</span>
                  <span className="font-medium text-right">{formatCurrency(mean)}</span>
                  <span className="text-muted-foreground">Variance:</span>
                  <span className="font-medium text-right">{formatCurrency(Math.sqrt(variance))}</span>
                  <span className="text-muted-foreground">RMSE:</span>
                  <span className="font-medium text-right">{formatCurrency(rmse)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="text-muted-foreground font-medium">Targets</div>
                <div className="grid grid-cols-2 gap-1">
                  <span className="text-muted-foreground">Target/Rep:</span>
                  <span className="font-medium text-right">{formatCurrency(targetLoad)}</span>
                  <span className="text-muted-foreground">Tolerance:</span>
                  <span className="font-medium text-right">±{Math.round(tolerancePct * 100)}%</span>
                  <span className="text-muted-foreground">Min OK:</span>
                  <span className="font-medium text-right">{formatCurrency(minAcceptable)}</span>
                  <span className="text-muted-foreground">Max OK:</span>
                  <span className="font-medium text-right">{formatCurrency(maxAcceptable)}</span>
                </div>
              </div>
            </div>
            
            {/* Top Outliers */}
            {(outliers.underloaded > 0 || outliers.overloaded > 0) && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground font-medium">Attention Needed</div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {distribution
                    .filter(d => !d.inRange)
                    .slice(0, 5)
                    .map(d => (
                      <div 
                        key={d.repId}
                        className={cn(
                          'flex items-center justify-between text-xs p-1.5 rounded',
                          d.arrLoad < minAcceptable 
                            ? 'bg-red-500/10' 
                            : 'bg-amber-500/10'
                        )}
                      >
                        <span className="truncate max-w-[150px]">{d.repName}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatCurrency(d.arrLoad)}</span>
                          <span className={cn(
                            'text-xs',
                            d.deviation > 0 ? 'text-amber-600' : 'text-red-600'
                          )}>
                            ({d.deviation >= 0 ? '+' : ''}{formatCurrency(d.deviation)})
                          </span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
};

export default BalanceScoreDetailCard;








