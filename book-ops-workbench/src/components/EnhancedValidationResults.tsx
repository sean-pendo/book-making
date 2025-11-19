import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Download,
  Filter,
  BarChart3
} from "lucide-react";
import { useState } from "react";

interface ValidationError {
  row: number;
  field: string;
  issue: string;
  value: any;
  csvColumn?: string;
}

interface EnhancedValidationResultsProps {
  file: {
    id: string;
    name: string;
    type: string;
    validationResult?: {
      totalRows: number;
      validRows: number;
      warnings: string[];
      criticalErrors: string[];
      errors: string[];
    };
    fieldMappings?: { [key: string]: string };
  };
  onImport: (file: any) => void;
  onDownloadErrorReport: (file: any) => void;
}

export const EnhancedValidationResults: React.FC<EnhancedValidationResultsProps> = ({
  file,
  onImport,
  onDownloadErrorReport
}) => {
  const [selectedTab, setSelectedTab] = useState('overview');
  
  if (!file.validationResult) {
    return null;
  }

  const { validationResult } = file;
  
  // Parse errors to extract structured information
  const parseErrors = (errors: string[]) => {
    return errors.map(error => {
      const rowMatch = error.match(/Row (\d+):/);
      const fieldMatch = error.match(/Missing critical fields?: (.+?)\./);
      
      return {
        row: rowMatch ? parseInt(rowMatch[1]) : 0,
        field: fieldMatch ? fieldMatch[1] : 'Unknown',
        issue: error,
        value: null
      };
    });
  };

  const structuredErrors = parseErrors(validationResult.criticalErrors);
  const structuredWarnings = parseErrors(validationResult.warnings);

  // Group errors by field
  const errorsByField = structuredErrors.reduce((acc, error) => {
    if (!acc[error.field]) {
      acc[error.field] = [];
    }
    acc[error.field].push(error);
    return acc;
  }, {} as Record<string, ValidationError[]>);

  // Calculate statistics
  const errorStats = {
    totalErrors: validationResult.criticalErrors.length,
    totalWarnings: validationResult.warnings.length,
    successRate: Math.round((validationResult.validRows / validationResult.totalRows) * 100),
    failureRate: Math.round(((validationResult.totalRows - validationResult.validRows) / validationResult.totalRows) * 100),
    mostProblematicField: Object.entries(errorsByField).sort((a, b) => b[1].length - a[1].length)[0]?.[0] || 'None'
  };

  const getActionRecommendations = () => {
    const recommendations = [];
    
    if (validationResult.validRows === 0) {
      recommendations.push({
        type: 'critical',
        title: 'No Valid Data Found',
        description: 'All rows have critical errors. Check your field mappings and CSV data.',
        action: 'Review mapping configuration'
      });
    } else if (validationResult.validRows < validationResult.totalRows * 0.5) {
      recommendations.push({
        type: 'warning',
        title: 'Low Success Rate',
        description: `Only ${errorStats.successRate}% of rows are valid. Consider cleaning your data.`,
        action: 'Clean CSV data or proceed with partial import'
      });
    } else if (validationResult.validRows > 0) {
      recommendations.push({
        type: 'success',
        title: 'Ready for Import',
        description: `${validationResult.validRows} valid records ready for import.`,
        action: 'Proceed with import'
      });
    }

    if (Object.keys(errorsByField).length > 0) {
      recommendations.push({
        type: 'info',
        title: 'Field-Specific Issues',
        description: `Most issues in: ${errorStats.mostProblematicField}`,
        action: 'Review field mapping and data quality'
      });
    }

    return recommendations;
  };

  const recommendations = getActionRecommendations();

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Enhanced Validation Analysis - {file.name}
        </CardTitle>
        <CardDescription>
          Detailed breakdown of data quality and validation issues
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="errors">Errors ({validationResult.criticalErrors.length})</TabsTrigger>
            <TabsTrigger value="warnings">Warnings ({validationResult.warnings.length})</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Statistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-2xl font-bold">{validationResult.totalRows}</div>
                <div className="text-sm text-muted-foreground">Total Rows</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{validationResult.validRows}</div>
                <div className="text-sm text-muted-foreground">Valid ({errorStats.successRate}%)</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{errorStats.totalErrors}</div>
                <div className="text-sm text-muted-foreground">Critical Errors</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{errorStats.totalWarnings}</div>
                <div className="text-sm text-muted-foreground">Warnings</div>
              </div>
            </div>

            {/* Field Error Breakdown */}
            {Object.keys(errorsByField).length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Errors by Field</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.entries(errorsByField).map(([field, errors]) => (
                    <div key={field} className="flex items-center justify-between p-2 bg-red-50 rounded border border-red-200">
                      <span className="font-medium text-red-800">{field}</span>
                      <Badge variant="destructive">{errors.length} errors</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Success Rate Indicator */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">Success Rate</span>
                <span className="text-sm">{errorStats.successRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full ${
                    errorStats.successRate >= 80 ? 'bg-green-500' : 
                    errorStats.successRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${errorStats.successRate}%` }}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="errors" className="space-y-4">
            {validationResult.criticalErrors.length === 0 ? (
              <div className="text-center py-8 text-green-600">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium">No Critical Errors Found</h3>
                <p>All data passed validation checks!</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-64 overflow-y-auto">
                  {validationResult.criticalErrors.slice(0, 50).map((error, index) => (
                    <div key={index} className="text-sm text-red-700 mb-2 p-2 bg-white rounded">
                      <span className="font-medium">Error {index + 1}:</span> {error}
                    </div>
                  ))}
                  {validationResult.criticalErrors.length > 50 && (
                    <div className="text-sm text-red-600 italic text-center mt-2">
                      ... and {validationResult.criticalErrors.length - 50} more errors (download full report)
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="warnings" className="space-y-4">
            {validationResult.warnings.length === 0 ? (
              <div className="text-center py-8 text-green-600">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium">No Warnings Found</h3>
                <p>Data quality looks excellent!</p>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-h-64 overflow-y-auto">
                {validationResult.warnings.slice(0, 30).map((warning, index) => (
                  <div key={index} className="text-sm text-yellow-700 mb-2 p-2 bg-white rounded">
                    <span className="font-medium">Warning {index + 1}:</span> {warning}
                  </div>
                ))}
                {validationResult.warnings.length > 30 && (
                  <div className="text-sm text-yellow-600 italic text-center mt-2">
                    ... and {validationResult.warnings.length - 30} more warnings
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="actions" className="space-y-4">
            {/* Recommendations */}
            <div className="space-y-3">
              <h4 className="font-medium">Recommendations</h4>
              {recommendations.map((rec, index) => (
                <Alert key={index} className={
                  rec.type === 'critical' ? 'border-red-200 bg-red-50' :
                  rec.type === 'warning' ? 'border-yellow-200 bg-yellow-50' :
                  rec.type === 'success' ? 'border-green-200 bg-green-50' :
                  'border-blue-200 bg-blue-50'
                }>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div className="font-medium">{rec.title}</div>
                      <div className="text-sm">{rec.description}</div>
                      <div className="text-xs italic">Action: {rec.action}</div>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-4 border-t">
              <h4 className="font-medium">Available Actions</h4>
              <div className="flex flex-wrap gap-3">
                {validationResult.validRows > 0 && (
                  <Button 
                    onClick={() => onImport(file)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Import {validationResult.validRows} Valid Records
                  </Button>
                )}
                
                <Button 
                  variant="outline"
                  onClick={() => onDownloadErrorReport(file)}
                  className="border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Error Report
                </Button>
                
                <Button 
                  variant="outline"
                  className="border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Configure Data Cleaning
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};