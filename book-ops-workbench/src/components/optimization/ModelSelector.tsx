/**
 * Model Selector
 * 
 * Toggle between Waterfall and Relaxed Optimization assignment models.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Zap, Layers, Info } from 'lucide-react';

interface ModelSelectorProps {
  value: 'waterfall' | 'relaxed_optimization';
  onChange: (value: 'waterfall' | 'relaxed_optimization') => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Optimization Model
        </CardTitle>
        <CardDescription>
          Choose how assignments are calculated
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={value}
          onValueChange={(v) => onChange(v as 'waterfall' | 'relaxed_optimization')}
          disabled={disabled}
          className="grid grid-cols-2 gap-4"
        >
          <Label
            htmlFor="waterfall"
            className={`flex flex-col items-start gap-2 rounded-lg border p-4 cursor-pointer hover:bg-accent ${
              value === 'waterfall' ? 'border-primary bg-accent' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="waterfall" id="waterfall" />
              <span className="font-medium">Waterfall Optimization</span>
              <Badge variant="outline" className="text-xs">Current</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Layers className="h-3 w-3" />
              Priority cascade (P1 → P2 → P3 → P4)
            </div>
            <p className="text-xs text-muted-foreground">
              Processes priorities sequentially. Easier to understand and debug.
            </p>
          </Label>
          
          <Label
            htmlFor="relaxed_optimization"
            className={`flex flex-col items-start gap-2 rounded-lg border p-4 cursor-pointer hover:bg-accent ${
              value === 'relaxed_optimization' ? 'border-primary bg-accent' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="relaxed_optimization" id="relaxed_optimization" />
              <span className="font-medium">Relaxed Optimization</span>
              <Badge variant="secondary" className="text-xs">New</Badge>
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm p-4" sideOffset={5}>
                    <div className="space-y-3">
                      <p className="font-medium text-sm">How Relaxed Optimization Works</p>
                      <p className="text-xs text-muted-foreground">
                        Unlike Waterfall's fixed priority order, Relaxed Optimization uses 
                        <strong> weighted scoring</strong> to evaluate all factors simultaneously 
                        and find the globally optimal solution.
                      </p>
                      
                      <div className="text-xs space-y-1">
                        <p className="font-medium">Balance Weights:</p>
                        <div className="pl-2 text-muted-foreground">
                          <p>• Customers: ARR 50%, ATR 25%, Tiers 25%</p>
                          <p>• Prospects: Pipeline 50%, Tiers 50%</p>
                        </div>
                      </div>
                      
                      <div className="text-xs space-y-1">
                        <p className="font-medium">Priority Codes:</p>
                        <div className="pl-2 text-muted-foreground">
                          <p>The dominant scoring factor determines the priority shown:</p>
                          <p>• <strong>P0</strong>: Manual locks, Strategic accounts</p>
                          <p>• <strong>P1</strong>: Stability locks (CRE, renewal, etc.)</p>
                          <p>• <strong>P2</strong>: Geography + Continuity (both strong)</p>
                          <p>• <strong>P3</strong>: Geography Match (dominant)</p>
                          <p>• <strong>P4</strong>: Account Continuity (dominant)</p>
                          <p>• <strong>RO</strong>: Balance-driven / Team Alignment</p>
                        </div>
                      </div>
                      
                      <p className="text-xs text-muted-foreground italic">
                        The optimizer considers all constraints at once via Linear Programming, 
                        then reports which factor contributed most to each decision.
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-3 w-3" />
              Weighted scoring + LP solve
            </div>
            <p className="text-xs text-muted-foreground">
              Evaluates all factors simultaneously. Better balance, globally optimal.
            </p>
            <p className="text-xs text-yellow-600 font-medium mt-1">
              ⏱ Takes 4-6 minutes for large datasets
            </p>
          </Label>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

