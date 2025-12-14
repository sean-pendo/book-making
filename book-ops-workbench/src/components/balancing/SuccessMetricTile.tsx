import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowRight, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SuccessMetricTileProps {
  /** Label for the metric */
  label: string;
  /** Icon component to display */
  icon: React.ElementType;
  /** Icon background color class */
  iconBgColor: string;
  /** Icon color class */
  iconColor: string;
  /** Before value (0-1 for percentages, or null if not applicable) */
  beforeValue: number | null;
  /** After value (0-1 for percentages) */
  afterValue: number;
  /** Whether to show the before arrow after format (false for continuity which has no "before") */
  showBeforeAfter?: boolean;
  /** Tooltip title */
  tooltipTitle: string;
  /** Tooltip description */
  tooltipDescription: string;
  /** Additional tooltip content (e.g., breakdown stats) */
  tooltipExtra?: React.ReactNode;
  /** Whether this metric is not applicable (show N/A) */
  isNA?: boolean;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Compact success metric tile for Before vs After dashboard
 * Shows a metric with optional before → after display and tooltip
 */
export const SuccessMetricTile: React.FC<SuccessMetricTileProps> = ({
  label,
  icon: Icon,
  iconBgColor,
  iconColor,
  beforeValue,
  afterValue,
  showBeforeAfter = true,
  tooltipTitle,
  tooltipDescription,
  tooltipExtra,
  isNA = false,
  isLoading = false,
}) => {
  // Calculate delta for color
  const delta = showBeforeAfter && beforeValue !== null ? afterValue - beforeValue : null;
  
  // Get value color based on score
  const getValueColor = (score: number) => {
    if (score >= 0.7) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 0.5) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Get delta indicator
  const getDeltaIndicator = () => {
    if (delta === null) return null;
    
    const absDelta = Math.abs(delta);
    if (absDelta < 0.01) {
      return (
        <span className="flex items-center gap-0.5 text-muted-foreground text-xs">
          <Minus className="h-3 w-3" />
          <span>0%</span>
        </span>
      );
    }
    
    const isPositive = delta > 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const colorClass = isPositive 
      ? 'text-emerald-600 dark:text-emerald-400' 
      : 'text-red-600 dark:text-red-400';
    
    return (
      <span className={cn('flex items-center gap-0.5 text-xs', colorClass)}>
        <Icon className="h-3 w-3" />
        <span>{isPositive ? '+' : ''}{(delta * 100).toFixed(1)}%</span>
      </span>
    );
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return '--';
    return `${Math.round(value * 100)}%`;
  };

  if (isLoading) {
    return (
      <Card className="card-elevated animate-pulse">
        <CardContent className="p-4">
          <div className="h-4 bg-muted rounded w-20 mb-2" />
          <div className="h-8 bg-muted rounded w-16" />
        </CardContent>
      </Card>
    );
  }

  if (isNA) {
    return (
      <Card className="card-elevated opacity-60">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn('p-1.5 rounded-lg', iconBgColor)}>
              <Icon className={cn('h-4 w-4', iconColor)} />
            </div>
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
          </div>
          <div className="text-2xl font-bold text-muted-foreground">N/A</div>
          <p className="text-xs text-muted-foreground mt-1">No tier data configured</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="card-elevated hover:shadow-md transition-shadow cursor-help">
          <CardContent className="p-4">
            {/* Header with icon and label */}
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('p-1.5 rounded-lg', iconBgColor)}>
                <Icon className={cn('h-4 w-4', iconColor)} />
              </div>
              <span className="text-sm font-medium text-foreground">{label}</span>
              <Info className="h-3 w-3 text-muted-foreground ml-auto" />
            </div>
            
            {/* Value display */}
            {showBeforeAfter && beforeValue !== null ? (
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">
                  {formatPercent(beforeValue)}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className={cn('text-2xl font-bold', getValueColor(afterValue))}>
                  {formatPercent(afterValue)}
                </span>
              </div>
            ) : (
              <div className={cn('text-2xl font-bold', getValueColor(afterValue))}>
                {formatPercent(afterValue)}
              </div>
            )}
            
            {/* Delta indicator */}
            {getDeltaIndicator() && (
              <div className="mt-1">
                {getDeltaIndicator()}
              </div>
            )}
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs p-3 z-50">
        <p className="text-sm font-medium mb-1">{tooltipTitle}</p>
        <p className="text-xs text-muted-foreground mb-2">{tooltipDescription}</p>
        {tooltipExtra}
      </TooltipContent>
    </Tooltip>
  );
};

export default SuccessMetricTile;

