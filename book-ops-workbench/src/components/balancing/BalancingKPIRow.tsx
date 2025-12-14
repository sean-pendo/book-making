import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Target, Users, UserCheck } from 'lucide-react';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface BalancingKPIRowProps {
  parentCustomers: number;
  parentProspects: number;
  childCustomers?: number;
  childProspects?: number;
  activeReps: number;
  coveragePercent: number;
  isLoading?: boolean;
}

/**
 * Modular KPI Row Component for Balancing Dashboard
 * Displays 4 key metrics: Customers, Prospects, Reps, and Coverage
 * Reusable across all 3 tabs
 */
export const BalancingKPIRow: React.FC<BalancingKPIRowProps> = ({
  parentCustomers,
  parentProspects,
  childCustomers = 0,
  childProspects = 0,
  activeReps,
  coveragePercent,
  isLoading = false,
}) => {
  const totalCustomers = parentCustomers + childCustomers;
  const totalProspects = parentProspects + childProspects;
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Customers */}
      <Card className="card-elevated card-glass hover-lift group">
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
            <TooltipContent side="bottom" className="text-sm">
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
            </TooltipContent>
          </Tooltip>
        </CardContent>
      </Card>

      {/* Prospects */}
      <Card className="card-elevated card-glass hover-lift group">
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
            <TooltipContent side="bottom" className="text-sm">
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
            </TooltipContent>
          </Tooltip>
        </CardContent>
      </Card>

      {/* Active Reps */}
      <Card className="card-elevated card-glass hover-lift group">
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
          <AnimatedCounter 
            value={activeReps} 
            className="text-2xl font-bold text-violet-600 dark:text-violet-400" 
          />
        </CardContent>
      </Card>

      {/* Coverage */}
      <Card className="card-elevated card-glass hover-lift group">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <UserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Coverage</h3>
              <p className="text-xs text-muted-foreground">Assigned accounts</p>
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {coveragePercent.toFixed(1)}%
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BalancingKPIRow;

