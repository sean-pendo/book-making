import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RuleFieldMapperProps {
  open: boolean;
  onClose: () => void;
  ruleType: string;
  buildId: string;
  currentConditions: any;
  onSave: (fieldMappings: any) => void;
}

interface FieldOption {
  value: string;
  label: string;
  type: string;
  description?: string;
}

const ACCOUNT_FIELDS: FieldOption[] = [
  { value: 'expansion_tier', label: 'Expansion Tier', type: 'string', description: 'Account tier (Tier 1/2/3/4)' },
  { value: 'cre_count', label: 'CRE Count', type: 'number', description: 'Number of CRE opportunities' },
  { value: 'owner_id', label: 'Current Owner ID', type: 'string', description: 'Current account owner' },
  { value: 'owner_name', label: 'Current Owner Name', type: 'string', description: 'Current owner name' },
  { value: 'hq_country', label: 'HQ Country', type: 'string', description: 'Account headquarters location' },
  { value: 'calculated_arr', label: 'Calculated ARR', type: 'number', description: 'Calculated annual recurring revenue' },
  { value: 'calculated_atr', label: 'Calculated ATR', type: 'number', description: 'Calculated available to renew' },
  { value: 'is_customer', label: 'Is Customer', type: 'boolean', description: 'Customer vs prospect flag' },
  { value: 'enterprise_vs_commercial', label: 'Enterprise vs Commercial', type: 'string', description: 'Account segment' }
];

const REP_FIELDS: FieldOption[] = [
  { value: 'region', label: 'Region', type: 'string', description: 'Sales rep region/territory' },
  { value: 'team', label: 'Team', type: 'string', description: 'Sales rep team' },
  { value: 'rep_id', label: 'Rep ID', type: 'string', description: 'Unique rep identifier' },
  { value: 'name', label: 'Rep Name', type: 'string', description: 'Sales rep full name' }
];

