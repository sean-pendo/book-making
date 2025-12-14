import React from 'react';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useLastAssignmentTimestamp } from '@/hooks/useBuildData';
import { Skeleton } from '@/components/ui/skeleton';

interface AssignmentStatusHeaderProps {
  buildId: string;
}

/**
 * Assignment Status Header Component
 * Shows timestamp of the last applied assignment for this build
 * Displayed above the tab navigation in the Balancing module
 */
export const AssignmentStatusHeader: React.FC<AssignmentStatusHeaderProps> = ({ buildId }) => {
  const { data, isLoading, error } = useLastAssignmentTimestamp(buildId);

  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 rounded-lg border mb-4">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800 mb-4">
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-sm text-red-700 dark:text-red-300">
          Error loading assignment status
        </span>
      </div>
    );
  }

  if (!data?.timestamp) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 mb-4">
        <Clock className="h-4 w-4 text-amber-500" />
        <span className="text-sm text-amber-700 dark:text-amber-300">
          No assignments applied yet
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800 mb-4">
      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      <span className="text-sm text-emerald-700 dark:text-emerald-300">
        Last assignment applied: <strong>{formatTimestamp(data.timestamp)}</strong>
        <span className="text-emerald-600/70 dark:text-emerald-400/70 ml-2">
          ({data.count.toLocaleString()} assignments)
        </span>
      </span>
    </div>
  );
};

export default AssignmentStatusHeader;





