import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

interface ConditionalModifier {
  condition: string;
  action: string;
  value: number;
  description?: string;
}

interface ConditionalModifierBuilderProps {
  modifiers: ConditionalModifier[];
  onChange: (modifiers: ConditionalModifier[]) => void;
}

export const ConditionalModifierBuilder: React.FC<ConditionalModifierBuilderProps> = ({ 
  modifiers = [], 
  onChange 
}) => {
  const [localModifiers, setLocalModifiers] = useState<ConditionalModifier[]>(modifiers);

  const updateModifier = (index: number, field: keyof ConditionalModifier, value: any) => {
    const updated = [...localModifiers];
    updated[index] = { ...updated[index], [field]: value };
    setLocalModifiers(updated);
    onChange(updated);
  };

  const addModifier = () => {
    const newModifier: ConditionalModifier = {
      condition: 'rep_region != target_region',
      action: 'multiply_score',
      value: 0.2,
      description: ''
    };
    const updated = [...localModifiers, newModifier];
    setLocalModifiers(updated);
    onChange(updated);
  };

  const removeModifier = (index: number) => {
    const updated = localModifiers.filter((_, i) => i !== index);
    setLocalModifiers(updated);
    onChange(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conditional Modifiers</CardTitle>
        <CardDescription>
          Adjust scores based on conditions (e.g., reduce score if rep in wrong region)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {localModifiers.map((modifier, index) => (
          <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/30">
            <div className="flex items-start gap-2">
              <Label className="text-xs font-mono mt-2 min-w-[30px]">IF</Label>
              <Select 
                value={modifier.condition}
                onValueChange={(value) => updateModifier(index, 'condition', value)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rep_region != target_region">
                    Rep region ≠ Target region
                  </SelectItem>
                  <SelectItem value="rep_current_arr > average_arr * 1.2">
                    Rep ARR &gt; 120% of average
                  </SelectItem>
                  <SelectItem value="rep_account_count >= 12">
                    Rep has ≥ 12 accounts
                  </SelectItem>
                  <SelectItem value="account_arr > 1000000">
                    Account ARR &gt; $1M
                  </SelectItem>
                  <SelectItem value="is_current_owner == false">
                    Not current owner
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-2">
              <Label className="text-xs font-mono mt-2 min-w-[30px]">THEN</Label>
              <div className="flex-1 flex gap-2">
                <Select 
                  value={modifier.action}
                  onValueChange={(value) => updateModifier(index, 'action', value)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiply_score">Multiply score by</SelectItem>
                    <SelectItem value="set_score">Set score to</SelectItem>
                    <SelectItem value="add_penalty">Subtract from score</SelectItem>
                    <SelectItem value="disqualify">Disqualify (score = 0)</SelectItem>
                  </SelectContent>
                </Select>
                
                {modifier.action !== 'disqualify' && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={modifier.value}
                      onChange={(e) => updateModifier(index, 'value', parseFloat(e.target.value) || 0)}
                      className="w-24"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t">
              <Input
                placeholder="Optional description..."
                value={modifier.description || ''}
                onChange={(e) => updateModifier(index, 'description', e.target.value)}
                className="flex-1 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeModifier(index)}
                className="text-destructive hover:text-destructive ml-2"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        <Button onClick={addModifier} variant="outline" className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Conditional Modifier
        </Button>

        {localModifiers.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No conditional modifiers. Add one to adjust scores based on conditions.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
