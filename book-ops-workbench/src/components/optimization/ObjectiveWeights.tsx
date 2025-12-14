/**
 * Objective Weights
 * 
 * Configurable weight sliders for continuity, geography, and team alignment.
 * Weights auto-normalize to sum to 100%.
 */

import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, MapPin, Building2 } from 'lucide-react';
import type { LPObjectivesConfig } from '@/services/optimization/types';

interface ObjectiveWeightsProps {
  customerConfig: LPObjectivesConfig;
  prospectConfig: LPObjectivesConfig;
  onCustomerChange: (config: LPObjectivesConfig) => void;
  onProspectChange: (config: LPObjectivesConfig) => void;
  disabled?: boolean;
}

function WeightSlider({
  label,
  icon: Icon,
  enabled,
  weight,
  onEnableChange,
  onWeightChange,
  disabled
}: {
  label: string;
  icon: React.ElementType;
  enabled: boolean;
  weight: number;
  onEnableChange: (enabled: boolean) => void;
  onWeightChange: (weight: number) => void;
  disabled?: boolean;
}) {
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
        </div>
        <span className={`text-sm font-medium ${!enabled ? 'text-muted-foreground' : ''}`}>
          {enabled ? `${Math.round(weight * 100)}%` : 'Disabled'}
        </span>
      </div>
      <Slider
        value={[weight * 100]}
        onValueChange={([v]) => onWeightChange(v / 100)}
        min={5}
        max={80}
        step={5}
        disabled={disabled || !enabled}
        className={!enabled ? 'opacity-50' : ''}
      />
    </div>
  );
}

function ObjectiveWeightsPanel({
  config,
  onChange,
  disabled
}: {
  config: LPObjectivesConfig;
  onChange: (config: LPObjectivesConfig) => void;
  disabled?: boolean;
}) {
  // Normalize weights when one changes
  const handleWeightChange = (key: 'continuity' | 'geography' | 'team_alignment', newWeight: number) => {
    const oldWeight = config[`${key}_weight`];
    const delta = newWeight - oldWeight;
    
    // Get other enabled weights
    const others = ['continuity', 'geography', 'team_alignment'].filter(k => 
      k !== key && config[`${k}_enabled` as keyof LPObjectivesConfig]
    );
    
    if (others.length === 0) {
      // Only one enabled, just set it
      onChange({ ...config, [`${key}_weight`]: newWeight });
      return;
    }
    
    // Distribute negative delta to others proportionally
    const deltaPerOther = -delta / others.length;
    const newConfig = { ...config, [`${key}_weight`]: newWeight };
    
    for (const other of others) {
      const currentWeight = config[`${other}_weight` as keyof LPObjectivesConfig] as number;
      const adjusted = Math.max(0.05, Math.min(0.80, currentWeight + deltaPerOther));
      (newConfig as any)[`${other}_weight`] = adjusted;
    }
    
    // Normalize to ensure sum = 1
    const enabledKeys = ['continuity', 'geography', 'team_alignment'].filter(k =>
      newConfig[`${k}_enabled` as keyof LPObjectivesConfig]
    );
    const sum = enabledKeys.reduce((s, k) => s + (newConfig[`${k}_weight` as keyof LPObjectivesConfig] as number), 0);
    
    for (const k of enabledKeys) {
      (newConfig as any)[`${k}_weight`] = (newConfig[`${k}_weight` as keyof LPObjectivesConfig] as number) / sum;
    }
    
    onChange(newConfig);
  };
  
  const handleEnableChange = (key: 'continuity' | 'geography' | 'team_alignment', enabled: boolean) => {
    const newConfig = { ...config, [`${key}_enabled`]: enabled };
    
    // Renormalize remaining weights
    const enabledKeys = ['continuity', 'geography', 'team_alignment'].filter(k =>
      newConfig[`${k}_enabled` as keyof LPObjectivesConfig]
    );
    
    if (enabledKeys.length === 0) {
      // Can't disable all - re-enable this one
      return;
    }
    
    const sum = enabledKeys.reduce((s, k) => s + (newConfig[`${k}_weight` as keyof LPObjectivesConfig] as number), 0);
    
    for (const k of enabledKeys) {
      (newConfig as any)[`${k}_weight`] = (newConfig[`${k}_weight` as keyof LPObjectivesConfig] as number) / sum;
    }
    
    onChange(newConfig);
  };
  
  return (
    <div className="space-y-4">
      <WeightSlider
        label="Continuity"
        icon={Users}
        enabled={config.continuity_enabled}
        weight={config.continuity_weight}
        onEnableChange={(e) => handleEnableChange('continuity', e)}
        onWeightChange={(w) => handleWeightChange('continuity', w)}
        disabled={disabled}
      />
      
      <WeightSlider
        label="Geography"
        icon={MapPin}
        enabled={config.geography_enabled}
        weight={config.geography_weight}
        onEnableChange={(e) => handleEnableChange('geography', e)}
        onWeightChange={(w) => handleWeightChange('geography', w)}
        disabled={disabled}
      />
      
      <WeightSlider
        label="Team Alignment"
        icon={Building2}
        enabled={config.team_alignment_enabled}
        weight={config.team_alignment_weight}
        onEnableChange={(e) => handleEnableChange('team_alignment', e)}
        onWeightChange={(w) => handleWeightChange('team_alignment', w)}
        disabled={disabled}
      />
      
      <p className="text-xs text-muted-foreground text-center">
        Weights auto-normalize to 100% across enabled objectives
      </p>
    </div>
  );
}

export function ObjectiveWeights({
  customerConfig,
  prospectConfig,
  onCustomerChange,
  onProspectChange,
  disabled
}: ObjectiveWeightsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Scoring Objectives</CardTitle>
        <CardDescription>
          How much each factor influences assignment decisions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="customer">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="customer">Customer</TabsTrigger>
            <TabsTrigger value="prospect">Prospect</TabsTrigger>
          </TabsList>
          
          <TabsContent value="customer">
            <ObjectiveWeightsPanel
              config={customerConfig}
              onChange={onCustomerChange}
              disabled={disabled}
            />
          </TabsContent>
          
          <TabsContent value="prospect">
            <ObjectiveWeightsPanel
              config={prospectConfig}
              onChange={onProspectChange}
              disabled={disabled}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

