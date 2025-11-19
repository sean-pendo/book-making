import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface RuleExecutionSummary {
  ruleName: string;
  accountsProcessed: number;
  accountsAssigned: number;
  percentOfTotal: number;
}

interface AssignmentExecutionSummaryProps {
  summary: RuleExecutionSummary[];
  totalAccounts: number;
}

export const AssignmentExecutionSummary: React.FC<AssignmentExecutionSummaryProps> = ({
  summary,
  totalAccounts
}) => {
  const getRuleIcon = (ruleName: string) => {
    if (ruleName.includes('GEO')) return '🌍';
    if (ruleName.includes('CRE')) return '⚠️';
    if (ruleName.includes('TIER')) return '📊';
    if (ruleName.includes('CONTINUITY')) return '🔗';
    if (ruleName.includes('AI')) return '🤖';
    return '📋';
  };

  const getRuleStatus = (summary: RuleExecutionSummary) => {
    if (summary.accountsAssigned > 0) {
      return <Badge variant="default" className="bg-green-500">✅ Active</Badge>;
    }
    if (summary.accountsProcessed > 0 && summary.accountsAssigned === 0) {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600">⚠️ Processed but no assignments</Badge>;
    }
    return <Badge variant="outline" className="border-gray-400">ℹ️ Not reached</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="w-5 h-5" />
          Rule Execution Summary
        </CardTitle>
        <CardDescription>
          Breakdown of how many accounts each rule processed and assigned
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead className="text-right">Accounts Assigned</TableHead>
              <TableHead className="text-right">% of Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.map((rule) => (
              <TableRow key={rule.ruleName}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getRuleIcon(rule.ruleName)}</span>
                    <span className="font-medium">{rule.ruleName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {rule.accountsAssigned}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {rule.percentOfTotal.toFixed(1)}%
                </TableCell>
                <TableCell>
                  {getRuleStatus(rule)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-bold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right font-mono">
                {summary.reduce((sum, r) => sum + r.accountsAssigned, 0)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {summary.reduce((sum, r) => sum + r.percentOfTotal, 0).toFixed(1)}%
              </TableCell>
              <TableCell>
                <Badge variant="default">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Complete
                </Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {summary.some(s => s.accountsProcessed > 0 && s.accountsAssigned === 0) && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Note:</strong> Some rules processed accounts but made no assignments. 
                This typically happens when earlier rules already assigned all eligible accounts, 
                or when rule conditions weren't met.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
