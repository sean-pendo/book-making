import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AssignmentEngine } from './AssignmentEngine';
import TerritoryBalancingDashboard from './TerritoryBalancingDashboard';
import { AccountsTable } from '@/components/data-tables/AccountsTable';
import { OpportunitiesTable } from '@/components/data-tables/OpportunitiesTable';
import { SalesRepsTable } from '@/components/data-tables/SalesRepsTable';
import { useBuildDataSummary, useInvalidateBuildData, useAnalyticsMetrics, useLoadProgress } from '@/hooks/useBuildData';
import { formatCurrency } from '@/_domain';
import { InteractiveKPICard } from '@/components/InteractiveKPICard';
import { DataVisualizationCard } from '@/components/DataVisualizationCard';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { EnhancedLoader } from '@/components/EnhancedLoader';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { Database, Users, Target, AlertTriangle, CheckCircle, FileText, Cog, DollarSign, TrendingUp, Shield, Building2, Calendar, PieChart, RefreshCw, Upload, ChevronRight, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GlobalClashDetector } from './GlobalClashDetector';
import { SameBuildClashDetector } from '@/components/SameBuildClashDetector';
import { ComprehensiveReview } from './ComprehensiveReview';
import { DataImport } from './DataImport';
import { DataOverviewAnalytics } from '@/components/DataOverviewAnalytics';
import { TeamFitPieChart } from '@/components/analytics';
interface Build {
  id: string;
  name: string;
  description: string;
  status: string;
  version_tag: string;
  target_date: string;
  created_at: string;
}
export const BuildDetail = () => {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'import');
  
  // Track pending proposals from AssignmentEngine
  const [pendingProposals, setPendingProposals] = useState({ hasPending: false, count: 0 });
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingTabChange, setPendingTabChange] = useState<string | null>(null);
  
  // Track unlock animation state - two stages
  const [recentlyUnlocked, setRecentlyUnlocked] = useState<string[]>([]);
  const [stage1WasLocked, setStage1WasLocked] = useState(true); // Data import stage
  const [stage2WasLocked, setStage2WasLocked] = useState(true); // Assignments applied stage
  const hasTriggeredStage1Animation = React.useRef(false);
  const hasTriggeredStage2Animation = React.useRef(false);

  // Callback for AssignmentEngine to notify about pending proposals
  const handlePendingProposalsChange = useCallback((hasPending: boolean, count: number) => {
    setPendingProposals({ hasPending, count });
  }, []);

  // Sync tab state with URL query parameter
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  // Update URL when tab changes - with unsaved changes check
  const handleTabChange = (newTab: string) => {
    // Check if leaving assignments tab with pending proposals
    if (activeTab === 'assignments' && pendingProposals.hasPending && newTab !== 'assignments') {
      setPendingTabChange(newTab);
      setShowUnsavedDialog(true);
      return;
    }
    
    setActiveTab(newTab);
    // Clear the query param after navigation to keep URL clean
    if (searchParams.has('tab')) {
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  };

  // Handle confirmation to leave without saving
  const handleConfirmLeave = () => {
    if (pendingTabChange) {
      setActiveTab(pendingTabChange);
      setPendingTabChange(null);
    }
    setShowUnsavedDialog(false);
  };

  // Handle cancel - stay on assignments tab
  const handleCancelLeave = () => {
    setPendingTabChange(null);
    setShowUnsavedDialog(false);
  };

  // Fetch build details
  const {
    data: build,
    isLoading: buildLoading
  } = useQuery({
    queryKey: ['build', id],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from('builds').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Build;
    },
    enabled: !!id
  });

  // Use enhanced build data service
  const {
    data: buildData,
    isLoading: summaryLoading
  } = useBuildDataSummary(id);

  // Track loading progress for large datasets
  const loadProgress = useLoadProgress();

  // Get analytics metrics for Team Fit card on Data Overview tab
  // Use useProposed=false to show original imported data (not proposed assignments)
  const { data: analyticsMetrics } = useAnalyticsMetrics(id, false);
  
  // Hook to invalidate and refresh build data
  const invalidateBuildData = useInvalidateBuildData();
  
  // Callback for when data import completes - auto-refresh the build data
  const handleImportComplete = useCallback(async (dataType: 'accounts' | 'opportunities' | 'sales_reps') => {
    console.log(`✅ Import complete for ${dataType}, refreshing build data...`);
    if (id) {
      await invalidateBuildData(id);
      console.log(`✅ Build data refreshed after ${dataType} import`);
    }
  }, [id, invalidateBuildData]);
  
  // Callback for when data changes (import/delete) - force refresh
  const handleDataChange = useCallback(async () => {
    console.log(`🔄 Data changed, refreshing build data...`);
    if (id) {
      await invalidateBuildData(id);
      console.log(`✅ Build data refreshed after data change`);
    }
  }, [id, invalidateBuildData]);
  
  // STAGE 1: Track when Assignments tab becomes unlocked (accounts + sales reps required, opportunities optional)
  useEffect(() => {
    const hasAccounts = (buildData?.accounts.total || 0) > 0;
    const hasSalesReps = (buildData?.salesReps.total || 0) > 0;
    const isStage1Complete = hasAccounts && hasSalesReps; // Opportunities are optional
    
    // Only trigger animation once, when transitioning from locked to unlocked
    if (isStage1Complete && stage1WasLocked && !hasTriggeredStage1Animation.current) {
      hasTriggeredStage1Animation.current = true;
      setRecentlyUnlocked(['assignments']);
      setStage1WasLocked(false);
      
      // Clear the animation after it completes
      setTimeout(() => {
        setRecentlyUnlocked(prev => prev.filter(t => t !== 'assignments'));
      }, 2500);
    } else if (!isStage1Complete) {
      // Reset if data gets cleared (e.g., switching builds)
      setStage1WasLocked(true);
      hasTriggeredStage1Animation.current = false;
    }
  }, [buildData?.accounts.total, buildData?.salesReps.total, stage1WasLocked]);
  
  // STAGE 2: Track when Balancing/Clashes/Review tabs become unlocked (assignments applied)
  // Once unlocked, these tabs stay permanently unlocked for this build
  useEffect(() => {
    const hasAssignments = (buildData?.assignments.total || 0) > 0;
    
    // Only trigger animation once, when transitioning from locked to unlocked
    // IMPORTANT: Once unlocked, stage 2 stays unlocked permanently (no reset)
    if (hasAssignments && stage2WasLocked && !hasTriggeredStage2Animation.current) {
      hasTriggeredStage2Animation.current = true;
      setRecentlyUnlocked(prev => [...prev, 'balancing', 'clashes', 'review']);
      setStage2WasLocked(false);
      
      // Clear the animation after it completes
      setTimeout(() => {
        setRecentlyUnlocked(prev => prev.filter(t => !['balancing', 'clashes', 'review'].includes(t)));
      }, 2500);
    }
    // NOTE: We intentionally do NOT reset stage2WasLocked when assignments are cleared
    // Once assignments have been applied, stages 4-6 remain permanently unlocked
  }, [buildData?.assignments.total, stage2WasLocked]);
  
  if (buildLoading || summaryLoading) {
    return (
      <EnhancedLoader
        size="lg"
        text={buildLoading ? 'Loading Build Details' : loadProgress?.stage || 'Loading Data'}
        subtext={loadProgress && loadProgress.total > 10000 ? 'Large dataset detected' : undefined}
        progress={loadProgress && loadProgress.total > 1000 ? { current: loadProgress.current, total: loadProgress.total } : null}
        className="min-h-screen"
      />
    );
  }
  if (!build) {
    return <Navigate to="/dashboard" replace />;
  }
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'draft':
        return 'warning';
      case 'active':
        return 'info';
      case 'review':
        return 'warning';
      case 'approved':
        return 'success';
      case 'finalized':
        return 'success';
      default:
        return 'outline';
    }
  };
  const getDataQualityStatus = () => {
    if (!buildData) return 'loading';
    const {
      accounts,
      opportunities,
      salesReps,
      dataQuality
    } = buildData;
    if (accounts.total === 0) return 'no-accounts';
    if (opportunities.total === 0 && salesReps.total === 0) return 'missing-opp-and-reps';
    if (opportunities.total === 0) return 'missing-opportunities';
    if (salesReps.total === 0) return 'missing-sales-reps';
    if (dataQuality.missingOwners > accounts.total * 0.2) return 'assignment-issues';
    if (dataQuality.orphanedAccounts > 0 || dataQuality.orphanedOpportunities > 0) return 'orphaned-data';
    return 'good';
  };
  return <div className="space-y-6 animate-fade-in">
      {/* Enhanced Build Header */}
      <div className="relative">
        <Card className="card-elevated card-glass overflow-hidden">
          <div className="absolute inset-0 bg-gradient-primary opacity-5" />
          <CardContent className="pt-6 relative z-10">
            <div className="flex items-center justify-between">
              <div className="space-y-4">
                <div>
                  <h1 className="text-4xl font-bold text-gradient mb-2 animate-slide-up">
                    {build.name}
                  </h1>
                  <p className="text-muted-foreground text-lg">{build.description}</p>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={getStatusColor(build.status)} className="shadow-sm">
                    {build.status}
                  </Badge>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    
                    
                  </div>
                  {build.target_date && <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Target: {new Date(build.target_date).toLocaleDateString()}</span>
                    </div>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground mb-1">Created</div>
                  <div className="font-medium">
                    {new Date(build.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Enhanced Main Tabs with Progress Indicator */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {/* Progress Steps Navigation - Rectangular Design */}
        <div className="mb-6">
          {/* Check unlock conditions for two-stage flow */}
          {(() => {
            const hasAccounts = (buildData?.accounts.total || 0) > 0;
            const hasSalesReps = (buildData?.salesReps.total || 0) > 0;
            const hasAssignments = (buildData?.assignments.total || 0) > 0;
            
            // Stage 1: Accounts + Sales Reps imported -> unlocks Assignments (Opportunities optional)
            const isStage1Complete = hasAccounts && hasSalesReps;
            // Stage 2: Assignments have been applied at some point -> unlocks Balancing, Clashes, Review permanently
            // Uses !stage2WasLocked because once unlocked, it stays unlocked even if assignments are reset
            const isStage2Complete = hasAssignments || !stage2WasLocked;
            
            // Generate appropriate message based on what's missing
            const getMissingMessage = (tabValue: string) => {
              if (tabValue === 'assignments') {
                const missing = [];
                if (!hasAccounts) missing.push('Accounts');
                if (!hasSalesReps) missing.push('Sales Reps');
                return missing.length > 0 ? `Import ${missing.join(' and ')} to unlock` : '';
              } else {
                return 'Apply assignments first to unlock';
              }
            };
            
            return (
              <div className="flex items-stretch gap-1 relative">
                {[
                  { value: 'import', icon: Upload, label: 'Import Data', step: 1, unlockStage: 0 },
                  { value: 'overview', icon: Database, label: 'Data Overview', step: 2, unlockStage: 0 },
                  { value: 'assignments', icon: Users, label: 'Assignments', step: 3, unlockStage: 1 },
                  { value: 'balancing', icon: Target, label: 'Balancing', step: 4, unlockStage: 2 },
                  { value: 'clashes', icon: AlertTriangle, label: 'Clashes', step: 5, unlockStage: 2 },
                  { value: 'review', icon: FileText, label: 'Review', step: 6, unlockStage: 2 },
                ].map((tab, index, arr) => {
                  const tabIndex = ['import', 'overview', 'assignments', 'balancing', 'clashes', 'review'].indexOf(activeTab);
                  const isActive = activeTab === tab.value;
                  const isCompleted = index < tabIndex;
                  const isLast = index === arr.length - 1;
                  
                  // Determine if tab is locked based on its unlock stage
                  const isLocked = tab.unlockStage === 1 ? !isStage1Complete 
                                 : tab.unlockStage === 2 ? !isStage2Complete 
                                 : false;
                  const isJustUnlocked = recentlyUnlocked.includes(tab.value);
                  const Icon = tab.icon;
                  
                  const tabButton = (
                    <button
                      key={tab.value}
                      onClick={() => !isLocked && handleTabChange(tab.value)}
                      disabled={isLocked}
                      className={`
                        relative flex-1 flex items-center justify-center gap-3 py-4 px-4 transition-all duration-300
                        ${isLocked 
                          ? 'bg-muted/30 text-muted-foreground/50 cursor-not-allowed'
                          : isJustUnlocked
                            ? 'unlock-flash'
                            : isActive 
                              ? 'bg-primary text-primary-foreground shadow-lg' 
                              : isCompleted 
                                ? 'bg-primary/20 text-primary hover:bg-primary/30' 
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                        }
                        ${index === 0 ? 'rounded-l-lg' : ''}
                        ${isLast ? 'rounded-r-lg' : ''}
                      `}
                      style={{
                        clipPath: isLast 
                          ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)' 
                          : index === 0 
                            ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)'
                            : 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)'
                      }}
                    >
                      {/* Step number or lock icon */}
                      <span className={`
                        w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all duration-500
                        ${isLocked
                          ? 'bg-muted-foreground/10 text-muted-foreground/50'
                          : isJustUnlocked
                            ? 'bg-white/30'
                            : isActive 
                              ? 'bg-primary-foreground/20 text-primary-foreground' 
                              : isCompleted
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted-foreground/20 text-muted-foreground'
                        }
                      `}>
                        {isLocked ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          tab.step
                        )}
                      </span>
                      
                      {/* Icon and Label */}
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-5 h-5 shrink-0 transition-all duration-300 ${isLocked ? 'opacity-50' : isJustUnlocked ? 'scale-125' : ''}`} />
                        <span className={`font-medium text-sm truncate hidden lg:block transition-all duration-300 ${isLocked ? 'opacity-50' : isJustUnlocked ? 'font-bold' : ''}`}>{tab.label}</span>
                      </div>
                      
                    </button>
                  );
                  
                  // Wrap locked tabs with tooltip
                  if (isLocked) {
                    return (
                      <Tooltip key={tab.value}>
                        <TooltipTrigger asChild>
                          {tabButton}
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-popover border shadow-lg">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-muted-foreground" />
                            <span>{getMissingMessage(tab.value)}</span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  
                  return tabButton;
                })}
              </div>
            );
          })()}
        </div>
        
        {/* Hidden TabsList for accessibility - actual triggers above */}
        <TabsList className="hidden">
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="balancing">Balancing</TabsTrigger>
          <TabsTrigger value="clashes">Clashes</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
          <DataImport 
            buildId={id!} 
            onImportComplete={handleImportComplete}
            onDataChange={handleDataChange}
            onContinue={() => handleTabChange('overview')}
          />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          {/* Row 1: Account Summary - Customers, Prospects, All Accounts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="card-elevated card-glass hover-lift group">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-success/20 rounded-lg">
                    <Building2 className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Customers</h3>
                    <p className="text-xs text-muted-foreground">Total accounts</p>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help">
                      <AnimatedCounter value={buildData?.accounts.totalCustomers || 0} className="text-2xl font-bold text-success" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-sm">
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Parents:</span>
                        <span className="font-semibold">{(buildData?.accounts.customers || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Children:</span>
                        <span className="font-semibold">{(buildData?.accounts.childCustomers || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </CardContent>
            </Card>

            <Card className="card-elevated card-glass hover-lift group">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-info/20 rounded-lg">
                    <Target className="h-5 w-5 text-info" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Prospects</h3>
                    <p className="text-xs text-muted-foreground">Total accounts</p>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help">
                      <AnimatedCounter value={buildData?.accounts.totalProspects || 0} className="text-2xl font-bold text-info" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-sm">
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Parents:</span>
                        <span className="font-semibold">{(buildData?.accounts.prospects || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Children:</span>
                        <span className="font-semibold">{(buildData?.accounts.childProspects || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </CardContent>
            </Card>

            <Card className="card-elevated card-glass hover-lift group">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Database className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">All Accounts</h3>
                    <p className="text-xs text-muted-foreground">Total count</p>
                  </div>
                </div>
                <AnimatedCounter value={buildData?.accounts.total || 0} className="text-2xl font-bold text-primary" />
                <p className="text-xs text-muted-foreground mt-1">
                  Parents: {buildData?.accounts.parents || 0} | Children: {buildData?.accounts.children || 0}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Pipeline, Team, Team Fit */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="card-elevated card-glass hover-lift group cursor-pointer" onClick={() => setActiveTab('data-opportunities')}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-success/20 rounded-lg">
                    <PieChart className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Pipeline</h3>
                    <p className="text-xs text-muted-foreground">Opportunities</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-lg font-semibold">{buildData?.opportunities.total || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">CRE Risk</span>
                    <span className="text-sm font-medium text-warning">{buildData?.opportunities.withCRE || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-elevated card-glass hover-lift group cursor-pointer" onClick={() => setActiveTab('data-reps')}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Team</h3>
                    <p className="text-xs text-muted-foreground">Sales reps</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Active</span>
                    <span className="text-lg font-semibold">{buildData?.salesReps.activeReps || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Inactive</span>
                    <span className="text-sm font-medium text-muted-foreground">{buildData?.salesReps.inactiveReps || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team Fit Card */}
            <Card className="card-elevated card-glass hover-lift group">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-violet-500/20 rounded-lg">
                    <Shield className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex items-center gap-1">
                    <h3 className="font-semibold text-foreground">Team Fit</h3>
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm font-medium mb-1">Account-Rep Tier Alignment</p>
                        <p className="text-xs text-muted-foreground">
                          Measures how well account tiers match rep specializations.
                        </p>
                        <ul className="text-xs mt-1 space-y-0.5">
                          <li>• <strong>SMB</strong> = Small Business (&lt;100 employees)</li>
                          <li>• <strong>Growth</strong> = Growth (100-499 employees)</li>
                          <li>• <strong>MM</strong> = Mid-Market (500-1,499 employees)</li>
                          <li>• <strong>ENT</strong> = Enterprise (1,500+ employees)</li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                {analyticsMetrics?.lpMetrics?.teamAlignmentScore != null && analyticsMetrics.tierAlignmentBreakdown ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-2xl font-bold text-violet-600 dark:text-violet-400 mb-3 cursor-help">
                          {(analyticsMetrics.lpMetrics.teamAlignmentScore * 100).toFixed(0)}%
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm font-medium mb-1">Team Alignment Score</p>
                        <p className="text-xs text-muted-foreground">
                          Weighted average of tier alignment across all accounts. Higher scores indicate better matches between account tiers (SMB, Growth, MM, ENT) and rep specializations.
                        </p>
                        <ul className="text-xs mt-2 space-y-1">
                          <li>• <strong>100%</strong> = All accounts perfectly matched</li>
                          <li>• <strong>85%</strong> = Good alignment (current)</li>
                          <li>• <strong>&lt;70%</strong> = Needs attention</li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                    {analyticsMetrics.tierAlignmentBreakdown.exactMatch + analyticsMetrics.tierAlignmentBreakdown.oneLevelMismatch + analyticsMetrics.tierAlignmentBreakdown.twoPlusLevelMismatch + analyticsMetrics.tierAlignmentBreakdown.unassigned + (analyticsMetrics.tierAlignmentBreakdown.unknown || 0) > 0 ? (
                      <TeamFitPieChart 
                        breakdown={analyticsMetrics.tierAlignmentBreakdown}
                        teamAlignmentScore={analyticsMetrics.lpMetrics.teamAlignmentScore}
                        compact={true}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground mt-2">No tier data available</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-muted-foreground">N/A</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      No tier data available
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Balance Analytics Section */}
          {buildData && buildData.accounts.total > 0 && (
            <DataOverviewAnalytics buildId={id!} />
          )}

          {/* Enhanced Action Cards based on data state */}
          {buildData && buildData.accounts.total === 0 && <Card className="card-elevated card-glass">
              <CardContent className="pt-6">
                <div className="text-center space-y-6">
                  <div className="w-20 h-20 mx-auto bg-gradient-primary rounded-full flex items-center justify-center animate-float shadow-glow shadow-primary/20">
                    <Database className="h-10 w-10 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold text-gradient mb-2">No Data Imported Yet</h3>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto">
                      Import your accounts, opportunities, and sales reps to start building your book.
                    </p>
                  </div>
                  <Button variant="gradient" size="lg" onClick={() => navigate('/import')} className="shadow-lg">
                    <Database className="mr-2 h-5 w-5" />
                    Import Data
                  </Button>
                </div>
              </CardContent>
            </Card>}
          
          {buildData && buildData.accounts.total > 0 && buildData.salesReps.total === 0 && <Card className="card-elevated card-glass">
              <CardContent className="pt-6">
                <div className="text-center space-y-6">
                  <div className="w-20 h-20 mx-auto bg-success/20 rounded-full flex items-center justify-center animate-pulse">
                    <CheckCircle className="h-10 w-10 text-success" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold text-gradient mb-2">Great Progress!</h3>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto">
                      <AnimatedCounter value={buildData.accounts.total} className="text-success font-bold" /> accounts imported. Complete your dataset to unlock full functionality.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <Button variant="gradient" onClick={() => navigate('/import')}>
                      <Database className="mr-2 h-4 w-4" />
                      Import More Data
                    </Button>
                    {buildData.salesReps.total > 0 && <Button variant="outline" onClick={() => setActiveTab('assignments')}>
                        <Users className="mr-2 h-4 w-4" />
                        Start Assignments
                      </Button>}
                  </div>
                </div>
              </CardContent>
            </Card>}

          {buildData && buildData.accounts.total > 0 && buildData.salesReps.total > 0 && <Card className="card-elevated card-glass border-glow">
              <CardContent className="pt-6">
                <div className="text-center space-y-6">
                  <div className="w-20 h-20 mx-auto bg-gradient-primary rounded-full flex items-center justify-center animate-spin-slow shadow-glow shadow-primary/30">
                    <Cog className="h-10 w-10 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold text-gradient mb-2">Ready for Book Assignments</h3>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto">
                      All data imported successfully. Run the assignment engine to optimize book distribution.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <Button variant="glow" size="lg" onClick={() => setActiveTab('assignments')}>
                      <Users className="mr-2 h-5 w-5" />
                      View Assignment Engine
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>}

        </TabsContent>

        <TabsContent value="data-accounts">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Accounts Breakdown</h2>
              <Button variant="outline" onClick={() => setActiveTab('overview')}>
                ← Back to Overview
              </Button>
            </div>
            <AccountsTable buildId={id!} />
          </div>
        </TabsContent>

        <TabsContent value="data-opportunities">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Opportunities Breakdown</h2>
              <Button variant="outline" onClick={() => setActiveTab('overview')}>
                ← Back to Overview
              </Button>
            </div>
            <OpportunitiesTable buildId={id!} />
          </div>
        </TabsContent>

        <TabsContent value="data-reps">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Sales Reps Breakdown</h2>
              <Button variant="outline" onClick={() => setActiveTab('overview')}>
                ← Back to Overview
              </Button>
            </div>
            <SalesRepsTable buildId={id!} />
          </div>
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentEngine 
            buildId={id!} 
            onPendingProposalsChange={handlePendingProposalsChange}
          />
        </TabsContent>

        <TabsContent value="balancing">
          <TerritoryBalancingDashboard buildId={id!} />
        </TabsContent>

        <TabsContent value="clashes">
          <GlobalClashDetector />
        </TabsContent>

        <TabsContent value="review">
          <ComprehensiveReview buildId={id!} />
        </TabsContent>
      </Tabs>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Assignment Proposals</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                You have <strong>{pendingProposals.count} pending proposals</strong> that haven't been applied yet.
              </p>
              <p>
                If you leave now, these proposals will be lost. Click <strong>Apply Proposals</strong> first to save them to the database.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelLeave}>
              Stay & Review
            </Button>
            <Button variant="destructive" onClick={handleConfirmLeave}>
              Leave Without Saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>;
};