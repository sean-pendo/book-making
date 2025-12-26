import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Target, Users } from 'lucide-react';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface BalancingKPIRowProps {
  parentCustomers: number;
  parentProspects: number;
  childCustomers?: number;
  childProspects?: number;
  activeReps: number;
  /** Number of strategic reps (excluded from normal capacity) */
  strategicReps?: number;
  /** Number of reps that are backfill sources (leaving) */
  backfillSourceReps?: number;
  isLoading?: boolean;
}

/**
 * Modular KPI Row Component for Balancing Dashboard
 * Displays 3 key metrics: Customers, Prospects, and Reps
 * Reusable across all 3 tabs
 */
export const BalancingKPIRow: React.FC<BalancingKPIRowProps> = ({
  parentCustomers,
  parentProspects,
  childCustomers = 0,
  childProspects = 0,
  activeReps,
  strategicReps = 0,
  backfillSourceReps = 0,
  isLoading = false,
}) => {
  const totalCustomers = parentCustomers + childCustomers;
  const totalProspects = parentProspects + childProspects;
  const normalReps = activeReps - strategicReps;
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-5">
              <Skeleton className="h-5 w-24 mb-3" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Customers */}
      <Card className="card-elevated card-glass hover-lift group relative z-10">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Customers</h3>
              <p className="text-xs text-muted-foreground">Total accounts</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <AnimatedCounter 
                  value={totalCustomers} 
                  className="text-2xl font-bold text-emerald-600 dark:text-emerald-400" 
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8} className="text-sm z-[100]">
              <p className="font-medium mb-2">Customer Account Breakdown</p>
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Parents:</span>
                  <span className="font-semibold">{parentCustomers.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Children:</span>
                  <span className="font-semibold">{childCustomers.toLocaleString()}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Accounts with ARR &gt; $0
              </p>
            </TooltipContent>
          </Tooltip>
        </CardContent>
      </Card>

      {/* Prospects */}
      <Card className="card-elevated card-glass hover-lift group relative z-10">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Prospects</h3>
              <p className="text-xs text-muted-foreground">Total accounts</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <AnimatedCounter 
                  value={totalProspects} 
                  className="text-2xl font-bold text-blue-600 dark:text-blue-400" 
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8} className="text-sm z-[100]">
              <p className="font-medium mb-2">Prospect Account Breakdown</p>
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Parents:</span>
                  <span className="font-semibold">{parentProspects.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Children:</span>
                  <span className="font-semibold">{childProspects.toLocaleString()}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Accounts with no ARR (pipeline only)
              </p>
            </TooltipContent>
          </Tooltip>
        </CardContent>
      </Card>

      {/* Active Reps */}
      <Card className="card-elevated card-glass hover-lift group relative z-10">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Reps</h3>
              <p className="text-xs text-muted-foreground">Active sales reps</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <AnimatedCounter 
                  value={activeReps} 
                  className="text-2xl font-bold text-violet-600 dark:text-violet-400" 
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8} className="text-sm z-[100]">
              <p className="font-medium mb-2">Sales Rep Breakdown</p>
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Normal Reps:</span>
                  <span className="font-semibold">{normalReps.toLocaleString()}</span>
                </div>
                {strategicReps > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Strategic Reps:</span>
                    <span className="font-semibold">{strategicReps.toLocaleString()}</span>
                  </div>
                )}
                {backfillSourceReps > 0 && (
                  <div className="flex justify-between gap-4 text-amber-500">
                    <span>Leaving (Backfill):</span>
                    <span className="font-semibold">{backfillSourceReps.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Reps eligible to receive assignments
              </p>
            </TooltipContent>
          </Tooltip>
        </CardContent>
      </Card>
    </div>
  );
};

export default BalancingKPIRow;
