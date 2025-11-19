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
import { Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useState } from "react";

interface DataPreviewProps {
  data: any[];
  headers: string[];
  fileName: string;
  fileType: string;
  fieldMappings?: { [key: string]: string };
}

export const DataPreview: React.FC<DataPreviewProps> = ({
  data,
  headers,
  fileName,
  fileType,
  fieldMappings
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewRows, setPreviewRows] = useState(5);
  
  // Analyze data quality
  const dataQuality = React.useMemo(() => {
    const totalRows = data.length;
    const columnStats = headers.map(header => {
      const emptyCount = data.filter(row => !row[header] || row[header] === '' || row[header] === null).length;
      const nonEmptyCount = totalRows - emptyCount;
      return {
        header,
        emptyCount,
        nonEmptyCount,
        emptyPercent: (emptyCount / totalRows) * 100,
        isMapped: fieldMappings && Object.keys(fieldMappings).includes(header)
      };
    });

    // Find required fields that are mapped but have empty data
    const requiredFields = fileType === 'sales_reps' 
      ? ['rep_id', 'name'] 
      : fileType === 'accounts' 
      ? ['sfdc_account_id', 'account_name']
      : ['sfdc_opportunity_id', 'sfdc_account_id'];

    const mappedRequiredFields = requiredFields.filter(field => 
      fieldMappings && Object.values(fieldMappings).includes(field)
    );

    const problematicColumns = columnStats.filter(stat => 
      stat.isMapped && stat.emptyPercent > 10
    );

    return {
      totalRows,
      columnStats,
      problematicColumns,
      mappedRequiredFields
    };
  }, [data, headers, fieldMappings, fileType]);

  const getQualityBadge = (emptyPercent: number) => {
    if (emptyPercent === 0) return <Badge variant="default" className="bg-green-100 text-green-800">Perfect</Badge>;
    if (emptyPercent < 5) return <Badge variant="default" className="bg-blue-100 text-blue-800">Good</Badge>;
    if (emptyPercent < 20) return <Badge variant="secondary">Fair</Badge>;
    return <Badge variant="destructive">Poor</Badge>;
  };

  return (
    <Card className="border-blue-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Data Preview - {fileName}
            </CardTitle>
            <CardDescription>
              Sample of your CSV data with quality analysis
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
        </div>
      </CardHeader>
      
      {showPreview && (
        <CardContent className="space-y-4">
          {/* Data Quality Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/20 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold">{dataQuality.totalRows}</div>
              <div className="text-sm text-muted-foreground">Total Rows</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{headers.length}</div>
              <div className="text-sm text-muted-foreground">Columns</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {dataQuality.columnStats.filter(s => s.emptyPercent === 0).length}
              </div>
              <div className="text-sm text-muted-foreground">Perfect Columns</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {dataQuality.problematicColumns.length}
              </div>
              <div className="text-sm text-muted-foreground">Issues Found</div>
            </div>
          </div>

          {/* Column Quality Analysis */}
          {dataQuality.problematicColumns.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Data Quality Issues
              </h4>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                {dataQuality.problematicColumns.map(column => (
                  <div key={column.header} className="flex items-center justify-between text-sm py-1">
                    <span className="font-medium">{column.header}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-orange-700">
                        {column.emptyCount} empty ({Math.round(column.emptyPercent)}%)
                      </span>
                      {getQualityBadge(column.emptyPercent)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sample Data Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Sample Data</h4>
              <div className="flex items-center gap-2">
                <label className="text-sm">Show:</label>
                <select 
                  className="text-sm border rounded px-2 py-1"
                  value={previewRows}
                  onChange={(e) => setPreviewRows(Number(e.target.value))}
                >
                  <option value={5}>5 rows</option>
                  <option value={10}>10 rows</option>
                  <option value={20}>20 rows</option>
                </select>
              </div>
            </div>
            
            <div className="border rounded-lg max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {headers.map(header => (
                      <TableHead key={header} className="min-w-32">
                        <div className="space-y-1">
                          <span className={fieldMappings && Object.keys(fieldMappings).includes(header) ? 'font-semibold text-blue-600' : ''}>
                            {header}
                          </span>
                          {fieldMappings && Object.keys(fieldMappings).includes(header) && (
                            <Badge variant="outline" className="text-xs">
                              → {fieldMappings[header]}
                            </Badge>
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.slice(0, previewRows).map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      {headers.map(header => {
                        const value = row[header];
                        const isEmpty = !value || value === '' || value === null;
                        const isMapped = fieldMappings && Object.keys(fieldMappings).includes(header);
                        
                        return (
                          <TableCell key={header} className={isEmpty && isMapped ? 'bg-red-50' : ''}>
                            {isEmpty ? (
                              <span className="text-muted-foreground italic">
                                {isMapped ? '⚠️ Empty' : 'Empty'}
                              </span>
                            ) : (
                              <span className={isMapped ? 'font-medium' : ''}>
                                {String(value).substring(0, 30)}
                                {String(value).length > 30 && '...'}
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};