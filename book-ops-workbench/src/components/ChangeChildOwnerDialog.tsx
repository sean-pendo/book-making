import React, { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, UserCheck, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { AccountDetail } from '@/hooks/useEnhancedBalancing';

interface ChangeChildOwnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childAccount: AccountDetail | null;
  buildId: string;
  availableReps?: { rep_id: string; name: string; team?: string; region?: string; }[];
  onSuccess?: () => void;
}

export const ChangeChildOwnerDialog = ({
  open,
  onOpenChange,
  childAccount,
  buildId,
  availableReps = [],
  onSuccess
}: ChangeChildOwnerDialogProps) => {
  const [rationale, setRationale] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleChangeOwner = async () => {
    if (!childAccount || !newOwnerId) return;

    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      // Find selected rep details
      const selectedRep = availableReps.find(r => r.rep_id === newOwnerId);
      if (!selectedRep) {
        toast({
          title: "Invalid Selection",
          description: "Selected owner is not valid",
          variant: "destructive",
        });
        return;
      }

      // Store previous owner for tracking
      const previousOwnerId = (childAccount as any).new_owner_id || childAccount.owner_id;

      // Update the child account's owner WITHOUT changing parent relationship
      const { error: updateError } = await supabase
        .from('accounts')
        .update({
          new_owner_id: newOwnerId,
          new_owner_name: selectedRep.name,
          previous_owner_id: previousOwnerId // Track previous owner for split ownership detection
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
          action: 'change_child_owner',
          old_values: {
            owner_id: childAccount.owner_id,
            owner_name: childAccount.owner_name,
            new_owner_id: (childAccount as any).new_owner_id,
            new_owner_name: (childAccount as any).new_owner_name
          },
          new_values: {
            new_owner_id: newOwnerId,
            new_owner_name: selectedRep.name
          },
          rationale: rationale || `Child account owner changed to ${selectedRep.name}`,
          created_by: userData.user?.id
        });

      if (auditError) console.error('Audit log error:', auditError);

      // Mark split ownership for this build
      await supabase.rpc('mark_split_ownership', { p_build_id: buildId });

      // Trigger recalculation of account values (respects split ownership)
      await supabase.rpc('update_account_calculated_values', { p_build_id: buildId });

      toast({
        title: "Success",
        description: `${childAccount.account_name} reassigned to ${selectedRep.name}. Parent's ARR will be adjusted if applicable.`,
      });

      setRationale('');
      setNewOwnerId('');
      setShowConfirmation(false);
      onOpenChange(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error changing child owner:', error);
      toast({
        title: "Error",
        description: "Failed to change account owner",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredReps = availableReps.filter(rep =>
    rep.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    rep.rep_id !== ((childAccount as any)?.new_owner_id || childAccount?.owner_id) // Exclude current owner
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (!childAccount) return null;

  return (
    <>
      <Dialog open={open && !showConfirmation} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Change Child Account Owner
            </DialogTitle>
            <DialogDescription>
              Assign a new owner to this child account. The parent relationship will remain intact.
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
                    ARR: {formatCurrency(childAccount.arr || 0)}
                  </p>
                </div>
                <Badge variant={childAccount.is_customer ? "default" : "outline"}>
                  {childAccount.is_customer ? 'Customer' : 'Prospect'}
                </Badge>
              </div>
              
              <div className="mt-3 pt-3 border-t space-y-2">
                {childAccount.ultimate_parent_name && (
                  <div>
                    <p className="text-sm text-muted-foreground">Parent Account</p>
                    <p className="font-medium">{childAccount.ultimate_parent_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Current Owner</p>
                  <p className="font-medium">{childAccount.owner_name || 'Unassigned'}</p>
                </div>
              </div>
            </div>

            {/* Owner Selection */}
            <div className="space-y-3">
              <Label>Select New Owner</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sales reps..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {filteredReps.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No sales reps found
                  </div>
                ) : (
                  filteredReps.map(rep => (
                    <button
                      key={rep.rep_id}
                      onClick={() => setNewOwnerId(rep.rep_id)}
                      className={`w-full p-3 text-left hover:bg-muted/50 border-b last:border-b-0 transition-colors ${
                        newOwnerId === rep.rep_id ? 'bg-primary/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{rep.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {rep.team || 'No team'} • {rep.region || 'No region'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Rationale */}
            <div className="space-y-2">
              <Label htmlFor="rationale">Rationale (Optional)</Label>
              <Textarea
                id="rationale"
                placeholder="Explain why you're changing the owner..."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={3}
              />
            </div>

            {/* Warning */}
            {newOwnerId && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex gap-2">
                  <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800">Split Ownership Note:</p>
                    <p className="text-blue-700 mt-1">
                      This child account will be marked with "Split Ownership" since its owner differs from the parent. 
                      If this child has ARR, it will be removed from the parent's ARR total.
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
              disabled={isLoading || !newOwnerId}
            >
              Change Owner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Owner Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reassign <strong>{childAccount.account_name}</strong> to{' '}
              <strong>{availableReps.find(r => r.rep_id === newOwnerId)?.name}</strong>?
              <br /><br />
              The parent relationship will remain, but both accounts will be marked with "Split Ownership" status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleChangeOwner}
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
