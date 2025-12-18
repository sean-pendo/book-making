import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAccountARR, getAccountATR } from '@/_domain';
import { 
  Search, 
  Download, 
  UserPlus, 
  AlertTriangle, 
  CheckCircle2,
  Users,
  DollarSign,
  Split,
  GitBranch,
  Network,
  MoreVertical,
  Unlink,
  RefreshCw
} from 'lucide-react';
import { RepMetrics, AccountDetail } from '@/hooks/useEnhancedBalancing';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChangeChildOwnerDialog } from '@/components/ChangeChildOwnerDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProspectOpportunities, formatCloseDate, formatNetARR } from '@/hooks/useProspectOpportunities';
import { RenewalQuarterBadge } from '@/components/ui/RenewalQuarterBadge';
import { useInvalidateAnalytics } from '@/hooks/useInvalidateAnalytics';

interface SalesRepDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rep: RepMetrics | null;
  buildId?: string;
  availableReps?: { rep_id: string; name: string; team?: string; }[];
  onDataRefresh?: () => void;
}

export const SalesRepDetailModal = ({
  open,
  onOpenChange,
  rep,
  buildId,
  availableReps = [],
  onDataRefresh
}: SalesRepDetailModalProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'customer' | 'prospect'>('all');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState<string>('');
  const [reassignRationale, setReassignRationale] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [territoryMappings, setTerritoryMappings] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<AccountDetail[]>([]);
  const [childAccounts, setChildAccounts] = useState<Record<string, AccountDetail[]>>({});
  const [showChangeOwnerDialog, setShowChangeOwnerDialog] = useState(false);
  const [selectedChildAccount, setSelectedChildAccount] = useState<AccountDetail | null>(null);
  const [beforeMetrics, setBeforeMetrics] = useState<{
    customerAccounts: number;
    prospectAccounts: number;
    customerARR: number;
  } | null>(null);

  // Fetch prospect opportunity data (Net ARR and Close Date)
  const { getNetARR, getCloseDate, getNetARRColorClass } = useProspectOpportunities(buildId);
  const invalidateAnalytics = useInvalidateAnalytics();

interface ExtendedAccountDetail extends AccountDetail {
  employees?: number;
  // DEPRECATED: industry - removed in v1.3.9
  geo?: string;
  expansion_tier?: string;
  initial_sale_tier?: string;
  renewal_quarter?: string | null;
  cre_count?: number;
  current_owner_id?: string;
  current_owner_name?: string;
  proposed_owner_id?: string;
  proposed_owner_name?: string;
  new_owner_name?: string;
  new_owner_id?: string;
  has_split_ownership?: boolean;
  assignment_rationale?: string;
}

  // Reset state when modal closes or rep changes
  React.useEffect(() => {
    if (!open) {
      setBeforeMetrics(null);
      setAccounts([]);
      setChildAccounts({});
    }
  }, [open]);

  // Fetch accounts and their children when modal opens
  React.useEffect(() => {
    if (!rep || !buildId || !open) return;

    const fetchAccountsWithChildren = async () => {
      // Fetch accounts owned by this rep (parents OR split ownership children)
      const { data: ownedAccounts, error: fetchError } = await supabase
        .from('accounts')
        .select('*, has_split_ownership')
        .eq('build_id', buildId)
        .eq('new_owner_id', rep.rep_id)
        .or('is_parent.eq.true,has_split_ownership.eq.true');

      if (fetchError) {
        console.error('Error fetching owned accounts:', fetchError);
        return;
      }

      // Fetch assignment rationales for these accounts
      const accountIds = (ownedAccounts || []).map((a: any) => a.sfdc_account_id);
      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select('sfdc_account_id, rationale')
        .eq('build_id', buildId)
        .in('sfdc_account_id', accountIds);
      
      // Create a map of account_id -> rationale
      const rationaleMap = new Map<string, string>();
      (assignmentsData || []).forEach((a: any) => {
        rationaleMap.set(a.sfdc_account_id, a.rationale || '');
      });

      const mappedAccounts: ExtendedAccountDetail[] = (ownedAccounts || []).map((account: any) => ({
        sfdc_account_id: account.sfdc_account_id,
        account_name: account.account_name,
        arr: getAccountARR(account),
        atr: getAccountATR(account),
        employees: account.employees,
        // DEPRECATED: industry - removed in v1.3.9
        geo: account.geo,
        expansion_tier: account.expansion_tier,
        initial_sale_tier: account.initial_sale_tier,
        is_customer: account.is_customer,
        cre_count: account.cre_count || 0,
        is_parent: account.is_parent,
        ultimate_parent_id: account.ultimate_parent_id,
        ultimate_parent_name: account.ultimate_parent_name,
        current_owner_id: account.owner_id,
        current_owner_name: account.owner_name,
        proposed_owner_id: account.new_owner_id,
        proposed_owner_name: account.new_owner_name,
        owner_id: account.owner_id,
        owner_name: account.owner_name,
        new_owner_id: account.new_owner_id,
        new_owner_name: account.new_owner_name,
        renewals: 0,
        sales_territory: account.sales_territory,
        hq_country: account.hq_country,
        cre_risk_count: 0,
        has_split_ownership: account.has_split_ownership || false,
        assignment_rationale: rationaleMap.get(account.sfdc_account_id) || ''
      }));

      setAccounts(mappedAccounts as AccountDetail[]);

      // Calculate before metrics (based on owner_id) for this rep
      const { data: beforeAccounts, error: beforeError } = await supabase
        .from('accounts')
        .select('sfdc_account_id, is_customer, owner_id, hierarchy_bookings_arr_converted, calculated_arr, arr, is_parent')
        .eq('build_id', buildId)
        .eq('owner_id', rep.rep_id)
        .eq('is_parent', true);

      if (!beforeError && beforeAccounts) {
        const beforeCustomerAccounts = beforeAccounts.filter(acc => acc.is_customer);
        const beforeProspectAccounts = beforeAccounts.filter(acc => !acc.is_customer);
        const beforeCustomerARR = beforeCustomerAccounts.reduce((sum, acc) => {
          return sum + getAccountARR(acc);
        }, 0);

        setBeforeMetrics({
          customerAccounts: beforeCustomerAccounts.length,
          prospectAccounts: beforeProspectAccounts.length,
          customerARR: beforeCustomerARR
        });
      }

      // Fetch child accounts only for actual parent accounts (not for split ownership children)
      const actualParents = (ownedAccounts || []).filter((acc: any) => acc.is_parent);
      if (actualParents.length > 0) {
        const parentIds = actualParents.map((p: any) => p.sfdc_account_id);
        
        const { data: childrenData, error: childError } = await supabase
          .from('accounts')
          .select('*, has_split_ownership')
          .eq('build_id', buildId)
          .in('ultimate_parent_id', parentIds)
          .eq('is_parent', false);

        if (childError) {
          console.error('Error fetching child accounts:', childError);
          return;
        }

        // Fetch rationales for child accounts
        const childIds = (childrenData || []).map((c: any) => c.sfdc_account_id);
        let childRationaleMap = new Map<string, string>();
        if (childIds.length > 0) {
          const { data: childAssignments } = await supabase
            .from('assignments')
            .select('sfdc_account_id, rationale')
            .eq('build_id', buildId)
            .in('sfdc_account_id', childIds);
          
          (childAssignments || []).forEach((a: any) => {
            childRationaleMap.set(a.sfdc_account_id, a.rationale || '');
          });
        }

        const childrenByParent: Record<string, ExtendedAccountDetail[]> = {};
        
        (childrenData || []).forEach((child: any) => {
          const parentId = child.ultimate_parent_id;
          if (!childrenByParent[parentId]) {
            childrenByParent[parentId] = [];
          }
          
          childrenByParent[parentId].push({
            sfdc_account_id: child.sfdc_account_id,
            account_name: child.account_name,
            arr: getAccountARR(child),
            atr: getAccountATR(child),
            employees: child.employees,
            // DEPRECATED: industry - removed in v1.3.9
            geo: child.geo,
            expansion_tier: child.expansion_tier,
            initial_sale_tier: child.initial_sale_tier,
            is_customer: child.is_customer,
            cre_count: child.cre_count || 0,
            is_parent: child.is_parent,
            ultimate_parent_id: child.ultimate_parent_id,
            ultimate_parent_name: child.ultimate_parent_name,
            current_owner_id: child.owner_id,
            current_owner_name: child.owner_name,
            proposed_owner_id: child.new_owner_id,
            proposed_owner_name: child.new_owner_name,
            owner_id: child.owner_id,
            owner_name: child.owner_name,
            new_owner_id: child.new_owner_id,
            new_owner_name: child.new_owner_name,
            renewals: 0,
            sales_territory: child.sales_territory,
            hq_country: child.hq_country,
            cre_risk_count: 0,
            has_split_ownership: child.has_split_ownership || false,
            assignment_rationale: childRationaleMap.get(child.sfdc_account_id) || ''
          });
        });

        setChildAccounts(childrenByParent as Record<string, AccountDetail[]>);
      }
    };

    fetchAccountsWithChildren();
  }, [rep, buildId, open]);

  if (!rep) return null;

  // Filter and sort accounts: customers first, then prospects, then by ARR descending
  const filteredAccounts = accounts
    .filter(account => {
      const matchesSearch = account.account_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || 
        (filterType === 'customer' && account.is_customer) ||
        (filterType === 'prospect' && !account.is_customer);
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      // First sort by customer status (customers first)
      if (a.is_customer && !b.is_customer) return -1;
      if (!a.is_customer && b.is_customer) return 1;
      // Then by CRE risk (risky accounts first within each group)
      const aRisk = (a.cre_risk_count || 0) > 0;
      const bRisk = (b.cre_risk_count || 0) > 0;
      if (aRisk && !bRisk) return -1;
      if (!aRisk && bRisk) return 1;
      // Finally by ARR descending
      return b.arr - a.arr;
    });

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Balanced': return 'bg-green-100 text-green-800 border-green-200';
      case 'Overloaded': return 'bg-red-100 text-red-800 border-red-200';
      case 'Light': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Handle account selection
  const handleAccountSelect = (accountId: string, selected: boolean) => {
    const newSelected = new Set(selectedAccounts);
    if (selected) {
      newSelected.add(accountId);
    } else {
      newSelected.delete(accountId);
    }
    setSelectedAccounts(newSelected);
  };

  // Handle select all
  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedAccounts(new Set(filteredAccounts.map(acc => acc.sfdc_account_id)));
    } else {
      setSelectedAccounts(new Set());
    }
  };

  // Handle reassignment
  const handleReassign = async () => {
    if (!selectedNewOwner || selectedAccounts.size === 0 || !buildId) return;

    setIsReassigning(true);
    try {
      const selectedNewOwnerData = availableReps.find(r => r.rep_id === selectedNewOwner);
      
      // Update accounts
      const { error: accountError } = await supabase
        .from('accounts')
        .update({ 
          new_owner_id: selectedNewOwner,
          new_owner_name: selectedNewOwnerData?.name || ''
        })
        .in('sfdc_account_id', Array.from(selectedAccounts))
        .eq('build_id', buildId);

      if (accountError) throw accountError;

      // Get current user for assignment records
      const { data: userData } = await supabase.auth.getUser();
      
      // Create assignment records
      const assignmentRecords = Array.from(selectedAccounts).map(accountId => {
        const account = accounts.find(a => a.sfdc_account_id === accountId);
        return {
          build_id: buildId,
          sfdc_account_id: accountId,
          proposed_owner_id: selectedNewOwner,
          proposed_owner_name: selectedNewOwnerData?.name || '',
          assignment_type: 'MANUAL_REASSIGNMENT',
          rationale: `MANUAL_REASSIGNMENT: ${reassignRationale || 'Manual reassignment by RevOps manager'}`,
          created_by: userData.user?.id
        };
      });

      const { error: assignmentError } = await supabase
        .from('assignments')
        .upsert(assignmentRecords, {
          onConflict: 'build_id,sfdc_account_id'
        });

      if (assignmentError) throw assignmentError;

      // Invalidate analytics queries so KPIs and charts update
      if (buildId) {
        await invalidateAnalytics(buildId);
      }

      toast({
        title: "Success",
        description: `Reassigned ${selectedAccounts.size} accounts to ${selectedNewOwnerData?.name}`,
      });

      // Reset state
      setSelectedAccounts(new Set());
      setShowReassignDialog(false);
      setSelectedNewOwner('');
      setReassignRationale('');
      
      // Refresh data
      onDataRefresh?.();

    } catch (error) {
      console.error('Error reassigning accounts:', error);
      toast({
        title: "Error",
        description: "Failed to reassign accounts",
        variant: "destructive",
      });
    } finally {
      setIsReassigning(false);
    }
  };

  // Get rep region
  const getRepRegion = (account: ExtendedAccountDetail) => {
    return account.geo || 'N/A';
  };

  // Handle child owner change action
  const handleChangeChildOwner = (child: AccountDetail) => {
    setSelectedChildAccount(child);
    setShowChangeOwnerDialog(true);
  };

  // Export functionality
  const handleExport = () => {
    const csvContent = [
      ['Account Name', 'Type', 'Previous Owner', 'Location', 'Rep Region', 'ARR', 'ATR', 'Renewals', 'CRE Risk'].join(','),
      ...filteredAccounts.map(acc => [
        `"${acc.account_name}"`,
        acc.is_customer ? 'Customer' : 'Prospect',
        `"${acc.owner_name || 'N/A'}"`,
        `"${acc.hq_country || acc.sales_territory || 'N/A'}"`,
        `"${getRepRegion(acc)}"`,
        acc.arr,
        acc.atr,
        acc.renewals,
        acc.cre_risk_count || 0
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rep?.name.replace(/\s+/g, '_')}_portfolio.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Calculate fixed retention rate (customers who kept the same owner)
  const calculateRetentionRate = () => {
    const customerAccounts = accounts.filter(acc => acc.is_customer);
    if (customerAccounts.length === 0) return 0;
    
    const retainedCount = customerAccounts.filter(acc => 
      acc.owner_id && acc.owner_id === (acc.new_owner_id || acc.owner_id)
    ).length;
    
    return (retainedCount / customerAccounts.length) * 100;
  };

  // Calculate simplified regional alignment (just show if alignment exists)
  const calculateRegionalAlignment = () => {
    const totalAccounts = accounts.length;
    if (totalAccounts === 0) return 100;
    
    // For now, return a simplified metric - can be enhanced later
    return rep?.regionalAlignment || 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Sales Rep Analysis - {rep.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Rep Overview</TabsTrigger>
              <TabsTrigger value="accounts">Account Portfolio</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Representative Information</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">Metric</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Name</TableCell>
                        <TableCell>{rep.name}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Team</TableCell>
                        <TableCell>{rep.team}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Region</TableCell>
                        <TableCell>{rep.region}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Status</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(rep.status)}>
                            {rep.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Portfolio Metrics */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Portfolio Metrics</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">Metric</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Total Accounts</TableCell>
                        <TableCell>
                          {rep.totalAccounts}
                          {beforeMetrics && (
                            <span className="ml-2 text-sm text-muted-foreground">
                              ({beforeMetrics.customerAccounts + beforeMetrics.prospectAccounts} previous owner)
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Customer Accounts</TableCell>
                        <TableCell>
                          {rep.customerAccounts}
                          {beforeMetrics && (
                            <span className={`ml-2 text-sm ${rep.customerAccounts > beforeMetrics.customerAccounts ? 'text-green-600' : rep.customerAccounts < beforeMetrics.customerAccounts ? 'text-red-600' : 'text-muted-foreground'}`}>
                              ({rep.customerAccounts > beforeMetrics.customerAccounts ? '+' : ''}{rep.customerAccounts - beforeMetrics.customerAccounts} vs previous owner)
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Prospect Accounts</TableCell>
                        <TableCell>
                          {rep.prospectAccounts}
                          {beforeMetrics && (
                            <span className={`ml-2 text-sm ${rep.prospectAccounts > beforeMetrics.prospectAccounts ? 'text-green-600' : rep.prospectAccounts < beforeMetrics.prospectAccounts ? 'text-red-600' : 'text-muted-foreground'}`}>
                              ({rep.prospectAccounts > beforeMetrics.prospectAccounts ? '+' : ''}{rep.prospectAccounts - beforeMetrics.prospectAccounts} vs previous owner)
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Customer ARR</TableCell>
                        <TableCell>
                          {formatCurrency(rep.customerARR)}
                          {beforeMetrics && (
                            <span className={`ml-2 text-sm ${rep.customerARR > beforeMetrics.customerARR ? 'text-green-600' : rep.customerARR < beforeMetrics.customerARR ? 'text-red-600' : 'text-muted-foreground'}`}>
                              ({rep.customerARR > beforeMetrics.customerARR ? '+' : ''}{formatCurrency(rep.customerARR - beforeMetrics.customerARR)} vs previous owner)
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Customer ATR</TableCell>
                        <TableCell>{formatCurrency(rep.customerATR)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Total ATR</TableCell>
                        <TableCell>{formatCurrency(rep.totalATR)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Total Renewals</TableCell>
                        <TableCell>{rep.totalRenewals}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Performance Metrics */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Performance Metrics</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">Metric</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Customer Retention Rate</TableCell>
                        <TableCell>{calculateRetentionRate().toFixed(1)}%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Regional Alignment</TableCell>
                        <TableCell>{calculateRegionalAlignment().toFixed(1)}%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">CRE Risk Accounts</TableCell>
                        <TableCell className="flex items-center gap-2">
                          {accounts.filter(acc => (acc.cre_risk_count || 0) > 0).length}
                          {accounts.filter(acc => (acc.cre_risk_count || 0) > 0).length > 0 && (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="accounts" className="mt-4">
              <div className="space-y-4">
                {/* Action Bar */}
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-muted/50 p-4 rounded-lg">
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-1">
                    <div className="relative flex-1 min-w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search accounts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value as any)}
                      className="px-3 py-2 border rounded-md bg-background min-w-32"
                    >
                      <option value="all">All Accounts</option>
                      <option value="customer">Customers Only</option>
                      <option value="prospect">Prospects Only</option>
                    </select>
                  </div>
                  
                  <div className="flex gap-2">
                    {selectedAccounts.size > 0 && (
                      <Button 
                        onClick={() => setShowReassignDialog(true)}
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <UserPlus className="h-4 w-4" />
                        Reassign ({selectedAccounts.size})
                      </Button>
                    )}
                    <Button variant="outline" onClick={handleExport} size="sm" className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                  </div>
                </div>

                {/* Enhanced Accounts Table */}
                <div className="border rounded-lg overflow-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedAccounts.size === filteredAccounts.length && filteredAccounts.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">
                          <Tooltip>
                            <TooltipTrigger className="cursor-help">ARR</TooltipTrigger>
                            <TooltipContent>
                              <p><strong>Customers:</strong> ARR</p>
                              <p><strong>Prospects:</strong> Net ARR from opps</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead className="text-right">
                          <Tooltip>
                            <TooltipTrigger className="cursor-help">ATR / Close</TooltipTrigger>
                            <TooltipContent>
                              <p><strong>Customers:</strong> ATR</p>
                              <p><strong>Prospects:</strong> Earliest Close Date</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead className="text-center">CRE</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Renewal</TableHead>
                        <TableHead>Geo</TableHead>
                        <TableHead>Previous Owner</TableHead>
                        <TableHead>New Owner</TableHead>
                        <TableHead className="min-w-[180px]">Reason</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAccounts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                            No accounts found matching your criteria
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {filteredAccounts.map((account) => {
                            const extAccount = account as ExtendedAccountDetail;
                            const children = childAccounts[account.sfdc_account_id] || [];

                            return (
                              <React.Fragment key={account.sfdc_account_id}>
                                {/* Parent Account Row */}
                                <TableRow className="bg-background font-medium">
                                  <TableCell>
                                    <Checkbox
                                      checked={selectedAccounts.has(account.sfdc_account_id)}
                                      onCheckedChange={(checked) => 
                                        handleAccountSelect(account.sfdc_account_id, !!checked)
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <div>
                                        <div className="font-semibold flex items-center gap-2">
                                          {account.account_name}
                                          {account.is_parent && (
                                            <Badge variant="secondary" className="text-xs">
                                              Parent
                                            </Badge>
                                          )}
                                          {extAccount.has_split_ownership && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Badge variant="warning" className="text-xs">
                                                  <Split className="h-3 w-3 mr-1" />
                                                  Split Ownership
                                                </Badge>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>This account has children assigned to different owners</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          )}
                                          {children.length > 0 && (
                                            <Badge variant="outline" className="text-xs">
                                              {children.length} {children.length === 1 ? 'child' : 'children'}
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="text-xs text-muted-foreground font-normal">
                                          {account.sfdc_account_id}
                                        </div>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={account.is_customer ? "default" : "secondary"}>
                                      {account.is_customer ? 'Customer' : 'Prospect'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex flex-col items-end">
                                      <span className={getAccountARR(account) > 0 ? "text-green-600" : "text-muted-foreground"}>
                                        ${getAccountARR(account).toLocaleString()}
                                      </span>
                                      {!account.is_customer && getNetARR(account.sfdc_account_id) > 0 && (
                                        <span className={`text-xs ${getNetARRColorClass(getNetARR(account.sfdc_account_id))}`}>
                                          Net: {formatNetARR(getNetARR(account.sfdc_account_id))}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {account.is_customer ? (
                                      `$${(account.atr || 0).toLocaleString()}`
                                    ) : (
                                      formatCloseDate(getCloseDate(account.sfdc_account_id))
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">{extAccount.cre_count || 0}</TableCell>
                                  <TableCell>
                                    {(extAccount.expansion_tier || extAccount.initial_sale_tier) ? (
                                      <Badge variant="outline">
                                        {extAccount.expansion_tier || extAccount.initial_sale_tier}
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <RenewalQuarterBadge renewalQuarter={extAccount.renewal_quarter} />
                                  </TableCell>
                                  <TableCell>{extAccount.geo || 'N/A'}</TableCell>
                                  <TableCell className="text-sm">{account.owner_name || 'N/A'}</TableCell>
                                  <TableCell className="text-sm">
                                    {account.new_owner_name || account.owner_name || 'N/A'}
                                    {account.new_owner_name && account.owner_name && account.new_owner_name !== account.owner_name && (
                                      <Badge variant="outline" className="ml-2 text-xs">Changed</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={extAccount.assignment_rationale || ''}>
                                    {extAccount.assignment_rationale || '-'}
                                  </TableCell>
                                  <TableCell>
                                    {/* Actions handled via checkbox selection */}
                                  </TableCell>
                                </TableRow>

                                {/* Child Account Rows - Always Shown */}
                                {children.map((child) => {
                                  const extChild = child as ExtendedAccountDetail;
                                  return (
                                    <TableRow key={child.sfdc_account_id} className="bg-muted/30">
                                      <TableCell></TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2 ml-8">
                                          <span className="text-muted-foreground">└─</span>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <div className="cursor-help">
                                                <div className="font-medium text-sm flex items-center gap-2">
                                                  {child.account_name}
                                                  {(extChild as ExtendedAccountDetail).has_split_ownership && (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge variant="warning" className="text-xs">
                                                          <Split className="h-3 w-3 mr-1" />
                                                          Split
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p>This child is assigned to a different owner than its parent</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  )}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                  {child.sfdc_account_id}
                                                </div>
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <div className="space-y-1 text-xs">
                                                {extChild.employees && (
                                                  <div><strong>Employees:</strong> {extChild.employees.toLocaleString()}</div>
                                                )}
                                                {/* DEPRECATED: industry - removed in v1.3.9 */}
                                                {child.hq_country && (
                                                  <div><strong>HQ Country:</strong> {child.hq_country}</div>
                                                )}
                                                {child.sales_territory && (
                                                  <div><strong>Territory:</strong> {child.sales_territory}</div>
                                                )}
                                                <div className="pt-1 border-t border-border">
                                                  <strong>Parent:</strong> {account.account_name}
                                                </div>
                                              </div>
                                            </TooltipContent>
                                          </Tooltip>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {child.is_customer && (
                                          <Badge variant="default" className="text-xs">Customer</Badge>
                                        )}
                                        {!child.is_customer && (
                                          <Badge variant="secondary" className="text-xs">Prospect</Badge>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right text-sm">
                                        <div className="flex flex-col items-end">
                                          <span className={(child.arr || 0) > 0 ? "text-green-600" : "text-muted-foreground"}>
                                            ${(child.arr || 0).toLocaleString()}
                                          </span>
                                          {!child.is_customer && getNetARR(child.sfdc_account_id) > 0 && (
                                            <span className={`text-xs ${getNetARRColorClass(getNetARR(child.sfdc_account_id))}`}>
                                              Net: {formatNetARR(getNetARR(child.sfdc_account_id))}
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right text-sm">
                                        {child.is_customer ? (
                                          `$${(child.atr || 0).toLocaleString()}`
                                        ) : (
                                          formatCloseDate(getCloseDate(child.sfdc_account_id))
                                        )}
                                      </TableCell>
                                      <TableCell className="text-center text-sm">{extChild.cre_count || 0}</TableCell>
                                      <TableCell>
                                        {(extChild.expansion_tier || extChild.initial_sale_tier) ? (
                                          <Badge variant="outline" className="text-xs">
                                            {extChild.expansion_tier || extChild.initial_sale_tier}
                                          </Badge>
                                        ) : (
                                          <span className="text-muted-foreground">-</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <RenewalQuarterBadge renewalQuarter={extChild.renewal_quarter} />
                                      </TableCell>
                                      <TableCell className="text-sm">{extChild.geo || 'N/A'}</TableCell>
                                      <TableCell className="text-sm">{child.owner_name || 'N/A'}</TableCell>
                                      <TableCell className="text-sm">
                                        {child.new_owner_name || child.owner_name || 'N/A'}
                                        {child.new_owner_name && child.owner_name && child.new_owner_name !== child.owner_name && (
                                          <Badge variant="outline" className="ml-2 text-xs">Changed</Badge>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={extChild.assignment_rationale || ''}>
                                        {extChild.assignment_rationale || '-'}
                                      </TableCell>
                                      <TableCell>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm">
                                              <MoreVertical className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                           <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => handleChangeChildOwner(child)}>
                                              <UserPlus className="h-4 w-4 mr-2" />
                                              Change Owner
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Enhanced Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm bg-muted/50 p-4 rounded-lg">
                  <div className="text-center">
                    <div className="font-semibold text-lg">{filteredAccounts.length}</div>
                    <div className="text-muted-foreground">Total Accounts</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-green-600">
                      {filteredAccounts.filter(acc => acc.is_customer).length}
                    </div>
                    <div className="text-muted-foreground">Customers</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-blue-600">
                      {filteredAccounts.filter(acc => !acc.is_customer).length}
                    </div>
                    <div className="text-muted-foreground">Prospects</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-red-600">
                      {filteredAccounts.filter(acc => (acc.cre_risk_count || 0) > 0).length}
                    </div>
                    <div className="text-muted-foreground">At Risk</div>
                  </div>
                  <div className="col-span-2 sm:col-span-4 pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Portfolio ARR:</span>
                      <span className="font-semibold text-lg">
                        {formatCurrency(filteredAccounts.reduce((sum, acc) => sum + acc.arr, 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export Portfolio
            </Button>
            {selectedAccounts.size > 0 && (
              <Button onClick={() => setShowReassignDialog(true)} className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Reassign Selected ({selectedAccounts.size})
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>

        {/* Reassignment Dialog */}
        <AlertDialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reassign Accounts</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to reassign {selectedAccounts.size} accounts from {rep?.name}. 
                This action will update the account ownership and create assignment records.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">New Owner</label>
                <Select value={selectedNewOwner} onValueChange={setSelectedNewOwner}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select new owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReps
                      .filter(r => r.rep_id !== rep?.rep_id)
                      .map(r => (
                        <SelectItem key={r.rep_id} value={r.rep_id}>
                          {r.name} {r.team && `(${r.team})`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium">Rationale (Optional)</label>
                <Input
                  placeholder="Reason for reassignment..."
                  value={reassignRationale}
                  onChange={(e) => setReassignRationale(e.target.value)}
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isReassigning}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleReassign}
                disabled={!selectedNewOwner || isReassigning}
              >
                {isReassigning ? 'Reassigning...' : 'Reassign Accounts'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Change Child Owner Dialog */}
        <ChangeChildOwnerDialog
          open={showChangeOwnerDialog}
          onOpenChange={setShowChangeOwnerDialog}
          childAccount={selectedChildAccount}
          buildId={buildId || ''}
          availableReps={availableReps}
          onSuccess={() => {
            setShowChangeOwnerDialog(false);
            setSelectedChildAccount(null);
            onDataRefresh?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};