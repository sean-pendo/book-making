import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Map, Plus, Trash2, Pencil, X, Sparkles, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  mapTerritoriesWithGemini, 
  NOT_APPLICABLE, 
  NOT_APPLICABLE_LABEL,
  isNotApplicable 
} from '@/services/geminiRegionMappingService';

interface TerritoryMapping {
  territory: string;
  region: string;
  salesRep?: string;
  isCustom?: boolean;
}

interface TerritoryMappingInterfaceProps {
  buildId: string;
  onMappingsChanged: (mappings: Record<string, string>) => void;
}

const DEFAULT_US_MAPPINGS: Record<string, string> = {
  // North East
  'BOSTON': 'North East',
  'NEW ENGLAND': 'North East',
  'NY E': 'North East',
  'NY S': 'North East',
  
  // South East
  'CHESAPEAKE': 'South East',
  'MID-ATLANTIC': 'South East',
  'SOUTH EAST': 'South East',
  'GULF COAST': 'South East',
  'AUSTIN – HOUSTON': 'South East',
  'AUSTIN - HOUSTON': 'South East',
  
  // Central
  'CHICAGO': 'Central',
  'GREAT LAKES N-CA': 'Central',
  'GREAT LAKES N-US': 'Central',
  'GREAT LAKES S': 'Central',
  'GREATER ONTARIO-CA': 'Central',
  'MID-WEST': 'Central',
  'MOUNTAIN': 'Central',
  
  // West
  'LOS ANGELES': 'West',
  'NOR CAL': 'West',
  'PAC NW-CA': 'West',
  'PAC NW-US': 'West',
  'SAN FRANCISCO': 'West',
  'SO CAL': 'West',
  'SOUTHWEST': 'West',
  'SOUTH WEST': 'West'
};

const INTERNATIONAL_MAPPINGS: Record<string, string> = {
  'Australia': 'Other',
  'Benelux': 'Other',
  'China': 'Other',
  'DACH': 'Other',
  'France': 'Other',
  'Israel': 'Other',
  'Japan': 'Other',
  'LATAM': 'Other',
  'Middle East': 'Other',
  'New Zealand': 'Other',
  'NZ': 'Other',
  'Nordics': 'Other',
  'RO-APAC': 'Other',
  'RO-EMEA': 'Other',
  'Singapore': 'Other',
  'UKI': 'Other'
};

const REGIONS = ['North East', 'South East', 'Central', 'West', 'Other', 'Custom'];

