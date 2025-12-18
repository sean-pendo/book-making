import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, getAccountARR, getAccountATR } from "@/_domain";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Shield, Users } from "lucide-react";
import { useInvalidateAnalytics } from "@/hooks/useInvalidateAnalytics";

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
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState(account?.new_owner_id || account?.owner_id);
  const queryClient = useQueryClient();
  const invalidateAnalytics = useInvalidateAnalytics();

  const handleReassignment = async () => {
    if (!selectedOwnerId || selectedOwnerId === account?.owner_id) {
      toast.error("Please select a different owner");
      return;
    }

    setIsUpdating(true);
    try {
      const selectedRep = availableReps.find(rep => rep.rep_id === selectedOwnerId);
      
      const { error } = await supabase
        .from('accounts')
        .update({
          new_owner_id: selectedOwnerId,
          new_owner_name: selectedRep?.name || selectedOwnerId
        })
        .eq('sfdc_account_id', account.sfdc_account_id)
        .eq('build_id', buildId);

      if (error) throw error;

      // Refresh data - table queries
      queryClient.invalidateQueries({ queryKey: ['customer-accounts', buildId] });
      queryClient.invalidateQueries({ queryKey: ['customer-assignment-changes', buildId] });
      
      // Invalidate analytics queries so KPIs and charts update
      await invalidateAnalytics(buildId);
      
      toast.success("Account reassigned successfully");
      onOpenChange(false);
    } catch (error) {
      console.error('Error reassigning account:', error);
      toast.error("Failed to reassign account");
    } finally {
      setIsUpdating(false);
    }
  };

  const getRiskBadges = () => {
    const badges = [];
    if (account?.cre_risk) {
      badges.push(<Badge key="cre-risk" variant="destructive">CRE Risk</Badge>);
    }
    if (account?.risk_flag) {
      badges.push(<Badge key="risk-flag" variant="destructive">Risk Flag</Badge>);
    }
    if (account?.cre_count && account.cre_count > 0) {
      badges.push(<Badge key="cre-count" variant="secondary">CRE Count: {account.cre_count}</Badge>);
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
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium">Select New Owner:</label>
                  <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a sales rep..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableReps.map((rep) => (
                        <SelectItem key={rep.rep_id} value={rep.rep_id}>
                          {rep.name} ({rep.team || 'No Team'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleReassignment} 
                  disabled={isUpdating || !selectedOwnerId || selectedOwnerId === account.owner_id}
                >
                  {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Reassign
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}