import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';

const MAX_REASON_LENGTH = 500;

interface LockAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  onConfirm: (reason: string | null) => void;
  isLoading?: boolean;
}

/**
 * Dialog for locking an account with an optional reason
 * 
 * Shows when user clicks to lock an account. The reason is optional
 * but provides context for why the account was locked.
 * 
 * @see MASTER_LOGIC.mdc §10.5.1 (Manual Holdover)
 */
export function LockAccountDialog({
  open,
  onOpenChange,
  accountName,
  onConfirm,
  isLoading = false,
}: LockAccountDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    // Pass null if empty, otherwise pass the trimmed reason
    const trimmedReason = reason.trim();
    onConfirm(trimmedReason || null);
    setReason(''); // Reset for next use
  };

  const handleCancel = () => {
    setReason(''); // Reset on cancel
    onOpenChange(false);
  };

  const remainingChars = MAX_REASON_LENGTH - reason.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-yellow-600" />
            Lock Account
          </DialogTitle>
          <DialogDescription>
            Lock <span className="font-medium">{accountName}</span> to keep it with the current owner.
            This account will not be reassigned.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="lock-reason">
              Reason <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="lock-reason"
              placeholder="e.g., Strategic relationship - do not move, Key account during renewal period..."
              value={reason}
              onChange={(e) => {
                // Enforce max length
                if (e.target.value.length <= MAX_REASON_LENGTH) {
                  setReason(e.target.value);
                }
              }}
              className="min-h-[100px] resize-none"
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>This reason will be visible on hover over the lock icon</span>
              <span className={remainingChars < 50 ? 'text-orange-500' : ''}>
                {remainingChars} characters remaining
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Locking...' : 'Lock Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

