import React from 'react';
import { 
  formatCurrencyCompact, 
  RepBookMetrics, 
  calculateMetricsDelta,
  calculateGeoMatchScore 
} from '@/_domain';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowDown, 
  ArrowUp, 
  Users, 
  DollarSign, 
  RefreshCcw, 
  TrendingUp,
  AlertTriangle,
  MapPin,
  Check,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Rep info for display
 */
interface RepInfo {
  id: string;
  name: string;
  region?: string | null;
}

interface ReassignmentImpactPanelProps {
  /** Rep losing the account(s) */
  losingRep: RepInfo | null;
  /** Rep gaining the account(s) */
  gainingRep: RepInfo;
  /** Current metrics for losing rep (before move) */
  losingRepMetrics: RepBookMetrics | null;
  /** Current metrics for gaining rep (before move) */
  gainingRepMetrics: RepBookMetrics | null;
  /** Projected metrics for losing rep (after move) */
  losingRepProjected: RepBookMetrics | null;
  /** Projected metrics for gaining rep (after move) */
  gainingRepProjected: RepBookMetrics | null;
  /** Account territory being moved (for geo alignment check) */
  accountTerritory?: string | null;
  /** Total accounts being affected (for header) */
  accountsAffectedCount: number;
  /** Is data still loading? */
  isLoading?: boolean;
}

/**
 * Format percentage with sign
 */
