import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Users, AlertTriangle, Search, Edit, CheckCircle, FileText, Target, Settings, UserCheck, UserX, RefreshCw, Download, RotateCcw, Play, Loader2, Wrench, Eye, Info, ChevronDown, MoreHorizontal } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { getAccountARR } from '@/_domain';
import { useAssignmentEngine } from '@/hooks/useAssignmentEngine';
import { useNavigate } from 'react-router-dom';
import { useAccountCalculations } from '@/hooks/useAccountCalculations';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { AssignmentPreviewDialog } from '@/components/AssignmentPreviewDialog';
import { AssignmentGenerationDialog } from '@/components/AssignmentGenerationDialog';
import { AssignmentWarnings } from '@/components/AssignmentWarnings';
import { WaterfallLogicExplainer } from '@/components/WaterfallLogicExplainer';
import { VirtualizedAccountTable } from '@/components/VirtualizedAccountTable';
import { RepManagement } from '@/components/RepManagement';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ResetProgressDialog, ResetProgress } from '@/components/ResetProgressDialog';
import { AssignmentRuleAdjustment } from '@/components/AssignmentRuleAdjustment';
import { assignmentService } from '@/services/assignmentService';
import { EnhancedAssignmentDebugger } from '@/components/EnhancedAssignmentDebugger';
import { EnhancedTabRefreshIndicator } from '@/components/EnhancedTabRefreshIndicator';
import { AssignmentDataFlowTracker } from '@/components/AssignmentDataFlowTracker';
import { buildDataService } from '@/services/buildDataService';
import { supabase } from '@/integrations/supabase/client';
// AI Balancing Optimizer removed - now using HIGHS optimization
import { AssignmentSuccessDialog } from '@/components/AssignmentSuccessDialog';
import { fixOwnerAssignments } from '@/utils/fixOwnerAssignments';
import { QuickResetButton } from '@/components/QuickResetButton';
import { FullAssignmentConfig } from '@/components/FullAssignmentConfig';
import { PriorityConfig, getDefaultPriorityConfig } from '@/config/priorityRegistry';
import { useMappedFields } from '@/hooks/useMappedFields';
import { notifyOptimizationComplete } from '@/services/slackNotificationService';
import { useAuth } from '@/contexts/AuthContext';

interface Account {
  sfdc_account_id: string;
  account_name: string;
  parent_id?: string;
  ultimate_parent_id?: string;
  enterprise_vs_commercial: string;
  expansion_tier?: string;
  initial_sale_tier?: string;
  arr: number;
  hierarchy_bookings_arr_converted?: number;
  calculated_arr?: number;
  owner_id?: string;
  owner_name?: string;
  new_owner_id?: string;
  new_owner_name?: string;
  geo: string;
  hq_country?: string;
  sales_territory?: string;
  is_customer: boolean;
  is_parent: boolean;
  risk_flag: boolean;
  cre_risk: boolean;
  expansion_score?: number;
  account_type?: string;
  cre_count?: number;
  cre_status?: string;
  exclude_from_reassignment?: boolean;
}

interface AssignmentRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  conditions: any;
  enabled: boolean;
  rule_type: string;
}

interface Owner {
  rep_id: string;
  name: string;
  manager?: string;
  team?: string;
  region?: string;
}

interface AssignmentEngineProps {
  buildId?: string;
  onPendingProposalsChange?: (hasPending: boolean, count: number) => void;
}

