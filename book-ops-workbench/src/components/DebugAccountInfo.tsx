import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, CheckCircle, XCircle } from 'lucide-react';

interface Account {
  sfdc_account_id: string;
  account_name: string;
  hierarchy_bookings_arr_converted?: number;
  arr?: number;
  is_customer: boolean;
  is_parent: boolean;
}

interface DebugAccountInfoProps {
  accounts: Account[];
  customerAccounts: Account[];
  prospectAccounts: Account[];
}

export const DebugAccountInfo = ({ accounts, customerAccounts, prospectAccounts }: DebugAccountInfoProps) => {
  // Validation checks
  const totalClassified = customerAccounts.length + prospectAccounts.length;
  const classificationAccurate = totalClassified === accounts.length;
  const customerLogicCorrect = customerAccounts.every(acc => (acc.hierarchy_bookings_arr_converted || 0) > 0);
  const prospectLogicCorrect = prospectAccounts.every(acc => (acc.hierarchy_bookings_arr_converted || 0) === 0);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="w-5 h-5" />
          Account Classification Validation
        </CardTitle>
        <CardDescription>
          Validation of customer/prospect classification logic
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Badge variant="outline">Total Parent Accounts</Badge>
            <div className="text-2xl font-bold">{accounts.length}</div>
          </div>
          <div>
            <Badge variant="default" className="bg-green-500">Customer Accounts</Badge>
            <div className="text-2xl font-bold">{customerAccounts.length}</div>
          </div>
          <div>
            <Badge variant="secondary">Prospect Accounts</Badge>
            <div className="text-2xl font-bold">{prospectAccounts.length}</div>
          </div>
        </div>

        <div className="border rounded p-3 bg-muted/50">
          <h4 className="font-medium text-sm mb-3">ARR Data Explanation</h4>
          <div className="text-xs space-y-2">
            <div className="flex items-center gap-2">
              <Info className="w-3 h-3 text-blue-500" />
              <span><strong>Hierarchy ARR:</strong> Consolidated ARR including parent + child accounts</span>
            </div>
            <div className="flex items-center gap-2">
              <Info className="w-3 h-3 text-blue-500" />
              <span><strong>Regular ARR:</strong> Direct ARR for this specific account only</span>
            </div>
          </div>
        </div>

        <div className="border rounded p-3 bg-muted/30">
          <h4 className="font-medium text-sm mb-3">Classification Logic Validation</h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span>Total accounts classified correctly:</span>
              <div className="flex items-center gap-1">
                {classificationAccurate ? 
                  <CheckCircle className="w-3 h-3 text-green-500" /> : 
                  <XCircle className="w-3 h-3 text-red-500" />
                }
                <span className={classificationAccurate ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {totalClassified}/{accounts.length}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span>Customer logic (Hierarchy ARR &gt; 0):</span>
              <div className="flex items-center gap-1">
                {customerLogicCorrect ? 
                  <CheckCircle className="w-3 h-3 text-green-500" /> : 
                  <XCircle className="w-3 h-3 text-red-500" />
                }
                <span className={customerLogicCorrect ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {customerLogicCorrect ? 'Valid' : 'Invalid'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span>Prospect logic (Hierarchy ARR = 0):</span>
              <div className="flex items-center gap-1">
                {prospectLogicCorrect ? 
                  <CheckCircle className="w-3 h-3 text-green-500" /> : 
                  <XCircle className="w-3 h-3 text-red-500" />
                }
                <span className={prospectLogicCorrect ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {prospectLogicCorrect ? 'Valid' : 'Invalid'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};