export const TerritoryMappingInterface: React.FC<TerritoryMappingInterfaceProps> = ({ 
  buildId, 
  onMappingsChanged 
}) => {
  const { toast } = useToast();
  const [mappings, setMappings] = useState<TerritoryMapping[]>([]);
  const [editingTerritory, setEditingTerritory] = useState<string | null>(null);
  const [newTerritoryName, setNewTerritoryName] = useState('');
  const [newTerritoryRegion, setNewTerritoryRegion] = useState('North East');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('us');
  const [isAiMapping, setIsAiMapping] = useState(false);
  const [uniqueRepRegions, setUniqueRepRegions] = useState<string[]>([]);

  useEffect(() => {
    loadTerritoryMappings();
  }, [buildId]);

  const loadTerritoryMappings = async () => {
    setLoading(true);
    try {
      // Get existing territory mappings from GEO_FIRST rules
      const { data: rules, error } = await supabase
        .from('assignment_rules')
        .select('conditions')
        .eq('build_id', buildId)
        .eq('rule_type', 'GEO_FIRST')
        .eq('enabled', true);

      if (error) throw error;

      let existingMappings: Record<string, string> = {};
      
      if (rules && rules.length > 0) {
        // Merge all territory mappings from different GEO_FIRST rules
        rules.forEach(rule => {
          const conditions = rule.conditions as any;
          if (conditions?.territoryMappings) {
            existingMappings = { ...existingMappings, ...conditions.territoryMappings };
          }
        });
      }

      // Combine default mappings with existing custom mappings
      const allMappings = { ...DEFAULT_US_MAPPINGS, ...INTERNATIONAL_MAPPINGS, ...existingMappings };
      
      const territoryMappings: TerritoryMapping[] = Object.entries(allMappings).map(([territory, region]) => ({
        territory,
        region,
        isCustom: !DEFAULT_US_MAPPINGS[territory] && !INTERNATIONAL_MAPPINGS[territory]
      }));

      setMappings(territoryMappings);
      onMappingsChanged(allMappings);

      // Load unique rep regions for this build
      const { data: reps, error: repsError } = await supabase
        .from('sales_reps')
        .select('region')
        .eq('build_id', buildId);

      if (!repsError && reps) {
        const regions = Array.from(new Set(
          reps.map(r => r.region).filter(r => r && r.trim() !== '')
        )).sort();
        setUniqueRepRegions(regions);
      }
    } catch (error) {
      console.error('Error loading territory mappings:', error);
      toast({
        title: "Error Loading Mappings",
        description: "Failed to load territory mappings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAiMapping = async () => {
    const territories = mappings.map(m => m.territory);
    const availableRegions = uniqueRepRegions.length > 0 ? uniqueRepRegions : REGIONS.filter(r => r !== 'Custom');

    if (territories.length === 0) {
      toast({
        title: "No Territories",
        description: "No territories found to map",
        variant: "destructive"
      });
      return;
    }

    setIsAiMapping(true);
    
    try {
      // Call via secure edge function (API key stored server-side)
      const result = await mapTerritoriesWithGemini(territories, availableRegions);
      
      // Update mappings with AI results
      const updatedMappings = mappings.map(m => {
        const aiRegion = result.mappings[m.territory];
        if (aiRegion) {
          return { ...m, region: aiRegion };
        }
        return m;
      });
      
      setMappings(updatedMappings);
      saveTerritoryMappings(updatedMappings);
      
      const mappedCount = Object.keys(result.mappings).length - result.notApplicableCount;
      
      toast({
        title: "AI Mapping Complete",
        description: `Mapped ${mappedCount} territories. ${result.notApplicableCount} marked as Not Applicable.`
      });
    } catch (error) {
      console.error('AI mapping error:', error);
      toast({
        title: "AI Mapping Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsAiMapping(false);
    }
  };

  const saveTerritoryMappings = async (updatedMappings: TerritoryMapping[]) => {
    try {
      const mappingObject = updatedMappings.reduce((acc, mapping) => {
        acc[mapping.territory] = mapping.region;
        return acc;
      }, {} as Record<string, string>);

      // Find or create a GEO_FIRST rule to store mappings
      const { data: existingRules } = await supabase
        .from('assignment_rules')
        .select('*')
        .eq('build_id', buildId)
        .eq('rule_type', 'GEO_FIRST')
        .limit(1);

      if (existingRules && existingRules.length > 0) {
        // Update existing rule
        const { error } = await supabase
          .from('assignment_rules')
          .update({
            conditions: {
              ...(existingRules[0].conditions as any),
              territoryMappings: mappingObject
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRules[0].id);

        if (error) throw error;
      } else {
        // Create new GEO_FIRST rule
        const { error } = await supabase
          .from('assignment_rules')
          .insert({
            build_id: buildId,
            name: 'Territory Mappings',
            rule_type: 'GEO_FIRST',
            priority: 1,
            conditions: {
              territoryMappings: mappingObject,
              fallbackStrategy: 'NEAREST_REGION'
            },
            enabled: true,
            account_scope: 'all'
          });

        if (error) throw error;
      }

      onMappingsChanged(mappingObject);
      
      toast({
        title: "Mappings Saved",
        description: "Territory mappings have been updated successfully"
      });
    } catch (error) {
      console.error('Error saving territory mappings:', error);
      toast({
        title: "Error Saving Mappings",
        description: "Failed to save territory mappings",
        variant: "destructive"
      });
    }
  };

  const updateTerritoryMapping = (territory: string, newRegion: string) => {
    const updatedMappings = mappings.map(mapping => 
      mapping.territory === territory 
        ? { ...mapping, region: newRegion }
        : mapping
    );
    setMappings(updatedMappings);
    saveTerritoryMappings(updatedMappings);
    setEditingTerritory(null);
  };

  const addCustomTerritory = () => {
    if (!newTerritoryName.trim()) return;

    const newMapping: TerritoryMapping = {
      territory: newTerritoryName.trim(),
      region: newTerritoryRegion,
      isCustom: true
    };

    const updatedMappings = [...mappings, newMapping];
    setMappings(updatedMappings);
    saveTerritoryMappings(updatedMappings);
    
    setNewTerritoryName('');
    setNewTerritoryRegion('North East');
  };

  const removeCustomTerritory = (territory: string) => {
    const updatedMappings = mappings.filter(mapping => mapping.territory !== territory);
    setMappings(updatedMappings);
    saveTerritoryMappings(updatedMappings);
  };

  const getRegionColor = (region: string) => {
    if (isNotApplicable(region)) {
      return 'bg-gray-200 text-gray-600 border-gray-300';
    }
    const colors: Record<string, string> = {
      'North East': 'bg-blue-100 text-blue-800 border-blue-200',
      'South East': 'bg-green-100 text-green-800 border-green-200',
      'Central': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'West': 'bg-purple-100 text-purple-800 border-purple-200',
      'Other': 'bg-gray-100 text-gray-800 border-gray-200',
      'Custom': 'bg-orange-100 text-orange-800 border-orange-200'
    };
    return colors[region] || colors.Custom;
  };

  const filterMappingsByTab = (tab: string) => {
    switch (tab) {
      case 'us':
        return mappings.filter(m => ['North East', 'South East', 'Central', 'West'].includes(m.region) && !isNotApplicable(m.region));
      case 'international':
        return mappings.filter(m => m.region === 'Other' && !isNotApplicable(m.region));
      case 'na':
        return mappings.filter(m => isNotApplicable(m.region));
      case 'custom':
        return mappings.filter(m => m.isCustom && !isNotApplicable(m.region));
      default:
        return mappings;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading territory mappings...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5" />
              Territory Mapping Configuration
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure how sales territories map to regions for geographic assignment rules
            </p>
          </div>
          <Button
            onClick={handleAiMapping}
            disabled={isAiMapping || mappings.length === 0}
            className="gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {isAiMapping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                AI Mapping...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                AI Auto-Map All
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="us">US Territories</TabsTrigger>
            <TabsTrigger value="international">International</TabsTrigger>
            <TabsTrigger value="na" className="text-gray-600">
              Not Applicable
              {filterMappingsByTab('na').length > 0 && (
                <span className="ml-1 text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                  {filterMappingsByTab('na').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="us" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {['North East', 'South East', 'Central', 'West'].map(region => {
                const regionMappings = mappings.filter(m => m.region === region);
                return (
                  <Card key={region}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{region}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {regionMappings.map(mapping => (
                        <div key={mapping.territory} className="flex items-center justify-between">
                          {editingTerritory === mapping.territory ? (
                            <div className="flex items-center gap-2 w-full">
                              <Select 
                                value={mapping.region}
                                onValueChange={(value) => updateTerritoryMapping(mapping.territory, value)}
                              >
                                <SelectTrigger className="h-6 text-xs">
                                  <SelectValue>
                                    {isNotApplicable(mapping.region) ? NOT_APPLICABLE_LABEL : mapping.region}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NOT_APPLICABLE} className="text-gray-500 italic">
                                    ⊘ Not Applicable
                                  </SelectItem>
                                  <div className="border-b my-1" />
                                  {REGIONS.map(r => (
                                    <SelectItem key={r} value={r}>{r}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => setEditingTerritory(null)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xs">{mapping.territory}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingTerritory(mapping.territory)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="international" className="space-y-4">
            <Alert className="mb-4">
              <AlertDescription className="text-sm">
                International territories can be mapped to "Other" region, or marked as "Not Applicable" if you have no reps covering those areas.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filterMappingsByTab('international').map(mapping => (
                <div key={mapping.territory} className={`flex items-center justify-between p-3 border rounded ${isNotApplicable(mapping.region) ? 'bg-gray-100 dark:bg-gray-800' : ''}`}>
                  {editingTerritory === mapping.territory ? (
                    <div className="flex items-center gap-2 w-full">
                      <Select 
                        value={mapping.region}
                        onValueChange={(value) => updateTerritoryMapping(mapping.territory, value)}
                      >
                        <SelectTrigger>
                          <SelectValue>
                            {isNotApplicable(mapping.region) ? NOT_APPLICABLE_LABEL : mapping.region}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NOT_APPLICABLE} className="text-gray-500 italic">
                            ⊘ Not Applicable
                          </SelectItem>
                          <div className="border-b my-1" />
                          {REGIONS.map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => setEditingTerritory(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className={`font-medium ${isNotApplicable(mapping.region) ? 'text-gray-500' : ''}`}>{mapping.territory}</div>
                        <Badge className={getRegionColor(mapping.region)}>
                          {isNotApplicable(mapping.region) ? 'Not Applicable' : mapping.region}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTerritory(mapping.territory)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="na" className="space-y-4">
            <Alert className="mb-4">
              <AlertDescription className="text-sm">
                Territories marked as "Not Applicable" will be excluded from geographic assignment matching. 
                Use this for international territories when your sales team only covers specific regions.
              </AlertDescription>
            </Alert>
            {filterMappingsByTab('na').length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="font-medium">No territories marked as Not Applicable</p>
                <p className="text-sm">
                  Use the "AI Auto-Map" button or manually mark territories in other tabs to exclude them from assignments.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filterMappingsByTab('na').map(mapping => (
                  <div key={mapping.territory} className="flex items-center justify-between p-3 border rounded bg-gray-100 dark:bg-gray-800">
                    <div>
                      <div className="font-medium text-gray-600">{mapping.territory}</div>
                      <Badge className="bg-gray-200 text-gray-600 border-gray-300">
                        Not Applicable
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Select
                        value={mapping.region}
                        onValueChange={(value) => updateTerritoryMapping(mapping.territory, value)}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue>Change...</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {REGIONS.map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="custom" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Add Custom Territory</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Territory Name</Label>
                    <Input
                      value={newTerritoryName}
                      onChange={(e) => setNewTerritoryName(e.target.value)}
                      placeholder="Enter territory name"
                    />
                  </div>
                  <div className="w-48">
                    <Label>Region</Label>
                    <Select value={newTerritoryRegion} onValueChange={setNewTerritoryRegion}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REGIONS.map(region => (
                          <SelectItem key={region} value={region}>{region}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="pt-6">
                    <Button onClick={addCustomTerritory} disabled={!newTerritoryName.trim()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {filterMappingsByTab('custom').map(mapping => (
                <div key={mapping.territory} className="flex items-center justify-between p-3 border rounded">
                  {editingTerritory === mapping.territory ? (
                    <div className="flex items-center gap-2 w-full">
                      <Input value={mapping.territory} disabled className="flex-1" />
                      <Select 
                        value={mapping.region}
                        onValueChange={(value) => updateTerritoryMapping(mapping.territory, value)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REGIONS.map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => setEditingTerritory(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="font-medium">{mapping.territory}</div>
                        <Badge className={getRegionColor(mapping.region)}>{mapping.region}</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingTerritory(mapping.territory)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeCustomTerritory(mapping.territory)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              
              {filterMappingsByTab('custom').length === 0 && (
                <Alert>
                  <AlertDescription>
                    No custom territories configured. Add custom territories above to extend the default mappings.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};