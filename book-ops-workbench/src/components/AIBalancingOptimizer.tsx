import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AIBalancingOptimizer, OptimizationSuggestion, ProblemRep } from '@/services/aiBalancingOptimizer';
import { supabase } from '@/integrations/supabase/client';

interface AIBalancingOptimizerProps {
  buildId: string;
  onOptimizationsApplied: () => void;
}

export const AIBalancingOptimizerComponent: React.FC<AIBalancingOptimizerProps> = ({ 
  buildId, 
  onOptimizationsApplied 
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [problemReps, setProblemReps] = useState<ProblemRep[]>([]);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [aiReasoning, setAiReasoning] = useState<string>('');
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  const analyzeProblemReps = async () => {
    try {
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .eq('is_customer', true);
      
      const { data: salesReps } = await supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_active', true);
      
      if (!accounts || !salesReps) {
        throw new Error('Failed to load data');
      }
      
      const problems = AIBalancingOptimizer.analyzeWorkloadImbalance(
        accounts,
        salesReps,
        accounts
      );
      
      setProblemReps(problems);
      return problems;
    } catch (error) {
      console.error('Error analyzing problem reps:', error);
      toast({
        title: "Analysis Failed",
        description: "Could not analyze workload imbalance",
        variant: "destructive"
      });
      return [];
    }
  };

  const runAIOptimization = async () => {
    setLoading(true);
    try {
      const problems = await analyzeProblemReps();
      
      if (problems.length === 0) {
        toast({
          title: "No Problems Found",
          description: "All reps are above $1M ARR threshold"
        });
        setLoading(false);
        return;
      }
      
      toast({
        title: "Running AI Optimization",
        description: `Analyzing ${problems.length} problem reps...`
      });
      
      const result = await AIBalancingOptimizer.generateOptimizations(buildId, problems);
      
      setSuggestions(result.suggestions);
      setAiReasoning(result.aiReasoning);
      setSelectedSuggestions(new Set(result.suggestions.map(s => s.accountId)));
      
      toast({
        title: "AI Analysis Complete",
        description: `Generated ${result.suggestions.length} optimization suggestions`
      });
    } catch (error) {
      console.error('AI optimization error:', error);
      toast({
        title: "Optimization Failed",
        description: error instanceof Error ? error.message : "AI optimization failed",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const applySuggestions = async () => {
    const selectedSuggestionsList = suggestions.filter(s => 
      selectedSuggestions.has(s.accountId)
    );
    
    if (selectedSuggestionsList.length === 0) {
      toast({
        title: "No Suggestions Selected",
        description: "Please select at least one suggestion to apply",
        variant: "destructive"
      });
      return;
    }
    
    setApplying(true);
    try {
      const result = await AIBalancingOptimizer.applyOptimizations(
        buildId,
        selectedSuggestionsList
      );
      
      if (result.success) {
        toast({
          title: "Optimizations Applied",
          description: `Successfully applied ${result.applied} of ${selectedSuggestionsList.length} suggestions`
        });
        
        setSuggestions([]);
        setProblemReps([]);
        setAiReasoning('');
        setSelectedSuggestions(new Set());
        onOptimizationsApplied();
      } else {
        throw new Error('No suggestions were applied');
      }
    } catch (error) {
      console.error('Error applying suggestions:', error);
      toast({
        title: "Application Failed",
        description: "Failed to apply optimization suggestions",
        variant: "destructive"
      });
    } finally {
      setApplying(false);
    }
  };

  const toggleSuggestion = (accountId: string) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId);
    } else {
      newSelected.add(accountId);
    }
    setSelectedSuggestions(newSelected);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Balancing Optimizer
            </CardTitle>
            <CardDescription>
              Use AI to intelligently boost reps below $1M ARR
            </CardDescription>
          </div>
          <Button 
            onClick={runAIOptimization}
            disabled={loading}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Run AI Optimization
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      
      {(problemReps.length > 0 || suggestions.length > 0) && (
        <CardContent className="space-y-6">
          {problemReps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Problem Reps (Below $1M ARR)</h3>
              <div className="space-y-2">
                {problemReps.map(rep => (
                  <div key={rep.repId} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
                    <div>
                      <div className="font-medium">{rep.repName}</div>
                      <div className="text-sm text-muted-foreground">
                        {rep.region} • {rep.currentAccounts} accounts
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-red-600 dark:text-red-400">
                        ${(rep.currentARR / 1000000).toFixed(2)}M
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Needs ${(rep.deficit / 1000000).toFixed(2)}M
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {aiReasoning && (
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                <strong>AI Strategy:</strong> {aiReasoning}
              </AlertDescription>
            </Alert>
          )}
          
          {suggestions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">
                  Suggested Moves ({selectedSuggestions.size} of {suggestions.length} selected)
                </h3>
                <Button 
                  onClick={applySuggestions}
                  disabled={applying || selectedSuggestions.size === 0}
                  size="sm"
                >
                  {applying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Apply Selected ({selectedSuggestions.size})
                    </>
                  )}
                </Button>
              </div>
              
              <div className="space-y-3">
                {suggestions
                  .sort((a, b) => a.priority - b.priority)
                  .map(suggestion => (
                    <div 
                      key={suggestion.accountId}
                      className={`p-4 rounded border cursor-pointer transition-all ${
                        selectedSuggestions.has(suggestion.accountId)
                          ? 'bg-purple-50 dark:bg-purple-950/20 border-purple-300 dark:border-purple-700'
                          : 'bg-background border-border hover:border-purple-200'
                      }`}
                      onClick={() => toggleSuggestion(suggestion.accountId)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {selectedSuggestions.has(suggestion.accountId) ? (
                            <CheckCircle className="h-5 w-5 text-purple-600" />
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-muted" />
                          )}
                          <div>
                            <div className="font-medium">{suggestion.accountName}</div>
                            <div className="text-sm text-muted-foreground">
                              ${(suggestion.accountARR / 1000000).toFixed(2)}M ARR
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline">Priority {suggestion.priority}</Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-7 text-sm">
                        <span className="text-muted-foreground">{suggestion.fromRepName}</span>
                        <ArrowRight className="h-4 w-4 text-purple-500" />
                        <span className="font-medium text-purple-600 dark:text-purple-400">
                          {suggestion.toRepName}
                        </span>
                      </div>
                      
                      <div className="ml-7 mt-2 text-sm text-muted-foreground">
                        {suggestion.reasoning}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
