import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Sliders, Shuffle, AlertCircle } from 'lucide-react';

interface ScoringWeightsEditorProps {
  ruleType: string;
  weights: Record<string, number>;
  onChange: (weights: Record<string, number>) => void;
}

const DEFAULT_WEIGHTS: Record<string, Record<string, { label: string; default: number; description: string }>> = {
  GEO_FIRST: {
    territoryMatch: { label: 'Territory Match', default: 50, description: 'Points for matching territory to region' },
    distancePenalty: { label: 'Territory Mismatch Penalty', default: -20, description: 'Penalty for territory outside rep region' }
  },
  CONTINUITY: {
    continuityBonus: { label: 'Keep Current Owner Bonus', default: 75, description: 'Points for keeping account with current owner' }
  },
  SMART_BALANCE: {
    balanceImpact: { label: 'Balance Priority', default: 50, description: 'Points for assigning to under-utilized reps' }
  },
  CRE_BALANCE: {
    balanceWeight: { label: 'CRE Distribution Weight', default: 20, description: 'Points per available CRE slot (max 3 per rep)' }
  },
  TIER_BALANCE: {
    // No configurable weights - uses hardcoded logic
  }
};

export const ScoringWeightsEditor: React.FC<ScoringWeightsEditorProps> = ({ ruleType, weights, onChange }) => {
  const ruleWeights = DEFAULT_WEIGHTS[ruleType];

  if (!ruleWeights) {
    return null;
  }

  // Special UI for TIER_BALANCE
  if (ruleType === 'TIER_BALANCE') {
    return (
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shuffle className="h-4 w-4" />
            Tier Balance Logic (Hardcoded)
          </CardTitle>
          <CardDescription>
            This rule uses predefined scoring based on account tier and rep type. No configurable weights.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between p-2 bg-background rounded">
              <span>Tier 1 Account + Strategic Rep:</span>
              <Badge>60 points</Badge>
            </div>
            <div className="flex justify-between p-2 bg-background rounded">
              <span>Tier 3/4 Account + Non-Strategic Rep:</span>
              <Badge>40 points</Badge>
            </div>
            <div className="flex justify-between p-2 bg-background rounded">
              <span>All Other Combinations:</span>
              <Badge>20 points</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleWeightChange = (key: string, value: number) => {
    onChange({ ...weights, [key]: value });
  };

  // Initialize weights with defaults if not set
  React.useEffect(() => {
    const hasWeights = Object.keys(weights || {}).length > 0;
    if (!hasWeights) {
      const defaultWeights: Record<string, number> = {};
      Object.entries(ruleWeights).forEach(([key, config]) => {
        defaultWeights[key] = config.default;
      });
      onChange(defaultWeights);
    }
  }, [ruleType]);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sliders className="h-4 w-4" />
          Scoring Weights
          <Badge variant="outline" className="ml-auto">Priority-Based</Badge>
        </CardTitle>
        <CardDescription>
          Configure how this rule scores potential assignments. Higher scores = better match.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(ruleWeights).map(([key, config], index) => (
          <div key={key}>
            {index > 0 && <Separator className="my-4" />}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`weight-${key}`} className="text-sm font-medium">
                  {config.label}
                </Label>
                <Badge variant="secondary" className="font-mono">
                  {weights?.[key] ?? config.default} pts
                </Badge>
              </div>
              <Input
                id={`weight-${key}`}
                type="number"
                value={weights?.[key] ?? config.default}
                onChange={(e) => handleWeightChange(key, parseFloat(e.target.value) || 0)}
                step={5}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{config.description}</p>
            </div>
          </div>
        ))}
        
        <Separator className="my-4" />
        
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            <strong>How it works:</strong> Each account is scored for every rep using all enabled rules. 
            Rule scores are multiplied by priority weight (Priority 1 = 1.0x, Priority 2 = 0.5x, Priority 3 = 0.33x).
            A capacity multiplier (0.5x to 1.5x) adjusts based on rep workload.
            The rep with the highest total score gets the account.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Example:</strong> Priority 1 Geo rule (50 pts) + Priority 2 Continuity (75 pts) + Priority 3 Balance (30 pts) 
            = 50×1.0 + 75×0.5 + 30×0.33 = 97.4 total score
          </p>
        </div>
      </CardContent>
    </Card>
  );
};