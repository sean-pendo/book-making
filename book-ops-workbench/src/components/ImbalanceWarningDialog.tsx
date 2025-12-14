import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Settings, RefreshCw, CheckCircle } from 'lucide-react';

interface ImbalanceWarningDialogProps {
  open: boolean;
  repName: string;
  repARR: number;
  targetARR: number;
  overloadPercent: number;
  onConfirm: () => void;
  onDismiss: () => void;
}

export const ImbalanceWarningDialog: React.FC<ImbalanceWarningDialogProps> = ({
  open,
  repName,
  repARR,
  targetARR,
  overloadPercent,
  onConfirm,
  onDismiss,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      notation: 'compact',
      compactDisplay: 'short',
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Imbalanced Assignment Detected
          </DialogTitle>
          <DialogDescription>
            One or more reps are significantly overloaded compared to the target.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats Card */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Most Overloaded Rep</span>
              <span className="font-semibold">{repName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Assigned ARR</span>
              <span className="font-semibold text-amber-600">{formatCurrency(repARR)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Target ARR</span>
              <span className="font-medium">{formatCurrency(targetARR)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-amber-200 dark:border-amber-700 pt-2">
              <span className="text-sm font-medium">Overload</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">+{overloadPercent}%</span>
            </div>
          </div>

          {/* Suggestions */}
          <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <Settings className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-900 dark:text-blue-100">How to improve balance</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              <ul className="list-disc list-inside space-y-1 mt-2 text-sm">
                <li>Lower the <strong>Max ARR per rep</strong> in Assignment Targets</li>
                <li>Increase the <strong>variance tolerance</strong> to allow more flexibility</li>
                <li>Check if specific accounts need to be <strong>locked</strong> to certain reps</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onDismiss} className="w-full sm:w-auto">
            <RefreshCw className="h-4 w-4 mr-2" />
            Go Back & Adjust
          </Button>
          <Button 
            onClick={onConfirm} 
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Apply Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};






