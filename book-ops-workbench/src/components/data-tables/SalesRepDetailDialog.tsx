import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { calculateSalesRepMetrics, getAccountCustomerStatus } from '@/utils/salesRepCalculations';
import { getAccountARR, getAccountATR } from '@/utils/accountCalculations';
import { useProspectOpportunities, formatCloseDate, formatNetARR } from '@/hooks/useProspectOpportunities';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Building2, TrendingUp, AlertTriangle, Users, ChevronDown, ChevronRight, UserMinus, UserPlus, Loader2, HelpCircle, ArrowRightLeft, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { TableFilters, type FilterConfig, type FilterValues } from '@/components/ui/table-filters';
import { RenewalQuarterBadge } from '@/components/ui/RenewalQuarterBadge';
import { useToast } from '@/hooks/use-toast';

interface SalesRepDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rep: {
    rep_id: string;
    name: string;
    team: string | null;
    flm: string | null;
    slm: string | null;
  } | null;
  buildId: string;
  /** Callback when data changes (e.g., backfill enabled/disabled) for live sync */
  onDataRefresh?: () => void;
}

interface AccountWithHierarchy {
  sfdc_account_id: string;
  account_name: string;
  ultimate_parent_id: string | null;
  ultimate_parent_name: string | null;
  is_customer: boolean;
  is_parent: boolean;
  arr: number;
  atr: number;
  calculated_arr: number;
  calculated_atr: number;
  hierarchy_bookings_arr_converted: number;
  cre_count: number;
  industry: string | null;
  account_type: string | null;
  geo: string | null;
  sales_territory: string | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  renewal_quarter: string | null;
  cre_risk: boolean;
  risk_flag: boolean;
  owner_id: string;
  owner_name: string | null;
  new_owner_id: string | null;
  new_owner_name: string | null;
  hq_country: string | null;
  children?: AccountWithHierarchy[];
  isParent: boolean;
}

