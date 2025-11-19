import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Download, CheckCircle, AlertCircle, ArrowRight, FileText, Users, TrendingUp, Info, HelpCircle, Send, Undo2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useBuildDataRelationships } from '@/hooks/useBuildData';
import { AccountDetailDialog } from '@/components/AccountDetailDialog';
import { FLMDetailDialog } from '@/components/FLMDetailDialog';
import SendToManagerDialog from '@/components/SendToManagerDialog';
import { formatDistanceToNow } from 'date-fns';

interface ComprehensiveReviewProps {
  buildId?: string;
}

export const ComprehensiveReview = ({ buildId: propBuildId }: ComprehensiveReviewProps = {}) => {
  const { buildId: paramBuildId } = useParams<{ buildId: string }>();
  const buildId = propBuildId || paramBuildId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Active tab state for switching between summary and account moves
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [selectedFLM, setSelectedFLM] = useState<{
    flm: string;
    slm: string;
    data: any;
  } | null>(null);
  const [sendToManagerDialogOpen, setSendToManagerDialogOpen] = useState(false);
  const [selectedSLMForSend, setSelectedSLMForSend] = useState<string | null>(null);

  const { 
    data: buildData, 
    isLoading: buildLoading, 
    error: buildError 
  } = useBuildDataRelationships(buildId);

  // Fetch all active sales reps for the build
  const { data: allActiveSalesReps = [], isLoading: repsLoading } = useQuery({
    queryKey: ['active-sales-reps', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_active', true)
        .eq('include_in_assignments', true)
        .eq('is_manager', false);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildId,
  });

  // Fetch all customer parent accounts for complete portfolio view
  const { data: allAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['customer-parent-accounts', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id,
          account_name,
          owner_id,
          owner_name,
          new_owner_id,
          new_owner_name,
          is_parent,
          ultimate_parent_id,
          has_split_ownership,
          calculated_arr,
          calculated_atr,
          arr,
          atr,
          cre_count,
          cre_risk,
          expansion_tier,
          is_customer
        `)
        .eq('build_id', buildId)
        .eq('is_customer', true)
        .or('is_parent.eq.true,has_split_ownership.eq.true');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildId
  });

  // Fetch assignment changes for customer accounts for the "Largest Changes" tab
  const { data: assignmentChanges, isLoading: changesLoading } = useQuery({
    queryKey: ['customer-assignment-changes', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id,
          account_name,
          owner_id,
          owner_name,
          new_owner_id,
          new_owner_name,
          is_parent,
          calculated_arr,
          arr,
          cre_risk,
          risk_flag,
          cre_count,
          expansion_tier
        `)
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .eq('is_customer', true)
        .not('owner_id', 'is', null); // Has a current owner
      
      if (error) throw error;
      
      // Filter to only accounts where ownership changed (current owner != new owner)
      return (data || []).filter(account => {
        const hasNewOwner = account.new_owner_id && account.new_owner_id.trim() !== '';
        const ownerChanged = account.owner_id !== account.new_owner_id;
        return hasNewOwner && ownerChanged;
      });
    },
    enabled: !!buildId
  });

  // Fetch manager reviews (sent books of business)
  const { data: managerReviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ['manager-reviews', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      
      const { data, error } = await supabase
        .from('manager_reviews')
        .select('*')
        .eq('build_id', buildId)
        .order('sent_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildId
  });

  // Mutation to retract a manager review
  const retractReviewMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from('manager_reviews')
        .update({ status: 'withdrawn' })
        .eq('id', reviewId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-reviews', buildId] });
      toast({
        title: "Review Retracted",
        description: "The manager review has been withdrawn successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to retract the review. Please try again.",
        variant: "destructive",
      });
    }
  });

  // State for filters
  const [minArrFilter, setMinArrFilter] = useState(100000); // $100K default
  const [searchFilter, setSearchFilter] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');

  // Filter large assignment changes (ARR >= $100K by default)
  const largestChanges = useMemo(() => {
    if (!assignmentChanges) return [];
    
    return assignmentChanges.filter(change => {
      const arr = change.calculated_arr || change.arr || 0;
      
      // ARR filter
      if (arr < minArrFilter) return false;
      
      // Search filter
      if (searchFilter) {
        const searchLower = searchFilter.toLowerCase();
        const matchesAccount = change.account_name?.toLowerCase().includes(searchLower);
        const matchesAccountId = change.sfdc_account_id?.toLowerCase().includes(searchLower);
        const matchesCurrentOwner = change.owner_name?.toLowerCase().includes(searchLower);
        const matchesNewOwner = change.new_owner_name?.toLowerCase().includes(searchLower);
        
        if (!matchesAccount && !matchesAccountId && !matchesCurrentOwner && !matchesNewOwner) {
          return false;
        }
      }
      
      // Tier filter
      if (tierFilter !== 'all') {
        const tier = change.expansion_tier?.toLowerCase();
        if (tierFilter === 'tier1' && tier !== 'tier 1' && tier !== '1') return false;
        if (tierFilter === 'tier2' && tier !== 'tier 2' && tier !== '2') return false;
        if (tierFilter === 'tier3' && tier !== 'tier 3' && tier !== '3') return false;
        if (tierFilter === 'tier4' && tier !== 'tier 4' && tier !== '4') return false;
        if (tierFilter === 'unassigned' && tier && tier !== 'unassigned' && tier !== 'none') return false;
      }
      
      // Risk filter
      if (riskFilter !== 'all') {
        const hasRisk = change.cre_risk || (change.cre_count && change.cre_count > 0) || change.risk_flag;
        if (riskFilter === 'risk' && !hasRisk) return false;
        if (riskFilter === 'no-risk' && hasRisk) return false;
      }
      
      return true;
    });
  }, [assignmentChanges, minArrFilter, searchFilter, tierFilter, riskFilter]);

  const portfolioSummary = useMemo(() => {
    if (!allAccounts || !buildData || !allActiveSalesReps) return null;

    // Separate parent and child accounts
    const parentAccounts = allAccounts.filter(acc => acc.is_parent);
    const childAccounts = allAccounts.filter(acc => !acc.is_parent && acc.has_split_ownership);

    // Build parent owner map for split ownership detection
    const parentOwnerMap = new Map<string, string>();
    parentAccounts.forEach(parent => {
      const ownerId = parent.new_owner_id || parent.owner_id;
      if (parent.sfdc_account_id && ownerId) {
        parentOwnerMap.set(parent.sfdc_account_id, ownerId);
      }
    });

    // Calculate total metrics with split ownership
    const totalAccounts = parentAccounts.length;
    const totalParentARR = parentAccounts.reduce((sum, acc) => sum + (acc.calculated_arr || acc.arr || 0), 0);
    const splitOwnershipChildrenARR = childAccounts
      .filter(acc => {
        const parentId = acc.ultimate_parent_id;
        if (!parentId) return false;
        const childOwnerId = acc.new_owner_id || acc.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, acc) => sum + (acc.calculated_arr || acc.arr || 0), 0);
    const totalARR = totalParentARR + splitOwnershipChildrenARR;
    const totalATR = parentAccounts.reduce((sum, acc) => sum + (acc.calculated_atr || acc.atr || 0), 0);
    const totalRiskAccounts = parentAccounts.filter(acc => 
      acc.cre_risk || (acc.cre_count && acc.cre_count > 0)
    ).length;
    const totalActiveReps = allActiveSalesReps.length;
    
    // Get sales rep data from the Map
    const salesRepsMap = buildData.salesRepsByRepId;

    // Group all customer accounts by current owner FLM and SLM with split ownership logic
    const portfoliosBySLM = parentAccounts.reduce((acc, account) => {
      // Use current owner (or new owner if assigned)
      const currentOwnerId = account.new_owner_id || account.owner_id;
      const currentOwnerRep = salesRepsMap.get(currentOwnerId);
      const slm = currentOwnerRep?.slm || 'Unassigned SLM';
      const flm = currentOwnerRep?.flm || currentOwnerRep?.manager || 'Unassigned FLM';
      
      if (!acc[slm]) {
        acc[slm] = {};
      }
      
      if (!acc[slm][flm]) {
        acc[slm][flm] = { 
          totalAccounts: 0,
          totalARR: 0,
          totalATR: 0,
          tier1Count: 0,
          tier2Count: 0,
          tier3Count: 0,
          tier4Count: 0,
          unassignedTierCount: 0,
          riskCount: 0,
          retainedCount: 0,
          reps: new Set(),
          activeReps: new Set(),
          accounts: [],
          repARRMap: new Map<string, number>() // Track ARR per rep for split ownership
        };
      }
      
      const arr = account.calculated_arr || account.arr || 0;
      const atr = account.calculated_atr || account.atr || 0;
      
      acc[slm][flm].totalAccounts++;
      acc[slm][flm].totalARR += arr;
      acc[slm][flm].totalATR += atr;
      acc[slm][flm].accounts.push(account);
      
      // Track parent ARR per rep
      const existingRepARR = acc[slm][flm].repARRMap.get(currentOwnerId) || 0;
      acc[slm][flm].repARRMap.set(currentOwnerId, existingRepARR + arr);
      
      // Add rep names (all reps for display)
      if (account.new_owner_name || account.owner_name) {
        acc[slm][flm].reps.add(account.new_owner_name || account.owner_name);
      }
      
      // Add active reps only (for counting)
      if (currentOwnerId) {
        const activeRep = allActiveSalesReps.find(rep => rep.rep_id === currentOwnerId);
        if (activeRep) {
          acc[slm][flm].activeReps.add(activeRep.name);
        }
      }
      
      // Calculate retention (account stayed with same owner)
      if (!account.new_owner_id || account.owner_id === account.new_owner_id) {
        acc[slm][flm].retainedCount++;
      }
      
      // Enhanced Tier classification
      const tier = account.expansion_tier?.toLowerCase();
      if (tier === 'tier 1' || tier === '1') {
        acc[slm][flm].tier1Count++;
      } else if (tier === 'tier 2' || tier === '2') {
        acc[slm][flm].tier2Count++;
      } else if (tier === 'tier 3' || tier === '3') {
        acc[slm][flm].tier3Count++;
      } else if (tier === 'tier 4' || tier === '4') {
        acc[slm][flm].tier4Count++;
      } else {
        acc[slm][flm].unassignedTierCount++;
      }
      
      // Enhanced Risk accounts (includes multiple risk factors)
      if (account.cre_risk || (account.cre_count && account.cre_count > 0)) {
        acc[slm][flm].riskCount++;
      }
      
      return acc;
    }, {} as Record<string, Record<string, { 
      totalAccounts: number;
      totalARR: number; 
      totalATR: number;
      tier1Count: number;
      tier2Count: number;
      tier3Count: number;
      tier4Count: number;
      unassignedTierCount: number;
      riskCount: number;
      retainedCount: number;
      reps: Set<string>;
      activeReps: Set<string>;
      accounts: any[];
      repARRMap: Map<string, number>;
    }>>);

    // Add split ownership children ARR to their respective FLM/SLM
    childAccounts.forEach(childAccount => {
      const parentId = childAccount.ultimate_parent_id;
      if (!parentId) return;
      
      const childOwnerId = childAccount.new_owner_id || childAccount.owner_id;
      const parentOwnerId = parentOwnerMap.get(parentId);
      
      // Only count if child has different owner than parent (split ownership)
      if (childOwnerId !== parentOwnerId) {
        const childOwnerRep = salesRepsMap.get(childOwnerId);
        const slm = childOwnerRep?.slm || 'Unassigned SLM';
        const flm = childOwnerRep?.flm || childOwnerRep?.manager || 'Unassigned FLM';
        
        if (portfoliosBySLM[slm]?.[flm]) {
          const childARR = childAccount.calculated_arr || childAccount.arr || 0;
          portfoliosBySLM[slm][flm].totalARR += childARR;
          
          // Update rep ARR map
          const existingRepARR = portfoliosBySLM[slm][flm].repARRMap.get(childOwnerId) || 0;
          portfoliosBySLM[slm][flm].repARRMap.set(childOwnerId, existingRepARR + childARR);
        }
      }
    });

    // Convert Set to array for reps and add percentage calculations
    const processedPortfoliosBySLM = Object.entries(portfoliosBySLM).reduce((slmAcc, [slm, flmData]) => {
      slmAcc[slm] = Object.entries(flmData).reduce((flmAcc, [flm, data]) => {
        const tier1Percentage = data.totalAccounts > 0 ? (data.tier1Count / data.totalAccounts) * 100 : 0;
        const tier2Percentage = data.totalAccounts > 0 ? (data.tier2Count / data.totalAccounts) * 100 : 0;
        const tier3Percentage = data.totalAccounts > 0 ? (data.tier3Count / data.totalAccounts) * 100 : 0;
        const tier4Percentage = data.totalAccounts > 0 ? (data.tier4Count / data.totalAccounts) * 100 : 0;
        const unassignedTierPercentage = data.totalAccounts > 0 ? (data.unassignedTierCount / data.totalAccounts) * 100 : 0;
        const retentionPercentage = data.totalAccounts > 0 ? (data.retainedCount / data.totalAccounts) * 100 : 0;
        const activeRepCount = data.activeReps.size;
        
        flmAcc[flm] = {
          ...data,
          reps: Array.from(data.reps),
          activeReps: Array.from(data.activeReps),
          activeRepCount,
          tier1Percentage,
          tier2Percentage,
          tier3Percentage,
          tier4Percentage,
          unassignedTierPercentage,
          retentionPercentage
        };
        return flmAcc;
      }, {} as Record<string, any>);
      return slmAcc;
    }, {} as Record<string, Record<string, any>>);

    return {
      totalAccounts,
      totalARR,
      totalATR,
      totalRiskAccounts,
      totalActiveReps,
      portfoliosBySLM: processedPortfoliosBySLM
    };
  }, [allAccounts, buildData, allActiveSalesReps]);

  const handleExportReview = () => {
    if (!allAccounts || !portfolioSummary) return;

    const csvRows: string[] = [];
    
    // Header section
    csvRows.push('Complete Portfolio Review Export');
    csvRows.push(`Export Date: ${new Date().toISOString()}`);
    csvRows.push(`Build ID: ${buildId}`);
    csvRows.push('');
    
    // Portfolio Summary Section
    csvRows.push('=== PORTFOLIO SUMMARY BY FLM/SLM ===');
    csvRows.push('');
    csvRows.push('SLM,FLM,Total Accounts,Total ARR,Total ATR,Active Reps,Tier 1,Tier 2,Tier 3,Tier 4,Unassigned Tier,Risk Accounts,Retention Rate %');
    
    Object.entries(portfolioSummary.portfoliosBySLM).forEach(([slm, flmData]) => {
      Object.entries(flmData).forEach(([flm, data]: [string, any]) => {
        const retentionRate = data.totalAccounts > 0 
          ? ((data.retainedCount / data.totalAccounts) * 100).toFixed(1)
          : '0.0';
        
        csvRows.push([
          slm,
          flm,
          data.totalAccounts,
          (data.totalARR / 1000000).toFixed(2), // ARR in millions
          (data.totalATR / 1000000).toFixed(2), // ATR in millions
          data.activeReps?.size || 0,
          data.tier1Count || 0,
          data.tier2Count || 0,
          data.tier3Count || 0,
          data.tier4Count || 0,
          data.unassignedTierCount || 0,
          data.riskCount || 0,
          retentionRate
        ].join(','));
      });
    });
    
    csvRows.push('');
    csvRows.push('');
    
    // Account Changes Section
    csvRows.push('=== ALL ACCOUNT MOVES (OWNERSHIP CHANGES) ===');
    csvRows.push('');
    csvRows.push('Account Name,Account ID,ARR,Tier,Current Owner,New Owner,CRE Risk,CRE Count,Risk Flag');
    
    assignmentChanges?.forEach((change) => {
      const arr = (change.calculated_arr || change.arr || 0) / 1000000;
      csvRows.push([
        `"${change.account_name || ''}"`, // Quote to handle commas in names
        change.sfdc_account_id || '',
        arr.toFixed(2),
        change.expansion_tier || 'Unassigned',
        `"${change.owner_name || 'Unassigned'}"`,
        `"${change.new_owner_name || 'Unassigned'}"`,
        change.cre_risk ? 'Yes' : 'No',
        change.cre_count || 0,
        change.risk_flag ? 'Yes' : 'No'
      ].join(','));
    });
    
    // Convert to CSV blob
    const csvContent = csvRows.join('\n');
    const dataBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `complete_portfolio_review_${buildId}_${new Date().toISOString().split('T')[0]}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Complete portfolio review exported as CSV successfully.",
    });
  };

  if (buildLoading || accountsLoading || changesLoading || repsLoading || reviewsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <span>Loading review data...</span>
        </div>
      </div>
    );
  }

  if (buildError || !buildId) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load review data. Please check the build ID and try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comprehensive Review</h1>
          <p className="text-muted-foreground">
            Review and validate territory assignment changes before finalization
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSendToManagerDialogOpen(true)}>
            <Send className="h-4 w-4 mr-2" />
            Send to Manager
          </Button>
          <Button onClick={handleExportReview}>
            <Download className="h-4 w-4 mr-2" />
            Export Review
          </Button>
        </div>
      </div>

      {/* Portfolio Summary Cards */}
      {portfolioSummary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customer Accounts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{portfolioSummary.totalAccounts}</div>
              <p className="text-xs text-muted-foreground">
                Customer accounts only
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Reps</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{portfolioSummary.totalActiveReps}</div>
              <p className="text-xs text-muted-foreground">
                Assignment eligible
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total ARR</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(portfolioSummary.totalARR / 1000000).toFixed(1)}M</div>
              <p className="text-xs text-muted-foreground">
                Total revenue
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total ATR</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(portfolioSummary.totalATR / 1000000).toFixed(1)}M</div>
              <p className="text-xs text-muted-foreground">
                Available to renew
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Risk Accounts</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{portfolioSummary.totalRiskAccounts}</div>
              <p className="text-xs text-muted-foreground">
                Require attention
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Review Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary">Portfolio Summary</TabsTrigger>
          <TabsTrigger value="changes">All Account Moves</TabsTrigger>
          <TabsTrigger value="reviews">Review Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer Portfolio Summary by FLM and SLM</CardTitle>
              <CardDescription>
                Complete view of all customer account portfolios organized by First Line Manager (FLM) and Second Line Manager (SLM)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {portfolioSummary ? (
                <div className="space-y-6">
                  {Object.entries(portfolioSummary.portfoliosBySLM).map(([slm, flmData]) => (
                    <div key={slm} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{slm}</h3>
                        <Badge variant="outline" className="text-xs">SLM</Badge>
                      </div>
                          <Table>
                           <TableHeader>
                             <TableRow>
                               <TableHead>Manager/Rep</TableHead>
                               <TableHead className="text-center">Reps</TableHead>
                               <TableHead className="text-center">Accounts</TableHead>
                               <TableHead className="text-center">ARR</TableHead>
                               <TableHead className="text-center">ATR</TableHead>
                               <TableHead className="text-center">Risk Accounts</TableHead>
                               <TableHead className="text-center">Retention %</TableHead>
                               <TableHead className="text-center">Tier Distribution</TableHead>
                               <TableHead>Actions</TableHead>
                             </TableRow>
                           </TableHeader>
                          <TableBody>
                            {Object.entries(flmData).map(([flm, data]) => (
                              <>
                                 <TableRow key={`${slm}-${flm}`} className="border-l-2 border-primary/20 hover:bg-muted/50 transition-colors cursor-pointer"
                                   onClick={() => setSelectedFLM({ flm, slm, data })}>
                                  <TableCell className="pl-4 font-medium">{flm} (FLM)</TableCell>
                                  <TableCell className="text-center">{data.activeRepCount}</TableCell>
                                  <TableCell className="text-center">{data.totalAccounts}</TableCell>
                                  <TableCell className="text-center">${(data.totalARR / 1000000).toFixed(1)}M</TableCell>
                                  <TableCell className="text-center">${(data.totalATR / 1000000).toFixed(1)}M</TableCell>
                                  <TableCell className="text-center">
                                    {data.riskCount > 0 ? (
                                      <Badge variant="destructive" className="text-xs">
                                        {data.riskCount}
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">0</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <Progress 
                                        value={data.retentionPercentage} 
                                        className="w-16" 
                                      />
                                      <span className="text-xs font-medium">{data.retentionPercentage.toFixed(1)}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex flex-wrap gap-1 justify-center">
                                      {data.tier1Count > 0 && (
                                        <Badge variant="default" className="text-xs">T1: {data.tier1Count}</Badge>
                                      )}
                                      {data.tier2Count > 0 && (
                                        <Badge variant="secondary" className="text-xs">T2: {data.tier2Count}</Badge>
                                      )}
                                      {data.tier3Count > 0 && (
                                        <Badge variant="outline" className="text-xs">T3: {data.tier3Count}</Badge>
                                      )}
                                      {data.tier4Count > 0 && (
                                        <Badge variant="outline" className="text-xs">T4: {data.tier4Count}</Badge>
                                      )}
                                      {data.unassignedTierCount > 0 && (
                                        <Badge variant="outline" className="text-xs">Unassigned: {data.unassignedTierCount}</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm text-muted-foreground">FLM Actions</span>
                                  </TableCell>
                                </TableRow>
                              </>
                            ))}
                            {/* SLM Total Row */}
                            <TableRow className="bg-muted/50 border-l-4 border-primary font-semibold">
                              <TableCell className="pl-4 font-bold text-primary">
                                {slm} Total
                              </TableCell>
                              <TableCell className="text-center font-bold text-primary">
                                {Object.values(flmData).reduce((sum, data) => sum + data.activeRepCount, 0)}
                              </TableCell>
                              <TableCell className="text-center font-bold text-primary">
                                {Object.values(flmData).reduce((sum, data) => sum + data.totalAccounts, 0)}
                              </TableCell>
                              <TableCell className="text-center font-bold text-primary">
                                ${(Object.values(flmData).reduce((sum, data) => sum + data.totalARR, 0) / 1000000).toFixed(1)}M
                              </TableCell>
                              <TableCell className="text-center font-bold text-primary">
                                ${(Object.values(flmData).reduce((sum, data) => sum + data.totalATR, 0) / 1000000).toFixed(1)}M
                              </TableCell>
                              <TableCell className="text-center font-bold text-primary">
                                {Object.values(flmData).reduce((sum, data) => sum + data.riskCount, 0)}
                              </TableCell>
                              <TableCell className="text-center font-bold text-primary">
                                {((Object.values(flmData).reduce((sum, data) => sum + data.retainedCount, 0) / Object.values(flmData).reduce((sum, data) => sum + data.totalAccounts, 0)) * 100).toFixed(1)}%
                              </TableCell>
                              <TableCell></TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSLMForSend(slm);
                                  }}
                                  className="gap-2"
                                >
                                  <Send className="h-4 w-4" />
                                  Send to Manager
                                </Button>
                              </TableCell>
                            </TableRow>
                            </TableBody>
                          </Table>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No portfolio data found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>All Account Moves</CardTitle>
              <CardDescription>
                All accounts where current owner is no longer the new owner (ARR ≥${(minArrFilter / 1000).toFixed(0)}K)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Min ARR</label>
                  <Input
                    type="number"
                    placeholder="Min ARR"
                    value={minArrFilter}
                    onChange={(e) => setMinArrFilter(Number(e.target.value) || 0)}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    ${(minArrFilter / 1000).toFixed(0)}K minimum
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search</label>
                  <Input
                    placeholder="Account, owner, or ID..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tier Filter</label>
                  <select
                    value={tierFilter}
                    onChange={(e) => setTierFilter(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All Tiers</option>
                    <option value="tier1">Tier 1</option>
                    <option value="tier2">Tier 2</option>
                    <option value="tier3">Tier 3</option>
                    <option value="tier4">Tier 4</option>
                    <option value="unassigned">Unassigned</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Risk Filter</label>
                  <select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All Accounts</option>
                    <option value="risk">With Risk</option>
                    <option value="no-risk">No Risk</option>
                  </select>
                </div>
              </div>
              
              {/* Results count */}
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30 rounded-md">
                <p className="text-sm text-muted-foreground">
                  Showing <strong className="text-foreground">{largestChanges.length}</strong> accounts with ownership changes
                  {assignmentChanges && assignmentChanges.length > largestChanges.length && (
                    <span className="ml-2">
                      (filtered from {assignmentChanges.length} total)
                    </span>
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMinArrFilter(100000);
                    setSearchFilter('');
                    setTierFilter('all');
                    setRiskFilter('all');
                  }}
                >
                  Reset Filters
                </Button>
              </div>
              {largestChanges && largestChanges.length > 0 ? (
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Account Name</TableHead>
                       <TableHead>Account ID</TableHead>
                       <TableHead>ARR</TableHead>
                       <TableHead>Tier</TableHead>
                       <TableHead>Current Owner</TableHead>
                       <TableHead>New Owner</TableHead>
                       <TableHead>Risk Status</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {largestChanges.map((change) => {
                       const riskBadges = [];
                       if (change.cre_risk) riskBadges.push("CRE Risk");
                       if (change.risk_flag) riskBadges.push("Risk Flag");
                       if (change.cre_count > 0) riskBadges.push(`CRE: ${change.cre_count}`);

                       return (
                         <TableRow 
                           key={change.sfdc_account_id}
                           className="cursor-pointer hover:bg-muted/50"
                           onClick={() => {
                             setSelectedAccount(change);
                             setIsAccountDialogOpen(true);
                           }}
                         >
                           <TableCell className="font-medium">{change.account_name}</TableCell>
                           <TableCell className="font-mono text-sm">{change.sfdc_account_id}</TableCell>
                           <TableCell className="font-medium">${((change.calculated_arr || change.arr || 0) / 1000000).toFixed(1)}M</TableCell>
                           <TableCell>
                             <Badge variant={change.expansion_tier === 'Tier 1' ? 'default' : 'secondary'}>
                               {change.expansion_tier || 'Unassigned'}
                             </Badge>
                           </TableCell>
                           <TableCell>{change.owner_name || 'Unassigned'}</TableCell>
                           <TableCell className="font-medium">{change.new_owner_name}</TableCell>
                           <TableCell>
                             {riskBadges.length > 0 ? (
                               <div className="flex flex-wrap gap-1">
                                 {riskBadges.map((risk, index) => (
                                   <Badge key={index} variant="destructive" className="text-xs">
                                     {risk}
                                   </Badge>
                                 ))}
                               </div>
                             ) : (
                               <span className="text-xs text-muted-foreground">None</span>
                             )}
                           </TableCell>
                         </TableRow>
                       );
                     })}
                   </TableBody>
                 </Table>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No high-value assignment changes to review</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sent Review Logs</CardTitle>
              <CardDescription>
                Track books of business sent to managers for review
              </CardDescription>
            </CardHeader>
            <CardContent>
              {managerReviews && managerReviews.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manager</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent By</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Reviewed At</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {managerReviews.map((review) => (
                      <TableRow key={review.id}>
                        <TableCell className="font-medium">{review.manager_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{review.manager_level}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              review.status === 'pending' ? 'default' :
                              review.status === 'reviewed' ? 'secondary' :
                              review.status === 'withdrawn' ? 'outline' :
                              'default'
                            }
                          >
                            {review.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          Sent by user
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(review.sent_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {review.reviewed_at ? formatDistanceToNow(new Date(review.reviewed_at), { addSuffix: true }) : '-'}
                        </TableCell>
                        <TableCell>
                          {review.status === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retractReviewMutation.mutate(review.id)}
                              disabled={retractReviewMutation.isPending}
                            >
                              <Undo2 className="h-4 w-4 mr-2" />
                              Retract
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No reviews sent yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
      
      <AccountDetailDialog
        open={isAccountDialogOpen}
        onOpenChange={setIsAccountDialogOpen}
        account={selectedAccount}
        currentOwner={buildData?.salesRepsByRepId.get(selectedAccount?.owner_id)}
        newOwner={buildData?.salesRepsByRepId.get(selectedAccount?.new_owner_id)}
        availableReps={allActiveSalesReps || []}
        buildId={buildId || ''}
      />

      <FLMDetailDialog
        open={!!selectedFLM}
        onOpenChange={(open) => !open && setSelectedFLM(null)}
        flmData={selectedFLM}
        buildId={buildId || ''}
      />

      <SendToManagerDialog
        open={sendToManagerDialogOpen || !!selectedSLMForSend}
        onClose={() => {
          setSendToManagerDialogOpen(false);
          setSelectedSLMForSend(null);
        }}
        buildId={buildId || ''}
        managerName={selectedSLMForSend || undefined}
        managerLevel={selectedSLMForSend ? 'SLM' : undefined}
      />
    </div>
  );
};