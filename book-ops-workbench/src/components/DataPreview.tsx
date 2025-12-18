import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CircleSlash, CheckCircle2 } from "lucide-react";
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
  const [previewRows, setPreviewRows] = useState(20);
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  
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
        emptyPercent: totalRows > 0 ? (emptyCount / totalRows) * 100 : 100,
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
    
    // Fields that are completely empty (100% null/empty) - these were likely not mapped during import
    const emptyColumns = columnStats.filter(stat => stat.emptyPercent === 100);
    
    // Fields that have data (populated columns)
    const populatedColumns = columnStats.filter(stat => stat.emptyPercent < 100);

    return {
      totalRows,
      columnStats,
      problematicColumns,
      mappedRequiredFields,
      emptyColumns,
      populatedColumns
    };
  }, [data, headers, fieldMappings, fileType]);

  const getQualityBadge = (emptyPercent: number) => {
    if (emptyPercent === 0) return <Badge variant="default" className="bg-green-100 text-green-800">Perfect</Badge>;
    if (emptyPercent < 5) return <Badge variant="default" className="bg-blue-100 text-blue-800">Good</Badge>;
    if (emptyPercent < 20) return <Badge variant="secondary">Fair</Badge>;
    return <Badge variant="destructive">Poor</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Data Quality Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-muted/20 rounded-lg">
        <div className="text-center">
          <div className="text-2xl font-bold">{dataQuality.totalRows}</div>
          <div className="text-sm text-muted-foreground">Total Rows</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{headers.length}</div>
          <div className="text-sm text-muted-foreground">Total Fields</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {dataQuality.populatedColumns.length}
          </div>
          <div className="text-sm text-muted-foreground">Fields with Data</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-muted-foreground">
            {dataQuality.emptyColumns.length}
          </div>
          <div className="text-sm text-muted-foreground">Empty Fields</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">
            {dataQuality.problematicColumns.length}
          </div>
          <div className="text-sm text-muted-foreground">Partial Data</div>
        </div>
      </div>

      {/* Empty Fields Section - Fields that were not mapped during import */}
      {dataQuality.emptyColumns.length > 0 && (
        <div className="space-y-2">
          <button 
            onClick={() => setShowEmptyFields(!showEmptyFields)}
            className="flex items-center gap-2 text-left w-full hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
          >
            <CircleSlash className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Empty Fields (Not Mapped)</span>
            <Badge variant="secondary" className="ml-auto">
              {dataQuality.emptyColumns.length} fields
            </Badge>
            <span className="text-muted-foreground text-sm">
              {showEmptyFields ? '▼' : '▶'}
            </span>
          </button>
          {showEmptyFields && (
            <div className="bg-muted/30 border rounded-lg p-3 ml-6">
              <div className="flex flex-wrap gap-2">
                {dataQuality.emptyColumns.map(col => (
                  <Badge key={col.header} variant="outline" className="text-muted-foreground">
                    {col.header}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                These fields exist in the database but contain no data. They may not have been mapped during import.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Column Quality Analysis - Fields with partial data */}
      {dataQuality.problematicColumns.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Partial Data Issues
          </h4>
          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
            {dataQuality.problematicColumns.map(column => (
              <div key={column.header} className="flex items-center justify-between text-sm py-1">
                <span className="font-medium">{column.header}</span>
                <div className="flex items-center gap-2">
                  <span className="text-orange-700 dark:text-orange-400">
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
            <label className="text-sm text-muted-foreground">Show:</label>
            <select 
              className="text-sm border rounded px-2 py-1 bg-background"
              value={previewRows}
              onChange={(e) => setPreviewRows(Number(e.target.value))}
            >
              <option value={10}>10 rows</option>
              <option value={20}>20 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
            </select>
          </div>
        </div>
        
        <div className="border rounded-lg overflow-auto" style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '300px' }}>
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-12 bg-background">#</TableHead>
                {headers.slice(0, 15).map(header => (
                  <TableHead key={header} className="min-w-32 bg-background">
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
                {headers.length > 15 && (
                  <TableHead className="bg-background text-muted-foreground">
                    +{headers.length - 15} more columns
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, previewRows).map((row, index) => (
                <TableRow key={index}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  {headers.slice(0, 15).map(header => {
                    const value = row[header];
                    const isEmpty = !value || value === '' || value === null;
                    const isMapped = fieldMappings && Object.keys(fieldMappings).includes(header);
                    
                    return (
                      <TableCell key={header} className={isEmpty && isMapped ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                        {isEmpty ? (
                          <span className="text-muted-foreground italic">
                            {isMapped ? '⚠️ Empty' : '—'}
                          </span>
                        ) : (
                          <span className={isMapped ? 'font-medium' : ''}>
                            {String(value).substring(0, 40)}
                            {String(value).length > 40 && '...'}
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                  {headers.length > 15 && (
                    <TableCell className="text-muted-foreground">...</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {data.length > previewRows && (
          <p className="text-sm text-muted-foreground text-center">
            Showing {previewRows} of {data.length} rows
          </p>
        )}
      </div>
    </div>
  );
};
