import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Layers, RefreshCw, AlertTriangle, BarChart3 } from 'lucide-react';
import { useMetricsComparison } from '@/hooks/useBuildData';
import { SuccessMetricTile } from './SuccessMetricTile';
import { BeforeAfterDistributionChart, type BeforeAfterRepData } from './BeforeAfterDistributionChart';
import { BeforeAfterAccountChart, type BeforeAfterAccountData } from './BeforeAfterAccountChart';
import type { ThresholdConfig } from '@/components/analytics/RepDistributionChart';
import { supabase } from '@/integrations/supabase/client';

interface BeforeAfterTabProps {
  buildId: string;
}

/**
 * Before vs After Tab
 * 
 * Shows comparison between original (owner_id) and proposed (new_owner_id) assignments:
 * - Row 1: Success metric tiles (Geo Alignment, Team Alignment, Continuity)
 * - Row 2: ARR/ATR/Pipeline distribution with before/after ghost bars
 * - Row 3: Account count distribution with before/after
 */
export const BeforeAfterTab: React.FC<BeforeAfterTabProps> = ({ buildId }) => {
  const { data: comparison, isLoading, error, refetch } = useMetricsComparison(buildId);
  const [thresholds, setThresholds] = useState<ThresholdConfig | undefined>(undefined);

  // Fetch thresholds from configuration
  useEffect(() => {
    const fetchThresholds = async () => {
      if (!buildId) return;
      
      const { data: config } = await supabase
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (config) {
        const targetArr = config.customer_target_arr;
        const variancePercent = config.capacity_variance_percent || 10;
        
        setThresholds({
          // Target zone (green shaded area)
          min: targetArr ? targetArr * (1 - variancePercent / 100) : undefined,
          max: targetArr ? targetArr * (1 + variancePercent / 100) : undefined,
          target: targetArr,
          // Absolute limits (hard floor/ceiling lines)
          absoluteMin: config.customer_min_arr,
          absoluteMax: config.customer_max_arr,
        });
      }
    };
    
    fetchThresholds();
  }, [buildId]);

  // Transform data for distribution chart
  const distributionData: BeforeAfterRepData[] = useMemo(() => {
    if (!comparison?.original?.repDistribution || !comparison?.proposed?.repDistribution) {
      return [];
    }

    const originalMap = new Map(
      comparison.original.repDistribution.map(r => [r.repId, r])
    );

    return comparison.proposed.repDistribution.map(afterRep => {
      const beforeRep = originalMap.get(afterRep.repId);
      
      return {
        repId: afterRep.repId,
        repName: afterRep.repName,
        region: afterRep.region,
        beforeArr: beforeRep?.arr || 0,
        afterArr: afterRep.arr,
        beforeAtr: beforeRep?.atr || 0,
        afterAtr: afterRep.atr,
        beforePipeline: beforeRep?.pipeline || 0,
        afterPipeline: afterRep.pipeline,
        isStrategicRep: afterRep.isStrategicRep,
      };
    });
  }, [comparison]);

  // Transform data for account chart
  const accountData: BeforeAfterAccountData[] = useMemo(() => {
    if (!comparison?.original?.repDistribution || !comparison?.proposed?.repDistribution) {
      return [];
    }

    const originalMap = new Map(
      comparison.original.repDistribution.map(r => [r.repId, r])
    );

    return comparison.proposed.repDistribution.map(afterRep => {
      const beforeRep = originalMap.get(afterRep.repId);
      
      return {
        repId: afterRep.repId,
        repName: afterRep.repName,
        region: afterRep.region,
        // Counts
        beforeCustomers: beforeRep?.customerAccounts || 0,
        beforeProspects: beforeRep?.prospectAccounts || 0,
        beforeParentCustomers: beforeRep?.parentCustomers || 0,
        beforeChildCustomers: beforeRep?.childCustomers || 0,
        beforeParentProspects: beforeRep?.parentProspects || 0,
        beforeChildProspects: beforeRep?.childProspects || 0,
        afterCustomers: afterRep.customerAccounts,
        afterProspects: afterRep.prospectAccounts,
        afterParentCustomers: afterRep.parentCustomers,
        afterChildCustomers: afterRep.childCustomers,
        afterParentProspects: afterRep.parentProspects,
        afterChildProspects: afterRep.childProspects,
        isStrategicRep: afterRep.isStrategicRep,
        // Tier breakdown
        beforeTier1: beforeRep?.tier1Accounts || 0,
        beforeTier2: beforeRep?.tier2Accounts || 0,
        beforeTier3: beforeRep?.tier3Accounts || 0,
        beforeTier4: beforeRep?.tier4Accounts || 0,
        beforeTierNA: beforeRep?.tierNAAccounts || 0,
        afterTier1: afterRep.tier1Accounts || 0,
        afterTier2: afterRep.tier2Accounts || 0,
        afterTier3: afterRep.tier3Accounts || 0,
        afterTier4: afterRep.tier4Accounts || 0,
        afterTierNA: afterRep.tierNAAccounts || 0,
        // CRE Risk breakdown
        beforeCreNone: beforeRep?.creNoneAccounts || 0,
        beforeCreLow: beforeRep?.creLowAccounts || 0,
        beforeCreMedium: beforeRep?.creMediumAccounts || 0,
        beforeCreHigh: beforeRep?.creHighAccounts || 0,
        afterCreNone: afterRep.creNoneAccounts || 0,
        afterCreLow: afterRep.creLowAccounts || 0,
        afterCreMedium: afterRep.creMediumAccounts || 0,
        afterCreHigh: afterRep.creHighAccounts || 0,
      };
    });
  }, [comparison]);

  // Check if team alignment data exists
  const hasTeamAlignmentData = useMemo(() => {
    if (!comparison?.proposed?.lpMetrics) return false;
    const score = comparison.proposed.lpMetrics.teamAlignmentScore;
    return score !== null && score !== undefined && score > 0;
  }, [comparison]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="card-elevated">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[350px]" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-900 dark:text-red-200">
          Error loading comparison data: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  // No proposed assignments state
  if (!comparison || !comparison.hasProposedAssignments) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-12 flex flex-col items-center justify-center min-h-[400px]">
          <div className="text-center space-y-3">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground">
              No Proposed Assignments Yet
            </h2>
            <p className="text-muted-foreground max-w-md">
              Generate assignments from the Assignment Engine to see a before/after comparison
              of metrics, distributions, and success scores.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { original, proposed } = comparison;

  return (
    <div className="space-y-6">
      {/* Row 1: Success Metric Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Geo Alignment */}
        <SuccessMetricTile
          label="Geo Alignment"
          icon={MapPin}
          iconBgColor="bg-emerald-500/20"
          iconColor="text-emerald-600 dark:text-emerald-400"
          beforeValue={original.geoAlignment.alignmentRate / 100}
          afterValue={proposed.geoAlignment.alignmentRate / 100}
          showBeforeAfter={true}
          tooltipTitle="Geographic Alignment"
          tooltipDescription="Percentage of accounts where the account geo/territory matches the assigned rep's region."
          tooltipExtra={
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span>Aligned:</span>
                <span className="text-emerald-500">{proposed.geoAlignment.aligned.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Misaligned:</span>
                <span className="text-red-500">{proposed.geoAlignment.misaligned.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Unassigned:</span>
                <span className="text-muted-foreground">{proposed.geoAlignment.unassigned.toLocaleString()}</span>
              </div>
            </div>
          }
        />

        {/* Team Alignment */}
        <SuccessMetricTile
          label="Team Alignment"
          icon={Layers}
          iconBgColor="bg-purple-500/20"
          iconColor="text-purple-600 dark:text-purple-400"
          beforeValue={hasTeamAlignmentData ? original.lpMetrics.teamAlignmentScore : null}
          afterValue={hasTeamAlignmentData ? proposed.lpMetrics.teamAlignmentScore : 0}
          showBeforeAfter={hasTeamAlignmentData}
          tooltipTitle="Team Tier Alignment"
          tooltipDescription="Account employee tier (SMB/Growth/MM/ENT) matches rep's team tier."
          isNA={!hasTeamAlignmentData}
        />

        {/* Continuity */}
        <SuccessMetricTile
          label="Continuity"
          icon={RefreshCw}
          iconBgColor="bg-amber-500/20"
          iconColor="text-amber-600 dark:text-amber-400"
          beforeValue={null}
          afterValue={proposed.lpMetrics.continuityScore}
          showBeforeAfter={false}
          tooltipTitle="Owner Continuity"
          tooltipDescription="Percentage of accounts that remain with their original owner after assignment. Higher continuity means less disruption."
        />
      </div>

      {/* Row 2: Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Financial Distribution (ARR/ATR/Pipeline) */}
        <BeforeAfterDistributionChart
          data={distributionData}
          thresholds={thresholds}
        />

        {/* Account Distribution */}
        <BeforeAfterAccountChart
          data={accountData}
        />
      </div>
    </div>
  );
};

export default BeforeAfterTab;

