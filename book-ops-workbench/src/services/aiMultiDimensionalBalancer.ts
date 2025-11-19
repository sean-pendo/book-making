import { supabase } from "@/integrations/supabase/client";
import { BalancingGoals, BalancingConstraints } from "@/config/aiBalancingConfig";

interface RepWorkload {
  repId: string;
  repName: string;
  region: string;
  arr: number;
  atr: number;
  customerCount: number;
  creRiskCount: number;
  renewalsQ1: number;
  renewalsQ2: number;
  renewalsQ3: number;
  renewalsQ4: number;
  enterpriseCount: number;
  commercialCount: number;
  accounts: any[];
}

interface OptimizationSuggestion {
  accountName: string;
  accountId?: string;
  accountARR: number;
  accountATR: number;
  isHighRisk: boolean;
  renewalQuarter: string;
  tier: string;
  fromRepName: string;
  fromRepId?: string;
  toRepName: string;
  toRepId?: string;
  reasoning: string;
  dimensionImpacts: {
    arrBalance: string;
    customerCount: string;
    riskDistribution: string;
    atrBalance: string;
    renewalTiming: string;
    tierMix: string;
  };
  priority: number;
}

interface BalanceAnalysis {
  needsOptimization: boolean;
  repWorkloads: RepWorkload[];
  imbalances: {
    arrImbalance: number;
    atrImbalance: number;
    countImbalance: number;
    riskImbalance: number;
  };
}

export class AIMultiDimensionalBalancer {
  static analyzeBalance(
    assignments: any[],
    salesReps: any[],
    accounts: any[]
  ): BalanceAnalysis {
    console.log('[AI BALANCER] 🔍 Analyzing current balance across all dimensions...');
    
    // Calculate workloads for each rep
    const repWorkloads: RepWorkload[] = salesReps.map(rep => {
      const repAssignments = assignments.filter(a => a.ownerId === rep.rep_id);
      const repAccounts = repAssignments.map(a => 
        accounts.find(acc => acc.sfdc_account_id === a.accountId)
      ).filter(Boolean);

      const arr = repAccounts.reduce((sum, acc) => sum + (acc.calculated_arr || 0), 0);
      const atr = repAccounts.reduce((sum, acc) => sum + (acc.calculated_atr || 0), 0);
      const creRiskCount = repAccounts.filter(acc => acc.cre_risk).length;
      
      // Calculate quarterly renewals
      const renewalsQ1 = repAccounts.filter(acc => {
        const month = new Date(acc.renewal_date || '').getMonth() + 1;
        return month >= 1 && month <= 3;
      }).length;
      const renewalsQ2 = repAccounts.filter(acc => {
        const month = new Date(acc.renewal_date || '').getMonth() + 1;
        return month >= 4 && month <= 6;
      }).length;
      const renewalsQ3 = repAccounts.filter(acc => {
        const month = new Date(acc.renewal_date || '').getMonth() + 1;
        return month >= 7 && month <= 9;
      }).length;
      const renewalsQ4 = repAccounts.filter(acc => {
        const month = new Date(acc.renewal_date || '').getMonth() + 1;
        return month >= 10 && month <= 12;
      }).length;

      const enterpriseCount = repAccounts.filter(acc => 
        acc.enterprise_vs_commercial === 'Enterprise'
      ).length;
      const commercialCount = repAccounts.filter(acc => 
        acc.enterprise_vs_commercial === 'Commercial'
      ).length;

      return {
        repId: rep.rep_id,
        repName: rep.name,
        region: rep.region || 'Unknown',
        arr,
        atr,
        customerCount: repAccounts.length,
        creRiskCount,
        renewalsQ1,
        renewalsQ2,
        renewalsQ3,
        renewalsQ4,
        enterpriseCount,
        commercialCount,
        accounts: repAccounts
      };
    });

    // Calculate imbalances
    const avgARR = repWorkloads.reduce((sum, w) => sum + w.arr, 0) / repWorkloads.length;
    const avgATR = repWorkloads.reduce((sum, w) => sum + w.atr, 0) / repWorkloads.length;
    const avgCount = repWorkloads.reduce((sum, w) => sum + w.customerCount, 0) / repWorkloads.length;
    
    const arrVariance = Math.max(...repWorkloads.map(w => Math.abs(w.arr - avgARR) / avgARR)) * 100;
    const atrVariance = Math.max(...repWorkloads.map(w => Math.abs(w.atr - avgATR) / (avgATR || 1))) * 100;
    const countVariance = Math.max(...repWorkloads.map(w => Math.abs(w.customerCount - avgCount)));
    const maxRisk = Math.max(...repWorkloads.map(w => w.creRiskCount));

    console.log('[AI BALANCER] 📊 Current state:', {
      avgARR: `$${(avgARR / 1000000).toFixed(2)}M`,
      arrVariance: `${arrVariance.toFixed(1)}%`,
      atrVariance: `${atrVariance.toFixed(1)}%`,
      countVariance: `±${countVariance.toFixed(0)} accounts`,
      maxRiskPerRep: maxRisk
    });

    const needsOptimization = 
      arrVariance > 20 || 
      atrVariance > 25 || 
      countVariance > 7 || 
      maxRisk > 4;

    return {
      needsOptimization,
      repWorkloads,
      imbalances: {
        arrImbalance: arrVariance,
        atrImbalance: atrVariance,
        countImbalance: countVariance,
        riskImbalance: maxRisk
      }
    };
  }

