import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, UserPlus, AlertCircle, Wand2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { generateSimplifiedAssignments } from '@/services/simplifiedAssignmentEngine';
import { useProspectOpportunities, formatCloseDate, formatNetARR } from '@/hooks/useProspectOpportunities';
import { formatCurrency } from '@/utils/accountCalculations';
import { RenewalQuarterBadge } from '@/components/ui/RenewalQuarterBadge';

interface UnassignedAccount {
  sfdc_account_id: string;
  account_name: string;
  is_customer: boolean;
  calculated_arr: number;
  sales_territory?: string;
  hq_country?: string;
  owner_name?: string;
  renewal_quarter?: string | null;
}

interface UnassignedAccountsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildId: string;
  availableReps: { rep_id: string; name: string; team?: string; region?: string }[];
  onDataRefresh?: () => void;
}

export const UnassignedAccountsModal = ({
  open,
  onOpenChange,
  buildId,
  availableReps,
  onDataRefresh
}: UnassignedAccountsModalProps) => {
  // Fetch prospect opportunity data (Net ARR and Close Date)
  const { getNetARR, getCloseDate, getNetARRColorClass } = useProspectOpportunities(buildId);
  const [accounts, setAccounts] = useState<UnassignedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'customer' | 'prospect'>('all');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [selectedOwner, setSelectedOwner] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      fetchUnassignedAccounts();
    }
  }, [open, buildId]);

  const fetchUnassignedAccounts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('sfdc_account_id, account_name, is_customer, calculated_arr, sales_territory, hq_country, owner_name')
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .is('new_owner_id', null)
        .order('calculated_arr', { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching unassigned accounts:', error);
      toast({
        title: "Error",
        description: "Failed to fetch unassigned accounts",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = account.account_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || 
      (filterType === 'customer' && account.is_customer) ||
      (filterType === 'prospect' && !account.is_customer);
    return matchesSearch && matchesType;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedAccounts(new Set(filteredAccounts.map(acc => acc.sfdc_account_id)));
    } else {
      setSelectedAccounts(new Set());
    }
  };

  const handleAccountSelect = (accountId: string, checked: boolean) => {
    const newSelected = new Set(selectedAccounts);
    if (checked) {
      newSelected.add(accountId);
    } else {
      newSelected.delete(accountId);
    }
    setSelectedAccounts(newSelected);
  };

  const handleAutoAssign = async () => {
    setIsGenerating(true);
    try {
      console.log('[UnassignedAccountsModal] Starting auto-assignment for build:', buildId);
      
      toast({
        title: "Generating Assignments",
        description: "This may take a moment...",
      });

      // Fetch all accounts and reps for this build
      const { data: allAccounts, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_parent', true);

      if (accountsError) throw accountsError;

      const { data: allReps, error: repsError } = await supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId);

      if (repsError) throw repsError;

      // Fetch assignment configuration
      const { data: config, error: configError } = await supabase
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .maybeSingle();

      if (configError) throw configError;
      if (!config) {
        toast({
          title: "Configuration Missing",
          description: "Please configure assignment targets first",
          variant: "destructive",
        });
        return;
      }

      console.log('[UnassignedAccountsModal] Running assignment engine with:', {
        accounts: allAccounts.length,
        reps: allReps.length,
        unassigned: accounts.length
      });

      // Run assignment engine for both customers and prospects
      const customerAccounts = allAccounts.filter(a => a.is_customer);
      const prospectAccounts = allAccounts.filter(a => !a.is_customer);
      
      let totalProposals = 0;

      if (customerAccounts.length > 0) {
        const customerResult = await generateSimplifiedAssignments(
          buildId,
          'customer',
          customerAccounts,
          allReps,
          {
            ...config,
            territory_mappings: config.territory_mappings as Record<string, string> | null
          }
        );
        totalProposals += customerResult.proposals.length;
      }

      if (prospectAccounts.length > 0) {
        const prospectResult = await generateSimplifiedAssignments(
          buildId,
          'prospect',
          prospectAccounts,
          allReps,
          {
            ...config,
            territory_mappings: config.territory_mappings as Record<string, string> | null
          }
        );
        totalProposals += prospectResult.proposals.length;
      }

      toast({
        title: "Success",
        description: `Generated ${totalProposals} assignments`,
      });

      await fetchUnassignedAccounts();
      onDataRefresh?.();
      
    } catch (error) {
      console.error('Error generating assignments:', error);
      toast({
        title: "Error",
        description: `Failed to generate assignments: ${(error as Error).message}`,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!selectedOwner || selectedAccounts.size === 0) return;

    setIsAssigning(true);
    try {
      const selectedOwnerData = availableReps.find(r => r.rep_id === selectedOwner);
      
      const { error: accountError } = await supabase
        .from('accounts')
        .update({ 
          new_owner_id: selectedOwner,
          new_owner_name: selectedOwnerData?.name || ''
        })
        .in('sfdc_account_id', Array.from(selectedAccounts))
        .eq('build_id', buildId);

      if (accountError) throw accountError;

      const { data: userData } = await supabase.auth.getUser();
      
      const assignmentRecords = Array.from(selectedAccounts).map(accountId => {
        const account = accounts.find(a => a.sfdc_account_id === accountId);
        return {
          build_id: buildId,
          sfdc_account_id: accountId,
          proposed_owner_id: selectedOwner,
          proposed_owner_name: selectedOwnerData?.name || '',
          assignment_type: 'MANUAL_REASSIGNMENT',
          rationale: 'Bulk assignment from unassigned accounts',
          created_by: userData.user?.id
        };
      });

      const { error: assignmentError } = await supabase
        .from('assignments')
        .upsert(assignmentRecords, {
          onConflict: 'build_id,sfdc_account_id'
        });

      if (assignmentError) throw assignmentError;

      toast({
        title: "Success",
        description: `Assigned ${selectedAccounts.size} accounts to ${selectedOwnerData?.name}`,
      });

      setSelectedAccounts(new Set());
      setSelectedOwner('');
      await fetchUnassignedAccounts();
      onDataRefresh?.();

    } catch (error) {
      console.error('Error assigning accounts:', error);
      toast({
        title: "Error",
        description: "Failed to assign accounts",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const customerCount = accounts.filter(a => a.is_customer).length;
  const prospectCount = accounts.filter(a => !a.is_customer).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Unassigned Accounts ({accounts.length})
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {customerCount} customers • {prospectCount} prospects
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Auto-Assign Button */}
          <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
            <div className="flex items-start gap-3">
              <Wand2 className="h-5 w-5 mt-0.5 text-primary" />
              <div className="flex-1">
                <h4 className="font-semibold text-sm">Automatic Assignment</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Apply your assignment rules and rep capacity thresholds to automatically assign all unassigned accounts
                </p>
              </div>
            </div>
            <Button
              onClick={handleAutoAssign}
              disabled={isGenerating || accounts.length === 0}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Assignments...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate Assignments for All Unassigned
                </>
              )}
            </Button>
          </div>
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
          </div>

          {/* Bulk Assignment Section */}
          {selectedAccounts.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {selectedAccounts.size} account{selectedAccounts.size !== 1 ? 's' : ''} selected
                </p>
              </div>
              <div className="flex gap-2">
                <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select new owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReps.map(rep => (
                      <SelectItem key={rep.rep_id} value={rep.rep_id}>
                        {rep.name} {rep.region && `(${rep.region})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleBulkAssign}
                  disabled={!selectedOwner || isAssigning}
                  className="flex items-center gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  {isAssigning ? 'Assigning...' : 'Assign'}
                </Button>
              </div>
            </div>
          )}

          {/* Accounts Table */}
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
                  <TableHead>Renewal</TableHead>
                  <TableHead className="text-right">ARR</TableHead>
                  <TableHead>Territory</TableHead>
                  <TableHead>Previous Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading accounts...
                    </TableCell>
                  </TableRow>
                ) : filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No unassigned accounts found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map(account => (
                    <TableRow key={account.sfdc_account_id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedAccounts.has(account.sfdc_account_id)}
                          onCheckedChange={(checked) => 
                            handleAccountSelect(account.sfdc_account_id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{account.account_name}</TableCell>
                      <TableCell>
                        <Badge variant={account.is_customer ? 'default' : 'secondary'}>
                          {account.is_customer ? 'Customer' : 'Prospect'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <RenewalQuarterBadge renewalQuarter={account.renewal_quarter} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={(account.calculated_arr || 0) > 0 ? "text-green-600" : "text-muted-foreground"}>
                            {formatCurrency(account.calculated_arr || 0)}
                          </span>
                          {!account.is_customer && getNetARR(account.sfdc_account_id) > 0 && (
                            <span className={`text-xs ${getNetARRColorClass(getNetARR(account.sfdc_account_id))}`}>
                              Net: {formatNetARR(getNetARR(account.sfdc_account_id))}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{account.sales_territory || 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {account.owner_name || 'None'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
