/**
 * Constraint Toggles
 * 
 * Toggle hard constraints and stability locks on/off.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Shield, Lock, Users, Calendar, Building, Clock, UserMinus } from 'lucide-react';
import type { LPConstraintsConfig, LPStabilityConfig } from '@/services/optimization/types';

interface ConstraintTogglesProps {
  constraints: LPConstraintsConfig;
  stability: LPStabilityConfig;
  onConstraintsChange: (config: LPConstraintsConfig) => void;
  onStabilityChange: (config: LPStabilityConfig) => void;
  disabled?: boolean;
}

function ConstraintToggle({
  label,
  description,
  icon: Icon,
  checked,
  onCheckedChange,
  disabled
}: {
  label: string;
  description: string;
  icon: React.ElementType;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
        <div className="space-y-0.5">
          <Label className={!checked ? 'text-muted-foreground' : ''}>{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

function StabilityToggleWithDays({
  label,
  description,
  icon: Icon,
  checked,
  days,
  onCheckedChange,
  onDaysChange,
  disabled
}: {
  label: string;
  description: string;
  icon: React.ElementType;
  checked: boolean;
  days?: number;
  onCheckedChange: (checked: boolean) => void;
  onDaysChange?: (days: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
        <div className="space-y-0.5">
          <Label className={!checked ? 'text-muted-foreground' : ''}>{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {days !== undefined && onDaysChange && (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={days}
              onChange={(e) => onDaysChange(parseInt(e.target.value) || 90)}
              className="w-16 h-7 text-xs"
              min={1}
              max={365}
              disabled={disabled || !checked}
            />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
        )}
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function ConstraintToggles({
  constraints,
  stability,
  onConstraintsChange,
  onStabilityChange,
  disabled
}: ConstraintTogglesProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Hard Constraints
        </CardTitle>
        <CardDescription>
          Rules that cannot be violated
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ConstraintToggle
          label="Strategic Pool"
          description="Strategic accounts → strategic reps only"
          icon={Users}
          checked={constraints.strategic_pool_enabled}
          onCheckedChange={(c) => onConstraintsChange({ ...constraints, strategic_pool_enabled: c })}
          disabled={disabled}
        />
        
        <ConstraintToggle
          label="Locked Accounts"
          description="Respect exclude_from_reassignment flag"
          icon={Lock}
          checked={constraints.locked_accounts_enabled}
          onCheckedChange={(c) => onConstraintsChange({ ...constraints, locked_accounts_enabled: c })}
          disabled={disabled}
        />
        
        <ConstraintToggle
          label="Parent-Child Linking"
          description="Children follow parent assignment"
          icon={Building}
          checked={constraints.parent_child_linking_enabled}
          onCheckedChange={(c) => onConstraintsChange({ ...constraints, parent_child_linking_enabled: c })}
          disabled={disabled}
        />
        
        <ConstraintToggle
          label="Capacity Hard Cap"
          description="Enforce maximum ARR per rep"
          icon={Shield}
          checked={constraints.capacity_hard_cap_enabled}
          onCheckedChange={(c) => onConstraintsChange({ ...constraints, capacity_hard_cap_enabled: c })}
          disabled={disabled}
        />
        
        <Separator className="my-4" />
        
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Stability Locks</h4>
          <p className="text-xs text-muted-foreground">
            Accounts meeting these conditions stay with current owner
          </p>
        </div>
        
        <div className="space-y-4 pt-2">
          <ConstraintToggle
            label="CRE Risk"
            description="At-risk accounts stay with experienced owner"
            icon={Shield}
            checked={stability.cre_risk_locked}
            onCheckedChange={(c) => onStabilityChange({ ...stability, cre_risk_locked: c })}
            disabled={disabled}
          />
          
          <StabilityToggleWithDays
            label="Renewal Soon"
            description="Renewals within X days stay with owner"
            icon={Calendar}
            checked={stability.renewal_soon_locked}
            days={stability.renewal_soon_days}
            onCheckedChange={(c) => onStabilityChange({ ...stability, renewal_soon_locked: c })}
            onDaysChange={(d) => onStabilityChange({ ...stability, renewal_soon_days: d })}
            disabled={disabled}
          />
          
          <ConstraintToggle
            label="PE Firm"
            description="PE-owned accounts stay with majority owner"
            icon={Building}
            checked={stability.pe_firm_locked}
            onCheckedChange={(c) => onStabilityChange({ ...stability, pe_firm_locked: c })}
            disabled={disabled}
          />
          
          <StabilityToggleWithDays
            label="Recent Change"
            description="Recently changed owner stays to minimize disruption"
            icon={Clock}
            checked={stability.recent_change_locked}
            days={stability.recent_change_days}
            onCheckedChange={(c) => onStabilityChange({ ...stability, recent_change_locked: c })}
            onDaysChange={(d) => onStabilityChange({ ...stability, recent_change_days: d })}
            disabled={disabled}
          />
          
          <ConstraintToggle
            label="Backfill Migration"
            description="Accounts migrate to replacement rep when owner leaves"
            icon={UserMinus}
            checked={stability.backfill_migration_enabled}
            onCheckedChange={(c) => onStabilityChange({ ...stability, backfill_migration_enabled: c })}
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}

