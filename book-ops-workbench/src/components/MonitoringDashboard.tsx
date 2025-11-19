// Phase 5: Monitoring Dashboard for Account Calculation Health
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';

interface MonitoringDashboardProps {
  buildId: string;
}

interface ValidationResult {
  category: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  count?: number;
}

export const MonitoringDashboard = ({ buildId }: MonitoringDashboardProps) => {
  // Validation query to check calculation health
  const { data: validationResults, isLoading } = useQuery({
    queryKey: ['calculation-validation', buildId],
    queryFn: async (): Promise<ValidationResult[]> => {
      const results: ValidationResult[] = [];

      try {
        // Check 1: Akamai ATR should be $0
        const { data: akamaiData } = await supabase
          .from('accounts')
          .select('sfdc_account_id, account_name, calculated_atr')
          .eq('build_id', buildId)
          .ilike('account_name', '%akamai%')
          .limit(1);

        if (akamaiData && akamaiData.length > 0) {
          const akamai = akamaiData[0];
          results.push({
            category: 'ATR Validation',
            status: akamai.calculated_atr === 0 ? 'pass' : 'fail',
            message: `Akamai Technologies ATR: $${akamai.calculated_atr.toLocaleString()}`,
            count: akamai.calculated_atr
          });
        }

        // Check 2: Accounts with renewals should have ATR > 0
        const { data: renewalAccountsData } = await supabase
          .from('accounts')
          .select(`
            sfdc_account_id, 
            calculated_atr,
            opportunities!inner(opportunity_type, available_to_renew)
          `)
          .eq('build_id', buildId)
          .eq('opportunities.opportunity_type', 'Renewals')
          .gt('opportunities.available_to_renew', 0)
          .limit(10);

        const accountsWithRenewals = renewalAccountsData?.length || 0;
        const accountsWithATR = renewalAccountsData?.filter((acc: any) => acc.calculated_atr > 0).length || 0;

        results.push({
          category: 'Renewals Consistency',
          status: accountsWithATR === accountsWithRenewals ? 'pass' : 'warning',
          message: `${accountsWithATR}/${accountsWithRenewals} accounts with renewals have ATR`,
          count: accountsWithATR
        });

        // Check 3: Accounts without renewals should have ATR = 0
        const { data: nonRenewalAccounts } = await supabase
          .from('accounts')
          .select('sfdc_account_id, calculated_atr')
          .eq('build_id', buildId)
          .gt('calculated_atr', 0)
          .limit(100);

        if (nonRenewalAccounts) {
          let accountsWithIncorrectATR = 0;
          
          for (const account of nonRenewalAccounts) {
            const { data: renewalOpps } = await supabase
              .from('opportunities')
              .select('sfdc_opportunity_id')
              .eq('build_id', buildId)
              .eq('sfdc_account_id', account.sfdc_account_id)
              .eq('opportunity_type', 'Renewals')
              .gt('available_to_renew', 0)
              .limit(1);

            if (!renewalOpps || renewalOpps.length === 0) {
              accountsWithIncorrectATR++;
            }
          }

          results.push({
            category: 'ATR Accuracy',
            status: accountsWithIncorrectATR === 0 ? 'pass' : 'fail',
            message: `${accountsWithIncorrectATR} accounts have ATR without renewals`,
            count: accountsWithIncorrectATR
          });
        }

        // Check 4: Overall data completeness
        const { data: accountStats } = await supabase
          .from('accounts')
          .select('calculated_arr, calculated_atr, cre_count')
          .eq('build_id', buildId);

        if (accountStats) {
          const totalAccounts = accountStats.length;
          const accountsWithCalculations = accountStats.filter(acc => 
            acc.calculated_arr !== null && acc.calculated_atr !== null && acc.cre_count !== null
          ).length;

          results.push({
            category: 'Data Completeness',
            status: accountsWithCalculations === totalAccounts ? 'pass' : 'warning',
            message: `${accountsWithCalculations}/${totalAccounts} accounts have all calculations`,
            count: accountsWithCalculations
          });
        }

      } catch (error) {
        console.error('Validation error:', error);
        results.push({
          category: 'System Health',
          status: 'fail',
          message: 'Failed to run validation checks',
        });
      }

      return results;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pass':
        return 'default';
      case 'fail':
        return 'destructive';
      case 'warning':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 animate-pulse" />
            Calculation Health Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading validation results...</div>
        </CardContent>
      </Card>
    );
  }

  const overallStatus = validationResults?.some(r => r.status === 'fail') 
    ? 'fail' 
    : validationResults?.some(r => r.status === 'warning') 
    ? 'warning' 
    : 'pass';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon(overallStatus)}
          Calculation Health Monitor
        </CardTitle>
        <CardDescription>
          Real-time validation of account calculation accuracy
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {overallStatus === 'fail' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Critical issues detected with account calculations. Please review and recalculate.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3">
          {validationResults?.map((result, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(result.status)}
                <div>
                  <div className="font-medium text-sm">{result.category}</div>
                  <div className="text-xs text-muted-foreground">{result.message}</div>
                </div>
              </div>
              <Badge variant={getStatusBadgeVariant(result.status)}>
                {result.status.toUpperCase()}
              </Badge>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
};