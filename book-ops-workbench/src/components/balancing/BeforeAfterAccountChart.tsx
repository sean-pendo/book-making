import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Users, TrendingUp, TrendingDown, Minus, Layers, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AccountSubMode } from '@/types/analytics';

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
  // Strategic rep flag for distinct chart coloring
  isStrategicRep?: boolean;
  
  // Tier before/after (Tier 1-4 from expansion_tier or initial_sale_tier)
  beforeTier1: number;
  beforeTier2: number;
  beforeTier3: number;
  beforeTier4: number;
  beforeTierNA: number;
  afterTier1: number;
  afterTier2: number;
  afterTier3: number;
  afterTier4: number;
  afterTierNA: number;
  
  // CRE Risk before/after (based on cre_count thresholds from @/_domain)
  beforeCreNone: number;
  beforeCreLow: number;
  beforeCreMedium: number;
  beforeCreHigh: number;
  afterCreNone: number;
  afterCreLow: number;
  afterCreMedium: number;
  afterCreHigh: number;
}

// Strategic rep colors - two shades of purple for stacked bars (matches RepDistributionChart)
const STRATEGIC_REP_CUSTOMER_COLOR = '#7c3aed'; // Violet-600 (darker purple for customers)
const STRATEGIC_REP_PROSPECT_COLOR = '#c084fc'; // Purple-400 (lighter purple for prospects)

// Tier colors for tier distribution mode (matches RepDistributionChart)
const TIER_COLORS = {
  tier1: '#8b5cf6', // Violet-500 (highest priority)
  tier2: '#3b82f6', // Blue-500
  tier3: '#14b8a6', // Teal-500
  tier4: '#6b7280', // Gray-500
  tierNA: '#d1d5db', // Gray-300 (N/A - missing tier data)
};

