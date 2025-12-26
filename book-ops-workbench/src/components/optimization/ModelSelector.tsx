/**
 * Model Selector
 * 
 * Toggle between Waterfall and Relaxed Optimization assignment models.
 * @see MASTER_LOGIC.mdc §11.1 for detailed comparison
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Zap, Layers, Info, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

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
          {/* Waterfall Option */}
          <Label
            htmlFor="waterfall"
            className={`flex flex-col items-start gap-2 rounded-lg border p-4 cursor-pointer hover:bg-accent ${
              value === 'waterfall' ? 'border-primary bg-accent' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="waterfall" id="waterfall" />
              <span className="font-medium">Waterfall</span>
              <Badge variant="outline" className="text-xs">Recommended</Badge>
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm p-4" sideOffset={5}>
                    <div className="space-y-3">
                      <p className="font-medium text-sm">Waterfall Optimization</p>
                      <p className="text-xs text-muted-foreground">
                        Priorities are treated as <strong>strict filters</strong>. 
                        P1 always beats P2, P2 always beats P3, and so on.
                      </p>
                      
                      <div className="text-xs space-y-2">
                        <p className="font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          Best for:
                        </p>
                        <div className="pl-4 text-muted-foreground space-y-1">
                          <p>• Strict priority enforcement</p>
                          <p>• Easy-to-explain assignments</p>
                          <p>• Fast results needed</p>
                          <p>• Reproducible, auditable decisions</p>
                        </div>
                      </div>
                      
                      <div className="text-xs space-y-2">
                        <p className="font-medium flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 text-amber-500" />
                          Trade-off:
                        </p>
                        <p className="pl-4 text-muted-foreground">
                          May create suboptimal global balance. Early priorities 
                          can "steal" capacity from better matches in later priorities.
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1 text-xs text-muted-foreground border-t pt-2 mt-2">
                        <Clock className="h-3 w-3" />
                        <span>~1-2 minutes for most builds</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Layers className="h-3 w-3" />
              Priorities as filters (P1 → P2 → P3)
            </div>
            <p className="text-xs text-muted-foreground">
              Strict priority order. Easy to explain and audit.
            </p>
            <p className="text-xs text-green-600 font-medium mt-1">
              ⚡ ~1-2 min
            </p>
          </Label>
          
          {/* Relaxed Optimization Option */}
          <Label
            htmlFor="relaxed_optimization"
            className={`flex flex-col items-start gap-2 rounded-lg border p-4 cursor-pointer hover:bg-accent ${
              value === 'relaxed_optimization' ? 'border-primary bg-accent' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="relaxed_optimization" id="relaxed_optimization" />
              <span className="font-medium">Relaxed</span>
              <Badge variant="secondary" className="text-xs">Advanced</Badge>
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm p-4" sideOffset={5}>
                    <div className="space-y-3">
                      <p className="font-medium text-sm">Relaxed Optimization</p>
                      <p className="text-xs text-muted-foreground">
                        Priorities are treated as <strong>weights, not filters</strong>. 
                        All factors are evaluated simultaneously to find the globally optimal solution.
                      </p>
                      
                      <div className="text-xs space-y-2">
                        <p className="font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          Best for:
                        </p>
                        <div className="pl-4 text-muted-foreground space-y-1">
                          <p>• Best possible global balance</p>
                          <p>• Flexibility in trade-offs</p>
                          <p>• Exploratory "what's optimal?" analysis</p>
                          <p>• Complex multi-factor decisions</p>
                        </div>
                      </div>
                      
                      <div className="text-xs space-y-2">
                        <p className="font-medium flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 text-amber-500" />
                          Trade-off:
                        </p>
                        <p className="pl-4 text-muted-foreground">
                          Harder to explain decisions. An assignment might be 
                          "60% geo + 30% continuity + 10% balance" — valid, but complex to communicate.
                        </p>
                      </div>
                      
                      <div className="text-xs space-y-1 border-t pt-2 mt-2">
                        <p className="font-medium">Priority Labels in Relaxed Mode:</p>
                        <div className="pl-2 text-muted-foreground">
                          <p>Labels show the <em>dominant</em> factor, not a filter match:</p>
                          <p>• P2: Geo+Continuity both scored high</p>
                          <p>• P3: Geography was dominant factor</p>
                          <p>• RO: Balance/team alignment drove decision</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 text-xs text-muted-foreground border-t pt-2 mt-2">
                        <Clock className="h-3 w-3" />
                        <span>~4-6 minutes for most builds</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-3 w-3" />
              Priorities as weights (simultaneous)
            </div>
            <p className="text-xs text-muted-foreground">
              Optimizes all factors at once. Better global balance.
            </p>
            <p className="text-xs text-amber-600 font-medium mt-1">
              ⏱ ~4-6 min
            </p>
          </Label>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
