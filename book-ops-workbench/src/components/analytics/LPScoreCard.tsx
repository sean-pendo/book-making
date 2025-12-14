import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LPScoreCardProps {
  label: string;
  score: number | null;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  showAsPercentage?: boolean;
}

/**
 * Get color scheme based on score value
 * Green (good): >= 0.7
 * Yellow (warning): 0.4 - 0.7
 * Red (danger): < 0.4
 */
const getScoreColorScheme = (score: number | null) => {
  if (score === null) return 'muted';
  if (score >= 0.7) return 'success';
  if (score >= 0.4) return 'warning';
  return 'danger';
};

const colorClasses = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200/50 dark:border-emerald-800/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500 dark:bg-emerald-400',
    barBg: 'bg-emerald-100 dark:bg-emerald-900/50',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200/50 dark:border-amber-800/30',
    text: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500 dark:bg-amber-400',
    barBg: 'bg-amber-100 dark:bg-amber-900/50',
  },
  danger: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200/50 dark:border-red-800/30',
    text: 'text-red-700 dark:text-red-300',
    bar: 'bg-red-500 dark:bg-red-400',
    barBg: 'bg-red-100 dark:bg-red-900/50',
  },
  muted: {
    bg: 'bg-muted/50',
    border: 'border-muted-foreground/20',
    text: 'text-muted-foreground',
    bar: 'bg-muted-foreground/30',
    barBg: 'bg-muted-foreground/10',
  },
};

const sizeClasses = {
  sm: {
    card: 'p-3',
    label: 'text-xs',
    value: 'text-lg',
    bar: 'h-1',
  },
  md: {
    card: 'p-4',
    label: 'text-xs',
    value: 'text-2xl',
    bar: 'h-1.5',
  },
  lg: {
    card: 'p-5',
    label: 'text-sm',
    value: 'text-3xl',
    bar: 'h-2',
  },
};

export const LPScoreCard: React.FC<LPScoreCardProps> = ({
  label,
  score,
  description,
  size = 'md',
  showAsPercentage = true,
}) => {
  const colorScheme = getScoreColorScheme(score);
  const colors = colorClasses[colorScheme];
  const sizes = sizeClasses[size];
  
  const displayValue = score === null 
    ? '--' 
    : showAsPercentage 
      ? `${Math.round(score * 100)}%`
      : score.toFixed(2);
  
  const barWidth = score === null ? 0 : Math.min(100, Math.max(0, score * 100));

  return (
    <Card className={cn('border', colors.bg, colors.border)}>
      <CardContent className={cn(sizes.card, 'space-y-2')}>
        <div className="flex items-center justify-between">
          <span className={cn('font-medium', sizes.label, 'text-muted-foreground')}>
            {label}
          </span>
          {description && (
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">{description}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        
        <p className={cn('font-bold', sizes.value, colors.text)}>
          {displayValue}
        </p>
        
        {/* Progress bar */}
        <div className={cn('w-full rounded-full', colors.barBg, sizes.bar)}>
          <div 
            className={cn('rounded-full transition-all duration-500', colors.bar, sizes.bar)}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default LPScoreCard;

