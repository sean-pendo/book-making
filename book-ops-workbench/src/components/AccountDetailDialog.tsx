import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, getAccountARR, getAccountATR, getCRERiskLevel } from "@/_domain";
import { AlertTriangle, Shield, Users, Edit } from "lucide-react";
import { HierarchyAwareReassignDialog } from "@/components/HierarchyAwareReassignDialog";

interface AccountDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: any;
  currentOwner?: any;
  newOwner?: any;
  availableReps?: any[];
  buildId: string;
}

export function AccountDetailDialog({
  open,
  onOpenChange,
  account,
  currentOwner,
  newOwner,
  availableReps = [],
  buildId
}: AccountDetailDialogProps) {
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const queryClient = useQueryClient();

  const handleReassignSuccess = () => {
    // Refresh data - table queries
    queryClient.invalidateQueries({ queryKey: ['customer-accounts', buildId] });
    queryClient.invalidateQueries({ queryKey: ['customer-assignment-changes', buildId] });
    onOpenChange(false);
  };

  const getRiskBadges = () => {
    const badges = [];
    const creCount = account?.cre_count || 0;
    const riskLevel = getCRERiskLevel(creCount);
    
    if (account?.cre_risk) {
      badges.push(
        <Tooltip key="cre-risk">
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="cursor-help">CRE Risk</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Customer Renewal at Risk flag is set on this account.</p>
          </TooltipContent>
        </Tooltip>
      );
    }
    if (account?.risk_flag) {
      badges.push(
        <Tooltip key="risk-flag">
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="cursor-help">Risk Flag</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">This account has been flagged as at-risk.</p>
          </TooltipContent>
        </Tooltip>
      );
    }
    if (creCount > 0) {
      const getRiskDescription = () => {
        switch (riskLevel) {
          case 'low': return `${creCount} renewal risk event${creCount > 1 ? 's' : ''}. Low churn probability.`;
          case 'medium': return `${creCount} renewal risk events. Moderate churn probability.`;
          case 'high': return `${creCount} renewal risk events. High churn probability.`;
          default: return '';
        }
      };
      badges.push(
        <Tooltip key="cre-count">
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="cursor-help">CRE Count: {creCount}</Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-[250px]">
            <p className="font-semibold mb-1">Customer Renewal at Risk</p>
            <p className="text-xs text-muted-foreground">{getRiskDescription()}</p>
          </TooltipContent>
        </Tooltip>
      );
    }
    return badges;
  };

  if (!account) return null;

  const riskBadges = getRiskBadges();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Account Details: {account.account_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Account Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Account Information
                {riskBadges.length > 0 && (
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <div className="flex gap-1 flex-wrap">
                      {riskBadges}
                    </div>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-medium">Account ID:</span> {account.sfdc_account_id}</div>
                <div><span className="font-medium">Tier:</span> {account.expansion_tier || 'Unassigned'}</div>
                <div><span className="font-medium">ARR:</span> {formatCurrency(getAccountARR(account))}</div>
                <div><span className="font-medium">ATR:</span> {formatCurrency(getAccountATR(account))}</div>
                <div><span className="font-medium">Territory:</span> {account.sales_territory || 'N/A'}</div>
                <div><span className="font-medium">Region:</span> {account.geo || 'N/A'}</div>
              </div>
            </CardContent>
          </Card>

          {/* Current vs New Owner Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current Owner */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Current Owner
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">Name:</span> {account.owner_name || 'Unassigned'}</div>
                  <div><span className="font-medium">ID:</span> {account.owner_id || 'N/A'}</div>
                  {currentOwner && (
                    <>
                      <div><span className="font-medium">Team:</span> {currentOwner.team || 'N/A'}</div>
                      <div><span className="font-medium">Region:</span> {currentOwner.region || 'N/A'}</div>
                      <div><span className="font-medium">Manager:</span> {currentOwner.manager || 'N/A'}</div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* New/Proposed Owner */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {account.new_owner_id ? 'Proposed Owner' : 'Assign New Owner'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {account.new_owner_id ? (
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Name:</span> {account.new_owner_name}</div>
                    <div><span className="font-medium">ID:</span> {account.new_owner_id}</div>
                    {newOwner && (
                      <>
                        <div><span className="font-medium">Team:</span> {newOwner.team || 'N/A'}</div>
                        <div><span className="font-medium">Region:</span> {newOwner.region || 'N/A'}</div>
                        <div><span className="font-medium">Manager:</span> {newOwner.manager || 'N/A'}</div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No new owner assigned
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Reassignment Section */}
          <Card>
            <CardHeader>
              <CardTitle>Reassign Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Use the hierarchy-aware reassignment dialog to change this account's owner.
                </p>
                <Button onClick={() => setShowReassignDialog(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Reassign Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>

      {/* Hierarchy-Aware Reassignment Dialog */}
      <HierarchyAwareReassignDialog
        open={showReassignDialog}
        onOpenChange={setShowReassignDialog}
        account={account}
        buildId={buildId}
        availableReps={availableReps}
        onSuccess={handleReassignSuccess}
      />
    </Dialog>
  );
}