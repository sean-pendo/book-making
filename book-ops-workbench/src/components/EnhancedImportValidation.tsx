import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, AlertTriangle, XCircle, FileText, Download, Settings, RefreshCw } from 'lucide-react';
import { ValidationSummary } from '@/utils/importUtils';
import { ParseError } from '@/utils/enhancedCsvParser';
import { useToast } from '@/components/ui/use-toast';

interface EnhancedImportValidationProps {
  validationResult: ValidationSummary & {
    parseErrors?: ParseError[];
    businessLogicErrors?: string[];
    duplicateAnalysis?: {
      internalDuplicates: Array<{ field: string; value: string; rows: number[] }>;
      potentialExternalDuplicates: Array<{ field: string; value: string; existingCount: number }>;
    };
    crossTableValidation?: {
      orphanedRecords: Array<{ type: string; id: string; issue: string }>;
      missingReferences: Array<{ field: string; value: string; count: number }>;
    };
  };
  fileType: 'accounts' | 'opportunities' | 'sales_reps';
  buildId: string;
  onRevalidate: () => Promise<void>;
  onDownloadErrorReport: () => void;
  onProceedWithValidData: () => void;
  onFixData: (fixes: Array<{ row: number; field: string; oldValue: any; newValue: any }>) => void;
}

interface ValidationGroup {
  type: 'critical' | 'warning' | 'info';
  title: string;
  items: Array<{
    message: string;
    severity: 'critical' | 'warning' | 'info';
    count?: number;
    suggestions?: string[];
    affectedRows?: number[];
  }>;
}