export const SalesRepDetailDialog = ({ open, onOpenChange, rep, buildId, onDataRefresh }: SalesRepDetailDialogProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterValues>({});
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch prospect opportunity data (Net ARR and Close Date)
  const { getNetARR, getCloseDate, getNetARRColorClass } = useProspectOpportunities(buildId);

  // Fetch accounts being gained/lost by this rep
  const { data: accountChanges, isLoading: changesLoading } = useQuery({
    queryKey: ['rep-account-changes', rep?.rep_id, buildId],
    queryFn: async () => {
      if (!rep) return { gaining: [], losing: [] };

      // Accounts being GAINED: new_owner_id = rep_id AND owner_id != rep_id
      const { data: gainingAccounts, error: gainingError } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id,
          account_name,
          is_customer,
          is_parent,
          ultimate_parent_id,
          ultimate_parent_name,
          owner_id,
          owner_name,
          new_owner_id,
          new_owner_name,
          arr,
          calculated_arr,
          hierarchy_bookings_arr_converted,
          geo,
          sales_territory,
          expansion_tier,
          initial_sale_tier
        `)
        .eq('build_id', buildId)
        .eq('new_owner_id', rep.rep_id)
        .neq('owner_id', rep.rep_id);

      if (gainingError) throw gainingError;

      // Accounts being LOST: owner_id = rep_id AND new_owner_id IS NOT NULL AND new_owner_id != rep_id
      const { data: losingAccounts, error: losingError } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id,
          account_name,
          is_customer,
          is_parent,
          ultimate_parent_id,
          ultimate_parent_name,
          owner_id,
          owner_name,
          new_owner_id,
          new_owner_name,
          arr,
          calculated_arr,
          hierarchy_bookings_arr_converted,
          geo,
          sales_territory,
          expansion_tier,
          initial_sale_tier
        `)
        .eq('build_id', buildId)
        .eq('owner_id', rep.rep_id)
        .not('new_owner_id', 'is', null)
        .neq('new_owner_id', rep.rep_id);

      if (losingError) throw losingError;

      // Calculate ARR for each account
      const getARR = (acc: any): number => {
        return parseFloat(acc.hierarchy_bookings_arr_converted) ||
               parseFloat(acc.calculated_arr) ||
               parseFloat(acc.arr) ||
               0;
      };

      // Filter to parent accounts only for cleaner view
      const gainingParents = (gainingAccounts || []).filter(a => 
        !a.ultimate_parent_id || a.ultimate_parent_id.trim() === ''
      );
      const losingParents = (losingAccounts || []).filter(a => 
        !a.ultimate_parent_id || a.ultimate_parent_id.trim() === ''
      );

      return {
        gaining: gainingParents.map(a => ({
          ...a,
          arrValue: getARR(a),
          isCustomer: getARR(a) > 0
        })).sort((a, b) => b.arrValue - a.arrValue),
        losing: losingParents.map(a => ({
          ...a,
          arrValue: getARR(a),
          isCustomer: getARR(a) > 0
        })).sort((a, b) => b.arrValue - a.arrValue),
      };
    },
    enabled: open && !!rep && !!buildId,
  });

  // Fetch rep's backfill status
  const { data: repInfo, refetch: refetchRepInfo } = useQuery({
    queryKey: ['rep-backfill-status', rep?.rep_id, buildId],
    queryFn: async () => {
      if (!rep) return null;
      const { data, error } = await supabase
        .from('sales_reps')
        .select('id, is_backfill_source, is_backfill_target, backfill_target_rep_id, is_placeholder, include_in_assignments, region, team, flm, slm, sub_region, team_tier')
        .eq('build_id', buildId)
        .eq('rep_id', rep.rep_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!rep && !!buildId,
  });

  // Mutation to toggle backfill status
  const backfillMutation = useMutation({
    mutationFn: async ({ enable }: { enable: boolean }) => {
      if (!rep || !repInfo) throw new Error('Rep info not available');

      if (enable) {
        // === ENABLE BACKFILL ===
        // Guard: Don't create duplicate if already a backfill source
        if (repInfo.is_backfill_source) {
          throw new Error('Rep is already marked as leaving');
        }

        // 1. Create backfill rep (with random suffix for uniqueness)
        const bfRepId = `BF-${buildId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const bfRepName = `BF-${rep.name}`;

        const { error: insertError } = await supabase.from('sales_reps').insert({
          rep_id: bfRepId,
          name: bfRepName,
          build_id: buildId,
          region: repInfo.region,
          team: repInfo.team,
          flm: repInfo.flm,
          slm: repInfo.slm,
          sub_region: repInfo.sub_region,
          team_tier: repInfo.team_tier,
          is_active: true,
          include_in_assignments: true,
          is_backfill_target: true,
        });
        if (insertError) throw insertError;

        // 2. Update leaving rep
        const { error: updateRepError } = await supabase.from('sales_reps').update({
          is_backfill_source: true,
          backfill_target_rep_id: bfRepId,
          include_in_assignments: false,
        }).eq('id', repInfo.id);
        if (updateRepError) throw updateRepError;

        // 3. Migrate accounts (both owner_id and new_owner_id cases)
        // Case 1: Accounts already assigned via new_owner_id
        const { error: migrateAccounts1Error } = await supabase.from('accounts').update({
          new_owner_id: bfRepId,
          new_owner_name: bfRepName,
        }).eq('build_id', buildId).eq('new_owner_id', rep.rep_id);
        if (migrateAccounts1Error) throw migrateAccounts1Error;

        // Case 2: Accounts still on original owner (no assignment yet)
        const { error: migrateAccounts2Error } = await supabase.from('accounts').update({
          new_owner_id: bfRepId,
          new_owner_name: bfRepName,
        }).eq('build_id', buildId).eq('owner_id', rep.rep_id).is('new_owner_id', null);
        if (migrateAccounts2Error) throw migrateAccounts2Error;

        // 4. Migrate opportunities
        const { error: migrateOpps1Error } = await supabase.from('opportunities').update({
          new_owner_id: bfRepId,
          new_owner_name: bfRepName,
        }).eq('build_id', buildId).eq('new_owner_id', rep.rep_id);
        if (migrateOpps1Error) throw migrateOpps1Error;

        const { error: migrateOpps2Error } = await supabase.from('opportunities').update({
          new_owner_id: bfRepId,
          new_owner_name: bfRepName,
        }).eq('build_id', buildId).eq('owner_id', rep.rep_id).is('new_owner_id', null);
        if (migrateOpps2Error) throw migrateOpps2Error;

        // 5. Audit log
        await supabase.from('audit_log').insert({
          action: 'BACKFILL_CREATED',
          table_name: 'sales_reps',
          record_id: repInfo.id,
          build_id: buildId,
          created_by: user?.id || 'unknown',
          old_values: { is_backfill_source: false },
          new_values: { is_backfill_source: true, backfill_target_rep_id: bfRepId },
        });

        return { bfRepId, bfRepName };
      } else {
        // === DISABLE BACKFILL (ROLLBACK) ===
        // Restore leaving rep (but keep BF rep and accounts)
        const { error: updateError } = await supabase.from('sales_reps').update({
          is_backfill_source: false,
          include_in_assignments: true,
        }).eq('id', repInfo.id);
        if (updateError) throw updateError;

        // Audit log for rollback
        await supabase.from('audit_log').insert({
          action: 'BACKFILL_ROLLBACK',
          table_name: 'sales_reps',
          record_id: repInfo.id,
          build_id: buildId,
          created_by: user?.id || 'unknown',
          old_values: { is_backfill_source: true },
          new_values: { is_backfill_source: false },
        });

        return null;
      }
    },
    onSuccess: (result, { enable }) => {
      refetchRepInfo();
      queryClient.invalidateQueries({ queryKey: ['sales-reps'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      // Also invalidate balancing-related queries for live sync
      queryClient.invalidateQueries({ queryKey: ['analytics-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['priority-distribution'] });
      queryClient.invalidateQueries({ queryKey: ['last-assignment-timestamp'] });
      queryClient.invalidateQueries({ queryKey: ['enhanced-balancing'] });
      
      // Call parent refresh callback if provided
      onDataRefresh?.();
      
      if (enable && result) {
        toast({
          title: 'Backfill Created',
          description: `Created ${result.bfRepName} and migrated accounts. ${rep?.name} is now excluded from assignments.`,
        });
      } else {
        toast({
          title: 'Backfill Disabled',
          description: `${rep?.name} is now included in assignments again. The backfill rep and migrated accounts remain unchanged.`,
        });
      }
    },
    onError: (error) => {
      console.error('Backfill mutation error:', error);
      toast({
        title: 'Error',
        description: `Failed to update backfill status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    },
  });

  const filterConfigs: FilterConfig[] = [
    {
      key: 'account_type',
      label: 'Account Type',
      type: 'select',
      options: [
        { value: 'Customer', label: 'Customer' },
        { value: 'Prospect', label: 'Prospect' }
      ],
      placeholder: 'All types'
    },
    {
      key: 'industry',
      label: 'Industry',
      type: 'select',
      options: [], // Will be populated from data
      placeholder: 'All industries'
    },
    {
      key: 'geo',
      label: 'Region',
      type: 'select',
      options: [], // Will be populated from data
      placeholder: 'All regions'
    },
    {
      key: 'tier',
      label: 'Tier',
      type: 'select',
      options: [
        { value: 'Tier 1', label: 'Tier 1' },
        { value: 'Tier 2', label: 'Tier 2' },
        { value: 'Tier 3', label: 'Tier 3' },
        { value: 'Tier 4', label: 'Tier 4' }
      ],
      placeholder: 'All tiers'
    }
  ];

  const { data: repDetail, isLoading, error } = useQuery({
    queryKey: ['sales-rep-detail', rep?.rep_id, buildId, searchTerm, filters],
    queryFn: async () => {
      try {
        if (!rep) return null;

        // Get all accounts where this rep is the final owner (either new_owner_id or owner_id if no new assignment)
        let accountsQuery = supabase
          .from('accounts')
          .select(`
            sfdc_account_id,
            account_name,
            ultimate_parent_id,
            ultimate_parent_name,
            is_customer,
            is_parent,
            arr,
            atr,
            calculated_arr,
            calculated_atr,
            hierarchy_bookings_arr_converted,
            cre_count,
            industry,
            account_type,
            geo,
            sales_territory,
            expansion_tier,
            initial_sale_tier,
            renewal_quarter,
            cre_risk,
            risk_flag,
            owner_id,
            owner_name,
            new_owner_id,
            new_owner_name,
            hq_country
          `)
          .eq('build_id', buildId)
          .or(`new_owner_id.eq.${rep.rep_id},and(owner_id.eq.${rep.rep_id},new_owner_id.is.null)`);

        if (searchTerm) {
          accountsQuery = accountsQuery.or(`account_name.ilike.%${searchTerm}%,ultimate_parent_name.ilike.%${searchTerm}%,industry.ilike.%${searchTerm}%,account_type.ilike.%${searchTerm}%,geo.ilike.%${searchTerm}%,sales_territory.ilike.%${searchTerm}%`);
        }

        const { data: accounts, error: accountsError } = await accountsQuery.order('account_name');
        if (accountsError) throw accountsError;
        if (!accounts) return null;
        
        // DEBUG: Log tier data from database
        console.log('🔍 TIER DEBUG - First 5 accounts:', accounts.slice(0, 5).map(a => ({
          name: a.account_name,
          expansion_tier: a.expansion_tier,
          initial_sale_tier: a.initial_sale_tier,
          combined: a.expansion_tier || a.initial_sale_tier
        })));

        // Get opportunities data for ATR and CRE calculations - check both old and new owner assignments
        const { data: opportunities, error: oppsError } = await supabase
          .from('opportunities')
          .select('owner_id, new_owner_id, new_owner_name, renewal_event_date, sfdc_account_id, available_to_renew, cre_status, opportunity_type')
          .eq('build_id', buildId)
          .or(`new_owner_id.eq.${rep.rep_id},and(owner_id.eq.${rep.rep_id},new_owner_id.is.null)`);

        if (oppsError) throw oppsError;

        // Debug: Log raw account data for ATR investigation
        console.log(`[DEBUG Dialog] Fetched ${accounts.length} accounts for rep ${rep.rep_id}`);
        console.log('[DEBUG Dialog] Sample account ATR values:', accounts.slice(0, 5).map(a => ({
          name: a.account_name,
          atr: a.atr,
          calculated_atr: a.calculated_atr
        })));

        // Use shared calculation utility for consistent metrics
        const metrics = calculateSalesRepMetrics(rep.rep_id, accounts, opportunities || []);
        
        console.log('[DEBUG Dialog] Calculated metrics:', metrics);

        // Structure the hierarchy for display using updated parent/child logic
        // Parent accounts: those with blank ultimate_parent_id
        // Child accounts: those with non-blank ultimate_parent_id
        const hierarchicalAccounts: AccountWithHierarchy[] = [];
        
        // Group accounts: parents and children separately
        const parentAccounts = accounts.filter(a => 
          !a.ultimate_parent_id || 
          a.ultimate_parent_id === '' || 
          a.ultimate_parent_id.trim() === ''
        );
        
        const childAccounts = accounts.filter(a => 
          a.ultimate_parent_id && 
          a.ultimate_parent_id !== '' && 
          a.ultimate_parent_id.trim() !== ''
        );

        // Add parent accounts to hierarchy
        parentAccounts.forEach(parent => {
          hierarchicalAccounts.push({
            ...parent,
            renewal_quarter: parent.renewal_quarter || null,
            children: [],
            isParent: true
          });
        });
        
        // DEBUG: Check tier data after parent processing
        console.log('🔍 TIER DEBUG - After adding parents:', hierarchicalAccounts.slice(0, 3).map(a => ({
          name: a.account_name,
          expansion_tier: a.expansion_tier,
          initial_sale_tier: a.initial_sale_tier
        })));

        // Group child accounts by their ultimate parent ID
        const childAccountsByParent = new Map<string, typeof accounts>();
        childAccounts.forEach(child => {
          const parentId = child.ultimate_parent_id!;
          if (!childAccountsByParent.has(parentId)) {
            childAccountsByParent.set(parentId, []);
          }
          childAccountsByParent.get(parentId)!.push(child);
        });

        // Add orphaned child hierarchies (children whose parents aren't owned by this rep)
        childAccountsByParent.forEach((children, parentId) => {
          // Create a virtual parent entry for display purposes
          const firstChild = children[0];
          // Use the children's owner for the parent since they share ownership in this view
          const childOwnerName = firstChild.new_owner_name || firstChild.owner_name;
          const childOwnerId = firstChild.new_owner_id || firstChild.owner_id;
          const virtualParent: AccountWithHierarchy = {
            sfdc_account_id: `virtual-parent-${parentId}`, // Use unique key to avoid duplicates
            account_name: `${firstChild.ultimate_parent_name || 'Unknown Parent'} (Parent - Not Owned)`,
            ultimate_parent_id: null,
            ultimate_parent_name: firstChild.ultimate_parent_name,
            is_customer: false,
            is_parent: true,
            arr: 0,
            atr: 0,
            calculated_arr: 0,
            calculated_atr: 0,
            hierarchy_bookings_arr_converted: 0,
            cre_count: 0,
            industry: null,
            account_type: null,
            geo: null,
            sales_territory: null,
            expansion_tier: null,
            initial_sale_tier: null,
            renewal_quarter: null,
            cre_risk: false,
            risk_flag: false,
            owner_id: childOwnerId,
            owner_name: childOwnerName,
            new_owner_id: childOwnerId,
            new_owner_name: childOwnerName,
            hq_country: null,
            children: children.map(child => ({
              ...child,
              renewal_quarter: child.renewal_quarter || null,
              children: [],
              isParent: false
            })),
            isParent: true
          };
          hierarchicalAccounts.push(virtualParent);
        });

        // Group accounts by parent for hierarchy calculations (for filtering)
        const accountsByParent = new Map<string, typeof accounts>();
        accounts.forEach(account => {
          const parentId = account.ultimate_parent_id || account.sfdc_account_id;
          if (!accountsByParent.has(parentId)) {
            accountsByParent.set(parentId, []);
          }
          accountsByParent.get(parentId)!.push(account);
        });

        // Apply filters using hierarchy-based customer/prospect logic
        const filteredAccounts = hierarchicalAccounts.filter(account => {
          try {
            if (filters.account_type) {
              const customerStatus = getAccountCustomerStatus(account, accountsByParent);
              if (customerStatus !== filters.account_type) return false;
            }
            if (filters.industry && account.industry !== filters.industry) return false;
            if (filters.geo && account.geo !== filters.geo) return false;
            if (filters.tier) {
              const tier = account.expansion_tier || account.initial_sale_tier;
              if (tier !== filters.tier) return false;
            }
            return true;
          } catch (filterError) {
            console.warn('[WARN SalesRepDetailDialog] Filter error for account:', account.sfdc_account_id, filterError);
            return true; // Include account if filter fails
          }
        });

        // Calculate summary using metrics from shared utility
        const summary = {
          totalAccounts: metrics.total_accounts,
          parentAccounts: metrics.parent_accounts,
          childAccounts: metrics.child_accounts,
          customerAccounts: metrics.customer_accounts,
          prospectAccounts: metrics.prospect_accounts,
          totalARR: metrics.total_arr,
          totalATR: metrics.total_atr,
          totalCRECount: metrics.cre_risk_count,
          renewalCount: metrics.renewal_count
        };

        // DEBUG: Check tier data in final filtered accounts
        console.log('🔍 TIER DEBUG - Final filtered accounts:', filteredAccounts.slice(0, 3).map(a => ({
          name: a.account_name,
          expansion_tier: a.expansion_tier,
          initial_sale_tier: a.initial_sale_tier
        })));

        // Fetch assignment rationales for all accounts
        const allAccountIds = accounts.map(a => a.sfdc_account_id);
        let rationaleMap = new Map<string, string>();
        if (allAccountIds.length > 0) {
          const { data: assignmentsData } = await supabase
            .from('assignments')
            .select('sfdc_account_id, rationale')
            .eq('build_id', buildId)
            .in('sfdc_account_id', allAccountIds);
          
          (assignmentsData || []).forEach((a: any) => {
            rationaleMap.set(a.sfdc_account_id, a.rationale || '');
          });
        }

        // Add assignment_rationale to filtered accounts and their children
        const accountsWithRationale = filteredAccounts.map(account => ({
          ...account,
          assignment_rationale: rationaleMap.get(account.sfdc_account_id) || '',
          children: (account.children || []).map((child: any) => ({
            ...child,
            assignment_rationale: rationaleMap.get(child.sfdc_account_id) || ''
          }))
        }));

        return {
          accounts: accountsWithRationale,
          summary,
          industries: [...new Set(accounts.map(a => a.industry).filter(Boolean))],
          geos: [...new Set(accounts.map(a => a.geo).filter(Boolean))],
          hierarchyOpportunities: opportunities || [],
          accountsByParent: accountsByParent
        };

      } catch (error) {
        console.error('[ERROR SalesRepDetailDialog] Query failed:', error);
        throw error;
      }
    },
    enabled: open && !!rep && !!buildId,
    retry: 1,
    retryDelay: 1000,
  });

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const getActiveFilterCount = () => {
    return Object.values(filters).filter(v => v !== null && v !== '' && v !== undefined).length;
  };

  const formatCurrency = (value: number | undefined) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getFiscalQuarter = (date: string | Date) => {
    const d = new Date(date);
    const month = d.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
    
    // FY starts in February
    if (month >= 2 && month <= 4) return 'Q1';
    if (month >= 5 && month <= 7) return 'Q2'; 
    if (month >= 8 && month <= 10) return 'Q3';
    return 'Q4'; // Nov, Dec, Jan
  };

  const getRenewalsByQuarter = () => {
    if (!repDetail?.hierarchyOpportunities) return { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    
    const quarters = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    
    repDetail.hierarchyOpportunities.forEach(opp => {
      if (opp.renewal_event_date) {
        const quarter = getFiscalQuarter(opp.renewal_event_date);
        quarters[quarter as keyof typeof quarters]++;
      }
    });
    
    return quarters;
  };

  const getTierBadge = (tier: string | null) => {
    if (!tier) return <span className="text-xs text-muted-foreground">-</span>;
    const variant = tier === 'Tier 1' ? 'default' : 'outline';
    return <Badge variant={variant} className="text-xs">{tier}</Badge>;
  };

  const getPreviousOwnerInfo = (account: AccountWithHierarchy) => {
    // Show the original owner (owner_name) - this is who owned it BEFORE any reassignment
    // If there was a reassignment (new_owner_id exists), owner_name is the previous owner
    // If no reassignment, owner_name is still the owner (so technically no "previous")
    return account.owner_name || account.owner_id || 'Unknown';
  };

  const toggleParentExpansion = (parentId: string) => {
    const newExpanded = new Set(expandedParents);
    if (newExpanded.has(parentId)) {
      newExpanded.delete(parentId);
    } else {
      newExpanded.add(parentId);
    }
    setExpandedParents(newExpanded);
  };

  if (!rep) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-none max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {rep.name} - Detailed View
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="h-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Account Portfolio</TabsTrigger>
            <TabsTrigger value="changes" className="relative">
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
              Account Changes
              {accountChanges && (accountChanges.gaining.length > 0 || accountChanges.losing.length > 0) && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-pink-500/20 text-pink-700 dark:text-pink-300">
                  {accountChanges.gaining.length + accountChanges.losing.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-2">
              <div className="text-red-500">Error loading sales representative details</div>
              <div className="text-sm text-muted-foreground">Please close and try again</div>
            </div>
          ) : !repDetail ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted-foreground">No data found for this representative</div>
            </div>
          ) : (
            <>
              <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Account Portfolio
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Accounts:</span>
                    <span className="font-semibold">{repDetail?.summary.totalAccounts || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Parent Accounts:</span>
                    <span className="font-semibold">{repDetail?.summary.parentAccounts || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Child Accounts:</span>
                    <span className="font-semibold">{repDetail?.summary.childAccounts || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Customers:</span>
                    <span className="font-semibold text-green-600">{repDetail?.summary.customerAccounts || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Prospects:</span>
                    <span className="font-semibold text-blue-600">{repDetail?.summary.prospectAccounts || 0}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Financial Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total ARR:</span>
                    <span className="font-semibold text-green-600">
                      {formatCurrency(repDetail?.summary.totalARR)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total ATR:</span>
                    <span className="font-semibold text-red-600">
                      {formatCurrency(repDetail?.summary.totalATR)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CRE Count:</span>
                    <span className="font-semibold text-orange-600">{repDetail?.summary.totalCRECount || 0}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Renewals by Quarter
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(() => {
                    const renewalsByQuarter = getRenewalsByQuarter();
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Q1 (Feb-Apr):</span>
                          <span className="font-semibold">{renewalsByQuarter.Q1}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Q2 (May-Jul):</span>
                          <span className="font-semibold">{renewalsByQuarter.Q2}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Q3 (Aug-Oct):</span>
                          <span className="font-semibold">{renewalsByQuarter.Q3}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Q4 (Nov-Jan):</span>
                          <span className="font-semibold">{renewalsByQuarter.Q4}</span>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Rep Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-semibold">{rep.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rep ID:</span>
                      <span className="font-mono text-xs">{rep.rep_id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Team:</span>
                      <span>{rep.team || 'Not assigned'}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">FLM:</span>
                      <span>{rep.flm || 'Not assigned'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SLM:</span>
                      <span>{rep.slm || 'Not assigned'}</span>
                    </div>
                  </div>
                </div>

                {/* Backfill Toggle Section */}
                <div className="mt-6 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserMinus className="h-4 w-4 text-orange-500" />
                      <Label htmlFor="backfill-toggle" className="text-sm font-medium">
                        Mark as Leaving (Backfill)
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[280px]">
                          <p className="text-xs">
                            <strong>When enabled:</strong> This rep will be excluded from all assignments. 
                            A backfill rep (BF-{rep.name}) will be auto-created with the same region/team, 
                            and all current accounts will be migrated to the backfill rep.
                          </p>
                          <p className="text-xs mt-2">
                            <strong>When disabled:</strong> The rep will be included in assignments again. 
                            The backfill rep and migrated accounts remain unchanged.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-2">
                      {backfillMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      <Switch
                        id="backfill-toggle"
                        checked={repInfo?.is_backfill_source || false}
                        disabled={backfillMutation.isPending || repInfo?.is_backfill_target || repInfo?.is_placeholder}
                        onCheckedChange={(checked) => backfillMutation.mutate({ enable: checked })}
                      />
                    </div>
                  </div>

                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {repInfo?.is_backfill_source && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700">
                        <UserMinus className="h-3 w-3 mr-1" />
                        Leaving - Excluded from assignments
                      </Badge>
                    )}
                    {repInfo?.is_backfill_target && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                        <UserPlus className="h-3 w-3 mr-1" />
                        Backfill Rep
                      </Badge>
                    )}
                    {repInfo?.is_placeholder && (
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600">
                        Open Headcount
                      </Badge>
                    )}
                    {repInfo?.backfill_target_rep_id && (
                      <span className="text-xs text-muted-foreground">
                        Backfill target: <code className="text-xs">{repInfo.backfill_target_rep_id}</code>
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accounts" className="space-y-4 h-full overflow-hidden">
            <div className="space-y-4">
              <TableFilters
                title="Account Filters"
                filters={filterConfigs.map(config => {
                  if (config.key === 'industry') {
                    return {
                      ...config,
                      options: repDetail?.industries.map(industry => ({ value: industry, label: industry })) || []
                    };
                  }
                  if (config.key === 'geo') {
                    return {
                      ...config,
                      options: repDetail?.geos.map(geo => ({ value: geo, label: geo })) || []
                    };
                  }
                  return config;
                })}
                values={filters}
                onChange={handleFilterChange}
                onClear={clearFilters}
                activeCount={getActiveFilterCount()}
              />

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search accounts, industries, territories..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="border rounded-lg" style={{ width: '100% !important', minWidth: '1400px !important' }}>
                <div className="max-h-96 overflow-auto" style={{ width: '100% !important' }}>
                  <Table className="w-full min-w-[1600px]" style={{ tableLayout: 'fixed', width: '1600px !important' }}>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead style={{ width: '200px' }}>Account</TableHead>
                          <TableHead style={{ width: '150px' }} className="bg-blue-50 dark:bg-blue-950/30">Previous Owner</TableHead>
                          <TableHead style={{ width: '100px' }}>Type</TableHead>
                          <TableHead style={{ width: '140px' }}>Industry</TableHead>
                          <TableHead style={{ width: '120px' }}>Region</TableHead>
                          <TableHead style={{ width: '80px' }}>Tier</TableHead>
                          <TableHead style={{ width: '80px' }}>Renewal</TableHead>
                          <TableHead style={{ width: '120px' }}>ARR</TableHead>
                          <TableHead style={{ width: '120px' }}>ATR / Close</TableHead>
                          <TableHead style={{ width: '100px' }}>CRE Risk</TableHead>
                          <TableHead style={{ width: '180px' }}>Reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                           <TableCell colSpan={11} className="text-center py-8">
                             <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                           </TableCell>
                         </TableRow>
                      ) : (
                        repDetail?.accounts.map((account) => (
                          <React.Fragment key={account.sfdc_account_id}>
                            <TableRow 
                              className={`${account.isParent ? 'bg-muted/50' : ''} cursor-pointer hover:bg-muted/30`}
                              onClick={() => account.children && account.children.length > 0 && toggleParentExpansion(account.sfdc_account_id)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {account.children && account.children.length > 0 && (
                                    expandedParents.has(account.sfdc_account_id) ? 
                                      <ChevronDown className="h-4 w-4" /> : 
                                      <ChevronRight className="h-4 w-4" />
                                  )}
                                  <div>
                                    <div className="font-medium">{account.account_name}</div>
                                    {account.children && account.children.length > 0 && (
                                      <div className="text-xs text-muted-foreground">
                                        {account.children.length} child account{account.children.length !== 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </div>
                                 </div>
                               </TableCell>
                                 <TableCell className="text-sm bg-blue-50 dark:bg-blue-950/30">
                                   <Badge variant={getPreviousOwnerInfo(account) === 'No Change' ? 'outline' : 'secondary'} className="text-xs">
                                     {getPreviousOwnerInfo(account)}
                                   </Badge>
                                 </TableCell>
                                <TableCell>
                                <div className="flex flex-col gap-1">
                                  {(() => {
                                    // Use hierarchy-based customer/prospect logic - SAME AS SalesRepsTable
                                    const parentId = account.ultimate_parent_id || account.sfdc_account_id;
                                    const hierarchyAccounts = repDetail?.accountsByParent?.get(parentId) || [];
                                    const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
                                    const isCustomer = hierarchyARR > 0;
                                    return isCustomer ? (
                                      <Badge variant="default" className="text-xs">Customer</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">Prospect</Badge>
                                    );
                                  })()}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{account.industry || '-'}</TableCell>
                              <TableCell className="text-sm">{account.geo || '-'}</TableCell>
                              <TableCell>
                                {getTierBadge(account.expansion_tier || account.initial_sale_tier)}
                              </TableCell>
                              <TableCell>
                                <RenewalQuarterBadge renewalQuarter={account.renewal_quarter} />
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {(() => {
                                  // Use hierarchy-based customer/prospect logic
                                  const parentId = account.ultimate_parent_id || account.sfdc_account_id;
                                  const hierarchyAccounts = repDetail?.accountsByParent?.get(parentId) || [];
                                  const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
                                  const isCustomer = hierarchyARR > 0;
                                  const accountARR = getAccountARR(account);
                                  const netARR = getNetARR(account.sfdc_account_id);
                                  
                                  return (
                                    <div className="flex flex-col">
                                      <span className={accountARR > 0 ? "text-green-600" : "text-muted-foreground"}>
                                        {formatCurrency(accountARR)}
                                      </span>
                                      {!isCustomer && netARR > 0 && (
                                        <span className={`text-xs ${getNetARRColorClass(netARR)}`}>
                                          Net: {formatNetARR(netARR)}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {(() => {
                                  // Use hierarchy-based customer/prospect logic
                                  const parentId = account.ultimate_parent_id || account.sfdc_account_id;
                                  const hierarchyAccounts = repDetail?.accountsByParent?.get(parentId) || [];
                                  const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
                                  const isCustomer = hierarchyARR > 0;
                                  
                                  if (isCustomer) {
                                    // Calculate ATR from RENEWAL opportunities only for this account
                                    const accountATR = repDetail?.hierarchyOpportunities?.filter(o => 
                                      o.sfdc_account_id === account.sfdc_account_id &&
                                      o.opportunity_type && o.opportunity_type.toLowerCase().trim() === 'renewals'
                                    ).reduce((sum, opp) => sum + (opp.available_to_renew || 0), 0) || 0;
                                    return <span className="text-red-600">{formatCurrency(accountATR)}</span>;
                                  } else {
                                    return formatCloseDate(getCloseDate(account.sfdc_account_id));
                                  }
                                })()}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  // Calculate CRE risk from opportunities - ALIGN WITH SalesRepsTable  
                                  const accountCRECount = repDetail?.hierarchyOpportunities?.filter(o => 
                                    o.sfdc_account_id === account.sfdc_account_id && 
                                    o.cre_status && o.cre_status.trim() !== ''
                                  ).length || 0;
                                  
                                  if (accountCRECount === 0) {
                                    return <Badge variant="secondary" className="text-xs">No Risk</Badge>;
                                  } else {
                                    return <Badge variant="destructive" className="text-xs">{accountCRECount} CRE</Badge>;
                                  }
                                })()}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={(account as any).assignment_rationale || ''}>
                                {(account as any).assignment_rationale || '-'}
                              </TableCell>
                            </TableRow>
                            
                            {/* Child accounts */}
                            {expandedParents.has(account.sfdc_account_id) && account.children?.map((child) => (
                              <TableRow key={child.sfdc_account_id} className="bg-muted/20">
                                <TableCell className="pl-8">
                                  <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 flex items-center justify-center">
                                      <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
                                    </div>
                                    <div className="font-medium text-sm">{child.account_name}</div>
                                   </div>
                                 </TableCell>
                                  <TableCell className="text-sm pl-12">
                                    <Badge variant={getPreviousOwnerInfo(child) === 'No Change' ? 'outline' : 'secondary'} className="text-xs">
                                      {getPreviousOwnerInfo(child)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                  {(() => {
                                    // Use hierarchy-based customer/prospect logic for children too - SAME AS SalesRepsTable
                                    const parentId = child.ultimate_parent_id || child.sfdc_account_id;
                                    const hierarchyAccounts = repDetail?.accountsByParent?.get(parentId) || [];
                                    const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
                                    const isCustomer = hierarchyARR > 0;
                                    return isCustomer ? (
                                      <Badge variant="default" className="text-xs">Customer</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">Prospect</Badge>
                                    );
                                  })()}
                                 </TableCell>
                                <TableCell className="text-sm">{child.industry || '-'}</TableCell>
                                <TableCell className="text-sm">{child.geo || '-'}</TableCell>
                                <TableCell>
                                  {getTierBadge(child.expansion_tier || child.initial_sale_tier)}
                                </TableCell>
                                <TableCell>
                                  <RenewalQuarterBadge renewalQuarter={child.renewal_quarter} />
                                </TableCell>
                                <TableCell className="text-sm font-medium">
                                  {(() => {
                                    // Use hierarchy-based customer/prospect logic
                                    const parentId = child.ultimate_parent_id || child.sfdc_account_id;
                                    const hierarchyAccounts = repDetail?.accountsByParent?.get(parentId) || [];
                                    const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
                                    const isCustomer = hierarchyARR > 0;
                                    const childARR = getAccountARR(child);
                                    const netARR = getNetARR(child.sfdc_account_id);
                                    
                                    return (
                                      <div className="flex flex-col">
                                        <span className={childARR > 0 ? "text-green-600" : "text-muted-foreground"}>
                                          {formatCurrency(childARR)}
                                        </span>
                                        {!isCustomer && netARR > 0 && (
                                          <span className={`text-xs ${getNetARRColorClass(netARR)}`}>
                                            Net: {formatNetARR(netARR)}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </TableCell>
                                  <TableCell className="text-sm font-medium">
                                    {(() => {
                                      // Use hierarchy-based customer/prospect logic
                                      const parentId = child.ultimate_parent_id || child.sfdc_account_id;
                                      const hierarchyAccounts = repDetail?.accountsByParent?.get(parentId) || [];
                                      const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
                                      const isCustomer = hierarchyARR > 0;
                                      
                                      if (isCustomer) {
                                        // Calculate ATR from RENEWAL opportunities only for child account
                                        const childATR = repDetail?.hierarchyOpportunities?.filter(o => 
                                          o.sfdc_account_id === child.sfdc_account_id &&
                                          o.opportunity_type && o.opportunity_type.toLowerCase().trim() === 'renewals'
                                        ).reduce((sum, opp) => sum + (opp.available_to_renew || 0), 0) || 0;
                                        return <span className="text-red-600">{formatCurrency(childATR)}</span>;
                                      } else {
                                        return formatCloseDate(getCloseDate(child.sfdc_account_id));
                                      }
                                    })()}
                                  </TableCell>
                                 <TableCell>
                                  {(() => {
                                    // Calculate CRE risk from opportunities for this child account - ALIGN WITH SalesRepsTable  
                                    const childCRECount = repDetail?.hierarchyOpportunities?.filter(o => 
                                      o.sfdc_account_id === child.sfdc_account_id && 
                                      o.cre_status && o.cre_status.trim() !== ''
                                    ).length || 0;
                                    
                                    if (childCRECount === 0) {
                                      return <Badge variant="secondary" className="text-xs">No Risk</Badge>;
                                    } else {
                                      return <Badge variant="destructive" className="text-xs">{childCRECount} CRE</Badge>;
                                    }
                                  })()}
                                 </TableCell>
                                 <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={(child as any).assignment_rationale || ''}>
                                   {(child as any).assignment_rationale || '-'}
                                 </TableCell>
                              </TableRow>
                            ))}
                          </React.Fragment>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {repDetail?.accounts.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No accounts found matching your search criteria.
                </div>
              )}
            </div>
          </TabsContent>

          {/* Account Changes Tab - Gained/Lost Accounts */}
          <TabsContent value="changes" className="space-y-4">
            {changesLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span className="text-muted-foreground">Loading account changes...</span>
              </div>
            ) : !accountChanges || (accountChanges.gaining.length === 0 && accountChanges.losing.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <ArrowRightLeft className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">No Account Changes</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  This rep is keeping all their current accounts
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Accounts Gaining */}
                <Card className="border-emerald-200 dark:border-emerald-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <ArrowUpRight className="h-5 w-5" />
                      Accounts Gaining
                      <Badge variant="outline" className="ml-auto bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700">
                        {accountChanges?.gaining.length || 0}
                      </Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Accounts being transferred TO this rep
                    </p>
                  </CardHeader>
                  <CardContent>
                    {accountChanges?.gaining.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-4 text-center">No accounts being gained</p>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {accountChanges?.gaining.map((account: any) => (
                          <div 
                            key={account.sfdc_account_id}
                            className="flex items-center justify-between p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">{account.account_name}</span>
                                <Badge 
                                  variant={account.isCustomer ? "default" : "outline"} 
                                  className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
                                >
                                  {account.isCustomer ? 'Customer' : 'Prospect'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  From: <span className="font-medium text-foreground/80">{account.owner_name || 'Unknown'}</span>
                                </span>
                                {account.geo && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-xs text-muted-foreground">{account.geo}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {account.arrValue > 0 && (
                              <div className="text-right ml-3 flex-shrink-0">
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                                  {formatCurrency(account.arrValue)}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Summary */}
                    {accountChanges && accountChanges.gaining.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-emerald-200 dark:border-emerald-800">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total ARR Gaining:</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(accountChanges.gaining.reduce((sum: number, a: any) => sum + a.arrValue, 0))}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Accounts Losing */}
                <Card className="border-red-200 dark:border-red-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                      <ArrowDownRight className="h-5 w-5" />
                      Accounts Losing
                      <Badge variant="outline" className="ml-auto bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
                        {accountChanges?.losing.length || 0}
                      </Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Accounts being transferred FROM this rep
                    </p>
                  </CardHeader>
                  <CardContent>
                    {accountChanges?.losing.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-4 text-center">No accounts being lost</p>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {accountChanges?.losing.map((account: any) => (
                          <div 
                            key={account.sfdc_account_id}
                            className="flex items-center justify-between p-3 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">{account.account_name}</span>
                                <Badge 
                                  variant={account.isCustomer ? "default" : "outline"} 
                                  className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
                                >
                                  {account.isCustomer ? 'Customer' : 'Prospect'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  To: <span className="font-medium text-foreground/80">{account.new_owner_name || 'Unknown'}</span>
                                </span>
                                {account.geo && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-xs text-muted-foreground">{account.geo}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {account.arrValue > 0 && (
                              <div className="text-right ml-3 flex-shrink-0">
                                <span className="font-semibold text-red-600 dark:text-red-400 text-sm">
                                  {formatCurrency(account.arrValue)}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Summary */}
                    {accountChanges && accountChanges.losing.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-red-200 dark:border-red-800">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total ARR Losing:</span>
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            {formatCurrency(accountChanges.losing.reduce((sum: number, a: any) => sum + a.arrValue, 0))}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Net Impact Summary */}
            {accountChanges && (accountChanges.gaining.length > 0 || accountChanges.losing.length > 0) && (
              <Card className="border-2 border-dashed">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                          +{accountChanges.gaining.length}
                        </span>
                        <p className="text-xs text-muted-foreground">accounts gained</p>
                      </div>
                      <div className="text-center">
                        <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                          -{accountChanges.losing.length}
                        </span>
                        <p className="text-xs text-muted-foreground">accounts lost</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {(() => {
                        const arrGained = accountChanges.gaining.reduce((sum: number, a: any) => sum + a.arrValue, 0);
                        const arrLost = accountChanges.losing.reduce((sum: number, a: any) => sum + a.arrValue, 0);
                        const netArr = arrGained - arrLost;
                        const isPositive = netArr >= 0;
                        return (
                          <>
                            <span className={`text-2xl font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {isPositive ? '+' : ''}{formatCurrency(netArr)}
                            </span>
                            <p className="text-xs text-muted-foreground">net ARR impact</p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
            </>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};