import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, TrendingDown, Building2, DollarSign, ArrowUpRight, ArrowDownRight, Eye, Users, UserPlus } from 'lucide-react';
import { calculateBookImpact, formatImpactCurrency, formatSignedNumber, formatSignedCurrency, BookImpact } from '@/utils/bookImpactCalculations';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BookImpactSummaryProps {
  buildId: string;
  managerName: string;
  managerLevel: 'FLM' | 'SLM';
  visibleFlms?: string[];
  compact?: boolean; // For smaller display
}

export default function BookImpactSummary({
  buildId,
  managerName,
  managerLevel,
  visibleFlms,
  compact = false,
}: BookImpactSummaryProps) {
  const [showGainedModal, setShowGainedModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);

  const { data: impact, isLoading, error } = useQuery<BookImpact>({
    queryKey: ['book-impact', buildId, managerName, managerLevel, visibleFlms],
    queryFn: () => calculateBookImpact(buildId, managerName, managerLevel, visibleFlms),
    enabled: !!buildId && !!managerName,
    staleTime: 30000, // Cache for 30 seconds
  });

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <CardContent className="py-4 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !impact) {
    return null; // Fail silently
  }

  const hasChanges = impact.netAccountChange !== 0 || impact.netArrChange !== 0;
  const isPositive = impact.netArrChange >= 0;

  if (compact) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className={impact.netAccountChange > 0 ? 'text-green-600' : impact.netAccountChange < 0 ? 'text-red-600' : ''}>
                {formatSignedNumber(impact.netAccountChange)} accounts
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>+{impact.accountsGained} gained, -{impact.accountsLost} lost</p>
          </TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className={impact.netArrChange > 0 ? 'text-green-600' : impact.netArrChange < 0 ? 'text-red-600' : ''}>
                {formatSignedCurrency(impact.netArrChange)} ARR
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>+{formatImpactCurrency(impact.arrGained)} gained, -{formatImpactCurrency(impact.arrLost)} lost</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <>
      <Card className={`border-2 ${isPositive ? 'border-green-200 dark:border-green-900 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30' : 'border-red-200 dark:border-red-900 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30'}`}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            {/* Net Change Summary */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                {isPositive ? (
                  <TrendingUp className="w-6 h-6 text-green-600" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-600" />
                )}
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Net Book Change</div>
                  <div className={`text-xl font-bold ${isPositive ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {formatSignedCurrency(impact.netArrChange)}
                  </div>
                </div>
              </div>

              <div className="h-10 w-px bg-border" />

              {/* Accounts - Total with Parent label */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <div className="text-xs text-muted-foreground">Parent Accounts</div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{impact.accountsBefore}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-semibold">{impact.accountsAfter}</span>
                      <Badge variant={impact.netAccountChange >= 0 ? 'default' : 'destructive'} className="text-xs">
                        {formatSignedNumber(impact.netAccountChange)}
                      </Badge>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">Total: {impact.accountsBefore} → {impact.accountsAfter}</p>
                  <p className="text-xs text-muted-foreground">Customers: {impact.customersBefore} → {impact.customersAfter}</p>
                  <p className="text-xs text-muted-foreground">Prospects: {impact.prospectsBefore} → {impact.prospectsAfter}</p>
                </TooltipContent>
              </Tooltip>

              <div className="h-10 w-px bg-border" />

              {/* Customers */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Customers
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{impact.customersBefore}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-semibold">{impact.customersAfter}</span>
                      <span className="text-xs text-muted-foreground">
                        ({formatImpactCurrency(impact.customerArrAfter)})
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Customer ARR: {formatImpactCurrency(impact.customerArrBefore)} → {formatImpactCurrency(impact.customerArrAfter)}</p>
                  <p className="text-xs text-muted-foreground">
                    +{impact.customersGained} gained, -{impact.customersLost} lost
                  </p>
                </TooltipContent>
              </Tooltip>

              <div className="h-10 w-px bg-border" />

              {/* Prospects */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <UserPlus className="w-3 h-3" />
                      Prospects
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{impact.prospectsBefore}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-semibold">{impact.prospectsAfter}</span>
                      <span className="text-xs text-muted-foreground">
                        ({formatImpactCurrency(impact.prospectArrAfter)})
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Prospect ATR: {formatImpactCurrency(impact.prospectArrBefore)} → {formatImpactCurrency(impact.prospectArrAfter)}</p>
                  <p className="text-xs text-muted-foreground">
                    +{impact.prospectsGained} gained, -{impact.prospectsLost} lost
                  </p>
                </TooltipContent>
              </Tooltip>

              <div className="h-10 w-px bg-border" />

              {/* ARR */}
              <div>
                <div className="text-xs text-muted-foreground">Total ARR</div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatImpactCurrency(impact.arrBefore)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold">{formatImpactCurrency(impact.arrAfter)}</span>
                </div>
              </div>
            </div>

            {/* Gained/Lost Breakdown - Now Clickable */}
            <div className="flex items-center gap-3">
              {impact.accountsGained > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowGainedModal(true)}
                  className="gap-2 text-green-600 hover:text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span className="font-semibold">+{impact.accountsGained}</span>
                  <span className="text-muted-foreground">({formatImpactCurrency(impact.arrGained)})</span>
                  <Eye className="w-3 h-3 ml-1 opacity-60" />
                </Button>
              )}
              
              {impact.accountsLost > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLostModal(true)}
                  className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  <ArrowDownRight className="w-4 h-4" />
                  <span className="font-semibold">-{impact.accountsLost}</span>
                  <span className="text-muted-foreground">({formatImpactCurrency(impact.arrLost)})</span>
                  <Eye className="w-3 h-3 ml-1 opacity-60" />
                </Button>
              )}

              {!hasChanges && (
                <Badge variant="secondary">No changes</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accounts Gained Modal */}
      <Dialog open={showGainedModal} onOpenChange={setShowGainedModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <ArrowUpRight className="w-5 h-5" />
              Accounts Gained ({impact.accountsGained})
            </DialogTitle>
            <DialogDescription>
              Accounts being added to your book. Total ARR: {formatImpactCurrency(impact.arrGained)}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px]">
            {impact.gainedAccounts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No accounts gained</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">ARR</TableHead>
                    <TableHead>Coming From</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {impact.gainedAccounts.map((account) => (
                    <TableRow key={account.sfdc_account_id}>
                      <TableCell className="font-medium">{account.account_name}</TableCell>
                      <TableCell>
                        <Badge variant={account.is_customer ? 'default' : 'secondary'} className="text-xs">
                          {account.is_customer ? 'Customer' : 'Prospect'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatImpactCurrency(account.arr)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {account.from_owner_name || 'Unassigned'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Accounts Lost Modal */}
      <Dialog open={showLostModal} onOpenChange={setShowLostModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <ArrowDownRight className="w-5 h-5" />
              Accounts Lost ({impact.accountsLost})
            </DialogTitle>
            <DialogDescription>
              Accounts leaving your book. Total ARR: {formatImpactCurrency(impact.arrLost)}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px]">
            {impact.lostAccounts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No accounts lost</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">ARR</TableHead>
                    <TableHead>Going To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {impact.lostAccounts.map((account) => (
                    <TableRow key={account.sfdc_account_id} className="bg-red-50/50 dark:bg-red-950/20">
                      <TableCell className="font-medium">{account.account_name}</TableCell>
                      <TableCell>
                        <Badge variant={account.is_customer ? 'default' : 'secondary'} className="text-xs">
                          {account.is_customer ? 'Customer' : 'Prospect'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        {formatImpactCurrency(account.arr)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {account.to_owner_name || 'Unassigned'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