  static async generateOptimizations(
    buildId: string,
    balanceAnalysis: BalanceAnalysis,
    goals: BalancingGoals,
    constraints: BalancingConstraints
  ): Promise<OptimizationSuggestion[]> {
    console.log('[AI BALANCER] 🤖 Calling AI for optimization suggestions...');

    // Prepare available accounts for moves
    const availableAccounts = balanceAnalysis.repWorkloads
      .flatMap(rep => rep.accounts.map(acc => ({
        id: acc.sfdc_account_id,
        name: acc.account_name,
        arr: acc.calculated_arr || 0,
        atr: acc.calculated_atr || 0,
        isHighRisk: acc.cre_risk || false,
        renewalQuarter: this.getRenewalQuarter(acc.renewal_date),
        tier: acc.enterprise_vs_commercial || 'Commercial',
        currentOwner: rep.repName,
        currentOwnerId: rep.repId,
        region: acc.geo || acc.sales_territory || 'Unknown',
        ownedDays: this.getOwnedDays(acc.created_at)
      })))
      .filter(acc => {
        // Apply constraints
        if (constraints.maintainContinuity && acc.ownedDays > 90) {
          return false;
        }
        return true;
      });

    try {
      const { data, error } = await supabase.functions.invoke('ai-balance-optimizer', {
        body: {
          repWorkloads: balanceAnalysis.repWorkloads,
          goals,
          constraints,
          availableAccounts
        }
      });

      if (error) throw error;

      console.log('[AI BALANCER] ✅ AI returned', data.suggestions?.length || 0, 'suggestions');
      console.log('[AI BALANCER] 💡 Strategy:', data.overallStrategy);

      // Enrich suggestions with IDs
      const enrichedSuggestions = (data.suggestions || []).map((suggestion: OptimizationSuggestion) => {
        const account = availableAccounts.find(a => a.name === suggestion.accountName);
        const fromRep = balanceAnalysis.repWorkloads.find(r => r.repName === suggestion.fromRepName);
        const toRep = balanceAnalysis.repWorkloads.find(r => r.repName === suggestion.toRepName);

        return {
          ...suggestion,
          accountId: account?.id,
          fromRepId: fromRep?.repId,
          toRepId: toRep?.repId
        };
      }).filter((s: OptimizationSuggestion) => s.accountId && s.fromRepId && s.toRepId);

      return enrichedSuggestions;
    } catch (error) {
      console.error('[AI BALANCER] ❌ AI optimization failed:', error);
      return [];
    }
  }

  static applyOptimizations(
    assignments: any[],
    suggestions: OptimizationSuggestion[]
  ): any[] {
    console.log('[AI BALANCER] 📝 Applying', suggestions.length, 'AI suggestions...');

    const updatedAssignments = [...assignments];

    suggestions.forEach(suggestion => {
      const assignmentIndex = updatedAssignments.findIndex(
        a => a.accountId === suggestion.accountId
      );

      if (assignmentIndex !== -1) {
        updatedAssignments[assignmentIndex] = {
          ...updatedAssignments[assignmentIndex],
          ownerId: suggestion.toRepId,
          ownerName: suggestion.toRepName,
          rationale: `AI Multi-Dimensional Optimization: ${suggestion.reasoning}`,
          source: 'AI_BALANCER'
        };

        console.log(`[AI BALANCER] ✓ Moved ${suggestion.accountName} from ${suggestion.fromRepName} to ${suggestion.toRepName}`);
      }
    });

    return updatedAssignments;
  }

  private static getRenewalQuarter(renewalDate: string | null): string {
    if (!renewalDate) return 'Unknown';
    const month = new Date(renewalDate).getMonth() + 1;
    if (month >= 1 && month <= 3) return 'Q1';
    if (month >= 4 && month <= 6) return 'Q2';
    if (month >= 7 && month <= 9) return 'Q3';
    return 'Q4';
  }

  private static getOwnedDays(createdAt: string | null): number {
    if (!createdAt) return 0;
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  }
}
