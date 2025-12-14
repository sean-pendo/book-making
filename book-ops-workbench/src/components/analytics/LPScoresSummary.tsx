import React from 'react';
import { LPScoreCard } from './LPScoreCard';
import type { LPSuccessMetrics } from '@/types/analytics';
import { cn } from '@/lib/utils';

interface LPScoresSummaryProps {
  metrics: LPSuccessMetrics;
  showCapacity?: boolean;
  variant?: 'horizontal' | 'grid';
  size?: 'sm' | 'md' | 'lg';
}

const LP_METRIC_CONFIGS = [
  {
    key: 'balanceScore' as const,
    label: 'Balance',
    description: 'How evenly ARR is distributed across reps. Higher = more balanced workloads.',
  },
  {
    key: 'continuityScore' as const,
    label: 'Continuity',
    description: 'Percentage of accounts staying with their original owner. Higher = more stability.',
  },
  {
    key: 'geographyScore' as const,
    label: 'Geography',
    description: 'How well account regions match their assigned rep regions. Higher = better geo alignment.',
  },
  {
    key: 'teamAlignmentScore' as const,
    label: 'Team Fit',
    description: 'How well account tiers match rep specializations. Higher = better tier matching.',
  },
  {
    key: 'capacityUtilization' as const,
    label: 'Capacity',
    description: 'Average rep load compared to target. 100% = reps at target capacity.',
  },
];

export const LPScoresSummary: React.FC<LPScoresSummaryProps> = ({
  metrics,
  showCapacity = true,
  variant = 'horizontal',
  size = 'md',
}) => {
  const displayedMetrics = showCapacity 
    ? LP_METRIC_CONFIGS 
    : LP_METRIC_CONFIGS.filter(m => m.key !== 'capacityUtilization');

  const gridClasses = variant === 'horizontal'
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3'
    : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4';

  return (
    <div className={cn(gridClasses)}>
      {displayedMetrics.map(config => (
        <LPScoreCard
          key={config.key}
          label={config.label}
          score={metrics[config.key]}
          description={config.description}
          size={size}
        />
      ))}
    </div>
  );
};

export default LPScoresSummary;








