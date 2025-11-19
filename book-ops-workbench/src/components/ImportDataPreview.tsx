import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, AlertTriangle, Edit, Trash2, Download, FileText, Settings, Eye } from 'lucide-react';
import { ParsedCSVResult, DataQualityCheck } from '@/utils/enhancedCsvParser';
import { CleaningResult, DataCleaner } from '@/utils/dataCleaningUtils';
import { useToast } from '@/components/ui/use-toast';

interface ImportDataPreviewProps {
  parsedData: ParsedCSVResult;
  qualityChecks: DataQualityCheck[];
  fieldMappings: { [csvField: string]: string };
  onFieldMappingChange: (csvField: string, schemaField: string) => void;
  onDataEdit: (rowIndex: number, field: string, value: any) => void;
  onDataClean: (field: string, cleaningType: string) => void;
  onExportCleanedData: () => void;
  availableSchemaFields: string[];
  fileType: 'accounts' | 'opportunities' | 'sales_reps';
}

interface EditingCell {
  row: number;
  field: string;
  value: any;
}

export const ImportDataPreview: React.FC<ImportDataPreviewProps> = ({
  parsedData,
  qualityChecks,
  fieldMappings,
  onFieldMappingChange,
  onDataEdit,
  onDataClean,
  onExportCleanedData,
  availableSchemaFields,
  fileType
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [showCleaningDialog, setShowCleaningDialog] = useState(false);
  const [selectedField, setSelectedField] = useState<string>('');
  const [cleaningResults, setCleaningResults] = useState<{ [field: string]: CleaningResult[] }>({});

  // Memoized calculations for performance
  const previewData = useMemo(() => {
    return parsedData.data.slice(0, 100); // Show first 100 rows for preview
  }, [parsedData.data]);

  const errorStats = useMemo(() => {
    const critical = parsedData.errors.filter(e => e.severity === 'critical').length;
    const warnings = parsedData.errors.filter(e => e.severity === 'warning').length;
    const total = parsedData.errors.length;
    return { critical, warnings, total };
  }, [parsedData.errors]);

  const mappingCompleteness = useMemo(() => {
    const totalFields = parsedData.headers.length;
    const mappedFields = Object.keys(fieldMappings).length;
    return { mapped: mappedFields, total: totalFields, percentage: (mappedFields / totalFields) * 100 };
  }, [parsedData.headers, fieldMappings]);

  const handleCellEdit = (rowIndex: number, field: string, currentValue: any) => {
    setEditingCell({ row: rowIndex, field, value: currentValue });
    setShowEditDialog(true);
  };

  const saveEdit = () => {
    if (editingCell) {
      onDataEdit(editingCell.row, editingCell.field, editingCell.value);
      setShowEditDialog(false);
      setEditingCell(null);
      toast({
        title: "Data Updated",
        description: `Cell value has been updated successfully.`
      });
    }
  };

  const handleFieldCleaning = async (field: string, cleaningType: string) => {
    try {
      const result = DataCleaner.applyFieldCleaning(parsedData.data, field, cleaningType);
      setCleaningResults(prev => ({ ...prev, [field]: result.cleaningResults }));
      onDataClean(field, cleaningType);
      
      toast({
        title: "Data Cleaning Applied",
        description: `${result.summary.successfulCleanings} out of ${result.summary.totalProcessed} records cleaned (${result.summary.cleaningRate.toFixed(1)}% success rate).`
      });
    } catch (error) {
      toast({
        title: "Cleaning Failed",
        description: error instanceof Error ? error.message : "An error occurred during data cleaning.",
        variant: "destructive"
      });
    }
  };

  const getFieldQuality = (fieldName: string) => {
    const check = qualityChecks.find(q => q.fieldName === fieldName);
    if (!check) return null;

    const emptyRate = (check.emptyCount / check.totalCount) * 100;
    const uniqueRate = (check.uniqueCount / check.totalCount) * 100;
    
    let quality: 'excellent' | 'good' | 'fair' | 'poor' = 'excellent';
    
    if (emptyRate > 50 || check.possibleIssues.length > 2) quality = 'poor';
    else if (emptyRate > 25 || check.possibleIssues.length > 1) quality = 'fair';
    else if (emptyRate > 10 || check.possibleIssues.length > 0) quality = 'good';

    return { ...check, emptyRate, uniqueRate, quality };
  };

  const getQualityBadgeVariant = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'default';
      case 'good': return 'secondary';
      case 'fair': return 'outline';
      case 'poor': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Data Preview & Quality Analysis
            </CardTitle>
            <CardDescription>
              Review your data quality, fix issues, and verify field mappings before import
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onExportCleanedData}>
              <Download className="h-4 w-4 mr-2" />
              Export Cleaned
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowCleaningDialog(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Data Cleaning
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="quality">Data Quality</TabsTrigger>
            <TabsTrigger value="mappings">Field Mappings</TabsTrigger>
            <TabsTrigger value="preview">Data Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{parsedData.totalRows}</div>
                  <div className="text-sm text-muted-foreground">Total Rows</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-600">{parsedData.validRows}</div>
                  <div className="text-sm text-muted-foreground">Valid Rows</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-orange-600">{errorStats.warnings}</div>
                  <div className="text-sm text-muted-foreground">Warnings</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-red-600">{errorStats.critical}</div>
                  <div className="text-sm text-muted-foreground">Critical Errors</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">File Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span>Delimiter:</span>
                    <code className="bg-muted px-2 py-1 rounded">{parsedData.delimiter}</code>
                  </div>
                  <div className="flex justify-between">
                    <span>Encoding:</span>
                    <span>{parsedData.encoding}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Headers:</span>
                    <span>{parsedData.headers.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Quoted Fields:</span>
                    <span>{parsedData.hasQuotedFields ? 'Yes' : 'No'}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Mapping Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Fields Mapped</span>
                      <span>{mappingCompleteness.mapped}/{mappingCompleteness.total}</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${mappingCompleteness.percentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {mappingCompleteness.percentage.toFixed(1)}% complete
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {errorStats.total > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Found {errorStats.total} issues in your data. 
                  {errorStats.critical > 0 && (
                    <span className="text-destructive font-medium">
                      {' '}{errorStats.critical} critical errors must be resolved before import.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="quality" className="space-y-4">
            <div className="space-y-4">
              {qualityChecks.map((check) => {
                const quality = getFieldQuality(check.fieldName);
                if (!quality) return null;

                return (
                  <Card key={check.fieldName}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{check.fieldName}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant={getQualityBadgeVariant(quality.quality)}>
                            {quality.quality}
                          </Badge>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedField(check.fieldName);
                              setShowCleaningDialog(true);
                            }}
                          >
                            <Settings className="h-3 w-3 mr-1" />
                            Clean
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="font-medium">Empty Rate</div>
                          <div className="text-muted-foreground">{quality.emptyRate.toFixed(1)}%</div>
                        </div>
                        <div>
                          <div className="font-medium">Unique Values</div>
                          <div className="text-muted-foreground">{quality.uniqueCount}</div>
                        </div>
                        <div>
                          <div className="font-medium">Data Types</div>
                          <div className="text-muted-foreground">
                            {Object.keys(quality.dataTypes).join(', ')}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">Sample Values</div>
                          <div className="text-muted-foreground text-xs">
                            {quality.sampleValues.slice(0, 2).join(', ')}
                            {quality.sampleValues.length > 2 && '...'}
                          </div>
                        </div>
                      </div>
                      {quality.possibleIssues.length > 0 && (
                        <div className="mt-3 p-2 bg-orange-50 rounded-md">
                          <div className="text-sm font-medium text-orange-800">Issues Found:</div>
                          <ul className="text-sm text-orange-700 list-disc list-inside">
                            {quality.possibleIssues.map((issue, idx) => (
                              <li key={idx}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="mappings" className="space-y-4">
            <div className="space-y-4">
              {parsedData.headers.map((header) => (
                <div key={header} className="flex items-center gap-4 p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{header}</div>
                    <div className="text-sm text-muted-foreground">
                      CSV Field
                    </div>
                  </div>
                  <div className="flex-1">
                    <Select
                      value={fieldMappings[header] || ''}
                      onValueChange={(value) => onFieldMappingChange(header, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select database field..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">-- No Mapping --</SelectItem>
                        {availableSchemaFields.map((field) => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-16">
                    {fieldMappings[header] ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <div className="h-5 w-5" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            <ScrollArea className="h-96 w-full border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {parsedData.headers.map((header) => (
                      <TableHead key={header} className="min-w-32">
                        <div className="space-y-1">
                          <div>{header}</div>
                          {fieldMappings[header] && (
                            <div className="text-xs text-muted-foreground">
                              → {fieldMappings[header]}
                            </div>
                          )}
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-12">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {rowIndex + 1}
                      </TableCell>
                      {parsedData.headers.map((header) => (
                        <TableCell 
                          key={header}
                          className="max-w-32 truncate cursor-pointer hover:bg-muted/50"
                          onClick={() => handleCellEdit(rowIndex, header, row[header])}
                        >
                          <div className="flex items-center gap-1">
                            <span className="truncate">{String(row[header])}</span>
                            <Edit className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                          </div>
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button size="sm" variant="ghost">
                          <Edit className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            {parsedData.data.length > 100 && (
              <div className="text-sm text-muted-foreground text-center">
                Showing first 100 rows of {parsedData.data.length} total rows
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Edit Cell Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cell Value</DialogTitle>
            <DialogDescription>
              Update the value for {editingCell?.field} in row {(editingCell?.row ?? 0) + 1}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cell-value">Value</Label>
              <Input
                id="cell-value"
                value={editingCell?.value || ''}
                onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Data Cleaning Dialog */}
      <Dialog open={showCleaningDialog} onOpenChange={setShowCleaningDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Data Cleaning Tools</DialogTitle>
            <DialogDescription>
              Apply automated cleaning rules to improve data quality
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cleaning-field">Field to Clean</Label>
              <Select
                value={selectedField}
                onValueChange={setSelectedField}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field to clean..." />
                </SelectTrigger>
                <SelectContent>
                  {parsedData.headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedField && (
              <div className="space-y-3">
                <Label>Available Cleaning Rules</Label>
                <div className="space-y-2">
                  {DataCleaner.getAvailableCleaningRules().map((rule) => (
                    <div key={rule.rule} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{rule.description}</div>
                        <div className="text-sm text-muted-foreground">
                          Type: {rule.type} | Examples: {rule.examples?.join(', ') || 'No examples'}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleFieldCleaning(selectedField, rule.field)}
                      >
                        Apply
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCleaningDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};