import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VarianceIndicatorProps {
  before: number;
  after: number;
  format?: 'percentage' | 'currency' | 'number';
  size?: 'sm' | 'md' | 'lg';
  showArrow?: boolean;
  invertColors?: boolean; // For metrics where decrease is good
}

const formatDelta = (delta: number, format: string): string => {
  const sign = delta >= 0 ? '+' : '';
  
  switch (format) {
    case 'percentage':
      return `${sign}${(delta * 100).toFixed(1)}%`;
    case 'currency':
      if (Math.abs(delta) >= 1000000) {
        return `${sign}$${(delta / 1000000).toFixed(1)}M`;
      } else if (Math.abs(delta) >= 1000) {
        return `${sign}$${(delta / 1000).toFixed(0)}K`;
      }
      return `${sign}$${delta.toFixed(0)}`;
    case 'number':
    default:
      return `${sign}${delta.toLocaleString()}`;
  }
};

const sizeClasses = {
  sm: {
    text: 'text-xs',
    icon: 'h-3 w-3',
    padding: 'px-1.5 py-0.5',
  },
  md: {
    text: 'text-sm',
    icon: 'h-4 w-4',
    padding: 'px-2 py-1',
  },
  lg: {
    text: 'text-base',
    icon: 'h-5 w-5',
    padding: 'px-3 py-1.5',
  },
};

export const VarianceIndicator: React.FC<VarianceIndicatorProps> = ({
  before,
  after,
  format = 'percentage',
  size = 'md',
  showArrow = true,
  invertColors = false,
}) => {
  const delta = after - before;
  const sizes = sizeClasses[size];
  
  // Determine if this is positive, negative, or neutral
  const isPositive = delta > 0.001;
  const isNegative = delta < -0.001;
  const isNeutral = !isPositive && !isNegative;
  
  // Apply color logic (optionally inverted)
  const isGood = invertColors ? isNegative : isPositive;
  const isBad = invertColors ? isPositive : isNegative;
  
  const colorClasses = isNeutral
    ? 'bg-muted text-muted-foreground'
    : isGood
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  return (
    <span 
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        colorClasses,
        sizes.text,
        sizes.padding
      )}
    >
      {showArrow && <Icon className={sizes.icon} />}
      <span>{formatDelta(delta, format)}</span>
    </span>
  );
};

/**
 * Compact inline version for tables/lists
 */
export const InlineVariance: React.FC<{
  delta: number;
  format?: 'percentage' | 'currency' | 'number';
  invertColors?: boolean;
}> = ({ delta, format = 'percentage', invertColors = false }) => {
  const isPositive = delta > 0.001;
  const isNegative = delta < -0.001;
  
  const isGood = invertColors ? isNegative : isPositive;
  const isBad = invertColors ? isPositive : isNegative;
  
  const colorClass = isGood 
    ? 'text-emerald-600 dark:text-emerald-400' 
    : isBad 
      ? 'text-red-600 dark:text-red-400'
      : 'text-muted-foreground';

  return (
    <span className={cn('text-sm font-medium', colorClass)}>
      {formatDelta(delta, format)}
    </span>
  );
};

export default VarianceIndicator;

