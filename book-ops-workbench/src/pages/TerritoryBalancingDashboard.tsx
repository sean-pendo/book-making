import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Lock, ArrowLeft, AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// Hooks
import { useEnhancedBalancing } from '@/hooks/useEnhancedBalancing';
import { useAnalyticsMetrics, useInvalidateBuildData, useBuildDataSummary } from '@/hooks/useBuildData';

// Balancing components
import {
  AssignmentStatusHeader,
  BalancingKPIRow,
  BalancingSuccessMetrics,
  GainsLossesChart,
  BeforeAfterTab,
} from '@/components/balancing';
import { RepDistributionChart, type ThresholdConfig } from '@/components/analytics/RepDistributionChart';
import { SalesRepsTable } from '@/components/data-tables/SalesRepsTable';

import type { RepDistributionData } from '@/types/analytics';

interface TerritoryBalancingDashboardProps {
  buildId?: string;
}

type BalancingTab = 'overview' | 'before-after' | 'table';

/**
 * Book Balancing Dashboard
 * 
 * Redesigned with 3-tab structure:
 * - Overview: KPIs, success metrics, distribution charts, gains/losses analysis
 * - Before/After: Placeholder for comparison view
 * - Table: Embedded SalesRepsTable for editing and live sync
 */
export const TerritoryBalancingDashboard = ({ buildId }: TerritoryBalancingDashboardProps = {}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidateBuildData = useInvalidateBuildData();
  
  // State
  const [activeTab, setActiveTab] = useState<BalancingTab>('overview');
  const [thresholds, setThresholds] = useState<any>(null);

  // Data hooks
  const { data, isLoading, error, refetch } = useEnhancedBalancing(buildId);
  const { data: analyticsMetrics, isLoading: analyticsLoading } = useAnalyticsMetrics(buildId);
  const { data: buildDataSummary } = useBuildDataSummary(buildId);

  // Fetch configuration thresholds
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
        setThresholds(config);
      }
    };
    
    fetchThresholds();
  }, [buildId]);

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    if (!buildId) return;
    
    try {
      await invalidateBuildData(buildId);
      await refetch();
      toast.success('Data refreshed successfully');
    } catch (err) {
      console.error('Error refreshing data:', err);
      toast.error('Failed to refresh data');
    }
  }, [buildId, invalidateBuildData, refetch]);

  // Calculate KPI data
  const kpiData = useMemo(() => {
    if (!data) return null;
    
    const parentCustomers = data.customerMetrics.totalAccounts;
    const parentProspects = data.prospectMetrics.totalAccounts;
    const childCustomers = buildDataSummary?.accounts.childCustomers || 0;
    const childProspects = buildDataSummary?.accounts.childProspects || 0;
    const activeReps = data.repMetrics.length;
    const totalParentAccounts = parentCustomers + parentProspects;
    const coveragePercent = totalParentAccounts > 0
      ? (data.assignedAccountsCount / totalParentAccounts) * 100
      : 0;
    
    return {
      parentCustomers,
      parentProspects,
      childCustomers,
      childProspects,
      activeReps,
      coveragePercent,
    };
  }, [data, buildDataSummary]);

  // Prepare distribution chart data
  const repDistributionData: RepDistributionData[] = useMemo(() => {
    if (!data?.repMetrics) return [];
    
    return data.repMetrics.map(rep => ({
      repId: rep.rep_id,
      repName: rep.name,
      region: rep.region || 'Unknown',
      arr: rep.customerARR,
      atr: rep.customerATR,
      pipeline: 0, // Not available in current data structure
      customerAccounts: rep.customerAccounts,
      prospectAccounts: rep.prospectAccounts,
      totalAccounts: rep.customerAccounts + rep.prospectAccounts,
    }));
  }, [data]);

  // Calculate gains/losses data
  const repChangesData = useMemo(() => {
    if (!data?.repMetrics || !data?.beforeMetrics) return [];
    
    const beforeMap = new Map(
      data.beforeMetrics?.repMetrics?.map((r: any) => [r.rep_id, r]) || []
    );
    
    return data.repMetrics.map(rep => {
      const before = beforeMap.get(rep.rep_id) || {
        customerARR: 0,
        customerATR: 0,
        customerAccounts: 0,
        prospectAccounts: 0,
      };
      
      return {
        repId: rep.rep_id,
        repName: rep.name,
        region: rep.region || 'Unknown',
        beforeARR: (before as any).customerARR || 0,
        beforeATR: (before as any).customerATR || 0,
        beforePipeline: 0,
        beforeCustomerCount: (before as any).customerAccounts || 0,
        beforeProspectCount: (before as any).prospectAccounts || 0,
        afterARR: rep.customerARR,
        afterATR: rep.customerATR,
        afterPipeline: 0,
        afterCustomerCount: rep.customerAccounts,
        afterProspectCount: rep.prospectAccounts,
      };
    });
  }, [data]);

  // Prepare threshold config for chart
  // - min/max: Target zone bounds (target ± variance) - green shaded area
  // - absoluteMin/absoluteMax: Hard limits - blue/red dotted lines
  const arrThresholds: ThresholdConfig | undefined = useMemo(() => {
    if (!thresholds) return undefined;
    
    const targetArr = thresholds.customer_target_arr;
    const variancePercent = thresholds.capacity_variance_percent || 10;
    
    return {
      // Target zone (green shaded area)
      min: targetArr ? targetArr * (1 - variancePercent / 100) : undefined,
      max: targetArr ? targetArr * (1 + variancePercent / 100) : undefined,
      target: targetArr,
      // Absolute limits (hard floor/ceiling lines)
      absoluteMin: thresholds.customer_min_arr,
      absoluteMax: thresholds.customer_max_arr,
    };
  }, [thresholds]);

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>Loading balancing data...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-red-900 dark:text-red-200">
            Error loading balancing data: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // No data state
  if (!data || data.assignedAccountsCount === 0) {
    return (
      <div className="p-6 space-y-6">
        <Card className="border-2 border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Lock className="h-12 w-12 text-amber-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                  Balancing Dashboard Locked
                </h2>
                <p className="text-amber-700 dark:text-amber-300 max-w-md">
                  No assignments have been applied yet. The Balancing Dashboard shows metrics 
                  based on assigned accounts — you need to generate and apply assignments first.
                </p>
              </div>
              
              <Alert className="max-w-lg text-left border-amber-200 bg-amber-100/50 dark:bg-amber-900/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-900 dark:text-amber-100">How to unlock</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  <ol className="list-decimal list-inside space-y-1 mt-2 text-sm">
                    <li>Go to the <strong>Assignments</strong> tab</li>
                    <li>Click <strong>Generate</strong> (Customers, Prospects, or All)</li>
                    <li>Review the proposals in the Preview dialog</li>
                    <li>Click <strong>Apply Assignments</strong> to save to database</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-3 pt-4">
                <Button 
                  onClick={() => navigate(`/build/${buildId}?tab=assignments`)}
                  variant="outline"
                  className="border-amber-500 text-amber-700 hover:bg-amber-100"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go to Assignments
                </Button>
                <Button onClick={handleRefresh} variant="ghost" size="sm">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tab button component with pink highlight - full width tabs
  const TabButton = ({ 
    tab, 
    label 
  }: { 
    tab: BalancingTab; 
    label: string;
  }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`
        flex-1 px-6 py-3 text-base font-medium rounded-lg transition-all
        ${activeTab === tab 
          ? 'bg-pink-500/20 text-pink-700 dark:text-pink-300 border-2 border-pink-500 shadow-sm' 
          : 'bg-muted hover:bg-muted/80 text-muted-foreground border-2 border-transparent hover:border-muted-foreground/20'
        }
      `}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Book Balancing</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Analyze distribution and optimize rep assignments
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Assignment Status Header (above tabs) */}
      {buildId && <AssignmentStatusHeader buildId={buildId} />}

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 w-full">
        <TabButton tab="overview" label="Overview" />
        <TabButton tab="before-after" label="Before vs After" />
        <TabButton tab="table" label="Sales Reps" />
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && kpiData && (
        <div className="space-y-6">
          {/* Row 1: KPI Cards */}
          <BalancingKPIRow
            parentCustomers={kpiData.parentCustomers}
            parentProspects={kpiData.parentProspects}
            childCustomers={kpiData.childCustomers}
            childProspects={kpiData.childProspects}
            activeReps={kpiData.activeReps}
            coveragePercent={kpiData.coveragePercent}
            isLoading={isLoading}
          />

          {/* Row 2: Success Metrics */}
          {buildId && (
            <BalancingSuccessMetrics
              buildId={buildId}
              continuityScore={data.retentionMetrics.ownerRetentionRate / 100}
              geoAlignment={analyticsMetrics?.geoAlignment || null}
              isLoading={analyticsLoading}
            />
          )}

          {/* Row 3: Distribution Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Financial Distribution (ARR/ATR/Pipeline) */}
            <RepDistributionChart
              data={repDistributionData}
              allowedMetrics={['arr', 'atr', 'pipeline']}
              showStats
              thresholds={arrThresholds}
              showThresholdLegend
              className="card-elevated"
            />

            {/* Right: Account Distribution (Customers/Prospects stacked) */}
            <RepDistributionChart
              data={repDistributionData}
              allowedMetrics={['accounts']}
              showStats
              className="card-elevated"
            />
          </div>

          {/* Row 4: Gains/Losses Chart */}
          <GainsLossesChart
            repChanges={repChangesData}
            isLoading={isLoading}
          />
        </div>
      )}

      {activeTab === 'before-after' && buildId && (
        <BeforeAfterTab buildId={buildId} />
      )}

      {activeTab === 'table' && buildId && (
        <div className="space-y-4">
          <SalesRepsTable buildId={buildId} onDataRefresh={handleRefresh} />
        </div>
      )}
    </div>
  );
};

export default TerritoryBalancingDashboard;
