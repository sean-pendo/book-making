/**
 * Balance Config
 * 
 * Configure balance metric enables and penalties.
 * Higher penalty = solver tries harder to balance that metric.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Scale, DollarSign, TrendingUp, Target } from 'lucide-react';
import type { LPBalanceConfig } from '@/services/optimization/types';

interface BalanceConfigProps {
  config: LPBalanceConfig;
  onChange: (config: LPBalanceConfig) => void;
  disabled?: boolean;
}

function BalanceSlider({
  label,
  description,
  badge,
  icon: Icon,
  enabled,
  penalty,
  onEnableChange,
  onPenaltyChange,
  disabled
}: {
  label: string;
  description: string;
  badge?: string;
  icon: React.ElementType;
  enabled: boolean;
  penalty: number;
  onEnableChange: (enabled: boolean) => void;
  onPenaltyChange: (penalty: number) => void;
  disabled?: boolean;
}) {
  const getPenaltyLabel = (p: number) => {
    if (p < 0.3) return 'Low';
    if (p < 0.6) return 'Medium';
    if (p < 0.9) return 'High';
    return 'Critical';
  };
  
  const getPenaltyColor = (p: number) => {
    if (p < 0.3) return 'text-blue-500';
    if (p < 0.6) return 'text-yellow-500';
    if (p < 0.9) return 'text-orange-500';
    return 'text-red-500';
  };
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={onEnableChange}
            disabled={disabled}
          />
          <Icon className="h-4 w-4 text-muted-foreground" />
          <Label className={!enabled ? 'text-muted-foreground' : ''}>{label}</Label>
          {badge && (
            <Badge variant="outline" className="text-xs">
              {badge}
            </Badge>
          )}
        </div>
        <span className={`text-sm font-medium ${!enabled ? 'text-muted-foreground' : getPenaltyColor(penalty)}`}>
          {enabled ? `${getPenaltyLabel(penalty)} (${penalty.toFixed(1)})` : 'Disabled'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground ml-9">{description}</p>
      <Slider
        value={[penalty * 100]}
        onValueChange={([v]) => onPenaltyChange(v / 100)}
        min={10}
        max={100}
        step={10}
        disabled={disabled || !enabled}
        className={!enabled ? 'opacity-50 ml-9' : 'ml-9'}
      />
    </div>
  );
}

export function BalanceConfig({ config, onChange, disabled }: BalanceConfigProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4" />
          Balance Optimization
        </CardTitle>
        <CardDescription>
          How much to penalize uneven distribution of metrics across reps
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <BalanceSlider
          label="ARR Balance"
          description="Total ARR distributed evenly across reps"
          icon={DollarSign}
          enabled={config.arr_balance_enabled}
          penalty={config.arr_penalty}
          onEnableChange={(e) => onChange({ ...config, arr_balance_enabled: e })}
          onPenaltyChange={(p) => onChange({ ...config, arr_penalty: p })}
          disabled={disabled}
        />
        
        <BalanceSlider
          label="ATR Balance"
          description="Available to renew distributed evenly"
          badge="Customers"
          icon={TrendingUp}
          enabled={config.atr_balance_enabled}
          penalty={config.atr_penalty}
          onEnableChange={(e) => onChange({ ...config, atr_balance_enabled: e })}
          onPenaltyChange={(p) => onChange({ ...config, atr_penalty: p })}
          disabled={disabled}
        />
        
        <BalanceSlider
          label="Pipeline Balance"
          description="Prospect pipeline value distributed evenly"
          badge="Prospects"
          icon={Target}
          enabled={config.pipeline_balance_enabled}
          penalty={config.pipeline_penalty}
          onEnableChange={(e) => onChange({ ...config, pipeline_balance_enabled: e })}
          onPenaltyChange={(p) => onChange({ ...config, pipeline_penalty: p })}
          disabled={disabled}
        />
        
        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
          <p className="font-medium mb-1">How penalties work:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><span className="text-blue-500">Low (0.1-0.3)</span>: Balance is nice-to-have</li>
            <li><span className="text-yellow-500">Medium (0.3-0.6)</span>: Balance is important</li>
            <li><span className="text-orange-500">High (0.6-0.9)</span>: Balance is very important</li>
            <li><span className="text-red-500">Critical (0.9-1.0)</span>: Balance is as important as assignment quality</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

