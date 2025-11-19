import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, Info, Map, Cog } from 'lucide-react';
import { AdvancedRuleBuilder } from './AdvancedRuleBuilder';
import { TerritoryMappingInterface } from './TerritoryMappingInterface';
import { useToast } from '@/hooks/use-toast';

interface SophisticatedAssignmentRulesBuilderProps {
  buildId?: string;
  onRunAssignment?: (config: any) => Promise<void>;
  isRunning?: boolean;
}

export const SophisticatedAssignmentRulesBuilder = ({ 
  buildId, 
  onRunAssignment, 
  isRunning
}: SophisticatedAssignmentRulesBuilderProps) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'rules' | 'territories'>('rules');

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Assignment Rules
          </CardTitle>
          <CardDescription>
            Configure intelligent account assignment with load balancing, territory respect, and continuity optimization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This assignment engine uses a multi-pass approach: <strong>Geo Assignment</strong> → 
              <strong> Balance Enforcement</strong> → <strong>Optimization</strong>.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Configuration Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <Cog className="h-4 w-4" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="territories" className="flex items-center gap-2">
            <Map className="h-4 w-4" />
            Territories
          </TabsTrigger>
        </TabsList>

        {/* Advanced Rule Builder */}
        <TabsContent value="rules" className="space-y-4">
          <AdvancedRuleBuilder 
            buildId={buildId}
            onRulesChanged={() => {
              toast({
                title: "Rules Updated",
                description: "Assignment rules have been updated. Generate new assignments to apply changes."
              });
            }}
          />
        </TabsContent>

        {/* Territory Management */}
        <TabsContent value="territories" className="space-y-4">
          <TerritoryMappingInterface 
            buildId={buildId}
            onMappingsChanged={(mappings) => {
              toast({
                title: "Territory Mappings Updated",
                description: `Updated ${Object.keys(mappings).length} territory mappings`
              });
            }}
          />
        </TabsContent>
      </Tabs>

    </div>
  );
};