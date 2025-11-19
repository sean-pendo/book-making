import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Star } from 'lucide-react';

interface RepWorkloadCardProps {
  rep: any;
  currentARR: number;
  proposedARR: number;
  currentAccounts: number;
  proposedAccounts: number;
  gainingAccounts?: string[];
  losingAccounts?: string[];
  isStrategic?: boolean;
  onClick?: () => void;
}

export const RepWorkloadCard: React.FC<RepWorkloadCardProps> = ({
  rep,
  currentARR,
  proposedARR,
  currentAccounts,
  proposedAccounts,
  gainingAccounts = [],
  losingAccounts = [],
  isStrategic = false,
  onClick
}) => {
  const arrChange = proposedARR - currentARR;
  const changePercent = currentARR > 0 ? (arrChange / currentARR * 100) : 0;
  const accountChange = proposedAccounts - currentAccounts;

  return (
    <Card 
      className="hover:shadow-lg transition-shadow cursor-pointer border-l-4"
      style={{
        borderLeftColor: isStrategic ? 'hsl(var(--primary))' : 'hsl(var(--muted))'
      }}
      onClick={onClick}
    >
      <CardContent className="p-6 space-y-4">
        {/* Rep Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg">{rep.name}</span>
              {isStrategic && (
                <Badge variant="secondary" className="gap-1">
                  <Star className="w-3 h-3" />
                  Strategic
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{rep.region || 'No Region'}</p>
          </div>
        </div>

        {/* ARR Display */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Current ARR</span>
            <span className="text-2xl font-bold">
              ${(currentARR / 1000000).toFixed(1)}M
            </span>
          </div>
          
          {arrChange !== 0 && (
            <>
              <div className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-muted/50">
                <span className="text-sm font-medium flex items-center gap-1">
                  {arrChange > 0 ? (
                    <>
                      <ArrowUp className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">+${Math.abs(arrChange / 1000000).toFixed(1)}M</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-4 h-4 text-red-600" />
                      <span className="text-red-600">-${Math.abs(arrChange / 1000000).toFixed(1)}M</span>
                    </>
                  )}
                </span>
                <span className={`text-sm font-medium ${arrChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ({changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%)
                </span>
              </div>
              
              <div className="flex items-baseline justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">New ARR</span>
                <span className="text-xl font-bold text-primary">
                  ${(proposedARR / 1000000).toFixed(1)}M
                </span>
              </div>
            </>
          )}
        </div>

        {/* Account Changes */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Accounts</span>
            <span className="font-medium">
              {currentAccounts} {accountChange !== 0 && (
                <span className={accountChange > 0 ? 'text-green-600' : 'text-red-600'}>
                  → {proposedAccounts}
                </span>
              )}
            </span>
          </div>
          
          {(gainingAccounts.length > 0 || losingAccounts.length > 0) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {gainingAccounts.length > 0 && (
                <div className="flex items-center gap-1 text-green-600">
                  <ArrowUp className="w-3 h-3" />
                  <span>+{gainingAccounts.length} accounts</span>
                </div>
              )}
              {losingAccounts.length > 0 && (
                <div className="flex items-center gap-1 text-red-600">
                  <ArrowDown className="w-3 h-3" />
                  <span>-{losingAccounts.length} accounts</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
