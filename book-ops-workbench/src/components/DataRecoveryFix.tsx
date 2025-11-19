import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DataRecoveryFixProps {
  buildId: string;
  onRecoveryComplete?: () => void;
}

interface ValidationResult {
  total_accounts: number;
  parent_accounts: number;
  child_accounts: number;
  orphaned_children: number;
  self_referencing: number;
}

export const DataRecoveryFix: React.FC<DataRecoveryFixProps> = ({ 
  buildId, 
  onRecoveryComplete 
}) => {
  const { toast } = useToast();
  const [isFixing, setIsFixing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [fixResult, setFixResult] = useState<{ fixed_count: number } | null>(null);

  const validateData = async () => {
    setIsValidating(true);
    try {
      const { data, error } = await supabase.rpc('validate_parent_child_relationships', {
        p_build_id: buildId
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setValidationResult(data[0]);
      }

      toast({
        title: "Validation Complete",
        description: "Data validation completed successfully.",
      });
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: "Validation Failed",
        description: error instanceof Error ? error.message : "Failed to validate data",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const fixData = async () => {
    setIsFixing(true);
    try {
      // First fix the ultimate_parent_id data
      const { data: fixData, error: fixError } = await supabase.rpc('fix_ultimate_parent_id_data', {
        p_build_id: buildId
      });

      if (fixError) throw fixError;

      setFixResult(fixData?.[0] || { fixed_count: 0 });

      // Then classify parent/child accounts
      const { data: classifyData, error: classifyError } = await supabase.rpc('classify_parent_child_accounts', {
        p_build_id: buildId
      });

      if (classifyError) throw classifyError;

      toast({
        title: "Data Recovery Complete",
        description: `Fixed ${fixData?.[0]?.fixed_count || 0} records and classified parent/child relationships.`,
      });

      // Re-validate to show updated results
      await validateData();
      
      if (onRecoveryComplete) {
        onRecoveryComplete();
      }
    } catch (error) {
      console.error('Fix error:', error);
      toast({
        title: "Fix Failed",
        description: error instanceof Error ? error.message : "Failed to fix data",
        variant: "destructive",
      });
    } finally {
      setIsFixing(false);
    }
  };

  const hasIssues = validationResult && (
    validationResult.orphaned_children > 0 || 
    validationResult.self_referencing > 0 ||
    validationResult.parent_accounts === 0
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Parent/Child Data Recovery
        </CardTitle>
        <CardDescription>
          Fix ultimate_parent_id data issues and properly classify parent/child accounts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={validateData} 
            disabled={isValidating}
            variant="outline"
          >
            {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Validate Data
          </Button>
          
          <Button 
            onClick={fixData} 
            disabled={isFixing || !validationResult}
            variant={hasIssues ? "default" : "secondary"}
          >
            {isFixing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Fix Data Issues
          </Button>
        </div>

        {validationResult && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Data Validation Results:</h4>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                <span className="text-2xl font-bold">{validationResult.total_accounts}</span>
                <span className="text-xs text-muted-foreground">Total Accounts</span>
              </div>
              
              <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                <span className="text-2xl font-bold text-green-600">{validationResult.parent_accounts}</span>
                <span className="text-xs text-muted-foreground">Parent Accounts</span>
              </div>
              
              <div className="flex flex-col items-center p-3 bg-muted rounded-lg">
                <span className="text-2xl font-bold text-blue-600">{validationResult.child_accounts}</span>
                <span className="text-xs text-muted-foreground">Child Accounts</span>
              </div>
            </div>

            {validationResult.orphaned_children > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{validationResult.orphaned_children}</strong> orphaned child accounts found 
                  (ultimate_parent_id doesn't match any existing account)
                </AlertDescription>
              </Alert>
            )}

            {validationResult.self_referencing > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{validationResult.self_referencing}</strong> self-referencing accounts found 
                  (ultimate_parent_id points to itself)
                </AlertDescription>
              </Alert>
            )}

            {validationResult.parent_accounts === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>No parent accounts found!</strong> This indicates that ultimate_parent_id 
                  values are not being properly set to NULL for parent accounts.
                </AlertDescription>
              </Alert>
            )}

            {!hasIssues && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  All data validation checks passed! Parent/child relationships are properly configured.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {fixResult && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Successfully fixed <strong>{fixResult.fixed_count}</strong> records with incorrect 
              ultimate_parent_id values and updated parent/child classifications.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};