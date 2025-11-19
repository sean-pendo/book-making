import React from 'react';
import { RefreshCw, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface EnhancedTabRefreshIndicatorProps {
  isRefreshing: boolean;
  lastRefreshed?: Date;
  tabName: string;
}

export const EnhancedTabRefreshIndicator: React.FC<EnhancedTabRefreshIndicatorProps> = ({
  isRefreshing,
  lastRefreshed,
  tabName
}) => {
  if (isRefreshing) {
    return (
      <Badge variant="secondary" className="ml-2 animate-pulse">
        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
        Refreshing...
      </Badge>
    );
  }

  if (lastRefreshed) {
    const timeSinceRefresh = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000);
    
    if (timeSinceRefresh < 10) {
      return (
        <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle className="w-3 h-3 mr-1" />
          Updated
        </Badge>
      );
    }
  }

  return null;
};