import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AssignmentWarning {
  severity: 'low' | 'medium' | 'high';
  type: 'continuity_broken' | 'cross_region' | 'cre_risk' | 'tier_concentration' | 'unassigned' | 'parent_child_separated' | 'strategic_overflow';
  accountOrRep: string;
  reason: string;
  details: string;
}

interface AssignmentWarningsProps {
  warnings: AssignmentWarning[];
}

const severityConfig = {
  high: { label: 'High', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: AlertTriangle },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', icon: AlertCircle },
  low: { label: 'Low', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Info }
};

const typeLabels: Record<string, string> = {
  continuity_broken: 'Continuity Broken',
  cross_region: 'Cross-Region',
  cre_risk: 'CRE Risk',
  tier_concentration: 'Tier Concentration',
  unassigned: 'Unassigned',
  parent_child_separated: 'Parent-Child Separated',
  strategic_overflow: 'Strategic Overflow'
};

export const AssignmentWarnings: React.FC<AssignmentWarningsProps> = ({ warnings }) => {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const filteredWarnings = warnings.filter(warning => {
    if (severityFilter !== 'all' && warning.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && warning.type !== typeFilter) return false;
    return true;
  });

  const warningCounts = {
    high: warnings.filter(w => w.severity === 'high').length,
    medium: warnings.filter(w => w.severity === 'medium').length,
    low: warnings.filter(w => w.severity === 'low').length
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Assignment Warnings
            </CardTitle>
            <CardDescription>
              {warnings.length} warnings detected during assignment process
            </CardDescription>
          </div>
          
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950">
              High: {warningCounts.high}
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950">
              Medium: {warningCounts.medium}
            </Badge>
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950">
              Low: {warningCounts.low}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Severity:</span>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Type:</span>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="continuity_broken">Continuity Broken</SelectItem>
                <SelectItem value="cross_region">Cross-Region</SelectItem>
                <SelectItem value="cre_risk">CRE Risk</SelectItem>
                <SelectItem value="tier_concentration">Tier Concentration</SelectItem>
                <SelectItem value="strategic_overflow">Strategic Overflow</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Warnings Table */}
        {filteredWarnings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No warnings match the selected filters
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Severity</TableHead>
                <TableHead className="w-48">Type</TableHead>
                <TableHead>Account / Rep</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWarnings.map((warning, index) => {
                const config = severityConfig[warning.severity];
                const Icon = config.icon;
                const isExpanded = expandedRows.has(index);
                
                return (
                  <React.Fragment key={index}>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(index)}>
                      <TableCell>
                        <Badge variant="outline" className={config.className}>
                          <Icon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {typeLabels[warning.type] || warning.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{warning.accountOrRep}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{warning.reason}</div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30">
                          <div className="p-4 space-y-2">
                            <div className="text-sm font-medium">Details:</div>
                            <div className="text-sm text-muted-foreground">{warning.details}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
