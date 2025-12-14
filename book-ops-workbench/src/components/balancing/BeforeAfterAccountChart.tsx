import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Users, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

export interface BeforeAfterAccountData {
  repId: string;
  repName: string;
  region: string;
  // Before counts (original owner_id)
  beforeCustomers: number;
  beforeProspects: number;
  beforeParentCustomers: number;
  beforeChildCustomers: number;
  beforeParentProspects: number;
  beforeChildProspects: number;
  // After counts (new_owner_id)
  afterCustomers: number;
  afterProspects: number;
  afterParentCustomers: number;
  afterChildCustomers: number;
  afterParentProspects: number;
  afterChildProspects: number;
}

interface BeforeAfterAccountChartProps {
  data: BeforeAfterAccountData[];
  className?: string;
}

// ============================================
// HELPERS
// ============================================

const formatRepName = (fullName: string): string => {
  const parts = fullName.trim().split(' ').filter(p => p.length > 0);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

// ============================================
// COMPONENT
// ============================================

export const BeforeAfterAccountChart: React.FC<BeforeAfterAccountChartProps> = ({
  data,
  className,
}) => {
  // Calculate summary stats
  const stats = useMemo(() => {
    const before = {
      total: data.reduce((sum, r) => sum + r.beforeCustomers + r.beforeProspects, 0),
      customers: data.reduce((sum, r) => sum + r.beforeCustomers, 0),
      prospects: data.reduce((sum, r) => sum + r.beforeProspects, 0),
    };
    const after = {
      total: data.reduce((sum, r) => sum + r.afterCustomers + r.afterProspects, 0),
      customers: data.reduce((sum, r) => sum + r.afterCustomers, 0),
      prospects: data.reduce((sum, r) => sum + r.afterProspects, 0),
    };
    return { before, after };
  }, [data]);

  // Sort by after total descending
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => 
      (b.afterCustomers + b.afterProspects) - (a.afterCustomers + a.afterProspects)
    );
  }, [data]);

  // Calculate max for scaling
  const maxValue = useMemo(() => {
    const allValues = data.flatMap(r => [
      r.beforeCustomers + r.beforeProspects,
      r.afterCustomers + r.afterProspects,
    ]);
    return Math.max(...allValues, 1) * 1.1;
  }, [data]);

  // Calculate deltas
  const customerDelta = stats.after.customers - stats.before.customers;
  const prospectDelta = stats.after.prospects - stats.before.prospects;

  const DeltaIndicator = ({ delta }: { delta: number }) => {
    if (delta === 0) {
      return (
        <span className="flex items-center gap-0.5 text-muted-foreground">
          <Minus className="h-3 w-3" />
          <span>0</span>
        </span>
      );
    }
    const Icon = delta > 0 ? TrendingUp : TrendingDown;
    const colorClass = delta > 0 
      ? 'text-emerald-600 dark:text-emerald-400' 
      : 'text-red-600 dark:text-red-400';
    return (
      <span className={cn('flex items-center gap-0.5', colorClass)}>
        <Icon className="h-3 w-3" />
        <span>{delta > 0 ? '+' : ''}{delta}</span>
      </span>
    );
  };

  return (
    <Card className={cn('card-elevated', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              Account Distribution
            </CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  Shows account counts per rep before and after assignment.
                  Gray bars show original counts, colored bars show proposed.
                  Hover for parent/child breakdown.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        
        {/* Summary stats with deltas */}
        <div className="flex items-center gap-4 text-xs mt-2 py-2 px-3 bg-muted/30 rounded-md">
          <div className="flex items-center gap-1">
            <span className="font-semibold">{stats.after.total.toLocaleString()}</span>
            <span className="text-muted-foreground">accounts</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded bg-emerald-500" />
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {stats.after.customers}
            </span>
            <span className="text-muted-foreground">customers</span>
            <DeltaIndicator delta={customerDelta} />
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded bg-blue-500" />
            <span className="text-blue-600 dark:text-blue-400 font-medium">
              {stats.after.prospects}
            </span>
            <span className="text-muted-foreground">prospects</span>
            <DeltaIndicator delta={prospectDelta} />
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-4 text-xs mt-2 py-1.5 px-3 bg-muted/20 rounded-md border border-muted">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded bg-gray-400/50 border border-gray-400" />
            <span className="text-muted-foreground">Original</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-500" />
            <span className="text-muted-foreground">Customers</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-muted-foreground">Prospects</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-2">
        {sortedData.length > 0 ? (
          <div className="h-[350px] overflow-y-auto space-y-1">
            {sortedData.map((rep) => {
              const beforeTotal = rep.beforeCustomers + rep.beforeProspects;
              const afterTotal = rep.afterCustomers + rep.afterProspects;
              const beforeWidth = maxValue > 0 ? (beforeTotal / maxValue) * 100 : 0;
              const afterCustomerWidth = maxValue > 0 ? (rep.afterCustomers / maxValue) * 100 : 0;
              const afterProspectWidth = maxValue > 0 ? (rep.afterProspects / maxValue) * 100 : 0;
              
              return (
                <Tooltip key={rep.repId}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 group cursor-pointer py-0.5">
                      {/* Rep initials */}
                      <div className="w-8 text-xs font-medium text-right text-muted-foreground group-hover:text-foreground">
                        {formatRepName(rep.repName)}
                      </div>
                      
                      {/* Bar container */}
                      <div className="flex-1 bg-muted rounded-full h-5 relative overflow-hidden">
                        {/* Ghost bar (before total) */}
                        <div
                          className="absolute top-0.5 h-4 rounded-full bg-gray-400/40 border border-gray-400/60"
                          style={{ width: `${beforeWidth}%`, left: 0 }}
                        />
                        
                        {/* Customer bar (after) */}
                        <div
                          className="absolute top-0.5 h-4 rounded-l-full bg-emerald-500 group-hover:opacity-80"
                          style={{ width: `${afterCustomerWidth}%`, left: 0 }}
                        />
                        
                        {/* Prospect bar (after) */}
                        <div
                          className="absolute top-0.5 h-4 rounded-r-full bg-blue-500 group-hover:opacity-80"
                          style={{ 
                            width: `${afterProspectWidth}%`, 
                            left: `${afterCustomerWidth}%` 
                          }}
                        />
                      </div>
                      
                      {/* Value */}
                      <div className="w-10 text-xs font-medium text-right">
                        {afterTotal}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs z-50">
                    <div className="text-sm">
                      <div className="font-medium">{rep.repName}</div>
                      <div className="text-muted-foreground text-xs mb-2">{rep.region}</div>
                      
                      {/* Before */}
                      <div className="space-y-1 pb-2 border-b">
                        <div className="font-medium text-xs text-muted-foreground">BEFORE</div>
                        <div className="flex justify-between">
                          <span>Customers:</span>
                          <span className="font-medium">{rep.beforeCustomers}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground text-xs">
                          <span className="pl-2">└ Parents: {rep.beforeParentCustomers}</span>
                          <span>Children: {rep.beforeChildCustomers}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Prospects:</span>
                          <span className="font-medium">{rep.beforeProspects}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground text-xs">
                          <span className="pl-2">└ Parents: {rep.beforeParentProspects}</span>
                          <span>Children: {rep.beforeChildProspects}</span>
                        </div>
                      </div>
                      
                      {/* After */}
                      <div className="space-y-1 pt-2">
                        <div className="font-medium text-xs text-muted-foreground">AFTER</div>
                        <div className="flex justify-between">
                          <span className="text-emerald-600">Customers:</span>
                          <span className="font-medium text-emerald-600">{rep.afterCustomers}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground text-xs">
                          <span className="pl-2">└ Parents: {rep.afterParentCustomers}</span>
                          <span>Children: {rep.afterChildCustomers}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">Prospects:</span>
                          <span className="font-medium text-blue-600">{rep.afterProspects}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground text-xs">
                          <span className="pl-2">└ Parents: {rep.afterParentProspects}</span>
                          <span>Children: {rep.afterChildProspects}</span>
                        </div>
                      </div>
                      
                      {/* Change summary */}
                      {(beforeTotal !== afterTotal) && (
                        <div className={cn(
                          'text-xs pt-2 mt-2 border-t font-medium',
                          afterTotal > beforeTotal ? 'text-emerald-600' : 'text-red-600'
                        )}>
                          Net change: {afterTotal > beforeTotal ? '+' : ''}{afterTotal - beforeTotal} accounts
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            No account data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BeforeAfterAccountChart;

