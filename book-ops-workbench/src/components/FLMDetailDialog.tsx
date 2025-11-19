import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, TrendingUp, AlertTriangle, Users, Eye, Send } from 'lucide-react';
import { SalesRepDetailDialog } from '@/components/data-tables/SalesRepDetailDialog';
import { formatCurrency } from '@/utils/accountCalculations';
import SendToManagerDialog from './SendToManagerDialog';

interface FLMDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flmData: {
    flm: string;
    slm: string;
    data: {
      totalAccounts: number;
      totalARR: number;
      totalATR: number;
      riskCount: number;
      retainedCount: number;
      activeReps: Set<string>;
      accounts: any[];
    };
  } | null;
  buildId: string;
}

export const FLMDetailDialog = ({ open, onOpenChange, flmData, buildId }: FLMDetailDialogProps) => {
  const [selectedRep, setSelectedRep] = useState<any>(null);
  const [sendToManagerOpen, setSendToManagerOpen] = useState(false);

  const { data: flmRepsData, isLoading } = useQuery({
    queryKey: ['flm-reps-detail', flmData?.flm, buildId],
    queryFn: async () => {
      if (!flmData) return null;

      // Get all sales reps under this FLM
      const { data: salesReps, error: repsError } = await supabase
        .from('sales_reps')
        .select('rep_id, name, team, flm, slm')
        .eq('build_id', buildId)
        .eq('flm', flmData.flm)
        .eq('is_active', true);

      if (repsError) throw repsError;

      // Get accounts for each rep and calculate metrics
      const repMetrics = await Promise.all(
        (salesReps || []).map(async (rep) => {
          const { data: accounts, error: accountsError } = await supabase
            .from('accounts')
            .select(`
              sfdc_account_id,
              account_name,
              calculated_arr,
              calculated_atr,
              arr,
              atr,
              cre_count,
              cre_risk,
              risk_flag,
              owner_id,
              owner_name,
              new_owner_id,
              new_owner_name,
              is_parent,
              is_customer,
              ultimate_parent_id,
              has_split_ownership,
              hq_country,
              sales_territory
            `)
            .eq('build_id', buildId)
            .eq('is_customer', true)
            .or('is_parent.eq.true,has_split_ownership.eq.true')
            .or(`new_owner_id.eq.${rep.rep_id},and(owner_id.eq.${rep.rep_id},new_owner_id.is.null)`);

          if (accountsError) throw accountsError;

          // Separate parent and child accounts
          const parentAccounts = accounts?.filter(acc => acc.is_parent) || [];
          const childAccounts = accounts?.filter(acc => !acc.is_parent && acc.has_split_ownership) || [];

          // Build parent owner map for split ownership detection
          const parentOwnerMap = new Map<string, string>();
          parentAccounts.forEach(parent => {
            const ownerId = parent.new_owner_id || parent.owner_id;
            if (parent.sfdc_account_id && ownerId) {
              parentOwnerMap.set(parent.sfdc_account_id, ownerId);
            }
          });

          // Calculate metrics with split ownership
          const totalAccounts = parentAccounts.length;
          const parentARR = parentAccounts.reduce((sum, acc) => sum + (acc.calculated_arr || acc.arr || 0), 0);
          const splitOwnershipChildrenARR = childAccounts
            .filter(acc => {
              const parentId = acc.ultimate_parent_id;
              if (!parentId) return false;
              const childOwnerId = acc.new_owner_id || acc.owner_id;
              const parentOwnerId = parentOwnerMap.get(parentId);
              return childOwnerId !== parentOwnerId;
            })
            .reduce((sum, acc) => sum + (acc.calculated_arr || acc.arr || 0), 0);
          const totalARR = parentARR + splitOwnershipChildrenARR;
          const totalATR = parentAccounts.reduce((sum, acc) => sum + (acc.calculated_atr || acc.atr || 0), 0);
          const riskCount = parentAccounts.filter(acc => acc.cre_risk || (acc.cre_count && acc.cre_count > 0)).length;
          const retainedCount = parentAccounts.filter(acc => !acc.new_owner_id || acc.owner_id === acc.new_owner_id).length;
          const retentionRate = totalAccounts > 0 ? (retainedCount / totalAccounts) * 100 : 0;

          return {
            ...rep,
            totalAccounts,
            totalARR,
            totalATR,
            riskCount,
            retainedCount,
            retentionRate,
            accounts: accounts || []
          };
        })
      );

      return repMetrics;
    },
    enabled: open && !!flmData && !!buildId,
  });

  if (!flmData) return null;

  const handleViewRep = (rep: any) => {
    setSelectedRep(rep);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {flmData.flm} - FLM Portfolio Breakdown
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Under SLM: {flmData.slm}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSendToManagerOpen(true)}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Send to Manager
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* FLM Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Active Reps
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {flmData.data.activeReps.size}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Total Accounts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {flmData.data.totalAccounts}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Total ARR
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(flmData.data.totalARR)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Total ATR
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCurrency(flmData.data.totalATR)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Risk Accounts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {flmData.data.riskCount}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Retention %
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {((flmData.data.retainedCount / flmData.data.totalAccounts) * 100).toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sales Reps Table */}
            <Card>
              <CardHeader>
                <CardTitle>Sales Representatives</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rep Name</TableHead>
                        <TableHead className="text-center">Team</TableHead>
                        <TableHead className="text-center">Accounts</TableHead>
                        <TableHead className="text-center">ARR</TableHead>
                        <TableHead className="text-center">ATR</TableHead>
                        <TableHead className="text-center">Risk Accounts</TableHead>
                        <TableHead className="text-center">Retention %</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flmRepsData?.map((rep) => (
                        <TableRow key={rep.rep_id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{rep.name}</TableCell>
                          <TableCell className="text-center">{rep.team || '-'}</TableCell>
                          <TableCell className="text-center">{rep.totalAccounts}</TableCell>
                          <TableCell className="text-center">{formatCurrency(rep.totalARR)}</TableCell>
                          <TableCell className="text-center">{formatCurrency(rep.totalATR)}</TableCell>
                          <TableCell className="text-center">
                            {rep.riskCount > 0 ? (
                              <Badge variant="destructive">{rep.riskCount}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={rep.retentionRate >= 80 ? "default" : "secondary"}>
                              {rep.retentionRate.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewRep(rep)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rep Detail Dialog */}
      <SalesRepDetailDialog
        open={!!selectedRep}
        onOpenChange={(open) => !open && setSelectedRep(null)}
        rep={selectedRep}
        buildId={buildId}
      />

      {/* Send to Manager Dialog */}
      <SendToManagerDialog
        open={sendToManagerOpen}
        onClose={() => setSendToManagerOpen(false)}
        buildId={buildId}
        managerName={flmData.flm}
        managerLevel="FLM"
      />
    </>
  );
};