// CRE Risk colors for CRE distribution mode (matches RepDistributionChart)
const CRE_COLORS = {
  none: '#22c55e',   // Green-500 (no risk)
  low: '#facc15',    // Yellow-400
  medium: '#f97316', // Orange-500
  high: '#ef4444',   // Red-500
};

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
  // Sub-mode for accounts: counts (customer/prospect), tiers (T1-4), or cre (risk levels)
  const [accountSubMode, setAccountSubMode] = useState<AccountSubMode>('counts');
  
  // Calculate summary stats for counts mode
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
  
  // Calculate tier stats
  const tierStats = useMemo(() => {
    const before = {
      tier1: data.reduce((sum, r) => sum + (r.beforeTier1 || 0), 0),
      tier2: data.reduce((sum, r) => sum + (r.beforeTier2 || 0), 0),
      tier3: data.reduce((sum, r) => sum + (r.beforeTier3 || 0), 0),
      tier4: data.reduce((sum, r) => sum + (r.beforeTier4 || 0), 0),
      tierNA: data.reduce((sum, r) => sum + (r.beforeTierNA || 0), 0),
    };
    const after = {
      tier1: data.reduce((sum, r) => sum + (r.afterTier1 || 0), 0),
      tier2: data.reduce((sum, r) => sum + (r.afterTier2 || 0), 0),
      tier3: data.reduce((sum, r) => sum + (r.afterTier3 || 0), 0),
      tier4: data.reduce((sum, r) => sum + (r.afterTier4 || 0), 0),
      tierNA: data.reduce((sum, r) => sum + (r.afterTierNA || 0), 0),
    };
    before.total = before.tier1 + before.tier2 + before.tier3 + before.tier4 + before.tierNA;
    after.total = after.tier1 + after.tier2 + after.tier3 + after.tier4 + after.tierNA;
    return { before: { ...before, total: before.tier1 + before.tier2 + before.tier3 + before.tier4 + before.tierNA }, 
             after: { ...after, total: after.tier1 + after.tier2 + after.tier3 + after.tier4 + after.tierNA } };
  }, [data]);
  
  // Calculate CRE stats
  const creStats = useMemo(() => {
    const before = {
      none: data.reduce((sum, r) => sum + (r.beforeCreNone || 0), 0),
      low: data.reduce((sum, r) => sum + (r.beforeCreLow || 0), 0),
      medium: data.reduce((sum, r) => sum + (r.beforeCreMedium || 0), 0),
      high: data.reduce((sum, r) => sum + (r.beforeCreHigh || 0), 0),
    };
    const after = {
      none: data.reduce((sum, r) => sum + (r.afterCreNone || 0), 0),
      low: data.reduce((sum, r) => sum + (r.afterCreLow || 0), 0),
      medium: data.reduce((sum, r) => sum + (r.afterCreMedium || 0), 0),
      high: data.reduce((sum, r) => sum + (r.afterCreHigh || 0), 0),
    };
    return { before: { ...before, total: before.none + before.low + before.medium + before.high },
             after: { ...after, total: after.none + after.low + after.medium + after.high } };
  }, [data]);

  // Sort by after total descending
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => 
      (b.afterCustomers + b.afterProspects) - (a.afterCustomers + a.afterProspects)
    );
  }, [data]);

  // Calculate max for scaling based on current sub-mode
  const maxValue = useMemo(() => {
    let allValues: number[];
    if (accountSubMode === 'counts') {
      allValues = data.flatMap(r => [
        r.beforeCustomers + r.beforeProspects,
        r.afterCustomers + r.afterProspects,
      ]);
    } else if (accountSubMode === 'tiers') {
      allValues = data.flatMap(r => [
        (r.beforeTier1 || 0) + (r.beforeTier2 || 0) + (r.beforeTier3 || 0) + (r.beforeTier4 || 0) + (r.beforeTierNA || 0),
        (r.afterTier1 || 0) + (r.afterTier2 || 0) + (r.afterTier3 || 0) + (r.afterTier4 || 0) + (r.afterTierNA || 0),
      ]);
    } else {
      allValues = data.flatMap(r => [
        (r.beforeCreNone || 0) + (r.beforeCreLow || 0) + (r.beforeCreMedium || 0) + (r.beforeCreHigh || 0),
        (r.afterCreNone || 0) + (r.afterCreLow || 0) + (r.afterCreMedium || 0) + (r.afterCreHigh || 0),
      ]);
    }
    return Math.max(...allValues, 1) * 1.1;
  }, [data, accountSubMode]);

  // Calculate deltas
  const customerDelta = stats.after.customers - stats.before.customers;
  const prospectDelta = stats.after.prospects - stats.before.prospects;

  // Check if any strategic reps exist
  const hasStrategicReps = useMemo(() => 
    sortedData.some(r => r.isStrategicRep), 
  [sortedData]);

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
                  Hover for detailed breakdown.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        
        {/* Sub-mode toggle */}
        <div className="flex items-center gap-1 mt-2">
          <Button
            variant={accountSubMode === 'counts' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setAccountSubMode('counts')}
          >
            <Users className="h-3 w-3 mr-1" />
            Counts
          </Button>
          <Button
            variant={accountSubMode === 'tiers' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setAccountSubMode('tiers')}
          >
            <Layers className="h-3 w-3 mr-1" />
            Tiers
          </Button>
          <Button
            variant={accountSubMode === 'cre' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setAccountSubMode('cre')}
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            CRE
          </Button>
        </div>
        
        {/* Summary stats with deltas - counts mode */}
        {accountSubMode === 'counts' && (
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
        )}
        
        {/* Summary stats - tiers mode */}
        {accountSubMode === 'tiers' && (
          <div className="flex items-center gap-2 text-xs mt-2 py-2 px-3 bg-muted/30 rounded-md flex-wrap">
            <span className="font-semibold">{tierStats.after.total.toLocaleString()}</span>
            <span className="text-muted-foreground">accounts</span>
            <div className="h-3 w-px bg-border" />
            <span className="w-2 h-2 rounded" style={{ backgroundColor: TIER_COLORS.tier1 }} />
            <span className="font-medium" style={{ color: TIER_COLORS.tier1 }}>{tierStats.after.tier1}</span>
            <span className="text-muted-foreground">T1</span>
            <DeltaIndicator delta={tierStats.after.tier1 - tierStats.before.tier1} />
            <span className="w-2 h-2 rounded" style={{ backgroundColor: TIER_COLORS.tier2 }} />
            <span className="font-medium" style={{ color: TIER_COLORS.tier2 }}>{tierStats.after.tier2}</span>
            <span className="text-muted-foreground">T2</span>
            <span className="w-2 h-2 rounded" style={{ backgroundColor: TIER_COLORS.tier3 }} />
            <span className="font-medium" style={{ color: TIER_COLORS.tier3 }}>{tierStats.after.tier3}</span>
            <span className="text-muted-foreground">T3</span>
            <span className="w-2 h-2 rounded" style={{ backgroundColor: TIER_COLORS.tier4 }} />
            <span className="text-muted-foreground">{tierStats.after.tier4}</span>
            <span className="text-muted-foreground">T4</span>
            {tierStats.after.tierNA > 0 && (
              <>
                <span className="w-2 h-2 rounded" style={{ backgroundColor: TIER_COLORS.tierNA }} />
                <span className="text-muted-foreground">{tierStats.after.tierNA}</span>
                <span className="text-muted-foreground">N/A</span>
              </>
            )}
          </div>
        )}
        
        {/* Summary stats - CRE mode */}
        {accountSubMode === 'cre' && (
          <div className="flex items-center gap-2 text-xs mt-2 py-2 px-3 bg-muted/30 rounded-md flex-wrap">
            <span className="font-semibold">{creStats.after.total.toLocaleString()}</span>
            <span className="text-muted-foreground">accounts</span>
            <div className="h-3 w-px bg-border" />
            <span className="w-2 h-2 rounded" style={{ backgroundColor: CRE_COLORS.none }} />
            <span className="font-medium" style={{ color: CRE_COLORS.none }}>{creStats.after.none}</span>
            <span className="text-muted-foreground">No Risk</span>
            <span className="w-2 h-2 rounded" style={{ backgroundColor: CRE_COLORS.low }} />
            <span className="font-medium" style={{ color: CRE_COLORS.low }}>{creStats.after.low}</span>
            <span className="text-muted-foreground">Low</span>
            <span className="w-2 h-2 rounded" style={{ backgroundColor: CRE_COLORS.medium }} />
            <span className="font-medium" style={{ color: CRE_COLORS.medium }}>{creStats.after.medium}</span>
            <span className="text-muted-foreground">Med</span>
            <span className="w-2 h-2 rounded" style={{ backgroundColor: CRE_COLORS.high }} />
            <span className="font-medium" style={{ color: CRE_COLORS.high }}>{creStats.after.high}</span>
            <span className="text-muted-foreground">High</span>
            <DeltaIndicator delta={creStats.after.high - creStats.before.high} />
          </div>
        )}
        
        {/* Legend - counts mode */}
        {accountSubMode === 'counts' && (
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
            {hasStrategicReps && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-purple-500" />
                <span className="text-purple-600 dark:text-purple-400">Strategic</span>
              </div>
            )}
          </div>
        )}
        
        {/* Legend - tiers mode */}
        {accountSubMode === 'tiers' && (
          <div className="flex items-center gap-3 text-xs mt-2 py-1.5 px-3 bg-muted/20 rounded-md border border-muted">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded bg-gray-400/50 border border-gray-400" />
              <span className="text-muted-foreground">Original</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: TIER_COLORS.tier1 }} />
              <span className="text-muted-foreground">T1</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: TIER_COLORS.tier2 }} />
              <span className="text-muted-foreground">T2</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: TIER_COLORS.tier3 }} />
              <span className="text-muted-foreground">T3</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: TIER_COLORS.tier4 }} />
              <span className="text-muted-foreground">T4</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: TIER_COLORS.tierNA }} />
              <span className="text-muted-foreground">N/A</span>
            </div>
          </div>
        )}
        
        {/* Legend - CRE mode */}
        {accountSubMode === 'cre' && (
          <div className="flex items-center gap-3 text-xs mt-2 py-1.5 px-3 bg-muted/20 rounded-md border border-muted">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded bg-gray-400/50 border border-gray-400" />
              <span className="text-muted-foreground">Original</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: CRE_COLORS.none }} />
              <span className="text-muted-foreground">No Risk</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: CRE_COLORS.low }} />
              <span className="text-muted-foreground">Low</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: CRE_COLORS.medium }} />
              <span className="text-muted-foreground">Med</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: CRE_COLORS.high }} />
              <span className="text-muted-foreground">High</span>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="pt-2">
        {sortedData.length > 0 ? (
          <div className="h-[350px] overflow-y-auto space-y-1">
            {sortedData.map((rep) => {
              const isStrategic = rep.isStrategicRep ?? false;
              
              // Calculate values based on sub-mode
              let beforeTotal: number;
              let afterTotal: number;
              let beforeWidth: number;
              let segments: { width: number; color: string; left: number }[] = [];
              
              if (accountSubMode === 'counts') {
                beforeTotal = rep.beforeCustomers + rep.beforeProspects;
                afterTotal = rep.afterCustomers + rep.afterProspects;
                beforeWidth = maxValue > 0 ? (beforeTotal / maxValue) * 100 : 0;
                const customerWidth = maxValue > 0 ? (rep.afterCustomers / maxValue) * 100 : 0;
                const prospectWidth = maxValue > 0 ? (rep.afterProspects / maxValue) * 100 : 0;
                const customerColor = isStrategic ? STRATEGIC_REP_CUSTOMER_COLOR : '#22c55e';
                const prospectColor = isStrategic ? STRATEGIC_REP_PROSPECT_COLOR : '#3b82f6';
                segments = [
                  { width: customerWidth, color: customerColor, left: 0 },
                  { width: prospectWidth, color: prospectColor, left: customerWidth },
                ];
              } else if (accountSubMode === 'tiers') {
                beforeTotal = (rep.beforeTier1 || 0) + (rep.beforeTier2 || 0) + (rep.beforeTier3 || 0) + (rep.beforeTier4 || 0) + (rep.beforeTierNA || 0);
                afterTotal = (rep.afterTier1 || 0) + (rep.afterTier2 || 0) + (rep.afterTier3 || 0) + (rep.afterTier4 || 0) + (rep.afterTierNA || 0);
                beforeWidth = maxValue > 0 ? (beforeTotal / maxValue) * 100 : 0;
                const t1Width = maxValue > 0 ? ((rep.afterTier1 || 0) / maxValue) * 100 : 0;
                const t2Width = maxValue > 0 ? ((rep.afterTier2 || 0) / maxValue) * 100 : 0;
                const t3Width = maxValue > 0 ? ((rep.afterTier3 || 0) / maxValue) * 100 : 0;
                const t4Width = maxValue > 0 ? ((rep.afterTier4 || 0) / maxValue) * 100 : 0;
                const naWidth = maxValue > 0 ? ((rep.afterTierNA || 0) / maxValue) * 100 : 0;
                let left = 0;
                segments = [
                  { width: t1Width, color: TIER_COLORS.tier1, left: (left, left += t1Width, left - t1Width) },
                  { width: t2Width, color: TIER_COLORS.tier2, left: (left - t1Width + t1Width) },
                  { width: t3Width, color: TIER_COLORS.tier3, left: t1Width + t2Width },
                  { width: t4Width, color: TIER_COLORS.tier4, left: t1Width + t2Width + t3Width },
                  { width: naWidth, color: TIER_COLORS.tierNA, left: t1Width + t2Width + t3Width + t4Width },
                ].filter(s => s.width > 0);
              } else {
                beforeTotal = (rep.beforeCreNone || 0) + (rep.beforeCreLow || 0) + (rep.beforeCreMedium || 0) + (rep.beforeCreHigh || 0);
                afterTotal = (rep.afterCreNone || 0) + (rep.afterCreLow || 0) + (rep.afterCreMedium || 0) + (rep.afterCreHigh || 0);
                beforeWidth = maxValue > 0 ? (beforeTotal / maxValue) * 100 : 0;
                const noneWidth = maxValue > 0 ? ((rep.afterCreNone || 0) / maxValue) * 100 : 0;
                const lowWidth = maxValue > 0 ? ((rep.afterCreLow || 0) / maxValue) * 100 : 0;
                const medWidth = maxValue > 0 ? ((rep.afterCreMedium || 0) / maxValue) * 100 : 0;
                const highWidth = maxValue > 0 ? ((rep.afterCreHigh || 0) / maxValue) * 100 : 0;
                segments = [
                  { width: noneWidth, color: CRE_COLORS.none, left: 0 },
                  { width: lowWidth, color: CRE_COLORS.low, left: noneWidth },
                  { width: medWidth, color: CRE_COLORS.medium, left: noneWidth + lowWidth },
                  { width: highWidth, color: CRE_COLORS.high, left: noneWidth + lowWidth + medWidth },
                ].filter(s => s.width > 0);
              }
              
              return (
                <Tooltip key={rep.repId}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 group cursor-pointer py-0.5">
                      {/* Rep initials */}
                      <div className={cn(
                        "w-8 text-xs font-medium text-right group-hover:text-foreground",
                        isStrategic ? "text-purple-500" : "text-muted-foreground"
                      )}>
                        {formatRepName(rep.repName)}
                      </div>
                      
                      {/* Bar container */}
                      <div className="flex-1 bg-muted rounded-full h-5 relative overflow-hidden">
                        {/* Ghost bar (before total) */}
                        <div
                          className="absolute top-0.5 h-4 rounded-full bg-gray-400/40 border border-gray-400/60"
                          style={{ width: `${beforeWidth}%`, left: 0 }}
                        />
                        
                        {/* Stacked segments (after) */}
                        {segments.map((seg, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "absolute top-0.5 h-4 group-hover:opacity-80",
                              idx === 0 && "rounded-l-full",
                              idx === segments.length - 1 && "rounded-r-full"
                            )}
                            style={{ 
                              width: `${seg.width}%`, 
                              left: `${seg.left}%`,
                              backgroundColor: seg.color
                            }}
                          />
                        ))}
                      </div>
                      
                      {/* Value */}
                      <div className="w-10 text-xs font-medium text-right">
                        {afterTotal}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="top" 
                    className={cn(
                      "max-w-xs",
                      isStrategic && "bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800"
                    )}
                  >
                    <div className="text-sm">
                      <div className="flex items-center gap-2">
                        {isStrategic && <Users className="h-4 w-4 text-purple-500" />}
                        <span className={cn("font-medium", isStrategic && "text-purple-600 dark:text-purple-400")}>
                          {rep.repName}
                        </span>
                      </div>
                      <div className="text-muted-foreground text-xs mb-2">{rep.region}</div>
                      {isStrategic && (
                        <div className="text-xs text-purple-500 mb-2">
                          Strategic Rep - balanced separately
                        </div>
                      )}
                      
                      {/* Counts mode tooltip */}
                      {accountSubMode === 'counts' && (
                        <>
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
                        </>
                      )}
                      
                      {/* Tiers mode tooltip */}
                      {accountSubMode === 'tiers' && (
                        <>
                          <div className="space-y-1 pb-2 border-b">
                            <div className="font-medium text-xs text-muted-foreground">BEFORE</div>
                            <div className="flex justify-between"><span style={{ color: TIER_COLORS.tier1 }}>Tier 1:</span><span className="font-medium">{rep.beforeTier1 || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: TIER_COLORS.tier2 }}>Tier 2:</span><span className="font-medium">{rep.beforeTier2 || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: TIER_COLORS.tier3 }}>Tier 3:</span><span className="font-medium">{rep.beforeTier3 || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: TIER_COLORS.tier4 }}>Tier 4:</span><span className="font-medium">{rep.beforeTier4 || 0}</span></div>
                            {(rep.beforeTierNA || 0) > 0 && <div className="flex justify-between text-muted-foreground"><span>N/A:</span><span className="font-medium">{rep.beforeTierNA || 0}</span></div>}
                          </div>
                          <div className="space-y-1 pt-2">
                            <div className="font-medium text-xs text-muted-foreground">AFTER</div>
                            <div className="flex justify-between"><span style={{ color: TIER_COLORS.tier1 }}>Tier 1:</span><span className="font-medium">{rep.afterTier1 || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: TIER_COLORS.tier2 }}>Tier 2:</span><span className="font-medium">{rep.afterTier2 || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: TIER_COLORS.tier3 }}>Tier 3:</span><span className="font-medium">{rep.afterTier3 || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: TIER_COLORS.tier4 }}>Tier 4:</span><span className="font-medium">{rep.afterTier4 || 0}</span></div>
                            {(rep.afterTierNA || 0) > 0 && <div className="flex justify-between text-muted-foreground"><span>N/A:</span><span className="font-medium">{rep.afterTierNA || 0}</span></div>}
                          </div>
                        </>
                      )}
                      
                      {/* CRE mode tooltip */}
                      {accountSubMode === 'cre' && (
                        <>
                          <div className="space-y-1 pb-2 border-b">
                            <div className="font-medium text-xs text-muted-foreground">BEFORE</div>
                            <div className="flex justify-between"><span style={{ color: CRE_COLORS.none }}>No Risk:</span><span className="font-medium">{rep.beforeCreNone || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: CRE_COLORS.low }}>Low:</span><span className="font-medium">{rep.beforeCreLow || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: CRE_COLORS.medium }}>Medium:</span><span className="font-medium">{rep.beforeCreMedium || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: CRE_COLORS.high }}>High:</span><span className="font-medium">{rep.beforeCreHigh || 0}</span></div>
                          </div>
                          <div className="space-y-1 pt-2">
                            <div className="font-medium text-xs text-muted-foreground">AFTER</div>
                            <div className="flex justify-between"><span style={{ color: CRE_COLORS.none }}>No Risk:</span><span className="font-medium">{rep.afterCreNone || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: CRE_COLORS.low }}>Low:</span><span className="font-medium">{rep.afterCreLow || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: CRE_COLORS.medium }}>Medium:</span><span className="font-medium">{rep.afterCreMedium || 0}</span></div>
                            <div className="flex justify-between"><span style={{ color: CRE_COLORS.high }}>High:</span><span className="font-medium">{rep.afterCreHigh || 0}</span></div>
                          </div>
                        </>
                      )}
                      
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

