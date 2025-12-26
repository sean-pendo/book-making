import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Download, AlertCircle, FileText, Users, Send, Lock, ArrowLeft, RotateCcw, Loader2, Building } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useBuildDataRelationships } from '@/hooks/useBuildData';
import { FLMDetailDialog } from '@/components/FLMDetailDialog';
import SendToManagerDialog from '@/components/SendToManagerDialog';
import { getAccountARR, SUPABASE_LIMITS } from '@/_domain';

interface ComprehensiveReviewProps {
  buildId?: string;
}

export const ComprehensiveReview = ({ buildId: propBuildId }: ComprehensiveReviewProps = {}) => {
  const { buildId: paramBuildId } = useParams<{ buildId: string }>();
  const buildId = propBuildId || paramBuildId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [portfolioType, setPortfolioType] = useState<'customers' | 'prospects'>('customers');
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
      const pageSize = SUPABASE_LIMITS.FETCH_PAGE_SIZE;
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
    const totalParentARR = parentAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
    const splitOwnershipChildrenARR = childAccounts
      .filter(acc => {
        const parentId = acc.ultimate_parent_id;
        if (!parentId) return false;
        const childOwnerId = acc.new_owner_id || acc.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, acc) => sum + getAccountARR(acc), 0);
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
    
    // Calculate regional alignment - accounts where geo matches rep's region
    let regionallyAligned = 0;
    let totalWithTerritory = 0;
    parentAccounts.forEach(acc => {
      // Use geo field for regional alignment (more consistent naming)
      const accountGeo = acc.geo;
      if (accountGeo) {
        totalWithTerritory++;
        const ownerId = acc.new_owner_id || acc.owner_id;
        const ownerRep = salesRepsMap.get(ownerId);
        if (ownerRep?.region) {
          // Normalize and compare: "South East" matches "South East", case-insensitive
          const normalizedGeo = accountGeo.toLowerCase().trim();
          const normalizedRegion = ownerRep.region.toLowerCase().trim();
          if (normalizedGeo === normalizedRegion || 
              normalizedGeo.includes(normalizedRegion) || 
              normalizedRegion.includes(normalizedGeo)) {
            regionallyAligned++;
          }
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
      const flm = currentOwnerRep?.flm || 'Unassigned FLM';
      
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
      
      const arr = getAccountARR(account);
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
        const flm = childOwnerRep?.flm || 'Unassigned FLM';
        
        if (portfoliosBySLM[slm]?.[flm]) {
          const childARR = getAccountARR(childAccount);
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
      const flm = currentOwnerRep?.flm || 'Unassigned FLM';
      
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
      const arr = getAccountARR(account) / 1000000;
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

  if (buildLoading || accountsLoading || prospectsLoading || repsLoading) {
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
            Review and validate book assignment changes before finalization
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

      {/* Portfolio Summary Section */}
      <div className="space-y-6">
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
      </div>

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