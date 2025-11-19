import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Database, CheckCircle } from 'lucide-react';
import { DataRecoveryFix } from './DataRecoveryFix';

interface DataRecoveryProps {
  buildId: string;
  onRecoveryComplete?: () => void;
}

export const DataRecovery: React.FC<DataRecoveryProps> = ({ buildId, onRecoveryComplete }) => {
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<{
    nullOwnerIds: number;
    nullAmounts: number;
    totalOpportunities: number;
  } | null>(null);
  const { toast } = useToast();

  const checkDataIssues = async () => {
    try {
      // Check for opportunities with missing owner_id and amount data
      const { data: nullOwnerIds } = await supabase
        .from('opportunities')
        .select('id')
        .eq('build_id', buildId)
        .is('owner_id', null);

      const { data: nullAmounts } = await supabase
        .from('opportunities')
        .select('id')
        .eq('build_id', buildId)
        .eq('amount', 0);

      const { data: totalOpportunities } = await supabase
        .from('opportunities')
        .select('id')
        .eq('build_id', buildId);

      setRecoveryStatus({
        nullOwnerIds: nullOwnerIds?.length || 0,
        nullAmounts: nullAmounts?.length || 0,
        totalOpportunities: totalOpportunities?.length || 0
      });

    } catch (error) {
      console.error('Error checking data issues:', error);
      toast({
        title: "Error",
        description: "Failed to check data issues",
        variant: "destructive",
      });
    }
  };

  const recoverDataFromAccounts = async () => {
    setIsRecovering(true);
    try {
      // First, get all opportunities with null owner_id for this build
      const { data: opportunitiesWithNullOwners, error: fetchError } = await supabase
        .from('opportunities')
        .select('id, sfdc_account_id, sfdc_opportunity_id')
        .eq('build_id', buildId)
        .is('owner_id', null);

      if (fetchError) throw fetchError;

      if (!opportunitiesWithNullOwners || opportunitiesWithNullOwners.length === 0) {
        toast({
          title: "No Recovery Needed",
          description: "No opportunities found with missing owner information.",
        });
        setIsRecovering(false);
        return;
      }

      // Get the account data for these opportunities
      const accountIds = [...new Set(opportunitiesWithNullOwners.map(o => o.sfdc_account_id))];
      const { data: accounts, error: accountError } = await supabase
        .from('accounts')
        .select('sfdc_account_id, owner_id, owner_name')
        .eq('build_id', buildId)
        .in('sfdc_account_id', accountIds)
        .not('owner_id', 'is', null);

      if (accountError) throw accountError;

      // Create a map of account_id to owner info
      const accountOwnerMap = new Map();
      accounts?.forEach(account => {
        if (account.owner_id && account.owner_name) {
          accountOwnerMap.set(account.sfdc_account_id, {
            owner_id: account.owner_id,
            owner_name: account.owner_name
          });
        }
      });

      // Update opportunities that have matching accounts with owners
      let updatedCount = 0;
      for (const opp of opportunitiesWithNullOwners) {
        const ownerInfo = accountOwnerMap.get(opp.sfdc_account_id);
        if (ownerInfo) {
          const { error: updateError } = await supabase
            .from('opportunities')
            .update({
              owner_id: ownerInfo.owner_id,
              owner_name: ownerInfo.owner_name
            })
            .eq('id', opp.id);

          if (!updateError) {
            updatedCount++;
          }
        }
      }

      toast({
        title: "Data Recovery Complete",
        description: `Successfully recovered owner information for ${updatedCount} opportunities.`,
      });

      onRecoveryComplete?.();
      await checkDataIssues();

    } catch (error) {
      console.error('Error recovering data:', error);
      toast({
        title: "Recovery Failed",
        description: "Failed to recover opportunity owner data",
        variant: "destructive",
      });
    }
    setIsRecovering(false);
  };

  React.useEffect(() => {
    checkDataIssues();
  }, [buildId]);

  if (!recoveryStatus) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Checking for data issues...</p>
        </CardContent>
      </Card>
    );
  }

  const hasIssues = recoveryStatus.nullOwnerIds > 0 || recoveryStatus.nullAmounts > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Recovery Tools
          </CardTitle>
          <CardDescription>
            Recover missing opportunity owner and financial data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="font-semibold">{recoveryStatus.totalOpportunities}</div>
              <div className="text-muted-foreground">Total Opportunities</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-orange-600">{recoveryStatus.nullOwnerIds}</div>
              <div className="text-muted-foreground">Missing Owner IDs</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-orange-600">{recoveryStatus.nullAmounts}</div>
              <div className="text-muted-foreground">Zero Amounts</div>
            </div>
          </div>

          {hasIssues ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <div className="text-sm">
                  <strong>Data Issues Detected:</strong> Missing owner information affecting opportunity assignments and financial calculations.
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Recovery Options:</h4>
                <div className="space-y-2">
                  <Button 
                    onClick={recoverDataFromAccounts}
                    disabled={isRecovering}
                    className="w-full"
                    variant="default"
                  >
                    {isRecovering ? 'Recovering...' : 'Recover from Parent Accounts'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    This will copy owner_id and owner_name from parent accounts to opportunities where the account has an owner but the opportunity doesn't.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div className="text-sm">
                <strong>No Data Issues Found:</strong> All opportunities have proper owner and amount data.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <DataRecoveryFix buildId={buildId} onRecoveryComplete={onRecoveryComplete} />
    </>
  );
};