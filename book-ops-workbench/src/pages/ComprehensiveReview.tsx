import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Download, CheckCircle, AlertCircle, ArrowRight, FileText, Users, TrendingUp, Info, HelpCircle, Send, Undo2, Lock, ArrowLeft, RotateCcw, Loader2, Building, Building2, Target } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  const navigate = useNavigate();
  
  // Active tab state for switching between summary and account moves
  const [activeTab, setActiveTab] = useState('summary');
  // View mode for customers vs prospects vs all
  const [viewMode, setViewMode] = useState<'customers' | 'prospects' | 'all'>('all');
  const [portfolioType, setPortfolioType] = useState<'customers' | 'prospects'>('customers');
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
          hierarchy_bookings_arr_converted,
          calculated_arr,
          calculated_atr,
          arr,
          atr,
          cre_count,
          cre_risk,
          cre_status,
          expansion_tier,
          is_customer,
          sales_territory,
          geo
        `)
        .eq('build_id', buildId)
        .eq('is_customer', true)
        .or('is_parent.eq.true,has_split_ownership.eq.true');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildId
  });

  // Fetch opportunities to calculate ATR properly (ATR comes from renewal opportunities)
  const { data: opportunitiesForATR } = useQuery({
    queryKey: ['opportunities-for-atr', buildId],
    queryFn: async (): Promise<Map<string, number>> => {
      if (!buildId) return new Map<string, number>();
      
      const { data, error } = await supabase
        .from('opportunities')
        .select('sfdc_account_id, available_to_renew, opportunity_type')
        .eq('build_id', buildId)
        .eq('opportunity_type', 'Renewals')
        .not('available_to_renew', 'is', null);
      
      if (error) throw error;
      
      // Aggregate ATR by account
      const atrByAccount = new Map<string, number>();
      (data || []).forEach(opp => {
        const current = atrByAccount.get(opp.sfdc_account_id) || 0;
        atrByAccount.set(opp.sfdc_account_id, current + (opp.available_to_renew || 0));
      });
      
      return atrByAccount;
    },
    enabled: !!buildId
  });

  // Fetch all prospect parent accounts for prospect portfolio view
  const { data: prospectAccounts, isLoading: prospectsLoading } = useQuery({
    queryKey: ['prospect-parent-accounts', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      
      // First get count to determine pagination needs
      const { count } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId)
        .eq('is_customer', false)
        .eq('is_parent', true);
      
      const totalCount = count || 0;
      const pageSize = 1000;
      const pages = Math.ceil(totalCount / pageSize);
      
      // Fetch all pages in parallel
      const pagePromises = Array.from({ length: pages }, (_, i) => 
        supabase
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
            hierarchy_bookings_arr_converted,
            calculated_arr,
            calculated_atr,
            arr,
            atr,
            cre_count,
            cre_risk,
            cre_status,
            expansion_tier,
            initial_sale_tier,
            is_customer,
            geo,
            hq_country,
            sales_territory
          `)
          .eq('build_id', buildId)
          .eq('is_customer', false)
          .eq('is_parent', true)
          .range(i * pageSize, (i + 1) * pageSize - 1)
      );
      
      const results = await Promise.all(pagePromises);
      const allData = results.flatMap(r => r.data || []);
      
      console.log(`[ComprehensiveReview] Loaded ${allData.length} prospect accounts (${pages} pages)`);
      return allData;
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
          hierarchy_bookings_arr_converted,
          calculated_arr,
          arr,
          cre_risk,
          cre_status,
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
      const arr = parseFloat(change.hierarchy_bookings_arr_converted) || parseFloat(change.calculated_arr) || parseFloat(change.arr) || 0;

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
      
      // Risk filter - check both cre_status and cre_count
      if (riskFilter !== 'all') {
        const hasRisk = change.cre_status !== null || (change.cre_count && change.cre_count > 0) || change.risk_flag;
        if (riskFilter === 'risk' && !hasRisk) return false;
        if (riskFilter === 'no-risk' && hasRisk) return false;
      }
      
      return true;
    });
  }, [assignmentChanges, minArrFilter, searchFilter, tierFilter, riskFilter]);

  const portfolioSummary = useMemo(() => {
    if (!allAccounts || !buildData || !allActiveSalesReps) return null;
    
    // Helper to get ATR from opportunities (more accurate than calculated_atr)
    const getAccountATR = (accountId: string): number => {
      if (!opportunitiesForATR) return 0;
      return opportunitiesForATR.get(accountId) || 0;
    };

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
    const totalParentARR = parentAccounts.reduce((sum, acc) => {
      const arrValue = parseFloat(acc.hierarchy_bookings_arr_converted) || parseFloat(acc.calculated_arr) || parseFloat(acc.arr) || 0;
      return sum + arrValue;
    }, 0);
    const splitOwnershipChildrenARR = childAccounts
      .filter(acc => {
        const parentId = acc.ultimate_parent_id;
        if (!parentId) return false;
        const childOwnerId = acc.new_owner_id || acc.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, acc) => {
        const arrValue = parseFloat(acc.hierarchy_bookings_arr_converted) || parseFloat(acc.calculated_arr) || parseFloat(acc.arr) || 0;
        return sum + arrValue;
      }, 0);
    const totalARR = totalParentARR + splitOwnershipChildrenARR;
    // Calculate ATR from opportunities data (more reliable than calculated_atr field)
    const totalATR = parentAccounts.reduce((sum, acc) => {
      const atrFromOpps = getAccountATR(acc.sfdc_account_id);
      const atrFromAccount = parseFloat(acc.calculated_atr) || parseFloat(acc.atr) || 0;
      return sum + (atrFromOpps || atrFromAccount); // Prefer opportunities data
    }, 0);
    const totalRiskAccounts = parentAccounts.filter(acc => 
      acc.cre_status !== null || (acc.cre_count && acc.cre_count > 0)
    ).length;
    const totalActiveReps = allActiveSalesReps.length;
    
    // Get sales rep data from the Map
    const salesRepsMap = buildData.salesRepsByRepId;
    
    // Calculate regional alignment - accounts where territory matches rep's region
    let regionallyAligned = 0;
    let totalWithTerritory = 0;
    parentAccounts.forEach(acc => {
      const territory = acc.sales_territory || acc.geo;
      if (territory) {
        totalWithTerritory++;
        const ownerId = acc.new_owner_id || acc.owner_id;
        const ownerRep = salesRepsMap.get(ownerId);
        if (ownerRep?.region && territory.toLowerCase().includes(ownerRep.region.toLowerCase())) {
          regionallyAligned++;
        }
      }
    });
    const regionalAlignmentRate = totalWithTerritory > 0 
      ? (regionallyAligned / totalWithTerritory) * 100 
      : 0;

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
      
      const arr = parseFloat(account.hierarchy_bookings_arr_converted) || parseFloat(account.calculated_arr) || parseFloat(account.arr) || 0;
      // Get ATR from opportunities (preferred) or fall back to account field
      const atrFromOpps = getAccountATR(account.sfdc_account_id);
      const atr = atrFromOpps || parseFloat(account.calculated_atr) || parseFloat(account.atr) || 0;

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
      
      // Risk accounts - based on CRE status OR cre_count from opportunities
      if (account.cre_status !== null || (account.cre_count && account.cre_count > 0)) {
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
          const childARR = parseFloat(childAccount.hierarchy_bookings_arr_converted) || parseFloat(childAccount.calculated_arr) || parseFloat(childAccount.arr) || 0;
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
      regionalAlignmentRate,
      portfoliosBySLM: processedPortfoliosBySLM
    };
  }, [allAccounts, buildData, allActiveSalesReps, opportunitiesForATR]);

  // Calculate prospect portfolio summary by SLM/FLM
  const prospectPortfolioSummary = useMemo(() => {
    if (!prospectAccounts || !buildData || !allActiveSalesReps) return null;

    const salesRepsMap = buildData.salesRepsByRepId;
    const totalAccounts = prospectAccounts.length;
    const totalActiveReps = allActiveSalesReps.length;

    // Group prospect accounts by SLM/FLM
    const portfoliosBySLM = prospectAccounts.reduce((acc, account) => {
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
          tier1Count: 0,
          tier2Count: 0,
          tier3Count: 0,
          tier4Count: 0,
          unassignedTierCount: 0,
          retainedCount: 0,
          reps: new Set(),
          activeReps: new Set(),
          accounts: [],
          geoBreakdown: new Map<string, number>()
        };
      }

      acc[slm][flm].totalAccounts++;
      acc[slm][flm].accounts.push(account);
      
      // Track geo distribution
      const geo = account.geo || 'Unknown';
      acc[slm][flm].geoBreakdown.set(geo, (acc[slm][flm].geoBreakdown.get(geo) || 0) + 1);
      
      // Add rep names
      if (account.new_owner_name || account.owner_name) {
        acc[slm][flm].reps.add(account.new_owner_name || account.owner_name);
      }
      
      // Add active reps only
      if (currentOwnerId) {
        const activeRep = allActiveSalesReps.find(rep => rep.rep_id === currentOwnerId);
        if (activeRep) {
          acc[slm][flm].activeReps.add(activeRep.name);
        }
      }
      
      // Calculate retention
      if (!account.new_owner_id || account.owner_id === account.new_owner_id) {
        acc[slm][flm].retainedCount++;
      }
      
      // Tier classification (use initial_sale_tier for prospects)
      const tier = account.initial_sale_tier?.toLowerCase() || account.expansion_tier?.toLowerCase();
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
      
      return acc;
    }, {} as Record<string, Record<string, { 
      totalAccounts: number;
      tier1Count: number;
      tier2Count: number;
      tier3Count: number;
      tier4Count: number;
      unassignedTierCount: number;
      retainedCount: number;
      reps: Set<string>;
      activeReps: Set<string>;
      accounts: any[];
      geoBreakdown: Map<string, number>;
    }>>);

    // Convert Sets to arrays and calculate percentages
    const processedPortfoliosBySLM = Object.entries(portfoliosBySLM).reduce((slmAcc, [slm, flmData]) => {
      slmAcc[slm] = Object.entries(flmData).reduce((flmAcc, [flm, data]) => {
        const retentionPercentage = data.totalAccounts > 0 ? (data.retainedCount / data.totalAccounts) * 100 : 0;
        const activeRepCount = data.activeReps.size;
        
        // Get top geo
        let topGeo = '-';
        let topGeoCount = 0;
        data.geoBreakdown.forEach((count, geo) => {
          if (count > topGeoCount) {
            topGeoCount = count;
            topGeo = geo;
          }
        });
        
        flmAcc[flm] = {
          ...data,
          reps: Array.from(data.reps),
          activeReps: Array.from(data.activeReps),
          activeRepCount,
          retentionPercentage,
          topGeo,
          geoBreakdown: Object.fromEntries(data.geoBreakdown)
        };
        return flmAcc;
      }, {} as Record<string, any>);
      return slmAcc;
    }, {} as Record<string, Record<string, any>>);

    return {
      totalAccounts,
      totalActiveReps,
      portfoliosBySLM: processedPortfoliosBySLM
    };
  }, [prospectAccounts, buildData, allActiveSalesReps]);

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
    csvRows.push('SLM,FLM,Parent Accounts,Total ARR,Total ATR,Active Reps,Tier 1,Tier 2,Tier 3,Tier 4,Unassigned Tier,At-Risk Parents,Retention Rate %');
    
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
    
    // All Customer Accounts Section
    csvRows.push('=== ALL CUSTOMER ACCOUNTS ===');
    csvRows.push('');
    csvRows.push('Account Name,Account ID,ARR ($M),ATR ($M),Tier,Territory,Current Owner,New Owner,Changed,CRE Status,CRE Count');
    
    allAccounts?.forEach((account: any) => {
      const arr = (parseFloat(account.hierarchy_bookings_arr_converted) || parseFloat(account.calculated_arr) || parseFloat(account.arr) || 0) / 1000000;
      const atr = (parseFloat(account.calculated_atr) || parseFloat(account.atr) || 0) / 1000000;
      const wasReassigned = account.new_owner_id && account.owner_id !== account.new_owner_id;
      
      csvRows.push([
        `"${account.account_name || ''}"`,
        account.sfdc_account_id || '',
        arr.toFixed(3),
        atr.toFixed(3),
        account.expansion_tier || 'Unassigned',
        `"${account.sales_territory || account.geo || ''}"`,
        `"${account.owner_name || 'Unassigned'}"`,
        `"${account.new_owner_name || account.owner_name || 'Unassigned'}"`,
        wasReassigned ? 'Yes' : 'No',
        account.cre_status || '',
        account.cre_count || 0
      ].join(','));
    });
    
    csvRows.push('');
    csvRows.push('');
    
    // Prospect Accounts Section (if available)
    if (prospectAccounts && prospectAccounts.length > 0) {
      csvRows.push('=== ALL PROSPECT ACCOUNTS ===');
      csvRows.push('');
      csvRows.push('Account Name,Account ID,Territory,Current Owner,New Owner,Changed');
      
      prospectAccounts.forEach((account: any) => {
        const wasReassigned = account.new_owner_id && account.owner_id !== account.new_owner_id;
        
        csvRows.push([
          `"${account.account_name || ''}"`,
          account.sfdc_account_id || '',
          `"${account.sales_territory || account.geo || ''}"`,
          `"${account.owner_name || 'Unassigned'}"`,
          `"${account.new_owner_name || account.owner_name || 'Unassigned'}"`,
          wasReassigned ? 'Yes' : 'No'
        ].join(','));
      });
    }
    
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

  // Calculate prospect metrics (must be before conditional returns to follow React hooks rules)
  const prospectMetrics = useMemo(() => {
    if (!prospectAccounts) return null;
    
    const totalProspects = prospectAccounts.length;
    const assignedProspects = prospectAccounts.filter(acc => acc.new_owner_id && acc.new_owner_id.trim() !== '');
    const reassignedProspects = prospectAccounts.filter(acc => {
      const hasNewOwner = acc.new_owner_id && acc.new_owner_id.trim() !== '';
      const ownerChanged = acc.owner_id !== acc.new_owner_id;
      return hasNewOwner && ownerChanged;
    });
    
    return {
      total: totalProspects,
      assigned: assignedProspects.length,
      reassigned: reassignedProspects.length,
      retentionRate: totalProspects > 0 
        ? ((totalProspects - reassignedProspects.length) / totalProspects) * 100 
        : 0
    };
  }, [prospectAccounts]);

  if (buildLoading || accountsLoading || prospectsLoading || changesLoading || repsLoading || reviewsLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>Loading review data...</span>
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

  // Check if any assignments have been applied (new_owner_id is set)
  const hasAppliedAssignments = allAccounts && allAccounts.some(acc => acc.new_owner_id && acc.new_owner_id.trim() !== '');

  // Lock screen if no assignments applied yet
  if (!hasAppliedAssignments) {
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
                  Review Dashboard Locked
                </h2>
                <p className="text-amber-700 dark:text-amber-300 max-w-md">
                  No assignments have been applied yet. The Review Dashboard shows portfolio changes 
                  and impact analysis based on assigned accounts — you need to generate and apply assignments first.
                </p>
              </div>
              
              <Alert className="max-w-lg text-left border-amber-200 bg-amber-100/50 dark:bg-amber-900/20">
                <AlertCircle className="h-4 w-4 text-amber-600" />
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
                <Button 
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['customer-parent-accounts', buildId] })} 
                  variant="ghost" 
                  size="sm"
                >
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

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <ToggleGroup 
          type="single" 
          value={viewMode} 
          onValueChange={(value) => value && setViewMode(value as 'customers' | 'prospects' | 'all')}
          className="bg-muted p-1 rounded-lg"
        >
          <ToggleGroupItem value="all" className="data-[state=on]:bg-background px-4">
            <Users className="h-4 w-4 mr-2" />
            All Accounts
          </ToggleGroupItem>
          <ToggleGroupItem value="customers" className="data-[state=on]:bg-background px-4">
            <Building2 className="h-4 w-4 mr-2" />
            Customers
          </ToggleGroupItem>
          <ToggleGroupItem value="prospects" className="data-[state=on]:bg-background px-4">
            <Target className="h-4 w-4 mr-2" />
            Prospects
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">
          {viewMode === 'all' && `${portfolioSummary?.totalAccounts || 0} customers + ${prospectMetrics?.total || 0} prospects`}
          {viewMode === 'customers' && `${portfolioSummary?.totalAccounts || 0} customer accounts`}
          {viewMode === 'prospects' && `${prospectMetrics?.total || 0} prospect accounts`}
        </p>
      </div>

      {/* Customer Portfolio - Compact Summary Bar */}
      {(viewMode === 'all' || viewMode === 'customers') && portfolioSummary && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">Customer Portfolio</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {/* Accounts */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">{portfolioSummary.totalAccounts.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">accounts</span>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            
            {/* ARR */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">${(portfolioSummary.totalARR / 1000000).toFixed(1)}M</span>
              <span className="text-xs text-muted-foreground">ARR</span>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            
            {/* ATR */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">${(portfolioSummary.totalATR / 1000000).toFixed(1)}M</span>
              <span className="text-xs text-muted-foreground">ATR</span>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            
            {/* At-Risk */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-red-600">{portfolioSummary.totalRiskAccounts}</span>
              <span className="text-xs text-muted-foreground">at-risk</span>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            
            {/* Retention */}
            {assignmentChanges && allAccounts && (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-green-600">
                    {allAccounts.length > 0 ? (((allAccounts.length - assignmentChanges.length) / allAccounts.length) * 100).toFixed(1) : 0}%
                  </span>
                  <span className="text-xs text-muted-foreground">retention</span>
                </div>
                <div className="h-8 w-px bg-border hidden sm:block" />
                
                {/* Regional Alignment */}
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold ${portfolioSummary.regionalAlignmentRate >= 80 ? 'text-green-600' : portfolioSummary.regionalAlignmentRate >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                    {portfolioSummary.regionalAlignmentRate.toFixed(1)}%
                  </span>
                  <span className="text-xs text-muted-foreground">geo-aligned</span>
                </div>
                <div className="h-8 w-px bg-border hidden sm:block" />
                
                {/* Reassigned */}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold">{assignmentChanges.length}</span>
                  <span className="text-xs text-muted-foreground">reassigned</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Prospect Portfolio - Compact Summary Bar */}
      {(viewMode === 'all' || viewMode === 'prospects') && prospectMetrics && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium">Prospect Portfolio</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {/* Accounts */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">{prospectMetrics.total.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">accounts</span>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            
            {/* Reassigned */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">{prospectMetrics.reassigned.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">reassigned</span>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            
            {/* Retention */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-green-600">{prospectMetrics.retentionRate.toFixed(1)}%</span>
              <span className="text-xs text-muted-foreground">retention</span>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            
            {/* Coverage */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-blue-600">
                {prospectMetrics.total > 0 ? ((prospectMetrics.assigned / prospectMetrics.total) * 100).toFixed(1) : 0}%
              </span>
              <span className="text-xs text-muted-foreground">coverage</span>
            </div>
          </div>
        </div>
      )}

      {/* Review Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="summary">Portfolio Summary</TabsTrigger>
          <TabsTrigger value="changes">All Account Moves</TabsTrigger>
          <TabsTrigger value="impact">Impact Analysis</TabsTrigger>
          <TabsTrigger value="reviews">Review Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          {/* Portfolio Type Toggle */}
          <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
            <span className="text-sm font-medium">View:</span>
            <div className="flex gap-2">
              <Button
                variant={portfolioType === 'customers' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPortfolioType('customers')}
                className="gap-2"
              >
                <Users className="h-4 w-4" />
                Customers ({allAccounts?.length || 0})
              </Button>
              <Button
                variant={portfolioType === 'prospects' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPortfolioType('prospects')}
                className="gap-2"
              >
                <Building className="h-4 w-4" />
                Prospects ({prospectAccounts?.length || 0})
              </Button>
            </div>
          </div>

          {/* Customer Portfolio Summary */}
          {portfolioType === 'customers' && (
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
                               <TableHead className="text-center">Parents</TableHead>
                               <TableHead className="text-center">ARR</TableHead>
                               <TableHead className="text-center">ATR</TableHead>
                               <TableHead className="text-center whitespace-nowrap">CRE Parents</TableHead>
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
          )}

          {/* Prospect Portfolio Summary */}
          {portfolioType === 'prospects' && (
          <Card>
            <CardHeader>
              <CardTitle>Prospect Portfolio Summary by FLM and SLM</CardTitle>
              <CardDescription>
                Complete view of all prospect account portfolios organized by First Line Manager (FLM) and Second Line Manager (SLM)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {prospectPortfolioSummary ? (
                <div className="space-y-6">
                  {Object.entries(prospectPortfolioSummary.portfoliosBySLM).map(([slm, flmData]) => (
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
                               <TableHead className="text-center">Prospects</TableHead>
                               <TableHead className="text-center">Top Geo</TableHead>
                               <TableHead className="text-center">Retention %</TableHead>
                               <TableHead className="text-center">Tier Distribution</TableHead>
                               <TableHead>Actions</TableHead>
                             </TableRow>
                           </TableHeader>
                          <TableBody>
                            {Object.entries(flmData).map(([flm, data]) => (
                              <>
                                 <TableRow key={`${slm}-${flm}`} className="border-l-2 border-blue-200 hover:bg-muted/50 transition-colors cursor-pointer"
                                   onClick={() => setSelectedFLM({ flm, slm, data })}>
                                  <TableCell className="pl-4 font-medium">{flm} (FLM)</TableCell>
                                  <TableCell className="text-center">{data.activeRepCount}</TableCell>
                                  <TableCell className="text-center font-medium text-blue-600">{data.totalAccounts}</TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="outline" className="text-xs">{data.topGeo}</Badge>
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
                                        <Badge variant="outline" className="text-xs text-muted-foreground">?: {data.unassignedTierCount}</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm text-muted-foreground">View Details</span>
                                  </TableCell>
                                </TableRow>
                              </>
                            ))}
                            {/* SLM Total Row */}
                            <TableRow className="bg-blue-50/50 border-l-4 border-blue-500 font-semibold">
                              <TableCell className="pl-4 font-bold text-blue-700">
                                {slm} Total
                              </TableCell>
                              <TableCell className="text-center font-bold text-blue-700">
                                {Object.values(flmData).reduce((sum, data) => sum + data.activeRepCount, 0)}
                              </TableCell>
                              <TableCell className="text-center font-bold text-blue-700">
                                {Object.values(flmData).reduce((sum, data) => sum + data.totalAccounts, 0)}
                              </TableCell>
                              <TableCell className="text-center">-</TableCell>
                              <TableCell className="text-center font-bold text-blue-700">
                                {(() => {
                                  const totalAccounts = Object.values(flmData).reduce((sum, data) => sum + data.totalAccounts, 0);
                                  const totalRetained = Object.values(flmData).reduce((sum, data) => sum + data.retainedCount, 0);
                                  return totalAccounts > 0 ? ((totalRetained / totalAccounts) * 100).toFixed(1) : 0;
                                })()}%
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
                  <p className="text-muted-foreground">No prospect portfolio data found</p>
                </div>
              )}
            </CardContent>
          </Card>
          )}
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
                       // Show CRE status badge if present
                       const creStatus = change.cre_status;

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
                           <TableCell className="font-medium">${((parseFloat(change.hierarchy_bookings_arr_converted) || parseFloat(change.calculated_arr) || parseFloat(change.arr) || 0) / 1000000).toFixed(1)}M</TableCell>
                           <TableCell>
                             <Badge variant={change.expansion_tier === 'Tier 1' ? 'default' : 'secondary'}>
                               {change.expansion_tier || 'Unassigned'}
                             </Badge>
                           </TableCell>
                           <TableCell>{change.owner_name || 'Unassigned'}</TableCell>
                           <TableCell className="font-medium">{change.new_owner_name}</TableCell>
                          <TableCell>
                            {creStatus ? (
                              <Badge 
                                variant={creStatus === 'Confirmed Churn' || creStatus === 'At Risk' ? 'destructive' : 'secondary'}
                                className="text-xs"
                              >
                                {creStatus}
                              </Badge>
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

        <TabsContent value="impact" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Managers with Biggest Changes */}
            <Card>
              <CardHeader>
                <CardTitle>Managers with Biggest Changes</CardTitle>
                <CardDescription>
                  FLMs with the most account reassignments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assignmentChanges && allActiveSalesReps && (
                  <div className="space-y-3">
                    {(() => {
                      // Calculate changes per FLM
                      const flmChanges = new Map<string, { count: number; arr: number; reps: Set<string> }>();

                      assignmentChanges.forEach(acc => {
                        // Find the rep for this account's new owner
                        const newOwnerRep = allActiveSalesReps.find(r => r.rep_id === acc.new_owner_id);
                        if (newOwnerRep && newOwnerRep.flm) {
                          const current = flmChanges.get(newOwnerRep.flm) || { count: 0, arr: 0, reps: new Set() };
                          current.count++;
                          current.arr += parseFloat(acc.hierarchy_bookings_arr_converted || acc.calculated_arr || acc.arr) || 0;
                          current.reps.add(newOwnerRep.rep_id);
                          flmChanges.set(newOwnerRep.flm, current);
                        }
                      });

                      // Sort by count and take top 5
                      const sortedFLMs = Array.from(flmChanges.entries())
                        .sort((a, b) => b[1].count - a[1].count)
                        .slice(0, 5);

                      if (sortedFLMs.length === 0) {
                        return <p className="text-center text-muted-foreground py-4">No changes found</p>;
                      }

                      return sortedFLMs.map(([flm, data]) => (
                        <div key={flm} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div>
                            <div className="font-medium">{flm}</div>
                            <div className="text-sm text-muted-foreground">
                              {data.reps.size} reps affected
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-lg">{data.count}</div>
                            <div className="text-xs text-muted-foreground">
                              ${(data.arr / 1000000).toFixed(1)}M ARR
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Largest ARR Movements */}
            <Card>
              <CardHeader>
                <CardTitle>Largest ARR Movements</CardTitle>
                <CardDescription>
                  Top accounts being reassigned by ARR value
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assignmentChanges && (
                  <div className="space-y-3">
                    {assignmentChanges
                      .filter(acc => {
                        const arrValue = parseFloat(acc.hierarchy_bookings_arr_converted || acc.calculated_arr || acc.arr) || 0;
                        return arrValue >= 500000; // $500K minimum
                      })
                      .sort((a, b) => {
                        const aArr = parseFloat(a.hierarchy_bookings_arr_converted || a.calculated_arr || a.arr) || 0;
                        const bArr = parseFloat(b.hierarchy_bookings_arr_converted || b.calculated_arr || b.arr) || 0;
                        return bArr - aArr;
                      })
                      .slice(0, 5)
                      .map(acc => {
                        const arrValue = parseFloat(acc.hierarchy_bookings_arr_converted || acc.calculated_arr || acc.arr) || 0;
                        return (
                          <div
                            key={acc.sfdc_account_id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => {
                              setSelectedAccount(acc);
                              setIsAccountDialogOpen(true);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{acc.account_name}</div>
                              <div className="text-sm text-muted-foreground">
                                {acc.owner_name} → {acc.new_owner_name}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="font-bold text-lg">
                                ${(arrValue / 1000000).toFixed(1)}M
                              </div>
                              {(acc.cre_count || 0) > 0 && (
                                <Badge variant="destructive" className="text-xs mt-1">
                                  {acc.cre_count} CRE
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    {assignmentChanges.filter(acc => {
                      const arrValue = parseFloat(acc.hierarchy_bookings_arr_converted || acc.calculated_arr || acc.arr) || 0;
                      return arrValue >= 500000;
                    }).length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No accounts with ARR ≥ $500K being reassigned
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* At-Risk Parent Reassignments */}
            <Card>
              <CardHeader>
                <CardTitle>At-Risk Parent Reassignments</CardTitle>
                <CardDescription>
                  Parent accounts with CRE status being moved to new owners
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assignmentChanges && (
                  <div className="space-y-3">
                    {assignmentChanges
                      .filter(acc => acc.cre_status !== null || (acc.cre_count && acc.cre_count > 0))
                      .sort((a, b) => {
                        // Sort by severity: Confirmed Churn > At Risk > Pre-Risk Discovery > Monitoring > Closed
                        const severity: Record<string, number> = { 'Confirmed Churn': 5, 'At Risk': 4, 'Pre-Risk Discovery': 3, 'Monitoring': 2, 'Closed': 1 };
                        return (severity[b.cre_status] || 0) - (severity[a.cre_status] || 0);
                      })
                      .slice(0, 5)
                      .map(acc => {
                        const arrValue = parseFloat(acc.hierarchy_bookings_arr_converted || acc.calculated_arr || acc.arr) || 0;
                        const isHighRisk = acc.cre_status === 'Confirmed Churn' || acc.cre_status === 'At Risk';
                        return (
                          <div
                            key={acc.sfdc_account_id}
                            className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg hover:bg-destructive/5 transition-colors cursor-pointer"
                            onClick={() => {
                              setSelectedAccount(acc);
                              setIsAccountDialogOpen(true);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate flex items-center gap-2">
                                <AlertCircle className={`h-4 w-4 flex-shrink-0 ${isHighRisk ? 'text-destructive' : 'text-amber-500'}`} />
                                {acc.account_name}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {acc.owner_name} → {acc.new_owner_name}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <Badge 
                                variant={isHighRisk ? 'destructive' : 'secondary'} 
                                className="mb-1"
                              >
                                {acc.cre_status}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                ${(arrValue / 1000000).toFixed(1)}M ARR
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {assignmentChanges.filter(acc => acc.cre_status !== null || (acc.cre_count && acc.cre_count > 0)).length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No at-risk parent accounts being reassigned
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Coverage Gaps */}
            <Card>
              <CardHeader>
                <CardTitle>Coverage Gaps</CardTitle>
                <CardDescription>
                  High-value accounts without assigned owners
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allAccounts && (
                  <div className="space-y-3">
                    {allAccounts
                      .filter(acc => !acc.new_owner_id || acc.new_owner_id.trim() === '')
                      .sort((a, b) => {
                        const aArr = parseFloat(a.hierarchy_bookings_arr_converted || a.calculated_arr || a.arr) || 0;
                        const bArr = parseFloat(b.hierarchy_bookings_arr_converted || b.calculated_arr || b.arr) || 0;
                        return bArr - aArr;
                      })
                      .slice(0, 5)
                      .map(acc => {
                        const arrValue = parseFloat(acc.hierarchy_bookings_arr_converted || acc.calculated_arr || acc.arr) || 0;
                        return (
                          <div
                            key={acc.sfdc_account_id}
                            className="flex items-center justify-between p-3 border border-orange-200 dark:border-orange-900 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors cursor-pointer"
                            onClick={() => {
                              setSelectedAccount(acc);
                              setIsAccountDialogOpen(true);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate flex items-center gap-2">
                                <HelpCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                                {acc.account_name}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Current: {acc.owner_name || 'Unassigned'}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="font-bold text-lg">
                                ${(arrValue / 1000000).toFixed(1)}M
                              </div>
                              {acc.expansion_tier && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  {acc.expansion_tier}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    {allAccounts.filter(acc => !acc.new_owner_id || acc.new_owner_id.trim() === '').length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        All accounts have assigned owners
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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