export const EnhancedImportValidation: React.FC<EnhancedImportValidationProps> = ({
  validationResult,
  fileType,
  buildId,
  onRevalidate,
  onDownloadErrorReport,
  onProceedWithValidData,
  onFixData
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [showFixDialog, setShowFixDialog] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);

  // Group validation issues by type and severity
  const validationGroups = useMemo((): ValidationGroup[] => {
    const groups: ValidationGroup[] = [];

    // Critical errors
    if (validationResult.criticalErrors.length > 0) {
      groups.push({
        type: 'critical',
        title: 'Critical Errors',
        items: validationResult.criticalErrors.map(error => ({
          message: error,
          severity: 'critical' as const,
          suggestions: generateErrorSuggestions(error, fileType)
        }))
      });
    }

    // Parse errors
    if (validationResult.parseErrors && validationResult.parseErrors.length > 0) {
      const criticalParseErrors = validationResult.parseErrors.filter(e => e.severity === 'critical');
      const warningParseErrors = validationResult.parseErrors.filter(e => e.severity === 'warning');

      if (criticalParseErrors.length > 0) {
        groups.push({
          type: 'critical',
          title: 'File Structure Errors',
          items: criticalParseErrors.map(error => ({
            message: `Row ${error.row}: ${error.message}`,
            severity: 'critical' as const,
            suggestions: error.suggestedFix ? [error.suggestedFix] : []
          }))
        });
      }

      if (warningParseErrors.length > 0) {
        groups.push({
          type: 'warning',
          title: 'File Structure Warnings',
          items: warningParseErrors.map(error => ({
            message: `Row ${error.row}: ${error.message}`,
            severity: 'warning' as const,
            suggestions: error.suggestedFix ? [error.suggestedFix] : []
          }))
        });
      }
    }

    // Business logic errors
    if (validationResult.businessLogicErrors && validationResult.businessLogicErrors.length > 0) {
      groups.push({
        type: 'warning',
        title: 'Business Logic Issues',
        items: validationResult.businessLogicErrors.map(error => ({
          message: error,
          severity: 'warning' as const,
          suggestions: generateBusinessLogicSuggestions(error, fileType)
        }))
      });
    }

    // Duplicate analysis
    if (validationResult.duplicateAnalysis) {
      const { internalDuplicates, potentialExternalDuplicates } = validationResult.duplicateAnalysis;
      
      if (internalDuplicates.length > 0) {
        groups.push({
          type: 'warning',
          title: 'Internal Duplicates',
          items: internalDuplicates.map(dup => ({
            message: `Duplicate ${dup.field}: "${dup.value}" found in ${dup.rows.length} rows`,
            severity: 'warning' as const,
            affectedRows: dup.rows,
            suggestions: [
              'Review and merge duplicate records',
              'Keep the most complete record',
              'Update duplicate records with unique identifiers'
            ]
          }))
        });
      }

      if (potentialExternalDuplicates.length > 0) {
        groups.push({
          type: 'info',
          title: 'Potential Database Duplicates',
          items: potentialExternalDuplicates.map(dup => ({
            message: `${dup.field} "${dup.value}" may already exist (${dup.existingCount} records)`,
            severity: 'info' as const,
            suggestions: [
              'Records will be updated if they exist',
              'Verify this is the intended behavior',
              'Consider using different identifiers'
            ]
          }))
        });
      }
    }

    // Cross-table validation
    if (validationResult.crossTableValidation) {
      const { orphanedRecords, missingReferences } = validationResult.crossTableValidation;
      
      if (orphanedRecords.length > 0) {
        groups.push({
          type: 'warning',
          title: 'Orphaned Records',
          items: orphanedRecords.map(record => ({
            message: `${record.type} ${record.id}: ${record.issue}`,
            severity: 'warning' as const,
            suggestions: [
              'Import related records first',
              'Verify reference IDs are correct',
              'Consider creating placeholder records'
            ]
          }))
        });
      }

      if (missingReferences.length > 0) {
        groups.push({
          type: 'warning',
          title: 'Missing References',
          items: missingReferences.map(ref => ({
            message: `Missing ${ref.field} "${ref.value}" referenced by ${ref.count} records`,
            severity: 'warning' as const,
            count: ref.count,
            suggestions: [
              'Import missing reference data',
              'Update references to existing records',
              'Create placeholder records'
            ]
          }))
        });
      }
    }

    // General warnings
    if (validationResult.warnings.length > 0) {
      groups.push({
        type: 'warning',
        title: 'Data Quality Warnings',
        items: validationResult.warnings.map(warning => ({
          message: warning,
          severity: 'warning' as const,
          suggestions: generateWarningSuggestions(warning, fileType)
        }))
      });
    }

    return groups;
  }, [validationResult, fileType]);

  const validationStats = useMemo(() => {
    const totalIssues = validationGroups.reduce((sum, group) => sum + group.items.length, 0);
    const criticalIssues = validationGroups
      .filter(group => group.type === 'critical')
      .reduce((sum, group) => sum + group.items.length, 0);
    const warningIssues = validationGroups
      .filter(group => group.type === 'warning')
      .reduce((sum, group) => sum + group.items.length, 0);
    
    const successRate = validationResult.totalRows > 0 
      ? (validationResult.validRows / validationResult.totalRows) * 100 
      : 0;
    
    const canProceed = criticalIssues === 0 && validationResult.validRows > 0;

    return {
      totalIssues,
      criticalIssues,
      warningIssues,
      successRate,
      canProceed
    };
  }, [validationGroups, validationResult]);

  const handleRevalidate = async () => {
    setIsRevalidating(true);
    try {
      await onRevalidate();
      toast({
        title: "Validation Complete",
        description: "Data has been revalidated successfully."
      });
    } catch (error) {
      toast({
        title: "Validation Failed",
        description: error instanceof Error ? error.message : "Failed to revalidate data.",
        variant: "destructive"
      });
    } finally {
      setIsRevalidating(false);
    }
  };

  const getSeverityIcon = (severity: 'critical' | 'warning' | 'info') => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'info': return <CheckCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityBadgeVariant = (severity: 'critical' | 'warning' | 'info') => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary';
      case 'info': return 'outline';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Import Validation Results
            </CardTitle>
            <CardDescription>
              Comprehensive validation report for your {fileType} data
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRevalidate}
              disabled={isRevalidating}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRevalidating ? 'animate-spin' : ''}`} />
              Revalidate
            </Button>
            <Button variant="outline" size="sm" onClick={onDownloadErrorReport}>
              <Download className="h-4 w-4 mr-2" />
              Error Report
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Validation Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{validationResult.totalRows}</div>
                  <div className="text-sm text-muted-foreground">Total Records</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-600">{validationResult.validRows}</div>
                  <div className="text-sm text-muted-foreground">Valid Records</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-orange-600">{validationStats.warningIssues}</div>
                  <div className="text-sm text-muted-foreground">Warnings</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-red-600">{validationStats.criticalIssues}</div>
                  <div className="text-sm text-muted-foreground">Critical Issues</div>
                </CardContent>
              </Card>
            </div>

            {/* Success Rate */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Validation Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Valid Records</span>
                    <span>{validationResult.validRows}/{validationResult.totalRows}</span>
                  </div>
                  <Progress value={validationStats.successRate} className="h-2" />
                  <div className="text-sm text-muted-foreground">
                    {validationStats.successRate.toFixed(1)}% of records passed validation
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status Alert */}
            {validationStats.canProceed ? (
              <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription>
                  <strong>Ready to Import!</strong> {validationResult.validRows} records are ready for import.
                  {validationStats.warningIssues > 0 && (
                    <span> {validationStats.warningIssues} warnings were found but won't prevent import.</span>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Cannot Proceed with Import.</strong> {validationStats.criticalIssues} critical errors must be resolved before importing.
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button 
                onClick={onProceedWithValidData}
                disabled={!validationStats.canProceed}
                className="flex-1"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Import Valid Records ({validationResult.validRows})
              </Button>
              {validationStats.totalIssues > 0 && (
                <Button 
                  variant="outline" 
                  onClick={() => setShowFixDialog(true)}
                  className="flex-1"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Fix Issues ({validationStats.totalIssues})
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="issues" className="space-y-4">
            <ScrollArea className="h-96">
              <div className="space-y-4">
                {validationGroups.map((group, groupIndex) => (
                  <Card key={groupIndex}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(group.type)}
                        <CardTitle className="text-base">{group.title}</CardTitle>
                        <Badge variant={getSeverityBadgeVariant(group.type)}>
                          {group.items.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {group.items.slice(0, 10).map((item, itemIndex) => (
                          <div key={itemIndex} className="border-l-2 border-muted pl-4">
                            <div className="flex items-start gap-2">
                              {getSeverityIcon(item.severity)}
                              <div className="flex-1">
                                <div className="text-sm">{item.message}</div>
                                {item.suggestions && item.suggestions.length > 0 && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    <strong>Suggestions:</strong> {item.suggestions.join(', ')}
                                  </div>
                                )}
                                {item.affectedRows && item.affectedRows.length > 0 && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    <strong>Affected rows:</strong> {item.affectedRows.slice(0, 10).join(', ')}
                                    {item.affectedRows.length > 10 && ` and ${item.affectedRows.length - 10} more`}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {group.items.length > 10 && (
                          <div className="text-sm text-muted-foreground text-center">
                            And {group.items.length - 10} more issues...
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-4">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recommended Actions</CardTitle>
                  <CardDescription>
                    Follow these steps to improve your data quality and resolve issues
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {generateRecommendations(validationGroups, fileType, validationStats).map((rec, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                        <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{rec.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">{rec.description}</div>
                          {rec.action && (
                            <Button size="sm" variant="outline" className="mt-2" onClick={rec.action}>
                              {rec.actionText}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// Helper functions
function generateErrorSuggestions(error: string, fileType: string): string[] {
  const suggestions: string[] = [];
  
  if (error.includes('Missing critical fields')) {
    suggestions.push('Verify field mappings are correct');
    suggestions.push('Check if required columns exist in your CSV');
    suggestions.push('Download sample template for reference');
  }
  
  if (error.includes('duplicate')) {
    suggestions.push('Remove duplicate entries from your file');
    suggestions.push('Use unique identifiers for each record');
  }
  
  return suggestions;
}

function generateBusinessLogicSuggestions(error: string, fileType: string): string[] {
  const suggestions: string[] = [];
  
  if (error.includes('owner')) {
    suggestions.push('Import sales representatives first');
    suggestions.push('Verify owner IDs match sales rep data');
  }
  
  if (error.includes('account')) {
    suggestions.push('Import accounts before opportunities');
    suggestions.push('Verify account IDs are correct');
  }
  
  return suggestions;
}

function generateWarningSuggestions(warning: string, fileType: string): string[] {
  const suggestions: string[] = [];
  
  if (warning.includes('empty') || warning.includes('missing')) {
    suggestions.push('Fill in missing values where possible');
    suggestions.push('Consider if default values are appropriate');
  }
  
  if (warning.includes('format') || warning.includes('invalid')) {
    suggestions.push('Standardize data formats');
    suggestions.push('Use data cleaning tools');
  }
  
  return suggestions;
}

function generateRecommendations(
  groups: ValidationGroup[], 
  fileType: string, 
  stats: { criticalIssues: number; warningIssues: number; canProceed: boolean }
): Array<{ title: string; description: string; actionText?: string; action?: () => void }> {
  const recommendations = [];
  
  if (stats.criticalIssues > 0) {
    recommendations.push({
      title: 'Resolve Critical Errors First',
      description: `Fix ${stats.criticalIssues} critical errors before proceeding with import. These prevent successful data import.`,
      actionText: 'View Critical Errors',
      action: () => {}
    });
  }
  
  if (stats.warningIssues > 0) {
    recommendations.push({
      title: 'Review Data Quality Warnings',
      description: `${stats.warningIssues} warnings were found. While not blocking, addressing these will improve data quality.`,
      actionText: 'View Warnings',
      action: () => {}
    });
  }
  
  recommendations.push({
    title: 'Download Error Report',
    description: 'Get a detailed CSV report of all issues found in your data for offline review and correction.',
    actionText: 'Download Report',
    action: () => {}
  });
  
  if (fileType === 'opportunities') {
    recommendations.push({
      title: 'Import Dependencies First',
      description: 'Make sure accounts and sales representatives are imported before importing opportunities for best results.',
    });
  }
  
  return recommendations;
}