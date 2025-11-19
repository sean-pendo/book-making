import React from 'react';
import { EnhancedBalancingDashboard } from '@/components/EnhancedBalancingDashboard';

interface TerritoryBalancingDashboardProps {
  buildId?: string;
}

export const TerritoryBalancingDashboard = ({ buildId }: TerritoryBalancingDashboardProps = {}) => {
  return (
    <div className="space-y-6">
      <EnhancedBalancingDashboard buildId={buildId} />
    </div>
  );
};

export default TerritoryBalancingDashboard;
