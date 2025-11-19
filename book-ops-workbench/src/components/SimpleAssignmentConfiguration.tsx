import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface SimpleAssignmentConfigurationProps {
  buildId: string;
}

export const SimpleAssignmentConfiguration: React.FC<SimpleAssignmentConfigurationProps> = ({ buildId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    description: 'Balance workload around $1.3M ARR per rep, minimize risk concentration, prefer geographic matches',
    customer_min_arr: 1200000,
    customer_target_arr: 1300000,
    customer_max_arr: 3000000,
    max_cre_per_rep: 3,
    assign_prospects: false,
    prospect_min_arr: 300000,
    prospect_target_arr: 500000,
    prospect_max_arr: 2000000,
    prefer_geographic_match: true,
    prefer_continuity: true,
    continuity_days_threshold: 90,
    use_ai_optimization: true
  });

  useEffect(() => {
    loadConfiguration();
  }, [buildId]);

  const loadConfiguration = async () => {
    try {
      const { data, error } = await supabase
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setConfig({
          description: data.description || config.description,
          customer_min_arr: data.customer_min_arr || config.customer_min_arr,
          customer_target_arr: data.customer_target_arr || config.customer_target_arr,
          customer_max_arr: data.customer_max_arr || config.customer_max_arr,
          max_cre_per_rep: data.max_cre_per_rep || config.max_cre_per_rep,
          assign_prospects: data.assign_prospects || config.assign_prospects,
          prospect_min_arr: data.prospect_min_arr || config.prospect_min_arr,
          prospect_target_arr: data.prospect_target_arr || config.prospect_target_arr,
          prospect_max_arr: data.prospect_max_arr || config.prospect_max_arr,
          prefer_geographic_match: data.prefer_geographic_match ?? config.prefer_geographic_match,
          prefer_continuity: data.prefer_continuity ?? config.prefer_continuity,
          continuity_days_threshold: data.continuity_days_threshold || config.continuity_days_threshold,
          use_ai_optimization: data.use_ai_optimization ?? config.use_ai_optimization
        });
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
    }
  };

  const saveConfiguration = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('assignment_configuration')
        .upsert({
          build_id: buildId,
          created_by: user?.id,
          ...config,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: 'Configuration saved',
        description: 'Assignment configuration has been updated successfully.'
      });
    } catch (error: any) {
      toast({
        title: 'Error saving configuration',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI-Powered Assignment Configuration</CardTitle>
        <CardDescription>
          Configure how accounts should be assigned to your sales team using algorithmic balancing with optional AI optimization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Natural Language Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Assignment Goals (Natural Language)</Label>
          <Textarea
            id="description"
            value={config.description}
            onChange={(e) => setConfig({ ...config, description: e.target.value })}
            placeholder="E.g., Balance workload around $1.3M ARR per rep, minimize risk concentration, prefer geographic matches..."
            rows={3}
          />
        </div>

        {/* Customer Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Customer Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer_min_arr">Min ARR per Rep</Label>
                <Input
                  id="customer_min_arr"
                  type="number"
                  value={config.customer_min_arr}
                  onChange={(e) => setConfig({ ...config, customer_min_arr: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_target_arr">Target ARR per Rep</Label>
                <Input
                  id="customer_target_arr"
                  type="number"
                  value={config.customer_target_arr}
                  onChange={(e) => setConfig({ ...config, customer_target_arr: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_max_arr">Max ARR per Rep</Label>
                <Input
                  id="customer_max_arr"
                  type="number"
                  value={config.customer_max_arr}
                  onChange={(e) => setConfig({ ...config, customer_max_arr: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_cre">Max CRE Risks per Rep</Label>
              <Input
                id="max_cre"
                type="number"
                value={config.max_cre_per_rep}
                onChange={(e) => setConfig({ ...config, max_cre_per_rep: Number(e.target.value) })}
                className="w-32"
              />
            </div>
          </CardContent>
        </Card>

        {/* Prospect Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Prospect Assignment</CardTitle>
              <Switch
                checked={config.assign_prospects}
                onCheckedChange={(checked) => setConfig({ ...config, assign_prospects: checked })}
              />
            </div>
          </CardHeader>
          {config.assign_prospects && (
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Min ARR per Rep</Label>
                  <Input
                    type="number"
                    value={config.prospect_min_arr}
                    onChange={(e) => setConfig({ ...config, prospect_min_arr: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target ARR per Rep</Label>
                  <Input
                    type="number"
                    value={config.prospect_target_arr}
                    onChange={(e) => setConfig({ ...config, prospect_target_arr: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max ARR per Rep</Label>
                  <Input
                    type="number"
                    value={config.prospect_max_arr}
                    onChange={(e) => setConfig({ ...config, prospect_max_arr: Number(e.target.value) })}
                  />
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assignment Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Prefer Geographic Matches</Label>
              <Switch
                checked={config.prefer_geographic_match}
                onCheckedChange={(checked) => setConfig({ ...config, prefer_geographic_match: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Maintain Account Continuity</Label>
              <Switch
                checked={config.prefer_continuity}
                onCheckedChange={(checked) => setConfig({ ...config, prefer_continuity: checked })}
              />
            </div>
            {config.prefer_continuity && (
              <div className="space-y-2 pl-6">
                <Label>Continuity Threshold (days)</Label>
                <Input
                  type="number"
                  value={config.continuity_days_threshold}
                  onChange={(e) => setConfig({ ...config, continuity_days_threshold: Number(e.target.value) })}
                  className="w-32"
                />
                <p className="text-sm text-muted-foreground">
                  Don't reassign accounts owned for more than this many days
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Use AI Optimization Suggestions</Label>
              <Switch
                checked={config.use_ai_optimization}
                onCheckedChange={(checked) => setConfig({ ...config, use_ai_optimization: checked })}
              />
            </div>
          </CardContent>
        </Card>

        <Button onClick={saveConfiguration} disabled={loading} className="w-full">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
};
