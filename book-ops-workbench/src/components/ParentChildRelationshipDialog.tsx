import React, { useState } from 'react';
import { getAccountARR } from '@/_domain';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Link, Unlink, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { AccountDetail } from '@/hooks/useEnhancedBalancing';
import { useProspectOpportunities, formatNetARR } from '@/hooks/useProspectOpportunities';
import { formatCurrency } from '@/_domain';

interface ParentChildRelationshipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childAccount: AccountDetail | null;
  buildId: string;
  action: 'break-apart' | 'change-parent' | null;
  onSuccess?: () => void;
}

export const ParentChildRelationshipDialog = ({
  open,
  onOpenChange,
  childAccount,
  buildId,
  action,
  onSuccess
}: ParentChildRelationshipDialogProps) => {
  // Fetch prospect opportunity data (Net ARR and Close Date)
  const { getNetARR, getNetARRColorClass } = useProspectOpportunities(buildId);

  const [rationale, setRationale] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [newParentName, setNewParentName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [parentAccounts, setParentAccounts] = useState<AccountDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  React.useEffect(() => {
    if (open && action === 'change-parent') {
      fetchParentAccounts();
    }
  }, [open, action, buildId]);

  const fetchParentAccounts = async () => {
    setIsSearching(true);
    try {
      // Fetch all parent accounts (where ultimate_parent_id is NULL or empty)
      const { data, error } = await supabase
        .from('accounts')
        .select('sfdc_account_id, account_name, owner_name, sales_territory, calculated_arr, arr, atr, is_parent, is_customer, renewal_date, ultimate_parent_id, ultimate_parent_name')
        .eq('build_id', buildId)
        .or('ultimate_parent_id.is.null,ultimate_parent_id.eq.')
        .order('account_name');

      if (error) throw error;
      
      // Map to AccountDetail format with renewals set to 0 as a default
      const mappedData: AccountDetail[] = (data || []).map(acc => ({
        sfdc_account_id: acc.sfdc_account_id,
        account_name: acc.account_name,
        owner_name: acc.owner_name,
        sales_territory: acc.sales_territory,
        calculated_arr: acc.calculated_arr,
        arr: acc.arr || 0,
        atr: acc.atr || 0,
        renewals: 0, // Default value
        is_parent: acc.is_parent,
        is_customer: acc.is_customer || false,
        renewal_date: acc.renewal_date,
        ultimate_parent_id: acc.ultimate_parent_id,
        ultimate_parent_name: acc.ultimate_parent_name
      }));
      
      setParentAccounts(mappedData);
    } catch (error) {
      console.error('Error fetching parent accounts:', error);
      toast({
        title: "Error",
        description: "Failed to load parent accounts",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleBreakApart = async () => {
    if (!childAccount) return;

    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      // Update the child account to remove parent relationship
      const { error: updateError } = await supabase
        .from('accounts')
        .update({
          ultimate_parent_id: null,
          ultimate_parent_name: null,
          is_parent: true // Child becomes a parent when broken apart
        })
        .eq('sfdc_account_id', childAccount.sfdc_account_id)
        .eq('build_id', buildId);

      if (updateError) throw updateError;

      // Log the change in audit_log
      const { error: auditError } = await supabase
        .from('audit_log')
        .insert({
          build_id: buildId,
          table_name: 'accounts',
          record_id: childAccount.sfdc_account_id,
          action: 'break_parent_child_relationship',
          old_values: {
            ultimate_parent_id: childAccount.ultimate_parent_id,
            ultimate_parent_name: childAccount.ultimate_parent_name
          },
          new_values: {
            ultimate_parent_id: null,
            ultimate_parent_name: null
          },
          rationale: rationale || 'Child account broken apart from parent',
          created_by: userData.user?.id
        });

      if (auditError) console.error('Audit log error:', auditError);

      // Trigger recalculation of account values
      await supabase.rpc('recalculate_account_values_db', { p_build_id: buildId });

      toast({
        title: "Success",
        description: `${childAccount.account_name} has been made independent`,
      });

      setRationale('');
      setShowConfirmation(false);
      onOpenChange(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error breaking apart account:', error);
      toast({
        title: "Error",
        description: "Failed to break apart account",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeParent = async () => {
    if (!childAccount || !newParentId) return;

    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      // Validate: ensure new parent is not the same as child
      if (newParentId === childAccount.sfdc_account_id) {
        toast({
          title: "Invalid Operation",
          description: "An account cannot be its own parent",
          variant: "destructive",
        });
        return;
      }

      // Validate: ensure new parent is actually a parent account
      const selectedParent = parentAccounts.find(p => p.sfdc_account_id === newParentId);
      if (!selectedParent) {
        toast({
          title: "Invalid Selection",
          description: "Selected account is not a valid parent",
          variant: "destructive",
        });
        return;
      }

      // Update the child account to point to new parent
      const { error: updateError } = await supabase
        .from('accounts')
        .update({
          ultimate_parent_id: newParentId,
          ultimate_parent_name: newParentName || selectedParent.account_name,
          is_parent: false // Child remains a child
        })
        .eq('sfdc_account_id', childAccount.sfdc_account_id)
        .eq('build_id', buildId);

      if (updateError) throw updateError;

      // Log the change in audit_log
      const { error: auditError } = await supabase
        .from('audit_log')
        .insert({
          build_id: buildId,
          table_name: 'accounts',
          record_id: childAccount.sfdc_account_id,
          action: 'change_parent',
          old_values: {
            ultimate_parent_id: childAccount.ultimate_parent_id,
            ultimate_parent_name: childAccount.ultimate_parent_name
          },
          new_values: {
            ultimate_parent_id: newParentId,
            ultimate_parent_name: newParentName || selectedParent.account_name
          },
          rationale: rationale || 'Parent account changed',
          created_by: userData.user?.id
        });

      if (auditError) console.error('Audit log error:', auditError);

      // Trigger recalculation of account values for both old and new parents
      await supabase.rpc('recalculate_account_values_db', { p_build_id: buildId });

      toast({
        title: "Success",
        description: `${childAccount.account_name} moved to new parent ${selectedParent.account_name}`,
      });

      setRationale('');
      setNewParentId('');
      setNewParentName('');
      setShowConfirmation(false);
      onOpenChange(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error changing parent:', error);
      toast({
        title: "Error",
        description: "Failed to change parent account",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredParentAccounts = parentAccounts.filter(acc =>
    acc.account_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    acc.sfdc_account_id !== childAccount?.sfdc_account_id // Exclude self
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (!childAccount || !action) return null;

  return (
    <>
      <Dialog open={open && !showConfirmation} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {action === 'break-apart' ? (
                <>
                  <Unlink className="h-5 w-5" />
                  Break Apart from Parent
                </>
              ) : (
                <>
                  <Link className="h-5 w-5" />
                  Change Parent Account
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {action === 'break-apart' 
                ? 'This will make the child account independent with no parent relationship.'
                : 'Select a new parent account for this child account.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Current Account Info */}
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Child Account</p>
                  <p className="text-lg font-semibold">{childAccount.account_name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {childAccount.is_customer ? (
                      <>ARR: {formatCurrency(getAccountARR(childAccount))}</>
                    ) : (
                      <>Net ARR: <span className={getNetARRColorClass(getNetARR(childAccount.sfdc_account_id))}>{formatNetARR(getNetARR(childAccount.sfdc_account_id))}</span></>
                    )}
                  </p>
                </div>
                <Badge variant={childAccount.is_customer ? "default" : "outline"}>
                  {childAccount.is_customer ? 'Customer' : 'Prospect'}
                </Badge>
              </div>
              
              {childAccount.ultimate_parent_name && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-sm text-muted-foreground">Current Parent</p>
                  <p className="font-medium">{childAccount.ultimate_parent_name}</p>
                </div>
              )}
            </div>

            {/* Change Parent Selection */}
            {action === 'change-parent' && (
              <div className="space-y-3">
                <Label>Select New Parent Account</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search parent accounts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  {isSearching ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Loading parent accounts...
                    </div>
                  ) : filteredParentAccounts.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No parent accounts found
                    </div>
                  ) : (
                    filteredParentAccounts.map(parent => (
                      <button
                        key={parent.sfdc_account_id}
                        onClick={() => {
                          setNewParentId(parent.sfdc_account_id);
                          setNewParentName(parent.account_name);
                        }}
                        className={`w-full p-3 text-left hover:bg-muted/50 border-b last:border-b-0 transition-colors ${
                          newParentId === parent.sfdc_account_id ? 'bg-primary/10' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{parent.account_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {parent.owner_name || 'No owner'} • {parent.sales_territory || 'No territory'}
                            </p>
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-medium">{formatCurrency(getAccountARR(parent))}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Rationale */}
            <div className="space-y-2">
              <Label htmlFor="rationale">Rationale (Optional)</Label>
              <Textarea
                id="rationale"
                placeholder="Explain why you're making this change..."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={3}
              />
            </div>

            {/* Warning for Break Apart */}
            {action === 'break-apart' && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800">Important:</p>
                    <p className="text-yellow-700 mt-1">
                      Breaking apart will make this account independent. The parent account's metrics will be recalculated.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Warning for Change Parent */}
            {action === 'change-parent' && newParentId && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex gap-2">
                  <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800">Note:</p>
                    <p className="text-blue-700 mt-1">
                      Both old and new parent accounts will have their metrics recalculated.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button 
              onClick={() => setShowConfirmation(true)}
              disabled={isLoading || (action === 'change-parent' && !newParentId)}
            >
              {action === 'break-apart' ? 'Break Apart' : 'Change Parent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm {action === 'break-apart' ? 'Break Apart' : 'Parent Change'}</AlertDialogTitle>
            <AlertDialogDescription>
              {action === 'break-apart' ? (
                <>
                  Are you sure you want to break apart <strong>{childAccount.account_name}</strong> from its parent? 
                  This action will make it an independent parent account.
                </>
              ) : (
                <>
                  Are you sure you want to move <strong>{childAccount.account_name}</strong> to the new parent{' '}
                  <strong>{newParentName}</strong>?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={action === 'break-apart' ? handleBreakApart : handleChangeParent}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
