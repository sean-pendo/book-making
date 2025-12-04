import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Settings2, Loader2, Eye, Trash2, Database, FileText, Users, Upload, AlertTriangle } from "lucide-react";

interface EnhancedValidationResultsProps {
  file: {
    id: string;
    name: string;
    type: string;
    status?: string;
    validationResult?: {
      totalRows: number;
      validRows: number;
      warnings: string[];
      criticalErrors: string[];
      errors: string[];
    };
    fieldMappings?: { [key: string]: string };
    importProgress?: { processed: number; total: number };
  };
  onImport: (file: any) => void;
  onDownloadErrorReport: (file: any) => void;
  onReconfigureMapping?: () => void;
  onPreview?: (file: any) => void;
  onDelete?: (file: any) => void;
  onViewErrors?: (file: any) => void;
  isImporting?: boolean;
}

// Circular Progress component
const CircularProgress: React.FC<{ progress: number; size?: number }> = ({ progress, size = 40 }) => {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-300"
        />
      </svg>
      <span className="absolute text-xs font-bold">{Math.round(progress)}%</span>
    </div>
  );
};

export const EnhancedValidationResults: React.FC<EnhancedValidationResultsProps> = ({
  file,
  onImport,
  onReconfigureMapping,
  onPreview,
  onDelete,
  onViewErrors,
  isImporting = false
}) => {
  if (!file.validationResult) {
    return null;
  }

  const { validationResult } = file;
  const successRate = Math.round((validationResult.validRows / validationResult.totalRows) * 100);
  const hasErrors = validationResult.criticalErrors.length > 0;
  const isReady = validationResult.validRows > 0 && file.status !== 'completed';

  // Get file type icon and label
  const getFileTypeInfo = (type: string) => {
    switch (type) {
      case 'accounts':
        return { icon: Database, label: 'Accounts', textColor: 'text-blue-500' };
      case 'opportunities':
        return { icon: FileText, label: 'Opportunities', textColor: 'text-purple-500' };
      case 'sales_reps':
        return { icon: Users, label: 'Sales Reps', textColor: 'text-green-500' };
      default:
        return { icon: FileText, label: type, textColor: 'text-muted-foreground' };
    }
  };

  const typeInfo = getFileTypeInfo(file.type);
  const TypeIcon = typeInfo.icon;

  return (
    <Card>
      <CardContent className="pt-6">
        {/* File Type Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 font-medium ${typeInfo.textColor}`}>
              <TypeIcon className="w-4 h-4" />
              <span>{typeInfo.label}</span>
            </div>
            <span className="text-sm font-medium text-muted-foreground">{file.name}</span>
          </div>
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={() => onDelete(file)} className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Simple Stats Row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{validationResult.totalRows.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{validationResult.validRows.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Valid</div>
            </div>
            {hasErrors && (
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{validationResult.criticalErrors.length}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
            )}
          </div>
          
          {/* Success indicator */}
          <div className="flex items-center gap-2">
            {successRate === 100 ? (
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            ) : hasErrors ? (
              <XCircle className="w-8 h-8 text-red-500" />
            ) : (
              <CheckCircle2 className="w-8 h-8 text-yellow-500" />
            )}
            <span className="text-2xl font-bold">{successRate}%</span>
          </div>
        </div>

        {/* Progress bar - shows validation success rate OR import progress */}
        {isImporting && file.importProgress ? (
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-primary">Importing...</span>
              <span className="text-muted-foreground">
                {file.importProgress.processed.toLocaleString()} / {file.importProgress.total.toLocaleString()} records
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div 
                className="h-3 rounded-full bg-primary transition-all duration-300 animate-pulse"
                style={{ width: `${(file.importProgress.processed / file.importProgress.total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="w-full bg-muted rounded-full h-2 mb-4">
            <div 
              className={`h-2 rounded-full transition-all ${
                successRate === 100 ? 'bg-green-500' : 
                successRate >= 80 ? 'bg-green-400' : 
                successRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${successRate}%` }}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {isReady 
              ? `${validationResult.validRows.toLocaleString()} records ready to import`
              : file.status === 'completed' 
                ? 'Data imported successfully'
                : 'Fix errors before importing'
            }
          </div>
          <div className="flex gap-2">
            {onPreview && (
              <Button variant="outline" size="sm" onClick={() => onPreview(file)}>
                <Eye className="w-4 h-4 mr-1" />
                Preview
              </Button>
            )}
            {onReconfigureMapping && (
              <Button variant="outline" size="sm" onClick={onReconfigureMapping}>
                <Settings2 className="w-4 h-4 mr-1" />
                Reconfigure
              </Button>
            )}
            {hasErrors && onViewErrors && (
              <Button variant="outline" size="sm" onClick={() => onViewErrors(file)} className="text-destructive border-destructive/50 hover:bg-destructive/10">
                <AlertTriangle className="w-4 h-4 mr-1" />
                View Errors
              </Button>
            )}
            {isReady && (
              <Button size="sm" onClick={() => onImport(file)} disabled={isImporting}>
                {isImporting ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-1" /> Import Data</>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
