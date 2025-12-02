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
import { useBuildDataSummary } from '@/hooks/useBuildData';
import { formatCurrency } from '@/utils/accountCalculations';
import { InteractiveKPICard } from '@/components/InteractiveKPICard';
import { DataVisualizationCard } from '@/components/DataVisualizationCard';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { EnhancedLoader } from '@/components/EnhancedLoader';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { Database, Users, Target, AlertTriangle, CheckCircle, FileText, Cog, DollarSign, TrendingUp, Shield, Building2, UserCheck, Calendar, PieChart, RefreshCw } from 'lucide-react';
import { GlobalClashDetector } from './GlobalClashDetector';
import { SameBuildClashDetector } from '@/components/SameBuildClashDetector';
import { ComprehensiveReview } from './ComprehensiveReview';
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
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'overview');
  
  // Track pending proposals from AssignmentEngine
  const [pendingProposals, setPendingProposals] = useState({ hasPending: false, count: 0 });
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingTabChange, setPendingTabChange] = useState<string | null>(null);

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
  if (buildLoading || summaryLoading) {
    return <EnhancedLoader size="lg" text={buildLoading ? 'Loading Build Details' : 'Analyzing Data'} className="min-h-screen" />;
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
              <div className="text-right space-y-3">
                <div className="text-sm">
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Hard Refresh
                  </Button>
                </div>
                <div>
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


      {/* Enhanced Main Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-5 h-12 card-glass backdrop-blur-sm">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Database className="w-4 h-4 mr-2" />
            Data Overview
          </TabsTrigger>
          <TabsTrigger value="assignments" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Users className="w-4 h-4 mr-2" />
            Assignments
          </TabsTrigger>
          <TabsTrigger value="balancing" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Target className="w-4 h-4 mr-2" />
            Balancing
          </TabsTrigger>
          <TabsTrigger value="clashes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Clashes
          </TabsTrigger>
          <TabsTrigger value="review" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <FileText className="w-4 h-4 mr-2" />
            Review
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Data Validation Alert */}
          {buildData && buildData.accounts.total > 0 && buildData.accounts.total < 20000 && <Alert className="border-warning bg-warning/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-3">
                <div>
                  <strong>⚠️ Limited Data Detected:</strong> Showing {buildData.accounts.total.toLocaleString()} accounts, expected 27,000+. 
                  This indicates cache issues.
                </div>
                <div className="flex gap-2 items-center text-sm">
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    Hard Refresh
                  </Button>
                  <span className="text-muted-foreground">
                    or press <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+Shift+R</kbd> (Windows) / <kbd className="px-2 py-1 bg-muted rounded text-xs">Cmd+Shift+R</kbd> (Mac)
                  </span>
                </div>
              </AlertDescription>
            </Alert>}

          {/* Enhanced Financial Overview with Interactive Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="card-elevated card-glass hover-lift group">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-primary rounded-lg shadow-md">
                      <DollarSign className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Total ARR</h3>
                      <p className="text-xs text-muted-foreground">Customer ARR</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <AnimatedCounter value={buildData?.opportunities.totalARR || 0} formatValue={value => formatCurrency(value)} className="text-2xl font-bold text-gradient" />
                </div>
              </CardContent>
            </Card>


            <Card className="card-elevated card-glass hover-lift group">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-success/20 rounded-lg">
                      <Building2 className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Customer Accounts</h3>
                      <p className="text-xs text-muted-foreground">Parent customers only</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <AnimatedCounter value={buildData?.accounts.customers || 0} className="text-2xl font-bold text-success" />
                </div>
              </CardContent>
            </Card>

            <Card className="card-elevated card-glass hover-lift group">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-info/20 rounded-lg">
                      <Target className="h-5 w-5 text-info" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Prospect Accounts</h3>
                      <p className="text-xs text-muted-foreground">Parent prospects only</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <AnimatedCounter value={buildData?.accounts.prospects || 0} className="text-2xl font-bold text-info" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Data Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="card-elevated card-glass hover-lift group">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/20 rounded-lg">
                      <Database className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">All Accounts</h3>
                      <p className="text-xs text-muted-foreground">Total account count</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <AnimatedCounter value={buildData?.accounts.total || 0} className="text-2xl font-bold text-primary" />
                  <p className="text-xs text-muted-foreground">
                    Parents: {buildData?.accounts.parents || 0} | Children: {buildData?.accounts.children || 0}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="card-elevated card-glass hover-lift group cursor-pointer" onClick={() => setActiveTab('data-opportunities')}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-success/20 rounded-lg">
                      <PieChart className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Sales Pipeline</h3>
                      <p className="text-xs text-muted-foreground">Opportunity overview</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Opportunities</span>
                    <span className="text-lg font-semibold">{buildData?.opportunities.total || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">With CRE Status</span>
                    <span className="text-lg font-semibold text-warning">{buildData?.opportunities.withCRE || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-elevated card-glass hover-lift group cursor-pointer" onClick={() => setActiveTab('data-reps')}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/20 rounded-lg">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Team Capacity</h3>
                      <p className="text-xs text-muted-foreground">Sales reps status</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Active Reps</span>
                    <span className="text-lg font-semibold">{buildData?.salesReps.activeReps || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Inactive Reps</span>
                    <span className="text-lg font-semibold text-muted-foreground">{buildData?.salesReps.inactiveReps || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

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
          
          {buildData && buildData.accounts.total > 0 && (buildData.opportunities.total === 0 || buildData.salesReps.total === 0) && <Card className="card-elevated card-glass">
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

          {buildData && buildData.accounts.total > 0 && buildData.opportunities.total > 0 && buildData.salesReps.total > 0 && <Card className="card-elevated card-glass border-glow">
              <CardContent className="pt-6">
                <div className="text-center space-y-6">
                  <div className="w-20 h-20 mx-auto bg-gradient-primary rounded-full flex items-center justify-center animate-spin-slow shadow-glow shadow-primary/30">
                    <Cog className="h-10 w-10 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold text-gradient mb-2">Ready for Territory Assignment</h3>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto">
                      All data imported successfully. Run the assignment engine to optimize territory distribution.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <Button variant="glow" size="lg" onClick={() => setActiveTab('assignments')}>
                      <Cog className="mr-2 h-5 w-5" />
                      Run Assignment Engine
                    </Button>
                    <Button variant="glass" onClick={() => setActiveTab('balancing')}>
                      <Target className="mr-2 h-4 w-4" />
                      View Balancing Dashboard
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
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Global Clash Detection</h2>
              <p className="text-muted-foreground">
                Identify and resolve assignment conflicts where the same account has different assignments across different builds
              </p>
            </div>
            
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Cross-Build Conflicts</CardTitle>
                  <CardDescription>
                    Conflicts where the same account has different assignments across different builds
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GlobalClashDetector />
                </CardContent>
              </Card>
            </div>
          </div>
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