export const RuleFieldMapper: React.FC<RuleFieldMapperProps> = ({
  open,
  onClose,
  ruleType,
  buildId,
  currentConditions,
  onSave
}) => {
  const { toast } = useToast();
  const [fieldMappings, setFieldMappings] = useState<any>({});
  const [dataPreview, setDataPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Initialize with existing mappings
      setFieldMappings(currentConditions?.fieldMappings || getDefaultMappings());
      loadDataPreview();
    }
  }, [open, ruleType]);

  const getDefaultMappings = () => {
    switch (ruleType) {
      case 'GEO_FIRST':
        return {
          countryField: 'hq_country',
          repRegionField: 'region'
        };
      case 'CONTINUITY':
        return {
          ownerIdField: 'owner_id',
          ownerNameField: 'owner_name'
        };
      case 'TIER_BALANCE':
        return {
          tierField: 'expansion_tier',
          tier1Value: 'Tier 1',
          tier2Value: 'Tier 2',
          tier3Value: 'Tier 3',
          tier4Value: 'Tier 4'
        };
      case 'CRE_BALANCE':
        return {
          creCountField: 'cre_count',
          creThreshold: 1
        };
      case 'AI_BALANCER':
        return {
          arrField: 'calculated_arr',
          accountCountField: 'count',
          minARR: currentConditions?.customers?.minARRThreshold || 1200000,
          maxARR: currentConditions?.maxARRThreshold || 3000000
        };
      default:
        return {};
    }
  };

  const loadDataPreview = async () => {
    setLoading(true);
    try {
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('expansion_tier, cre_count, owner_id, hq_country, calculated_arr, is_customer')
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .limit(100);

      if (error) throw error;

      // Calculate distribution stats
      const stats: any = {
        total: accounts?.length || 0
      };

      if (ruleType === 'TIER_BALANCE') {
        const tierCounts: Record<string, number> = {};
        accounts?.forEach(acc => {
          const tier = acc.expansion_tier || 'Unknown';
          tierCounts[tier] = (tierCounts[tier] || 0) + 1;
        });
        stats.tierDistribution = tierCounts;
      }

      if (ruleType === 'CRE_BALANCE') {
        const creAccounts = accounts?.filter(acc => acc.cre_count && acc.cre_count > 0) || [];
        stats.creAccounts = creAccounts.length;
        stats.crePercentage = ((creAccounts.length / (accounts?.length || 1)) * 100).toFixed(1);
      }

      if (ruleType === 'CONTINUITY') {
        const withOwner = accounts?.filter(acc => acc.owner_id) || [];
        stats.withCurrentOwner = withOwner.length;
        stats.ownerPercentage = ((withOwner.length / (accounts?.length || 1)) * 100).toFixed(1);
      }

      if (ruleType === 'GEO_FIRST') {
        const countryDist: Record<string, number> = {};
        accounts?.forEach(acc => {
          const country = acc.hq_country || 'Unknown';
          countryDist[country] = (countryDist[country] || 0) + 1;
        });
        stats.countryDistribution = countryDist;
        stats.topCountries = Object.entries(countryDist)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 5);
      }

      setDataPreview(stats);
    } catch (error) {
      console.error('Error loading data preview:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    // Validate mappings
    const validation = validateMappings();
    if (!validation.isValid) {
      toast({
        title: "Invalid Field Mapping",
        description: validation.message,
        variant: "destructive"
      });
      return;
    }

    onSave(fieldMappings);
    onClose();
    
    toast({
      title: "Field Mapping Saved",
      description: "Rule field mappings have been configured successfully"
    });
  };

  const validateMappings = () => {
    switch (ruleType) {
      case 'TIER_BALANCE':
        if (!fieldMappings.tierField) {
          return { isValid: false, message: 'Tier field is required' };
        }
        break;
      case 'CRE_BALANCE':
        if (!fieldMappings.creCountField) {
          return { isValid: false, message: 'CRE count field is required' };
        }
        break;
      case 'CONTINUITY':
        if (!fieldMappings.ownerIdField) {
          return { isValid: false, message: 'Owner ID field is required' };
        }
        break;
    }
    return { isValid: true };
  };

  const getMappingStatus = () => {
    const validation = validateMappings();
    if (!validation.isValid) {
      return { icon: AlertTriangle, color: 'text-destructive', label: 'Incomplete' };
    }
    return { icon: CheckCircle, color: 'text-green-600', label: 'Ready' };
  };

  const renderRuleSpecificFields = () => {
    switch (ruleType) {
      case 'GEO_FIRST':
        return (
          <div className="space-y-4">
            <div>
              <Label>Account Country Field</Label>
              <Select
                value={fieldMappings.countryField || ''}
                onValueChange={(value) => setFieldMappings({ ...fieldMappings, countryField: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_FIELDS.filter(f => f.type === 'string').map(field => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                      {field.description && <span className="text-xs text-muted-foreground ml-2">- {field.description}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sales Rep Region Field</Label>
              <Select
                value={fieldMappings.repRegionField || ''}
                onValueChange={(value) => setFieldMappings({ ...fieldMappings, repRegionField: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {REP_FIELDS.map(field => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                      {field.description && <span className="text-xs text-muted-foreground ml-2">- {field.description}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {dataPreview?.topCountries && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Top 5 Countries</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    {dataPreview.topCountries.map(([country, count]: [string, number]) => (
                      <div key={country} className="flex justify-between">
                        <span>{country}</span>
                        <Badge variant="secondary">{count} accounts</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 'CONTINUITY':
        return (
          <div className="space-y-4">
            <div>
              <Label>Current Owner ID Field</Label>
              <Select
                value={fieldMappings.ownerIdField || ''}
                onValueChange={(value) => setFieldMappings({ ...fieldMappings, ownerIdField: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_FIELDS.filter(f => f.value.includes('owner')).map(field => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Current Owner Name Field (Optional)</Label>
              <Select
                value={fieldMappings.ownerNameField || ''}
                onValueChange={(value) => setFieldMappings({ ...fieldMappings, ownerNameField: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_FIELDS.filter(f => f.value.includes('owner')).map(field => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {dataPreview && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <span>{dataPreview.withCurrentOwner} accounts have current owners</span>
                    <Badge>{dataPreview.ownerPercentage}%</Badge>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'TIER_BALANCE':
        return (
          <div className="space-y-4">
            <div>
              <Label>Account Tier Field</Label>
              <Select
                value={fieldMappings.tierField || ''}
                onValueChange={(value) => setFieldMappings({ ...fieldMappings, tierField: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_FIELDS.map(field => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tier 1 Value</Label>
                <Input 
                  value={fieldMappings.tier1Value || ''} 
                  onChange={(e) => setFieldMappings({ ...fieldMappings, tier1Value: e.target.value })}
                  placeholder="e.g., Tier 1"
                />
              </div>
              <div>
                <Label className="text-xs">Tier 2 Value</Label>
                <Input 
                  value={fieldMappings.tier2Value || ''} 
                  onChange={(e) => setFieldMappings({ ...fieldMappings, tier2Value: e.target.value })}
                  placeholder="e.g., Tier 2"
                />
              </div>
              <div>
                <Label className="text-xs">Tier 3 Value</Label>
                <Input 
                  value={fieldMappings.tier3Value || ''} 
                  onChange={(e) => setFieldMappings({ ...fieldMappings, tier3Value: e.target.value })}
                  placeholder="e.g., Tier 3"
                />
              </div>
              <div>
                <Label className="text-xs">Tier 4 Value</Label>
                <Input 
                  value={fieldMappings.tier4Value || ''} 
                  onChange={(e) => setFieldMappings({ ...fieldMappings, tier4Value: e.target.value })}
                  placeholder="e.g., Tier 4"
                />
              </div>
            </div>

            {dataPreview?.tierDistribution && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Current Tier Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    {Object.entries(dataPreview.tierDistribution).map(([tier, count]) => (
                      <div key={tier} className="flex justify-between">
                        <span>{tier}</span>
                        <Badge variant="secondary">{count as number} accounts</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 'CRE_BALANCE':
        return (
          <div className="space-y-4">
            <div>
              <Label>CRE Count Field</Label>
              <Select
                value={fieldMappings.creCountField || ''}
                onValueChange={(value) => setFieldMappings({ ...fieldMappings, creCountField: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_FIELDS.filter(f => f.type === 'number').map(field => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CRE Threshold (accounts with value &gt; threshold)</Label>
              <Input
                type="number"
                value={fieldMappings.creThreshold || 0}
                onChange={(e) => setFieldMappings({ ...fieldMappings, creThreshold: parseInt(e.target.value) })}
              />
            </div>
            {dataPreview && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <span>{dataPreview.creAccounts} accounts have CRE</span>
                    <Badge>{dataPreview.crePercentage}%</Badge>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'AI_BALANCER':
        return (
          <div className="space-y-4">
            <div>
              <Label>ARR Field</Label>
              <Select
                value={fieldMappings.arrField || ''}
                onValueChange={(value) => setFieldMappings({ ...fieldMappings, arrField: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_FIELDS.filter(f => f.type === 'number' && f.value.includes('arr')).map(field => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Min ARR per Rep ($)</Label>
                <Input
                  type="number"
                  value={fieldMappings.minARR || 0}
                  onChange={(e) => setFieldMappings({ ...fieldMappings, minARR: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label>Max ARR per Rep ($)</Label>
                <Input
                  type="number"
                  value={fieldMappings.maxARR || 0}
                  onChange={(e) => setFieldMappings({ ...fieldMappings, maxARR: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </div>
        );

      default:
        return (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No field mapping required for this rule type.
            </AlertDescription>
          </Alert>
        );
    }
  };

  const status = getMappingStatus();
  const StatusIcon = status.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Configure Field Mappings
            <Badge variant={status.label === 'Ready' ? 'default' : 'destructive'}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Map database fields to rule logic for <strong>{ruleType}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading field data...</div>
          ) : (
            renderRuleSpecificFields()
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Field Mappings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
