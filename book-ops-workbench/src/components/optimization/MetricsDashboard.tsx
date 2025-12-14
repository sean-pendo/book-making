/**
 * Metrics Dashboard
 * 
 * Displays success metrics after LP solve.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart3, 
  Users, 
  MapPin, 
  Building2, 
  AlertTriangle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import type { LPMetrics } from '@/services/optimization/types';

interface MetricsDashboardProps {
  metrics: LPMetrics;
  className?: string;
}

function MetricCard({
  label,
  value,
  target,
  unit,
  icon: Icon,
  status
}: {
  label: string;
  value: number;
  target?: number;
  unit: string;
  icon: React.ElementType;
  status: 'good' | 'warning' | 'bad' | 'neutral';
}) {
  const statusColors = {
    good: 'text-green-500 bg-green-500/10',
    warning: 'text-yellow-500 bg-yellow-500/10',
    bad: 'text-red-500 bg-red-500/10',
    neutral: 'text-blue-500 bg-blue-500/10'
  };
  
  const formattedValue = unit === '%' 
    ? `${value.toFixed(1)}%` 
    : unit === 'ms' 
    ? `${value}ms`
    : unit === '$'
    ? `$${(value / 1000000).toFixed(2)}M`
    : value.toFixed(0);
  
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${statusColors[status]}`}>
      <Icon className="h-5 w-5" />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold">{formattedValue}</p>
      </div>
      {target !== undefined && (
        <Badge variant="outline" className="text-xs">
          Target: {target}{unit}
        </Badge>
      )}
    </div>
  );
}

function MetricSection({
  title,
  icon: Icon,
  children
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {title}
      </h4>
      <div className="grid gap-2">
        {children}
      </div>
    </div>
  );
}

export function MetricsDashboard({ metrics, className }: MetricsDashboardProps) {
  // Determine metric statuses
  const getVarianceStatus = (v: number) => v < 10 ? 'good' : v < 20 ? 'warning' : 'bad';
  const getContinuityStatus = (v: number) => v >= 75 ? 'good' : v >= 60 ? 'warning' : 'bad';
  const getGeoStatus = (v: number) => v >= 85 ? 'good' : v >= 70 ? 'warning' : 'bad';
  const getTierStatus = (v: number) => v >= 80 ? 'good' : v >= 60 ? 'warning' : 'bad';
  
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Optimization Metrics
        </CardTitle>
        <CardDescription>
          Performance metrics from the LP solve
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Balance Metrics */}
        <MetricSection title="Balance" icon={BarChart3}>
          <MetricCard
            label="ARR Variance (CV)"
            value={metrics.arr_variance_percent}
            target={10}
            unit="%"
            icon={BarChart3}
            status={getVarianceStatus(metrics.arr_variance_percent)}
          />
          {metrics.atr_variance_percent > 0 && (
            <MetricCard
              label="ATR Variance (CV)"
              value={metrics.atr_variance_percent}
              target={15}
              unit="%"
              icon={BarChart3}
              status={getVarianceStatus(metrics.atr_variance_percent)}
            />
          )}
          {metrics.pipeline_variance_percent > 0 && (
            <MetricCard
              label="Pipeline Variance (CV)"
              value={metrics.pipeline_variance_percent}
              target={15}
              unit="%"
              icon={BarChart3}
              status={getVarianceStatus(metrics.pipeline_variance_percent)}
            />
          )}
          <MetricCard
            label="Max Overload"
            value={metrics.max_overload_percent}
            target={115}
            unit="%"
            icon={AlertTriangle}
            status={metrics.max_overload_percent > 115 ? 'bad' : metrics.max_overload_percent > 100 ? 'warning' : 'good'}
          />
        </MetricSection>
        
        {/* Continuity Metrics */}
        <MetricSection title="Continuity" icon={Users}>
          <MetricCard
            label="Same Owner Rate"
            value={metrics.continuity_rate}
            target={75}
            unit="%"
            icon={Users}
            status={getContinuityStatus(metrics.continuity_rate)}
          />
          <MetricCard
            label="High-Value Continuity"
            value={metrics.high_value_continuity_rate}
            target={85}
            unit="%"
            icon={CheckCircle2}
            status={metrics.high_value_continuity_rate >= 85 ? 'good' : metrics.high_value_continuity_rate >= 70 ? 'warning' : 'bad'}
          />
          <MetricCard
            label="ARR Stayed"
            value={metrics.arr_stayed_percent}
            unit="%"
            icon={CheckCircle2}
            status="neutral"
          />
        </MetricSection>
        
        {/* Geography Metrics */}
        <MetricSection title="Geography" icon={MapPin}>
          <MetricCard
            label="Exact Geo Match"
            value={metrics.exact_geo_match_rate}
            unit="%"
            icon={CheckCircle2}
            status="neutral"
          />
          <MetricCard
            label="In-Region Match"
            value={metrics.sibling_geo_match_rate}
            target={85}
            unit="%"
            icon={MapPin}
            status={getGeoStatus(metrics.sibling_geo_match_rate)}
          />
          <MetricCard
            label="Cross-Region"
            value={metrics.cross_region_rate}
            unit="%"
            icon={AlertTriangle}
            status={metrics.cross_region_rate > 15 ? 'warning' : 'good'}
          />
        </MetricSection>
        
        {/* Team Alignment Metrics */}
        <MetricSection title="Team Alignment" icon={Building2}>
          <MetricCard
            label="Exact Tier Match"
            value={metrics.exact_tier_match_rate}
            target={80}
            unit="%"
            icon={Building2}
            status={getTierStatus(metrics.exact_tier_match_rate)}
          />
          <MetricCard
            label="One-Level Match"
            value={metrics.one_level_mismatch_rate}
            unit="%"
            icon={CheckCircle2}
            status="neutral"
          />
        </MetricSection>
        
        {/* Solver Info */}
        <MetricSection title="Solver" icon={Clock}>
          <MetricCard
            label="Solve Time"
            value={metrics.solve_time_ms}
            unit="ms"
            icon={Clock}
            status="neutral"
          />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Accounts</span>
            <span className="font-medium">{metrics.total_accounts}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Reps</span>
            <span className="font-medium">{metrics.total_reps}</span>
          </div>
          {metrics.reps_over_capacity > 0 && (
            <div className="flex items-center gap-2 text-yellow-500 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>{metrics.reps_over_capacity} reps over capacity</span>
            </div>
          )}
          {metrics.feasibility_slack_total > 0 && (
            <div className="flex items-center gap-2 text-orange-500 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Feasibility slack: ${(metrics.feasibility_slack_total / 1000000).toFixed(2)}M</span>
            </div>
          )}
        </MetricSection>
      </CardContent>
    </Card>
  );
}