function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(0)}%`;
}

/**
 * Metric row component showing before → after with delta
 */
function MetricRow({
  label,
  icon: Icon,
  before,
  after,
  formatFn = (v: number) => v.toLocaleString(),
  isLosingRep = false,
}: {
  label: string;
  icon: React.ElementType;
  before: number;
  after: number;
  formatFn?: (value: number) => string;
  isLosingRep?: boolean;
}) {
  const { absolute, percent } = calculateMetricsDelta(before, after);
  const isDecrease = absolute < 0;
  const isIncrease = absolute > 0;
  
  // For losing rep, decrease is expected (neutral/red)
  // For gaining rep, increase is expected (green)
  const deltaColorClass = isLosingRep
    ? isDecrease ? 'text-red-600' : 'text-muted-foreground'
    : isIncrease ? 'text-green-600' : 'text-muted-foreground';

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{formatFn(before)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium">{formatFn(after)}</span>
        {absolute !== 0 && (
          <span className={cn('flex items-center gap-0.5 text-xs', deltaColorClass)}>
            {isDecrease ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
            {formatPercent(percent)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Tier breakdown display
 */
function TierBreakdown({ 
  breakdown, 
  className 
}: { 
  breakdown: RepBookMetrics['tierBreakdown'];
  className?: string;
}) {
  const tiers = [
    { key: 'tier1', label: 'T1', value: breakdown.tier1 },
    { key: 'tier2', label: 'T2', value: breakdown.tier2 },
    { key: 'tier3', label: 'T3', value: breakdown.tier3 },
    { key: 'tier4', label: 'T4', value: breakdown.tier4 },
  ];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {tiers.map(tier => (
        <div key={tier.key} className="text-xs">
          <span className="text-muted-foreground">{tier.label}:</span>
          <span className="font-medium ml-0.5">{tier.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Rep card component (one side of the comparison)
 */
function RepCard({
  rep,
  label,
  currentMetrics,
  projectedMetrics,
  isLosingRep,
  accountTerritory,
  isLoading = false,
}: {
  rep: RepInfo;
  label: string;
  currentMetrics: RepBookMetrics | null;
  projectedMetrics: RepBookMetrics | null;
  isLosingRep: boolean;
  accountTerritory?: string | null;
  isLoading?: boolean;
}) {
  // Geo alignment check
  const geoScore = accountTerritory && rep.region 
    ? calculateGeoMatchScore(accountTerritory, rep.region)
    : null;
  const isGeoMatch = geoScore !== null && geoScore >= 0.65; // Same parent or better

  const borderColor = isLosingRep ? 'border-red-200' : 'border-green-200';
  const bgColor = isLosingRep ? 'bg-red-50/50' : 'bg-green-50/50';
  const headerColor = isLosingRep ? 'text-red-700' : 'text-green-700';
  const headerBg = isLosingRep ? 'bg-red-100' : 'bg-green-100';

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border p-4', borderColor, bgColor)}>
        <Skeleton className="h-5 w-32 mb-3" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!currentMetrics || !projectedMetrics) {
    return (
      <div className={cn('rounded-lg border p-4', borderColor, bgColor)}>
        <div className={cn('text-xs font-medium px-2 py-1 rounded mb-2 inline-block', headerBg, headerColor)}>
          {label}
        </div>
        <p className="font-medium">{rep.name}</p>
        <p className="text-sm text-muted-foreground mt-2">No data available</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border', borderColor, bgColor)}>
      {/* Header */}
      <div className={cn('px-4 py-2 border-b', borderColor)}>
        <div className="flex items-center justify-between">
          <div>
            <div className={cn('text-xs font-medium px-2 py-0.5 rounded inline-block mb-1', headerBg, headerColor)}>
              {label}
            </div>
            <p className="font-medium">{rep.name}</p>
          </div>
          {geoScore !== null && (
            <div className="flex items-center gap-1 text-xs">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              {isGeoMatch ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <X className="h-3.5 w-3.5 text-red-500" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="p-4 space-y-0.5">
        <MetricRow
          label="Accounts"
          icon={Users}
          before={currentMetrics.accountCount}
          after={projectedMetrics.accountCount}
          isLosingRep={isLosingRep}
        />
        <MetricRow
          label="ARR"
          icon={DollarSign}
          before={currentMetrics.totalARR}
          after={projectedMetrics.totalARR}
          formatFn={formatCurrencyCompact}
          isLosingRep={isLosingRep}
        />
        <MetricRow
          label="ATR"
          icon={RefreshCcw}
          before={currentMetrics.totalATR}
          after={projectedMetrics.totalATR}
          formatFn={formatCurrencyCompact}
          isLosingRep={isLosingRep}
        />
        <MetricRow
          label="Pipeline"
          icon={TrendingUp}
          before={currentMetrics.totalPipeline}
          after={projectedMetrics.totalPipeline}
          formatFn={formatCurrencyCompact}
          isLosingRep={isLosingRep}
        />
      </div>

      {/* Footer - Tiers & CRE */}
      <div className={cn('px-4 py-2 border-t flex items-center justify-between', borderColor)}>
        <TierBreakdown breakdown={projectedMetrics.tierBreakdown} />
        {projectedMetrics.creRiskCount > 0 && (
          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {projectedMetrics.creRiskCount} CRE
          </Badge>
        )}
      </div>
    </div>
  );
}

/**
 * ReassignmentImpactPanel
 * 
 * Shows comprehensive before/after metrics for both the losing and gaining rep
 * when manually reassigning accounts. Displays side-by-side comparison with
 * visual indicators for increases (green) and decreases (red).
 * 
 * @see MASTER_LOGIC.mdc §13.7
 */
export function ReassignmentImpactPanel({
  losingRep,
  gainingRep,
  losingRepMetrics,
  gainingRepMetrics,
  losingRepProjected,
  gainingRepProjected,
  accountTerritory,
  accountsAffectedCount,
  isLoading = false,
}: ReassignmentImpactPanelProps) {
  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">Impact Preview</h4>
        <Badge variant="secondary" className="text-xs">
          {accountsAffectedCount} account{accountsAffectedCount !== 1 ? 's' : ''} affected
        </Badge>
      </div>

      {/* Side-by-side cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Losing Rep */}
        {losingRep ? (
          <RepCard
            rep={losingRep}
            label="Current Owner"
            currentMetrics={losingRepMetrics}
            projectedMetrics={losingRepProjected}
            isLosingRep={true}
            accountTerritory={accountTerritory}
            isLoading={isLoading}
          />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
            <div className="text-xs font-medium px-2 py-0.5 rounded inline-block mb-1 bg-gray-100 text-gray-700">
              Current Owner
            </div>
            <p className="font-medium text-muted-foreground">Previously Unassigned</p>
            <p className="text-sm text-muted-foreground mt-2">
              This account was not assigned to any rep.
            </p>
          </div>
        )}

        {/* Gaining Rep */}
        <RepCard
          rep={gainingRep}
          label="New Owner"
          currentMetrics={gainingRepMetrics}
          projectedMetrics={gainingRepProjected}
          isLosingRep={false}
          accountTerritory={accountTerritory}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

export default ReassignmentImpactPanel;