export const AssignmentEngine: React.FC<AssignmentEngineProps> = ({ buildId, onPendingProposalsChange }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('customers');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAssignmentType, setSelectedAssignmentType] = useState('all');
  const [currentOwnerFilter, setCurrentOwnerFilter] = useState('');
  const [newOwnerFilter, setNewOwnerFilter] = useState('');
  const [lockStatusFilter, setLockStatusFilter] = useState('all');
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showApplyingOverlay, setShowApplyingOverlay] = useState(false);
  const [applyingStatus, setApplyingStatus] = useState<'saving' | 'refreshing'>('saving');
  const [appliedAssignmentCount, setAppliedAssignmentCount] = useState(0);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [configJustSaved, setConfigJustSaved] = useState(false); // Track when config was just saved to prompt regeneration
  const [checkingConfig, setCheckingConfig] = useState(true);
  const [showAssignmentProgress, setShowAssignmentProgress] = useState(false);
  const [assignmentProgress, setAssignmentProgress] = useState({
    isRunning: false,
    progress: 0,
    status: 'Ready to generate assignments',
    stages: [],
    accountsProcessed: 0,
    totalAccounts: 0,
    processingRate: 0,
    estimatedTimeRemaining: 0
  });
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [showResetProgress, setShowResetProgress] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [reassignmentReason, setReassignmentReason] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedOwnerName, setSelectedOwnerName] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [workloadBalanceData, setWorkloadBalanceData] = useState<any>(null);
  const [sophisticatedAssignmentResult, setSophisticatedAssignmentResult] = useState<any>(null);
  const [resetCancelToken, setResetCancelToken] = useState<{ cancelled: boolean }>({ cancelled: false });
  // AI Optimizer state removed - using HIGHS optimization
  const [resetProgress, setResetProgress] = useState<ResetProgress>({
    isRunning: false,
    currentStep: 0,
    totalSteps: 4,
    stepName: '',
    stepProgress: 0,
    totalProgress: 0,
    accountsProcessed: 0,
    opportunitiesProcessed: 0,
    totalAccounts: 0,
    totalOpportunities: 0,
    processingRate: 0,
    estimatedTimeRemaining: 0
  });
  
  const [assignmentWarnings, setAssignmentWarnings] = useState<any[]>([]);
  const [isApplyingAssignments, setIsApplyingAssignments] = useState(false);
  
  // Data flow tracking state
  const [dataFlowSteps, setDataFlowSteps] = useState([]);
  const [showDataFlowTracker, setShowDataFlowTracker] = useState(false);
  const [isFixingData, setIsFixingData] = useState(false);
  const [tabRefreshStates, setTabRefreshStates] = useState({
    assignments: { isRefreshing: false, lastRefreshed: null },
    balancing: { isRefreshing: false, lastRefreshed: null },
    review: { isRefreshing: false, lastRefreshed: null }
  });

  // Get assignment engine hook data
  const {
    accounts,
    owners,
    assignmentResult,
    assignmentReasons,
    isGenerating,
    accountsLoading,
    ownersLoading,
    accountsError,
    handleGenerateAssignments,
    handleExecuteAssignments,
    cancelGeneration,
    refetchAccounts,
    refreshData: hookRefreshData,
    isExecuting,
    assignmentProgress: hookAssignmentProgress,
  } = useAssignmentEngine(buildId);

  // Notify parent when pending proposals change
  useEffect(() => {
    const hasPending = !!(assignmentResult && assignmentResult.proposals.length > 0);
    const count = assignmentResult?.proposals.length || 0;
    onPendingProposalsChange?.(hasPending, count);
  }, [assignmentResult, onPendingProposalsChange]);

  // Check if assignment configuration exists for this build
  useEffect(() => {
    const checkConfiguration = async () => {
      if (!buildId) return;
      setCheckingConfig(true);
      try {
        const { data, error } = await supabase
          .from('assignment_configuration')
          .select('id, updated_at')
          .eq('build_id', buildId)
          .maybeSingle();
        
        // Consider configured if record exists and has been updated (not just default)
        setIsConfigured(!!data && !!data.updated_at);
      } catch (err) {
        console.error('Error checking config:', err);
        setIsConfigured(false);
      } finally {
        setCheckingConfig(false);
      }
    };
    checkConfiguration();
  }, [buildId, showConfigDialog]); // Re-check when dialog closes

  // Fetch build info for notifications
  const { data: buildInfo } = useQuery({
    queryKey: ['build-info', buildId],
    queryFn: async () => {
      if (!buildId) return null;
      const { data, error } = await supabase
        .from('builds')
        .select('name')
        .eq('id', buildId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!buildId
  });

  // Fetch assignment configuration for priority display
  const { data: assignmentConfig } = useQuery({
    queryKey: ['assignment-config-full', buildId, showConfigDialog],
    queryFn: async () => {
      if (!buildId) return null;
      const { data, error } = await supabase
        .from('assignment_configuration')
        .select('assignment_mode, priority_config')
        .eq('build_id', buildId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!buildId
  });

  // Get priority config with defaults
  const priorityConfig: PriorityConfig[] = (assignmentConfig?.priority_config as unknown as PriorityConfig[]) || 
    getDefaultPriorityConfig((assignmentConfig?.assignment_mode as 'ENT' | 'COMMERCIAL' | 'EMEA') || 'ENT');
  const assignmentMode = assignmentConfig?.assignment_mode || 'ENT';

  // Get mapped fields for priority availability checking
  const { mappedFields } = useMappedFields(buildId);

  // Fetch opportunities for Net ARR calculation
  const { data: opportunities = [] } = useQuery({
    queryKey: ['build-opportunities', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      const { data, error } = await supabase
        .from('opportunities')
        .select('sfdc_account_id, net_arr')
        .eq('build_id', buildId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildId
  });

  // Get account calculations hook for recalculating values
  const { recalculateAccountValues, isCalculating } = useAccountCalculations();
  
  // Get query client for cache invalidation
  const queryClient = useQueryClient();

  // Enhanced execution function for sophisticated assignments
  const executeSophisticatedAssignments = async (result: any) => {
    if (!buildId || !result?.proposals) {
      throw new Error('Invalid assignment result or build ID');
    }

    console.log('[Execute Sophisticated] 🚀 Starting execution with', result.proposals.length, 'proposals');
    console.log('[Execute Sophisticated] 📋 Execution Details:', {
      buildId,
      proposalCount: result.proposals.length,
      sampleProposal: result.proposals[0],
      timestamp: new Date().toISOString()
    });
    
    // Convert sophisticated result to format expected by legacy service
    const legacyProposals = result.proposals.map((proposal: any) => ({
      accountId: proposal.accountId,
      accountName: proposal.accountName,
      currentOwnerId: proposal.currentOwnerId,
      currentOwnerName: proposal.currentOwnerName,
      proposedOwnerId: proposal.proposedOwnerId,
      proposedOwnerName: proposal.proposedOwnerName,
      rationale: proposal.rationale || proposal.reason || 'Sophisticated assignment',
      ruleApplied: proposal.ruleApplied,
      conflictRisk: proposal.conflictRisk
    }));

    console.log('[Execute Sophisticated] 🔄 Executing assignments via assignment service...');
    
    // Execute assignments using the assignment service
    await assignmentService.executeAssignments(buildId, legacyProposals);
    
    console.log('[Execute Sophisticated] ✅ Assignment service execution completed');
    
    // Verify database updates with sample check
    try {
      const { data: sampleUpdates } = await supabase
        .from('accounts')
        .select('sfdc_account_id, new_owner_id, new_owner_name')
        .eq('build_id', buildId)
        .in('sfdc_account_id', legacyProposals.slice(0, 3).map(p => p.accountId));
      
      console.log('[Execute Sophisticated] 📊 Database Update Verification:', {
        sampleUpdates,
        expectedUpdates: legacyProposals.slice(0, 3).map(p => ({
          accountId: p.accountId,
          expectedOwnerId: p.proposedOwnerId,
          expectedOwnerName: p.proposedOwnerName
        }))
      });
    } catch (error) {
      console.warn('[Execute Sophisticated] ⚠️ Could not verify database updates:', error);
    }
    
    console.log('[Execute Sophisticated] 🔄 Starting comprehensive data refresh...');
    
    // Force comprehensive data refresh
    await refreshAllData();
    
    console.log('[Execute Sophisticated] 🎉 Execution and refresh completed successfully');
  };

  // Check if AI optimization is available from assignment result
  const checkIfOptimizationAvailable = useCallback((result: any) => {
    // Check if result has AI optimizations from post-processing
    if (result?.aiOptimizations && result.aiOptimizations.length > 0) {
      console.log('[AI Optimizer] Post-processing generated', result.aiOptimizations.length, 'suggestions');
      
      // Extract AI optimization data from result
      const suggestions = result.aiOptimizations.map((opt: any) => ({
        accountId: opt.accountId,
        accountName: opt.accountName,
        fromRepId: opt.currentOwnerId,
        fromRepName: opt.currentOwnerName,
        toRepId: opt.proposedOwnerId,
        toRepName: opt.proposedOwnerName,
        reasoning: opt.rationale || opt.assignmentReason,
        arrImpact: 0, // Calculate if needed
        priority: opt.conflictRisk === 'LOW' ? 1 : (opt.conflictRisk === 'MEDIUM' ? 3 : 5)
      }));
      
      setAiOptimizerSuggestions(suggestions);
      setAiOptimizerReasoning('AI Balancer detected workload imbalances and generated optimization suggestions based on your rules and territory configuration.');
      
      // Extract problem reps if available
      if (result.statistics?.repWorkloads) {
        const problemReps = result.statistics.repWorkloads
          .filter((rep: any) => rep.totalARR < 1300000)
          .map((rep: any) => ({
            repId: rep.repId,
            repName: rep.repName,
            currentARR: rep.totalARR,
            targetARR: 1300000,
            deficit: 1300000 - rep.totalARR
          }));
        setAiOptimizerProblemReps(problemReps);
      }
      
      return true;
    }
    
    return false;
  }, []);

  // Enhanced refresh function with detailed progress tracking and tab state updates
  const refreshAllData = useCallback(async () => {
    try {
      console.log('[Refresh] 🔄 Starting comprehensive data refresh...');
      
      // Update tab refresh states to show loading
      setTabRefreshStates(prev => ({
        ...prev,
        assignments: { ...prev.assignments, isRefreshing: true },
        balancing: { ...prev.balancing, isRefreshing: true },
        review: { ...prev.review, isRefreshing: true }
      }));
      
      // Show data flow tracker
      setShowDataFlowTracker(true);
      setDataFlowSteps([
        { id: 'start', name: 'Starting Refresh', status: 'completed', description: 'Initiating comprehensive data refresh', timestamp: new Date() },
        { id: 'recalc', name: 'Recalculating Values', status: 'in-progress', description: 'Updating account calculations' },
        { id: 'cache', name: 'Clearing Caches', status: 'pending', description: 'Invalidating React Query caches' },
        { id: 'fetch', name: 'Fetching Fresh Data', status: 'pending', description: 'Retrieving latest data from database' },
        { id: 'complete', name: 'Refresh Complete', status: 'pending', description: 'All tabs updated with current data' }
      ]);
      
      // Show refresh toast immediately for user feedback
      toast({
        title: "🔄 Refreshing Data",
        description: "Updating all tabs with latest assignment data...",
      });
      
      console.log('[Refresh] 📊 Step 1: Recalculating account values...');
      
      // Recalculate all account values first using mutation
      try {
        recalculateAccountValues.mutate(buildId);
        setDataFlowSteps(prev => prev.map(step => 
          step.id === 'recalc' ? { ...step, status: 'completed', timestamp: new Date() } :
          step.id === 'cache' ? { ...step, status: 'in-progress' } : step
        ));
      } catch (error) {
        console.warn('[Refresh] ⚠️ Could not trigger account value recalculation:', error);
      }
      
      console.log('[Refresh] 🗑️ Step 2: Invalidating React Query caches (force refetch)...');
      
      // Small delay to ensure database transaction is committed
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Invalidate queries - this marks data as stale and triggers immediate refetch for active queries
      await queryClient.invalidateQueries({ queryKey: ['build-parent-accounts-optimized', buildId] }); // Main accounts query
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['build-assignment-reasons', buildId] });
      await queryClient.invalidateQueries({ queryKey: ['enhanced-balancing', buildId] });
      await queryClient.invalidateQueries({ queryKey: ['workload-balance', buildId] });
      await queryClient.invalidateQueries({ queryKey: ['build-sales-reps', buildId] });
      
      // CRITICAL: Invalidate build data summary - this triggers Stage 2 unlock animation in BuildDetail
      await queryClient.invalidateQueries({ queryKey: ['build-data-summary', buildId] });
      
      setDataFlowSteps(prev => prev.map(step => 
        step.id === 'cache' ? { ...step, status: 'completed', timestamp: new Date() } :
        step.id === 'fetch' ? { ...step, status: 'in-progress' } : step
      ));
      
      console.log('[Refresh] 🔄 Step 3: Refreshing hook data...');
      
      // Use hook's refresh function
      if (hookRefreshData) {
        await hookRefreshData();
      }
      
      console.log('[Refresh] 📋 Step 4: Refetching accounts data...');
      
      // Refresh accounts data
      await refetchAccounts();
      
      // Complete the data flow
      setDataFlowSteps(prev => prev.map(step => 
        step.id === 'fetch' ? { ...step, status: 'completed', timestamp: new Date() } :
        step.id === 'complete' ? { ...step, status: 'completed', timestamp: new Date() } : step
      ));
      
      console.log('[Refresh] ✅ Data refresh completed successfully');
      
      // Update tab refresh states with completion
      const now = new Date();
      setTabRefreshStates(prev => ({
        assignments: { isRefreshing: false, lastRefreshed: now },
        balancing: { isRefreshing: false, lastRefreshed: now },
        review: { isRefreshing: false, lastRefreshed: now }
      }));
      
      // Success feedback
      toast({
        title: "✅ Data Refreshed",
        description: "All tabs updated with latest assignment data. New owners and balancing metrics are now current.",
      });
      
      // Hide data flow tracker after a delay
      setTimeout(() => {
        setShowDataFlowTracker(false);
      }, 3000);
      
    } catch (error) {
      console.error('[Refresh] ❌ Error refreshing data:', error);
      
      // Update error states
      setDataFlowSteps(prev => prev.map(step => 
        step.status === 'in-progress' ? { ...step, status: 'error', timestamp: new Date() } : step
      ));
      
      setTabRefreshStates(prev => ({
        ...prev,
        assignments: { ...prev.assignments, isRefreshing: false },
        balancing: { ...prev.balancing, isRefreshing: false },
        review: { ...prev.review, isRefreshing: false }
      }));
      
      toast({
        title: "❌ Data Refresh Error",
        description: "Some data may not be up to date. Please refresh the page.",
        variant: "destructive"
      });
      
      // Hide data flow tracker after error
      setTimeout(() => {
        setShowDataFlowTracker(false);
      }, 5000);
    }
  }, [buildId, recalculateAccountValues, refetchAccounts, queryClient, hookRefreshData, toast]);

  // Filter accounts based on assignment type
  const filterAccountsByAssignmentType = (accounts: Account[]): Account[] => {
    if (selectedAssignmentType === 'all') return accounts;
    
    return accounts.filter(account => {
      switch (selectedAssignmentType) {
        case 'assigned':
          return account.new_owner_id !== null && account.new_owner_id !== undefined;
        case 'unassigned':
          return account.new_owner_id === null || account.new_owner_id === undefined;
        case 'changed':
          return account.new_owner_id && account.owner_id !== account.new_owner_id;
        case 'unchanged':
          return account.new_owner_id && account.owner_id === account.new_owner_id;
        default:
          return true;
      }
    });
  };

  // Process accounts from useAssignmentEngine
  const allCustomerAccounts = filterAccountsByAssignmentType(accounts?.filter(acc => acc.is_customer) || []);
  const allProspectAccounts = filterAccountsByAssignmentType(accounts?.filter(acc => !acc.is_customer) || []);
  const calculationsLoading = accountsLoading || ownersLoading;
  const calculationsError = accountsError;
  
  // Check if assignments have already been applied to the database
  const hasExistingAssignments = (accounts || []).some(acc => acc.new_owner_id);
  const existingAssignmentCount = (accounts || []).filter(acc => acc.new_owner_id).length;

  // Handle refresh data
  const handleRefresh = useCallback(async () => {
    try {
      await refreshAllData();
      toast({
        title: "Data Refreshed",
        description: "Account data has been refreshed successfully."
      });
    } catch (error) {
      toast({
        title: "Refresh Failed", 
        description: "Failed to refresh account data.",
        variant: "destructive"
      });
    }
  }, [refreshAllData]);

  // Handle sophisticated assignment generation
  const handleSophisticatedAssignment = async (config: any) => {
    console.log(`[SophisticatedAssignment] Starting sophisticated assignment for all accounts with config:`, config);
    
    // Import and use the enhanced assignment service (uses database rules)
    const { EnhancedAssignmentService } = await import('@/services/enhancedAssignmentService');
    const service = EnhancedAssignmentService.getInstance();
    
    try {
      // Set up progress callback
      service.setProgressCallback((progress) => {
        setAssignmentProgress(prev => ({
          ...prev,
          progress: progress.progress,
          status: progress.status,
          stages: prev.stages.map(s => ({
            ...s,
            isActive: s.id === progress.stage,
            progress: s.id === progress.stage ? progress.progress : s.progress
          }))
        }));
      });

      setShowAssignmentProgress(true);
      
      const result = await service.generateBalancedAssignments(buildId!, 'All', 'all');
      
      if (result) {
        // Update workload balance data
        setWorkloadBalanceData({
          reps: result.statistics.repWorkloads.map(rep => ({
            repId: rep.repId,
            repName: rep.repName,
            region: rep.region,
            currentARR: rep.currentARR,
            proposedARR: rep.proposedARR,
            currentAccounts: rep.currentAccounts,
            proposedAccounts: rep.proposedAccounts,
            territories: rep.territories || new Set()
          })),
          balanceScore: result.statistics.balanceScore,
          variance: result.statistics.varianceScore,
          repsAboveMinimum: 0, // Will be calculated by visualization component
          averageARR: result.statistics.averageAssignmentsPerRep
        });

        // Store result for preview dialog
        setSophisticatedAssignmentResult(result);

        // Show preview dialog
        setTimeout(() => {
          setShowAssignmentProgress(false);
          setShowPreviewDialog(true);
        }, 1000);

        toast({
          title: "Sophisticated Assignment Complete",
          description: `Generated ${result.assignedAccounts} assignments with ${result.statistics.balanceScore}% balance score`,
        });
      }
    } catch (error) {
      console.error('Sophisticated assignment failed:', error);
      setShowAssignmentProgress(false);
      toast({
        title: "Assignment Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    }
  };

  // Handle tab-aware assignment generation
  const onGenerateAssignments = async (accountType: 'customers' | 'prospects' | 'all' = 'all') => {
    if (!buildId) return;
    
    // Clear the "config just saved" flag since we're now generating
    setConfigJustSaved(false);
    
    const accountCount = accountType === 'customers' ? allCustomerAccounts.length : 
                       accountType === 'prospects' ? allProspectAccounts.length : 
                       allCustomerAccounts.length + allProspectAccounts.length;

    console.log(`[Assignment Generation] Starting generation for: ${accountType} (${accountCount} accounts)`);

    // Initialize progress tracking
    setAssignmentProgress({
      isRunning: true,
      progress: 0,
      status: `Initializing ${accountType} assignment generation...`,
      stages: [],
      accountsProcessed: 0,
      totalAccounts: accountCount,
      processingRate: 0,
      estimatedTimeRemaining: 0
    });
    setShowAssignmentProgress(true);

    try {
      // Update progress stages as we go
      const updateProgress = (stageId: string, progress: number, status: string) => {
        setAssignmentProgress(prev => ({
          ...prev,
          progress,
          status,
          stages: prev.stages.map(stage => ({
            ...stage,
            isActive: stage.id === stageId,
            isCompleted: prev.stages.findIndex(s => s.id === stageId) < prev.stages.findIndex(s => s.isActive),
            progress: stage.id === stageId ? progress : stage.progress
          }))
        }));
      };

      // Stage 1: Loading data
      updateProgress('loading', 25, 'Loading account data and representatives...');
      await new Promise(resolve => setTimeout(resolve, 500)); // Allow UI to update

      // Stage 2: Analyzing accounts  
      updateProgress('analyzing', 50, `Analyzing ${accountCount.toLocaleString()} accounts...`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Stage 3: Applying rules
      updateProgress('applying', 75, 'Applying assignment rules (geo-first, continuity, load balancing)...');
      
      const result = await handleGenerateAssignments(accountType);
      
      // Stage 4: Finalizing
      updateProgress('finalizing', 100, 'Assignment proposals generated successfully!');
      
      if (result) {
        setAssignmentProgress(prev => ({
          ...prev,
          completedAt: new Date(),
          isRunning: false,
          stages: prev.stages.map(stage => ({ ...stage, isCompleted: true, isActive: false }))
        }));
        
        // Check if AI optimizations are available from POST_PROCESSOR
        const hasAIOptimizations = checkIfOptimizationAvailable(result);
        
        // Small delay to show completion, then show appropriate dialog
        setTimeout(() => {
          setShowAssignmentProgress(false);
          
          if (hasAIOptimizations) {
            // Show AI optimizer dialog if optimizations were generated
            console.log('[Assignment Generation] 🤖 AI optimizations detected, showing optimizer dialog');
            setShowAIOptimizer(true);
          } else {
            // Show standard preview dialog
            console.log('[Assignment Generation] 📋 No AI optimizations, showing preview dialog');
            setShowPreviewDialog(true);
          }
        }, 1000);
      }
    } catch (error) {
      setAssignmentProgress(prev => ({
        ...prev,
        isRunning: false,
        error: 'Failed to generate assignments. Please try again.',
        progress: 0
      }));
    }
  };

  // Handle preview assignments - show generated assignments if they exist
  const onPreviewAssignments = () => {
    const resultToPreview = sophisticatedAssignmentResult || assignmentResult;
    
    if (!resultToPreview || !resultToPreview.proposals || resultToPreview.proposals.length === 0) {
      toast({
        title: "No Assignments Generated",
        description: "Please generate assignments first before previewing them.",
        variant: "destructive"
      });
      return;
    }
    
    // Open the preview dialog with the generated assignments
    setShowPreviewDialog(true);
  };

  // Handle assignment execution with comprehensive tracking
  const onExecuteAssignments = async () => {
    // Set loading state IMMEDIATELY for responsive UI feedback
    setIsApplyingAssignments(true);
    
    // Close preview dialog and show the applying overlay immediately
    setShowPreviewDialog(false);
    setShowApplyingOverlay(true);
    setApplyingStatus('saving');
    
    try {
      // Handle both sophisticated and regular assignment results
      const resultToExecute = sophisticatedAssignmentResult || assignmentResult;
      
      if (!resultToExecute) {
        toast({
          title: "No Assignments to Execute",
          description: "Please generate assignments first.",
          variant: "destructive"
        });
        setIsApplyingAssignments(false);
        setShowApplyingOverlay(false);
        return;
      }

      const executionType = sophisticatedAssignmentResult ? 'sophisticated' : 'regular';
      const proposalCount = resultToExecute.proposals?.length || 0;
      
      console.log('[Execute] 🚀 Starting assignment execution:', {
        type: executionType,
        proposals: proposalCount,
        assignedAccounts: resultToExecute.assignedAccounts || 0,
        conflicts: resultToExecute.conflicts?.length || 0,
        buildId
      });

      // Execute using the hook's function but pass the correct result
      if (sophisticatedAssignmentResult) {
        console.log('[Execute] 🎯 Executing sophisticated assignments...');
        await executeSophisticatedAssignments(sophisticatedAssignmentResult);
      } else {
        console.log('[Execute] 🎯 Executing regular assignments...');
        const executed = await handleExecuteAssignments();
        if (!executed) {
          // Execution was blocked by imbalance warning - don't continue to success
          // User will see the warning dialog and can choose to proceed or go back
          console.log('[Execute] ⚠️ Execution blocked by imbalance warning');
          setIsApplyingAssignments(false);
          setShowApplyingOverlay(false);
          return;
        }
      }
      
      setSophisticatedAssignmentResult(null);
      
      console.log('[Execute] ✅ Assignment execution completed successfully');

      // Update status to refreshing
      setApplyingStatus('refreshing');

      // Force refresh all data FIRST - before showing success
      console.log('[Execute] 🔄 Triggering final data refresh...');
      await refreshAllData();
      
      // Wait for data propagation to ensure stage 2 unlock animation triggers
      await new Promise(resolve => setTimeout(resolve, 800));
      
      console.log('[Execute] 🎉 Data refresh complete, showing success dialog');
      
      // Hide applying overlay and show success dialog
      setShowApplyingOverlay(false);
      
      // NOW show success dialog with animated confirmation
      setAppliedAssignmentCount(proposalCount);
      setShowSuccessDialog(true);
      
      // AI optimization toast removed - HIGHS handles balancing
      
    } catch (error) {
      console.error('[Execute] ❌ Assignment execution failed:', error);
      setShowApplyingOverlay(false);
      toast({
        title: "❌ Assignment Execution Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsApplyingAssignments(false);
    }
  };

  // Handle AI optimizations applied
  const handleAIOptimizationsApplied = async () => {
    setShowAIOptimizer(false);
    
    toast({
      title: "✅ AI Optimizations Applied",
      description: "Balance optimized successfully. Refreshing data...",
    });
    
    // Refresh data to show the updated balance (AI optimizer already updated the database)
    await refreshAllData();
  };

  // Helper function for retrying database operations with exponential backoff
  const retryWithBackoff = async (
    operation: () => Promise<void>
  ): Promise<void> => {
    const maxRetries = 3;
    const baseDelay = 1000;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await operation();
        return;
      } catch (error: any) {
        const isTimeout = error?.message?.includes('timeout') || error?.code === '57014';
        const isLastAttempt = attempt === maxRetries - 1;
        
        if (!isTimeout || isLastAttempt) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[ResetAssignments] Retry ${attempt + 1}/${maxRetries} after ${delay}ms timeout...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  // Optimized batch processor with dynamic sizing and exponential backoff
  const processWithSimpleBatching = async (
    tableName: 'accounts' | 'opportunities',
    buildId: string,
    updateColumns: Record<string, any>,
    onProgress: (processed: number, rate: number, stepProgress: number, statusUpdate?: any) => void,
    cancelToken: { cancelled: boolean } = { cancelled: false }
  ) => {
    // Different strategies for accounts vs opportunities
    const getOptimalBatchSize = (tableName: 'accounts' | 'opportunities', totalRecords: number) => {
      if (tableName === 'opportunities') {
        // Ultra-conservative for opportunities due to complex indexes
        return Math.min(3, Math.max(1, Math.floor(totalRecords / 100)));
      }
      
      // Standard logic for accounts (works well)
      if (totalRecords < 1000) return 50;
      if (totalRecords < 10000) return 200;
      if (totalRecords < 50000) return 500;
      return 1000;
    };

    let processed = 0;
    let currentBatchSize = 0; // Will be set after we know the total count
    let retryCount = 0;
    const maxRetries = 3;
    const startTime = Date.now();
    
    // Emergency bypass tracking for opportunities
    let consecutiveTimeouts = 0;
    const maxConsecutiveTimeouts = 3; // Reduced from 5 to 3 for faster bypass
    let emergencyBypassActivated = false;
    
    const filterColumn = 'new_owner_id';
    
    console.log(`[ResetAssignments] Starting ${tableName} reset with optimized batching...`);
    
    // Get total count with filtering
    const { count: totalCount } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .eq('build_id', buildId)
      .not(filterColumn, 'is', null);

    if (!totalCount || totalCount === 0) {
      console.log(`[ResetAssignments] No ${tableName} to reset`);
      return 0;
    }

    // Set optimal batch size based on table type and dataset size
    currentBatchSize = getOptimalBatchSize(tableName, totalCount);
    
    console.log(`[ResetAssignments] Found ${totalCount} ${tableName} to reset with batch size: ${currentBatchSize}`);

    while (processed < totalCount && !cancelToken.cancelled) {
      try {
        // Process batch with current batch size
        const { error } = await supabase
          .from(tableName as any)
          .update(updateColumns as any)
          .eq('build_id', buildId)
          .not(filterColumn, 'is', null)
          .limit(currentBatchSize);

        if (error) throw error;
        
        processed += Math.min(currentBatchSize, totalCount - processed);
        retryCount = 0; // Reset retry count on success
        consecutiveTimeouts = 0; // Reset timeout counter on success
        
        // Calculate performance metrics
        const elapsed = (Date.now() - startTime) / 1000;
        const currentRate = processed / elapsed;
        const stepProgress = (processed / totalCount) * 100;
        
        onProgress(processed, currentRate, stepProgress, {
          statusDetails: `Processing ${tableName} (batch: ${currentBatchSize})`,
          currentBatchSize,
          timeoutCount: consecutiveTimeouts,
          retryCount: 0,
          emergencyBypass: emergencyBypassActivated,
          isRetrying: false
        });
        console.log(`[ResetAssignments] ${tableName}: ${processed}/${totalCount} (${Math.round(stepProgress)}%) - ${Math.round(currentRate)} records/sec - Batch: ${currentBatchSize}`);
        
        // Different delays for different table types
        let baseDelay = 200;
        if (tableName === 'opportunities') {
          // Much longer delays for opportunities due to complex indexes
          baseDelay = totalCount > 100 ? 2500 : 2000;
        } else {
          // Standard delays for accounts
          baseDelay = totalCount > 20000 ? 400 : totalCount > 5000 ? 300 : 200;
        }
        
        await new Promise(resolve => setTimeout(resolve, baseDelay));
        
      } catch (error: any) {
        console.error(`[ResetAssignments] Error updating ${tableName} (attempt ${retryCount + 1}):`, error);
        
        retryCount++;
        
        // Implement exponential backoff and adaptive batch sizing
        if (retryCount <= maxRetries) {
          // Different retry strategies for different table types
          if (tableName === 'opportunities') {
            // For opportunities, go to single record immediately on error
            currentBatchSize = 1;
            console.log(`[ResetAssignments] Reducing ${tableName} batch size to ${currentBatchSize} after error`);
          } else {
            // Standard retry logic for accounts
            if (currentBatchSize > 10) {
              currentBatchSize = Math.max(10, Math.floor(currentBatchSize / 2));
              console.log(`[ResetAssignments] Reducing ${tableName} batch size to ${currentBatchSize} after error`);
            }
          }
          
          // Longer backoff delays for opportunities
          const backoffMultiplier = tableName === 'opportunities' ? 3 : 1;
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCount - 1) * backoffMultiplier, 8000);
          console.log(`[ResetAssignments] Retrying ${tableName} in ${backoffDelay}ms...`);
          
          // Update progress to show retry status
          const currentRate = processed / ((Date.now() - startTime) / 1000);
          const stepProgress = (processed / totalCount) * 100;
          onProgress(processed, currentRate, stepProgress, {
            statusDetails: `Database timeout - retrying with smaller batch (${currentBatchSize})`,
            currentBatchSize,
            timeoutCount: consecutiveTimeouts,
            retryCount,
            emergencyBypass: emergencyBypassActivated,
            isRetrying: true,
            nextRetryIn: backoffDelay
          });
          
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          
          continue; // Retry the same batch
        }
        
        // Emergency bypass for opportunities with persistent timeouts
        if (tableName === 'opportunities') {
          consecutiveTimeouts++;
          
          // If we've hit too many consecutive timeouts, activate emergency bypass
          if (consecutiveTimeouts >= maxConsecutiveTimeouts && !emergencyBypassActivated) {
            emergencyBypassActivated = true;
            console.log(`[ResetAssignments] 🚨 EMERGENCY BYPASS ACTIVATED for ${tableName} after ${consecutiveTimeouts} consecutive timeouts`);
            
            // Update progress to show emergency bypass is active
            const emergencyProgress = Math.min(100, (processed / totalCount) * 100);
            const currentRate = processed / ((Date.now() - startTime) / 1000);
            onProgress(totalCount, currentRate, emergencyProgress, {
              statusDetails: `Emergency bypass activated - skipping problematic ${tableName}`,
              currentBatchSize,
              timeoutCount: consecutiveTimeouts,
              retryCount,
              emergencyBypass: true,
              isRetrying: false
            });
            
            throw new Error(`EMERGENCY_BYPASS: ${tableName} reset skipped due to persistent database timeouts. ${processed}/${totalCount} records processed before bypass.`);
          }
          
          if (currentBatchSize === 1) {
            console.log(`[ResetAssignments] Timeout ${consecutiveTimeouts}/${maxConsecutiveTimeouts} - Skipping problematic ${tableName} record and continuing...`);
            processed += 1; // Skip this record and continue
            retryCount = 0;
            
            // Add extra delay before continuing
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }
        }
        
        // For accounts, try single record processing as last resort
        if (tableName === 'accounts' && currentBatchSize > 1) {
          try {
            console.log(`[ResetAssignments] Final attempt with single record for ${tableName}...`);
            const { error: retryError } = await supabase
              .from(tableName as any)
              .update(updateColumns as any)
              .eq('build_id', buildId)
              .not(filterColumn, 'is', null)
              .limit(1);
              
            if (!retryError) {
              processed += 1;
              retryCount = 0;
              currentBatchSize = 1; // Continue with single record processing
              continue;
            }
          } catch (retryError) {
            console.error(`[ResetAssignments] Single record retry failed for ${tableName}:`, retryError);
          }
        }
        
        throw new Error(`Failed to reset ${tableName} after ${maxRetries} retries: ${error.message}`);
      }
    }
    
    if (cancelToken.cancelled) {
      throw new Error(`Reset cancelled by user. Progress: ${processed}/${totalCount} ${tableName}`);
    }
    
    console.log(`[ResetAssignments] Completed ${tableName} reset: ${processed}/${totalCount}`);
    return processed;
  };

  // Handle cancel reset
  const handleCancelReset = () => {
    if (resetCancelToken) {
      resetCancelToken.cancelled = true;
      console.log('[ResetAssignments] Reset cancelled by user');
      
      setResetProgress(prev => ({
        ...prev,
        isRunning: false,
        error: `Reset cancelled by user. Progress saved: ${prev.accountsProcessed} accounts, ${prev.opportunitiesProcessed} opportunities completed.`
      }));
      
      setIsResetting(false);
      
      toast({
        title: "Reset Cancelled",
        description: "The reset process has been cancelled. Your progress has been saved.",
        variant: "destructive"
      });
    }
  };

  // Reset all assignments to enable testing
  const handleResetAssignments = async () => {
    if (!buildId) return;

    setIsResetting(true);
    setShowResetProgress(true);
    
    // Create new cancel token
    const cancelToken = { cancelled: false };
    setResetCancelToken(cancelToken);
    
    const startTime = Date.now();
    
      // Initialize progress with enhanced tracking
      setResetProgress({
        isRunning: true,
        currentStep: 0,
        totalSteps: 4,
        stepName: 'Starting reset process...',
        stepProgress: 0,
        totalProgress: 0,
        accountsProcessed: 0,
        opportunitiesProcessed: 0,
        totalAccounts: 0,
        totalOpportunities: 0,
        processingRate: 0,
        estimatedTimeRemaining: 0,
        timeoutCount: 0,
        retryCount: 0,
        emergencyBypass: false,
        isRetrying: false
      });

    try {
      console.log(`[ResetAssignments] 🔄 Starting optimized reset for build ${buildId}...`);
      
      // Step 1: Try database function first (faster for large datasets)
      setResetProgress(prev => ({
        ...prev,
        currentStep: 1,
        stepName: 'Attempting database bulk reset...',
        stepProgress: 0,
        totalProgress: 10
      }));
      
      try {
        console.log(`[ResetAssignments] 1/2 Trying bulk database function...`);
        
        const { data: bulkResetResult, error: bulkError } = await supabase
          .rpc('reset_build_assignments_bulk', { p_build_id: buildId });
        
        if (!bulkError && bulkResetResult && bulkResetResult.length > 0) {
          const result = bulkResetResult[0];
          console.log(`[ResetAssignments] ✅ Bulk reset successful: ${result.accounts_reset} accounts, ${result.opportunities_reset} opportunities, ${result.assignments_deleted} assignments`);
          
          setResetProgress(prev => ({
            ...prev,
            currentStep: 2,
            stepName: 'Clearing cache and refreshing data...',
            stepProgress: 0,
            totalProgress: 90,
            accountsProcessed: result.accounts_reset,
            opportunitiesProcessed: result.opportunities_reset
          }));
          
          // Clear cache and refresh ALL data (not just accounts)
          buildDataService.clearBuildCache(buildId);
          
          // Clear local assignment state
          setSophisticatedAssignmentResult(null);
          
          await refreshAllData();
          
          // Complete
          setResetProgress(prev => ({
            ...prev,
            isRunning: false,
            stepProgress: 100,
            totalProgress: 100,
            completedAt: new Date(),
            estimatedTimeRemaining: 0
          }));

          console.log(`[ResetAssignments] ✅ Bulk reset completed successfully in ${(Date.now() - startTime) / 1000}s`);
          toast({
            title: "Assignments Reset",
            description: `Successfully reset ${result.accounts_reset} accounts and ${result.opportunities_reset} opportunities using optimized bulk operation.`,
          });
          return;
        }
      } catch (bulkError) {
        console.log(`[ResetAssignments] Bulk reset failed, falling back to batch processing:`, bulkError);
      }
      
      // Step 2: Fallback to batch processing
      setResetProgress(prev => ({
        ...prev,
        currentStep: 1,
        stepName: 'Using fallback batch processing...',
        stepProgress: 0,
        totalProgress: 2.5
      }));
      
      // Get total counts for progress tracking
      const [{ count: totalAccounts }, { count: totalOpportunities }] = await Promise.all([
        supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('build_id', buildId).not('new_owner_id', 'is', null),
        supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('build_id', buildId).not('new_owner_id', 'is', null)
      ]);

      const actualTotalAccounts = totalAccounts || 0;
      const actualTotalOpportunities = totalOpportunities || 0;
      const totalRecords = actualTotalAccounts + actualTotalOpportunities;
      
      setResetProgress(prev => ({
        ...prev,
        totalAccounts: actualTotalAccounts,
        totalOpportunities: actualTotalOpportunities
      }));
      
      // Clear assignments table
      setResetProgress(prev => ({
        ...prev,
        currentStep: 1,
        stepName: 'Clearing assignment proposals',
        stepProgress: 0,
        totalProgress: 5
      }));
      
      console.log(`[ResetAssignments] 1/4 Clearing assignments table...`);
      await retryWithBackoff(async () => {
        const { error: assignmentsError } = await supabase
          .from('assignments')
          .delete()
          .eq('build_id', buildId);
        if (assignmentsError) throw assignmentsError;
      });

      setResetProgress(prev => ({
        ...prev,
        stepProgress: 100,
        totalProgress: 10
      }));

      // Reset accounts
      setResetProgress(prev => ({
        ...prev,
        currentStep: 2,
        stepName: 'Resetting account assignments',
        stepProgress: 0
      }));
      
      console.log(`[ResetAssignments] 2/4 Resetting accounts with simple batching...`);
      const accountsProcessed = await processWithSimpleBatching(
        'accounts',
        buildId,
        { new_owner_id: null, new_owner_name: null },
        (processed, rate, stepProgress, statusUpdate) => {
          const remaining = actualTotalAccounts ? (actualTotalAccounts - processed) / rate : 0;
          // Accounts step is 10-50% of total progress (40% weight)
          const accountsWeight = actualTotalAccounts / Math.max(totalRecords, 1);
          const dynamicProgress = 10 + (stepProgress * 0.4 * accountsWeight);
          setResetProgress(prev => ({
            ...prev,
            accountsProcessed: processed,
            stepProgress,
            totalProgress: Math.min(50, dynamicProgress),
            processingRate: rate,
            estimatedTimeRemaining: remaining,
            ...statusUpdate
          }));
        },
        cancelToken
      );

      if (cancelToken.cancelled) {
        throw new Error('Reset cancelled by user');
      }

      // Reset opportunities with emergency bypass handling
      const baseProgressAfterAccounts = 10 + (40 * (actualTotalAccounts / Math.max(totalRecords, 1)));
      setResetProgress(prev => ({
        ...prev,
        currentStep: 3,
        stepName: 'Resetting opportunity assignments',
        stepProgress: 0,
        totalProgress: Math.min(50, baseProgressAfterAccounts)
      }));
      
      console.log(`[ResetAssignments] 3/4 Resetting opportunities with simple batching...`);
      let oppsProcessed = 0;
      
      try {
        oppsProcessed = await processWithSimpleBatching(
          'opportunities',
          buildId,
          { new_owner_id: null, new_owner_name: null },
          (processed, rate, stepProgress, statusUpdate) => {
            const remaining = actualTotalOpportunities ? (actualTotalOpportunities - processed) / rate : 0;
            // Opportunities step is 50-85% of total progress (35% weight)
            const oppsWeight = actualTotalOpportunities / Math.max(totalRecords, 1);
            const currentBaseProgress = 10 + (40 * (actualTotalAccounts / Math.max(totalRecords, 1)));
            const dynamicProgress = currentBaseProgress + (stepProgress * 0.35 * oppsWeight);
            setResetProgress(prev => ({
              ...prev,
              opportunitiesProcessed: processed,
              stepProgress,
              totalProgress: Math.min(85, dynamicProgress),
              processingRate: rate,
              estimatedTimeRemaining: remaining,
              ...statusUpdate
            }));
          },
          cancelToken
        );
      } catch (error: any) {
        if (error.message.includes('EMERGENCY_BYPASS')) {
          console.log(`[ResetAssignments] 🚨 Emergency bypass activated for opportunities: ${error.message}`);
          
          // Extract processed count from error message
          const match = error.message.match(/(\d+)\/\d+ records processed/);
          oppsProcessed = match ? parseInt(match[1]) : 0;
          
          // Update progress to show emergency bypass
          const currentBaseProgress = 10 + (40 * (actualTotalAccounts / Math.max(totalRecords, 1)));
          setResetProgress(prev => ({
            ...prev,
            stepName: 'Emergency bypass: Opportunity assignments skipped',
            stepProgress: 100,
            totalProgress: Math.min(85, currentBaseProgress + 35),
            opportunitiesProcessed: oppsProcessed,
            estimatedTimeRemaining: 0,
            error: `Emergency bypass activated: ${oppsProcessed}/${actualTotalOpportunities} opportunities processed. Account assignments completed successfully.`
          }));
          
          // Show user-friendly warning (not destructive)
          toast({
            title: "Emergency Bypass Activated",
            description: "Opportunity assignments were skipped due to database performance issues. Account assignments were completed successfully.",
            variant: "default"
          });
          
          console.log(`[ResetAssignments] Continuing with accounts-only reset. Opportunities will need manual cleanup.`);
        } else {
          throw error; // Re-throw non-bypass errors
        }
      }

      // Clear balancing metrics and refresh
      setResetProgress(prev => ({
        ...prev,
        currentStep: 4,
        stepName: 'Clearing balancing metrics and refreshing cache',
        stepProgress: 0,
        totalProgress: 85,
        estimatedTimeRemaining: 0
      }));
      
      console.log(`[ResetAssignments] 4/4 Clearing balancing metrics...`);
      await retryWithBackoff(async () => {
        const { error: balancingMetricsError } = await supabase
          .from('balancing_metrics')
          .delete()
          .eq('build_id', buildId);
        if (balancingMetricsError) throw balancingMetricsError;
      });

      setResetProgress(prev => ({
        ...prev,
        stepProgress: 50,
        totalProgress: 92.5
      }));

      // Clear service cache and refresh ALL data (not just accounts)
      buildDataService.clearBuildCache(buildId);
      
      // Clear local assignment state
      setSophisticatedAssignmentResult(null);
      
      await refreshAllData();

      // Complete - ensure 100% progress
      setResetProgress(prev => ({
        ...prev,
        isRunning: false,
        stepName: 'Reset completed successfully',
        stepProgress: 100,
        totalProgress: 100,
        completedAt: new Date(),
        estimatedTimeRemaining: 0,
        statusDetails: undefined,
        isRetrying: false,
        emergencyBypass: false
      }));

      console.log(`[ResetAssignments] ✅ Reset completed successfully in ${(Date.now() - startTime) / 1000}s`);
      toast({
        title: "Assignments Reset",
        description: `Successfully reset ${accountsProcessed} accounts and ${oppsProcessed} opportunities using fallback batch processing.`,
      });
    } catch (error) {
      console.error('Reset assignments error:', error);
      
      let errorMessage = "There was an error resetting assignments.";
      let isRecoverable = false;
      
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('statement timeout') || (error as any)?.code === '57014') {
          errorMessage = "Database timeout detected. The reset was partially completed. You can safely retry to continue from where it left off.";
          isRecoverable = true;
        } else if (error.message.includes('connection') || error.message.includes('network')) {
          errorMessage = "Network connection issue. Please check your connection and retry.";
          isRecoverable = true;
        } else {
          errorMessage = error.message;
        }
      }
      
      setResetProgress(prev => ({
        ...prev,
        isRunning: false,
        error: errorMessage
      }));
      
      toast({
        title: "Reset Failed",
        description: errorMessage + (isRecoverable ? " You can retry to continue the operation." : ""),
        variant: "destructive"
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Handle export functionality using the already-loaded UI data
  const handleExportAssignments = async (accountType: 'customers' | 'prospects' | 'all') => {
    if (!buildId) return;

    setIsExporting(true);
    try {
      // Use the already-loaded accounts from the UI instead of re-querying
      let accountsToExport: Account[] = [];
      
      if (accountType === 'customers') {
        accountsToExport = allCustomerAccounts;
      } else if (accountType === 'prospects') {
        accountsToExport = allProspectAccounts;
      } else {
        accountsToExport = [...allCustomerAccounts, ...allProspectAccounts];
      }

      // Filter to only accounts with assignments
      const accountsWithAssignments = accountsToExport.filter(account => account.new_owner_id);

      if (accountsWithAssignments.length === 0) {
        toast({
          title: "No Assignments to Export",
          description: "There are no assignment proposals to export. Generate assignments first.",
          variant: "destructive"
        });
        return;
      }

      // Prepare export data
      const exportData = accountsWithAssignments.map(account => ({
        'Account ID': account.sfdc_account_id,
        'Account Name': account.account_name,
        'Current Owner': account.owner_name || 'Unassigned',
        'New Owner': account.new_owner_name || 'Unassigned',
        'Account Type': account.is_customer ? 'Customer' : 'Prospect',
        'ARR': getAccountARR(account),
        'Geo': account.geo,
        'Country': account.hq_country || '',
        'Territory': account.sales_territory || '',
        'Enterprise/Commercial': account.enterprise_vs_commercial || '',
        'Expansion Tier': account.expansion_tier || '',
        'Risk Flag': account.risk_flag ? 'Yes' : 'No',
        'CRE Risk': account.cre_risk ? 'Yes' : 'No'
      }));

      // Create filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `assignment-export-${accountType}-${timestamp}.csv`;

      // Download the export (map to correct format)
      const properExportData = exportData.map(item => ({
        account_id: item['Account ID'],
        account_name: item['Account Name'],
        hq_location: item['Country'],
        tier: item['Expansion Tier'],
        arr: item.ARR,
        current_owner_id: '',
        current_owner_name: item['Current Owner'],
        new_owner_id: '',
        new_owner_name: item['New Owner'],
        assignment_reasoning: '',
        risk_level: item['Risk Flag'],
        assignment_status: 'Assigned',
        reassigned_flag: item['Current Owner'] !== item['New Owner'],
        assignment_type: item['Account Type'] === 'Customer' ? 'customer' as const : 'prospect' as const,
        geo: item.Geo,
        sales_territory: item.Territory
      }));
      
      const summary = {
        totalAccounts: exportData.length,
        customerAccounts: exportData.filter(d => d['Account Type'] === 'Customer').length,
        prospectAccounts: exportData.filter(d => d['Account Type'] === 'Prospect').length,
        assignedAccounts: exportData.length,
        unassignedAccounts: 0,
        exportDate: new Date().toISOString(),
        buildId: buildId || ''
      };
      
      const { downloadAssignmentExport } = await import('@/utils/assignmentExportUtils');
      downloadAssignmentExport(properExportData, summary, accountType);

      toast({
        title: "Export Completed",
        description: `Successfully exported ${exportData.length} ${accountType} assignments.`
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting the assignments.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Slack notification when optimization completes
  const handleOptimizationComplete = async (elapsedTime: string, proposalCount: number) => {
    if (!user?.email) {
      console.warn('[Slack Notification] No user email available for notification');
      return;
    }
    
    const buildName = buildInfo?.name || `Build ${buildId?.slice(0, 8)}`;
    const accountCount = allCustomerAccounts.length + allProspectAccounts.length;
    
    try {
      const result = await notifyOptimizationComplete(
        user.email,
        buildName,
        accountCount,
        proposalCount,
        elapsedTime
      );
      
      if (result.success) {
        console.log('[Slack Notification] Optimization complete notification sent');
      } else {
        console.warn('[Slack Notification] Failed to send:', result.error);
      }
    } catch (error) {
      console.error('[Slack Notification] Error sending notification:', error);
    }
  };

  // Handle account reassignment
  const handleReassignAccount = async () => {
    if (!buildId || !selectedAccount || !selectedOwnerId || !selectedOwnerName) return;

    setIsReassigning(true);
    try {
      // Update account assignment
      const { error: accountError } = await supabase
        .from('accounts')
        .update({
          new_owner_id: selectedOwnerId,
          new_owner_name: selectedOwnerName
        })
        .eq('sfdc_account_id', selectedAccount.sfdc_account_id)
        .eq('build_id', buildId);

      if (accountError) throw accountError;

      // Save assignment reason if provided
      if (reassignmentReason.trim()) {
        const { error: assignmentError } = await supabase
          .from('assignments')
          .upsert({
            build_id: buildId,
            sfdc_account_id: selectedAccount.sfdc_account_id,
            proposed_owner_id: selectedOwnerId,
            proposed_owner_name: selectedOwnerName,
            assignment_type: 'MANUAL_REASSIGNMENT',
            rationale: `MANUAL_REASSIGNMENT: ${reassignmentReason.trim()}`,
            created_by: (await supabase.auth.getUser()).data.user?.id,
            updated_at: new Date().toISOString()
          });

        if (assignmentError) {
          console.warn('Failed to save assignment reason:', assignmentError);
        }
      }

      // Refresh the data
      await handleRefresh();

      toast({
        title: "Account Reassigned",
        description: `Successfully reassigned ${selectedAccount.account_name} to ${selectedOwnerName}.`
      });

      setShowReassignDialog(false);
      setSelectedAccount(null);
      setReassignmentReason('');
      setSelectedOwnerId('');
      setSelectedOwnerName('');
    } catch (error) {
      console.error('Reassignment error:', error);
      toast({
        title: "Reassignment Failed",
        description: "There was an error reassigning the account.",
        variant: "destructive"
      });
    } finally {
      setIsReassigning(false);
    }
  };

  // Utility functions for UI rendering
  const getContinuityRiskBadge = (account: Account) => {
    const riskCount = (account.risk_flag ? 1 : 0) + (account.cre_risk ? 1 : 0);
    
    if (riskCount === 0) return null;
    
    const variant = riskCount >= 2 ? "destructive" : "secondary";
    const text = riskCount >= 2 ? "High Risk" : "At Risk";
    
    return <Badge variant={variant} className="text-xs">{text}</Badge>;
  };

  const getAssignmentTypeBadge = (account: Account) => {
    if (!account.new_owner_id) return null;
    
    const isNewAssignment = !account.owner_id || account.owner_id !== account.new_owner_id;
    const variant = isNewAssignment ? "default" : "outline";
    const text = isNewAssignment ? "New Assignment" : "No Change";
    
    return <Badge variant={variant} className="text-xs">{text}</Badge>;
  };

  const getDisplayTier = (account: Account) => {
    if (account.is_customer) {
      return account.expansion_tier || 'Untiered';
    } else {
      return account.initial_sale_tier || 'Untiered';
    }
  };

  const getDisplayARR = (account: Account) => {
    const arr = getAccountARR(account);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(arr);
  };

  // Handle fixing owner assignment data
  const handleFixOwnerData = async () => {
    if (!buildId) return;
    
    try {
      setIsFixingData(true);
      
      toast({
        title: "🔧 Fixing Assignment Data",
        description: "Converting owner names to valid rep IDs...",
      });

      const updatedCount = await fixOwnerAssignments(buildId);
      
      toast({
        title: "✅ Data Fixed Successfully",
        description: `Updated ${updatedCount} account assignments. Refreshing data...`,
      });
      
      // Refresh all data after fixing
      await refreshAllData();
      
    } catch (error) {
      console.error('Fix owner data error:', error);
      toast({
        title: "❌ Fix Failed",
        description: error instanceof Error ? error.message : "Failed to fix assignment data",
        variant: "destructive"
      });
    } finally {
      setIsFixingData(false);
    }
  };

  const getRiskLevel = (account: Account) => {
    const riskFactors = [
      account.risk_flag,
      account.cre_risk,
      (account.cre_count && account.cre_count > 0)
    ].filter(Boolean).length;
    
    if (riskFactors >= 2) return 'high';
    if (riskFactors === 1) return 'medium';
    return 'low';
  };

  if (!buildId) {
    return (
      <div className="p-8 text-center">
        <div className="max-w-md mx-auto">
          <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Build Selected</h3>
          <p className="text-muted-foreground">
            Please select a build from the dashboard to begin using the Assignment Engine.
          </p>
        </div>
      </div>
    );
  }

  const isLoading = accountsLoading || ownersLoading || calculationsLoading;
  const hasError = accountsError || calculationsError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Assignment Engine</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowHowItWorks(true)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="How It Works"
            >
              <Info className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-muted-foreground">
            Configure your assignment rules, then generate book assignments
          </p>
        </div>
      </div>

      {/* Primary Flow: Configure → Generate (Arrow Buttons) */}
      <div className="flex items-stretch gap-0 h-20">
        {/* Step 1: Configure */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowConfigDialog(true)}
              className={`
                relative flex-1 flex items-center justify-center gap-4 py-4 px-6 transition-all duration-300
                ${isConfigured 
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/30' 
                  : 'bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 glow-primary'
                }
                rounded-l-xl
              `}
              style={{
                clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%)'
              }}
            >
              <span className={`
                w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0
                ${isConfigured 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-primary-foreground/20 text-primary-foreground'
                }
              `}>
                {isConfigured ? <CheckCircle className="w-5 h-5" /> : '1'}
              </span>
              <div className="text-left">
                <span className="font-semibold text-lg block">Configure</span>
                <span className={`text-sm ${isConfigured ? 'text-emerald-600/70 dark:text-emerald-400/70' : 'text-primary-foreground/70'}`}>
                  {isConfigured ? 'Click to edit settings' : 'Set up assignment rules'}
                </span>
              </div>
              <Settings className={`w-6 h-6 ml-2 ${!isConfigured ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isConfigured 
              ? 'Edit thresholds, territory mapping, and priority rules' 
              : 'Configure assignment targets before generating'
            }
          </TooltipContent>
        </Tooltip>

        {/* Step 2: Generate (with dropdown) */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={isGenerating || isLoading || !isConfigured}
                  className={`
                    relative flex-1 flex items-center justify-center gap-4 py-4 px-6 transition-all duration-300
                    ${!isConfigured 
                      ? 'bg-muted/30 text-muted-foreground/50 cursor-not-allowed'
                      : configJustSaved
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30 glow-amber'
                        : isGenerating
                          ? 'bg-primary text-primary-foreground'
                          : hasExistingAssignments
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/30'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                    }
                    rounded-r-xl
                  `}
                  style={{
                    clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 20px 50%)'
                  }}
                >
                  <span className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0
                    ${!isConfigured 
                      ? 'bg-muted-foreground/20 text-muted-foreground/50'
                      : configJustSaved
                        ? 'bg-amber-500 text-white'
                        : hasExistingAssignments
                          ? 'bg-emerald-500 text-white'
                          : 'bg-muted-foreground/20 text-muted-foreground'
                    }
                  `}>
                    {hasExistingAssignments && !configJustSaved ? <CheckCircle className="w-5 h-5" /> : '2'}
                  </span>
                  <div className="text-left">
                    <span className="font-semibold text-lg block">
                      {configJustSaved ? 'Generate' : hasExistingAssignments ? 'Re-generate' : 'Generate'}
                    </span>
                    <span className="text-sm opacity-70">
                      {isGenerating 
                        ? 'Processing...' 
                        : configJustSaved
                          ? 'Apply new settings'
                          : hasExistingAssignments
                            ? `${existingAssignmentCount.toLocaleString()} assigned • Click to re-run`
                            : 'Run assignment engine'
                      }
                    </span>
                  </div>
                  {isGenerating ? (
                    <Loader2 className="w-6 h-6 ml-2 animate-spin" />
                  ) : (
                    <>
                      <Target className="w-6 h-6 ml-2" />
                      {isConfigured && <ChevronDown className="w-4 h-4 ml-1" />}
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {!isConfigured 
                ? 'Complete configuration first'
                : configJustSaved
                  ? 'Settings updated — click to generate assignments with new configuration'
                  : hasExistingAssignments
                    ? 'Run assignment engine again to update assignments'
                    : 'Generate book assignments based on your configuration'
              }
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="center" className="w-48">
            <DropdownMenuItem onClick={() => onGenerateAssignments('all')}>
              <Target className="h-4 w-4 mr-2" />
              All Accounts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onGenerateAssignments('customers')}>
              <UserCheck className="h-4 w-4 mr-2" />
              Customers Only
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onGenerateAssignments('prospects')}>
              <Users className="h-4 w-4 mr-2" />
              Prospects Only
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Secondary Actions Row */}
      <div className="flex items-center justify-end px-2 gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isExporting} className="gap-2 text-muted-foreground">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExportAssignments('customers')}>
              Customers
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportAssignments('prospects')}>
              Prospects
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExportAssignments('all')}>
              All
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {(activeTab === 'customers' || activeTab === 'prospects') && (
          <Button
            onClick={onPreviewAssignments}
            variant="ghost"
            size="sm"
            disabled={isLoading}
            className="gap-2 text-muted-foreground"
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        )}
        
        <Button
          onClick={handleResetAssignments}
          disabled={isResetting || isLoading}
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-destructive"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      {/* Pending Assignments Alert - show when proposals exist but haven't been applied */}
      {(assignmentResult?.proposals?.length > 0 || sophisticatedAssignmentResult?.proposals?.length > 0) && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-100">
                    {(sophisticatedAssignmentResult?.proposals?.length || assignmentResult?.proposals?.length || 0)} pending assignments not yet applied
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    These assignments are in memory only. Click Apply to save them to the database.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={onPreviewAssignments}
                  variant="outline"
                  className="border-amber-500 text-amber-700 hover:bg-amber-100"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Review
                </Button>
                <Button
                  onClick={onExecuteAssignments}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Apply {(sophisticatedAssignmentResult?.proposals?.length || assignmentResult?.proposals?.length || 0)} Assignments
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Customers ({allCustomerAccounts.length})
            <EnhancedTabRefreshIndicator
              isRefreshing={tabRefreshStates.assignments.isRefreshing}
              lastRefreshed={tabRefreshStates.assignments.lastRefreshed}
              tabName="Customers"
            />
          </TabsTrigger>
          <TabsTrigger value="prospects" className="flex items-center gap-2">
            <UserX className="h-4 w-4" />
            Prospects ({allProspectAccounts.length})
            <EnhancedTabRefreshIndicator
              isRefreshing={tabRefreshStates.assignments.isRefreshing}
              lastRefreshed={tabRefreshStates.assignments.lastRefreshed}
              tabName="Prospects"
            />
          </TabsTrigger>
          <TabsTrigger value="reps" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Sales Reps ({owners.length})
            <EnhancedTabRefreshIndicator
              isRefreshing={tabRefreshStates.review.isRefreshing}
              lastRefreshed={tabRefreshStates.review.lastRefreshed}
              tabName="Sales Reps"
            />
          </TabsTrigger>
        </TabsList>

        {/* Loading and Error States */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        )}
        
        {/* Assignment Warnings Section */}
        {assignmentWarnings && assignmentWarnings.length > 0 && (
          <div className="mt-6">
            <AssignmentWarnings warnings={assignmentWarnings} />
          </div>
        )}
        
        {/* Data Flow Tracker */}
        <AssignmentDataFlowTracker
          steps={dataFlowSteps}
          isVisible={showDataFlowTracker}
        />

        {hasError && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Error Loading Data</h3>
                <p className="text-muted-foreground mb-4">
                  {(accountsError || calculationsError)?.toString()}
                </p>
                <Button onClick={() => handleRefresh()} variant="outline">
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-4">
          {!isLoading && !hasError && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search customers..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-64"
                    />
                  </div>
                  <Select value={selectedAssignmentType} onValueChange={setSelectedAssignmentType}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by assignment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      <SelectItem value="assigned">With New Assignments</SelectItem>
                      <SelectItem value="unassigned">Without New Assignments</SelectItem>
                      <SelectItem value="changed">Assignment Changed</SelectItem>
                      <SelectItem value="unchanged">Assignment Unchanged</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Filter by current owner..."
                    value={currentOwnerFilter}
                    onChange={(e) => setCurrentOwnerFilter(e.target.value)}
                    className="w-48"
                  />
                  <Input
                    placeholder="Filter by new owner..."
                    value={newOwnerFilter}
                    onChange={(e) => setNewOwnerFilter(e.target.value)}
                    className="w-48"
                  />
                  <Select value={lockStatusFilter} onValueChange={setLockStatusFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Lock status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Accounts</SelectItem>
                      <SelectItem value="locked">Locked (Keep Owner)</SelectItem>
                      <SelectItem value="unlocked">Unlocked (Can Reassign)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <VirtualizedAccountTable
                accounts={allCustomerAccounts}
                assignmentProposals={assignmentResult?.proposals || []}
                assignmentReasons={assignmentReasons}
                searchTerm={searchTerm}
                currentOwnerFilter={currentOwnerFilter}
                newOwnerFilter={newOwnerFilter}
                lockStatusFilter={lockStatusFilter}
                buildId={buildId}
                accountType="customer"
                onReassign={(account) => {
                  setSelectedAccount(account);
                  setShowReassignDialog(true);
                }}
                emptyMessage="No customer accounts found"
              />
            </>
          )}
        </TabsContent>

        {/* Prospects Tab */}
        <TabsContent value="prospects" className="space-y-4">
          {!isLoading && !hasError && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search prospects..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-64"
                    />
                  </div>
                  <Select value={selectedAssignmentType} onValueChange={setSelectedAssignmentType}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by assignment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Prospects</SelectItem>
                      <SelectItem value="assigned">With New Assignments</SelectItem>
                      <SelectItem value="unassigned">Without New Assignments</SelectItem>
                      <SelectItem value="changed">Assignment Changed</SelectItem>
                      <SelectItem value="unchanged">Assignment Unchanged</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Filter by current owner..."
                    value={currentOwnerFilter}
                    onChange={(e) => setCurrentOwnerFilter(e.target.value)}
                    className="w-48"
                  />
                  <Input
                    placeholder="Filter by new owner..."
                    value={newOwnerFilter}
                    onChange={(e) => setNewOwnerFilter(e.target.value)}
                    className="w-48"
                  />
                  <Select value={lockStatusFilter} onValueChange={setLockStatusFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Lock status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Accounts</SelectItem>
                      <SelectItem value="locked">Locked (Keep Owner)</SelectItem>
                      <SelectItem value="unlocked">Unlocked (Can Reassign)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <VirtualizedAccountTable
                accounts={allProspectAccounts}
                assignmentProposals={assignmentResult?.proposals || []}
                assignmentReasons={assignmentReasons}
                searchTerm={searchTerm}
                currentOwnerFilter={currentOwnerFilter}
                newOwnerFilter={newOwnerFilter}
                lockStatusFilter={lockStatusFilter}
                buildId={buildId}
                accountType="prospect"
                opportunities={opportunities}
                onReassign={(account) => {
                  setSelectedAccount(account);
                  setShowReassignDialog(true);
                }}
                emptyMessage="No prospect accounts found"
              />
            </>
          )}
        </TabsContent>

        {/* Assignment Logic Tab */}
        {/* Sales Reps Tab */}
        <TabsContent value="reps">
          <RepManagement buildId={buildId} />
        </TabsContent>
      </Tabs>

      {/* Assignment Progress Dialog */}
      <AssignmentGenerationDialog
        open={showAssignmentProgress}
        onOpenChange={setShowAssignmentProgress}
        progress={(() => {
          // Merge local and hook progress - use whichever has higher progress value
          // This ensures smooth animation even when one source updates less frequently
          const localProgress = assignmentProgress?.progress ?? 0;
          const hookProgress = hookAssignmentProgress?.progress ?? 0;
          const useHook = hookProgress >= localProgress && hookAssignmentProgress;
          
          if (useHook && hookAssignmentProgress) {
            return {
              stage: hookAssignmentProgress.stage || 'applying',
              progress: hookAssignmentProgress.progress ?? 0,
              status: hookAssignmentProgress.status || 'Processing...',
              rulesCompleted: hookAssignmentProgress.rulesCompleted || 0,
              totalRules: hookAssignmentProgress.totalRules || 6,
              accountsProcessed: hookAssignmentProgress.accountsProcessed || 0,
              totalAccounts: hookAssignmentProgress.totalAccounts || 0,
              assignmentsMade: hookAssignmentProgress.assignmentsMade || 0,
              conflicts: hookAssignmentProgress.conflicts || 0,
              error: hookAssignmentProgress.error
            };
          } else if (assignmentProgress && localProgress > 0) {
            return {
              stage: 'applying',
              progress: localProgress,
              status: assignmentProgress.status || 'Processing...',
              rulesCompleted: 0,
              totalRules: 6,
              accountsProcessed: assignmentProgress.accountsProcessed || 0,
              totalAccounts: assignmentProgress.totalAccounts || 0,
              assignmentsMade: assignmentProgress.accountsProcessed || 0,
              conflicts: 0
            };
          }
          return null;
        })()}
        isGenerating={isGenerating}
        onCancel={() => {
          // Cancel the generation AND hide the dialog
          cancelGeneration();
          setShowAssignmentProgress(false);
        }}
        onComplete={handleOptimizationComplete}
      />

      {/* Assignment Preview Dialog */}
      <AssignmentPreviewDialog
          open={showPreviewDialog}
          onClose={() => {
            setShowPreviewDialog(false);
            setSophisticatedAssignmentResult(null);
          }}
          onExecute={onExecuteAssignments}
          result={sophisticatedAssignmentResult || assignmentResult}
          isExecuting={isExecuting || isApplyingAssignments}
          assignmentType={activeTab === 'prospects' ? 'prospect' : 'customer'}
          buildId={buildId}
        />

      {/* How It Works Dialog */}
      <Dialog open={showHowItWorks} onOpenChange={setShowHowItWorks}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              How the Assignment Engine Works
            </DialogTitle>
            <DialogDescription>
              Understanding the waterfall logic and assignment rules
            </DialogDescription>
          </DialogHeader>
          <WaterfallLogicExplainer 
            buildId={buildId} 
            priorityConfig={priorityConfig}
            assignmentMode={assignmentMode}
            mappedFields={mappedFields}
            onConfigureClick={() => {
              setShowHowItWorks(false);
              setShowConfigDialog(true);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Assignment Configuration
            </DialogTitle>
            <DialogDescription>
              Configure thresholds, territory mapping, and capacity settings
            </DialogDescription>
          </DialogHeader>
          <FullAssignmentConfig 
            buildId={buildId || ''} 
            onClose={() => setShowConfigDialog(false)}
            onConfigurationComplete={() => {
              setIsConfigured(true);
              setConfigJustSaved(true); // Mark that config was just saved to prompt regeneration
              toast({
                title: "Configuration Saved",
                description: "Click Generate to run the assignment engine"
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* AI Balancing Optimizer Dialog removed - using HIGHS optimization */}

      {/* Account Reassignment Dialog */}
      <Dialog open={showReassignDialog} onOpenChange={(open) => {
        setShowReassignDialog(open);
        if (!open) {
          setSelectedAccount(null);
          setReassignmentReason('');
          setSelectedOwnerId('');
          setSelectedOwnerName('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Account</DialogTitle>
            <DialogDescription>
              Change the assignment for {selectedAccount?.account_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="owner-select">New Owner</Label>
              <Select 
                value={selectedOwnerId ? `${selectedOwnerId}|${selectedOwnerName}` : ''} 
                onValueChange={(value) => {
                  const [ownerId, ownerName] = value.split('|');
                  setSelectedOwnerId(ownerId);
                  setSelectedOwnerName(ownerName);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select new owner..." />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((owner) => (
                    <SelectItem key={owner.rep_id} value={`${owner.rep_id}|${owner.name}`}>
                      {owner.name} {owner.team && `(${owner.team})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reason">Reassignment Reason</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for reassignment..."
                value={reassignmentReason}
                onChange={(e) => setReassignmentReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReassignDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleReassignAccount}
              disabled={!selectedOwnerId || !selectedOwnerName || isReassigning}
            >
              {isReassigning ? 'Reassigning...' : 'Submit Reassignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Progress Dialog */}
      <ResetProgressDialog
        open={showResetProgress}
        onOpenChange={setShowResetProgress}
        progress={resetProgress}
        onClose={() => {
          setShowResetProgress(false);
          setResetProgress(prev => ({ ...prev, isRunning: false }));
        }}
        onCancel={resetProgress.isRunning ? handleCancelReset : undefined}
      />


      {/* Applying Assignments Overlay - shows during save process */}
      <Dialog open={showApplyingOverlay}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-green-600" />
              Applying Assignments
            </DialogTitle>
            <DialogDescription>
              {applyingStatus === 'saving' 
                ? 'Saving assignments to database...' 
                : 'Refreshing data...'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-green-600 border-t-transparent animate-spin"></div>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p className="font-medium">
                {applyingStatus === 'saving' 
                  ? 'Please wait while we save your assignments...' 
                  : 'Almost done! Refreshing your data...'}
              </p>
              <p className="mt-1">This may take a few seconds for large datasets.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assignment Success Dialog - animated confirmation */}
      <AssignmentSuccessDialog
        open={showSuccessDialog}
        onClose={() => setShowSuccessDialog(false)}
        assignmentCount={appliedAssignmentCount}
        onViewBalancing={() => {
          setShowSuccessDialog(false);
          navigate(`/build/${buildId}?tab=balancing`);
        }}
        onViewReview={() => {
          setShowSuccessDialog(false);
          navigate(`/build/${buildId}?tab=review`);
        }}
      />
    </div>
  );
};
