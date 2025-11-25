import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Users, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface BuildAssignment {
  build_id: string;
  build_name: string;
  current_owner: string | null;
  current_owner_name: string | null;
  new_owner: string | null;
  new_owner_name: string | null;
  effective_owner: string | null;
  effective_owner_name: string | null;
  is_current_build: boolean;
}

interface AccountClash {
  sfdc_account_id: string;
  account_name: string;
  arr: number;
  builds: BuildAssignment[];
  severity: 'high' | 'medium' | 'low';
  conflict_types: string[];
  is_resolved: boolean;
}

export const GlobalClashDetector = () => {
  const { toast } = useToast();
  const { effectiveProfile } = useAuth();
  const { id: currentBuildId } = useParams();
  const [selectedClash, setSelectedClash] = useState<AccountClash | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<{type: 'build' | 'custom', buildId?: string, ownerId?: string, ownerName?: string}>({type: 'build'});
  const [resolutionRationale, setResolutionRationale] = useState('');
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);

  // Get user's region for filtering
  const userRegion = effectiveProfile?.region;

  // Fetch builds within the same region to detect clashes
  // Conflicts are only relevant between builds in the same region workspace
  const { data: builds, isLoading: buildsLoading } = useQuery({
    queryKey: ['builds-for-clash-detection', userRegion],
    queryFn: async () => {
      let query = supabase
        .from('builds')
        .select('id, name, status, created_at, region')
        .order('created_at', { ascending: false });
      
      // Only detect clashes within same region (unless REVOPS who sees all)
      if (userRegion && effectiveProfile?.role !== 'REVOPS') {
        query = query.eq('region', userRegion);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    }
  });

  // Detect clashes across builds - Enhanced version
  const { data: clashes, isLoading: clashesLoading, refetch: refetchClashes } = useQuery({
    queryKey: ['enhanced-global-clashes', builds?.map(b => b.id), currentBuildId],
    queryFn: async () => {
      if (!builds || builds.length < 2) return [];
      
      // Get all accounts from all builds
      const allAccountsPromises = builds.map(build => 
        supabase
          .from('accounts')
          .select('sfdc_account_id, account_name, new_owner_id, new_owner_name, owner_id, owner_name, is_parent, calculated_arr, build_id')
          .eq('build_id', build.id)
          .eq('is_parent', true)
      );
      
      const allAccountsResults = await Promise.all(allAccountsPromises);
      
      // Combine all accounts and group by sfdc_account_id
      const accountsMap = new Map<string, {
        account_name: string;
        arr: number;
        builds: BuildAssignment[];
      }>();
      
      allAccountsResults.forEach((result, index) => {
        if (result.error) return;
        const build = builds[index];
        
        result.data?.forEach(account => {
          const key = account.sfdc_account_id;
          
          if (!accountsMap.has(key)) {
            accountsMap.set(key, {
              account_name: account.account_name,
              arr: account.calculated_arr || 0,
              builds: []
            });
          }
          
          const accountData = accountsMap.get(key)!;
          const effectiveOwner = account.new_owner_id || account.owner_id;
          const effectiveOwnerName = account.new_owner_name || account.owner_name;
          
          accountData.builds.push({
            build_id: build.id,
            build_name: build.name,
            current_owner: account.owner_id,
            current_owner_name: account.owner_name,
            new_owner: account.new_owner_id,
            new_owner_name: account.new_owner_name,
            effective_owner: effectiveOwner,
            effective_owner_name: effectiveOwnerName,
            is_current_build: build.id === currentBuildId
          });
        });
      });
      
      // Filter accounts that appear in multiple builds and have conflicts
      const accountClashes: AccountClash[] = [];
      
      accountsMap.forEach((data, accountId) => {
        if (data.builds.length < 2) return; // Only interested in accounts in multiple builds
        
        // Check for conflicts
        const uniqueEffectiveOwners = new Set(data.builds.map(b => b.effective_owner).filter(Boolean));
        const hasNewAssignments = data.builds.some(b => b.new_owner);
        const hasMixedAssignments = data.builds.some(b => b.new_owner) && data.builds.some(b => !b.new_owner);
        
        if (uniqueEffectiveOwners.size > 1 || hasMixedAssignments) {
          // Determine severity and conflict types
          let severity: 'high' | 'medium' | 'low' = 'low';
          const conflictTypes: string[] = [];
          
          if (hasNewAssignments && uniqueEffectiveOwners.size > 1) {
            severity = 'high';
            conflictTypes.push('Different New Assignments');
          } else if (hasMixedAssignments) {
            severity = 'medium';
            conflictTypes.push('Mixed Assignment State');
          } else if (uniqueEffectiveOwners.size > 1) {
            severity = 'medium';
            conflictTypes.push('Different Current Owners');
          }
          
          accountClashes.push({
            sfdc_account_id: accountId,
            account_name: data.account_name,
            arr: data.arr,
            builds: data.builds.sort((a, b) => {
              // Sort current build first, then by build name
              if (a.is_current_build && !b.is_current_build) return -1;
              if (!a.is_current_build && b.is_current_build) return 1;
              return a.build_name.localeCompare(b.build_name);
            }),
            severity,
            conflict_types: conflictTypes,
            is_resolved: false
          });
        }
      });
      
      return accountClashes.sort((a, b) => {
        // Sort by severity (high first), then by ARR (highest first)
        const severityOrder = { high: 3, medium: 2, low: 1 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[b.severity] - severityOrder[a.severity];
        }
        return b.arr - a.arr;
      });
    },
    enabled: !!builds && builds.length >= 2
  });

  const clashStats = useMemo(() => {
    if (!clashes) return { total: 0, resolved: 0, highSeverity: 0, pending: 0 };
    
    return {
      total: clashes.length,
      resolved: clashes.filter(c => c.is_resolved).length,
      highSeverity: clashes.filter(c => c.severity === 'high').length,
      pending: clashes.filter(c => !c.is_resolved).length
    };
  }, [clashes]);

  const handleResolveClash = async () => {
    if (!selectedClash || !selectedResolution || !resolutionRationale) return;

    try {
      let targetOwnerId: string | null = null;
      let targetOwnerName: string | null = null;

      if (selectedResolution.type === 'build' && selectedResolution.buildId) {
        // Use assignment from selected build
        const targetBuild = selectedClash.builds.find(b => b.build_id === selectedResolution.buildId);
        if (targetBuild) {
          targetOwnerId = targetBuild.effective_owner;
          targetOwnerName = targetBuild.effective_owner_name;
        }
      } else if (selectedResolution.type === 'custom') {
        // Use custom assignment
        targetOwnerId = selectedResolution.ownerId || null;
        targetOwnerName = selectedResolution.ownerName || null;
      }

      // Update assignments across all affected builds
      const updatePromises = selectedClash.builds.map(build => 
        supabase
          .from('accounts')
          .update({
            new_owner_id: targetOwnerId,
            new_owner_name: targetOwnerName
          })
          .eq('build_id', build.build_id)
          .eq('sfdc_account_id', selectedClash.sfdc_account_id)
      );

      const results = await Promise.all(updatePromises);
      const hasErrors = results.some(result => result.error);

      if (hasErrors) {
        throw new Error('Failed to update some builds');
      }

      // Save resolution record
      const { error: clashError } = await supabase
        .from('clashes')
        .insert({
          sfdc_account_id: selectedClash.sfdc_account_id,
          account_name: selectedClash.account_name,
          proposed_resolution: selectedResolution.type === 'build' ? `Use assignment from build: ${selectedResolution.buildId}` : 'Custom assignment',
          resolution_rationale: resolutionRationale,
          is_resolved: true,
          resolved_by: (await supabase.auth.getUser()).data.user?.id,
          resolved_at: new Date().toISOString()
        });

      if (clashError) console.warn('Failed to save resolution record:', clashError);

      toast({
        title: "Clash Resolved",
        description: `Successfully resolved clash for ${selectedClash.account_name} across ${selectedClash.builds.length} builds`,
      });
      
      setShowResolutionDialog(false);
      setSelectedResolution({type: 'build'});
      setResolutionRationale('');
      setSelectedClash(null);
      refetchClashes();
    } catch (error) {
      console.error('Error resolving clash:', error);
      toast({
        title: "Resolution Failed",
        description: "Failed to resolve clash. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (buildsLoading || clashesLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading clash detection...</span>
        </div>
      </div>
    );
  }

  if (!builds || builds.length < 2) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Clash detection requires at least 2 builds to compare. Create more builds to detect conflicts.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clashes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clashStats.total}</div>
            <p className="text-xs text-muted-foreground">
              Across {builds.length} builds
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{clashStats.pending}</div>
            <p className="text-xs text-muted-foreground">
              Require resolution
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Severity</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{clashStats.highSeverity}</div>
            <p className="text-xs text-muted-foreground">
              Critical conflicts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{clashStats.resolved}</div>
            <p className="text-xs text-muted-foreground">
              Successfully handled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Clashes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Account Conflicts</CardTitle>
          <CardDescription>
            Accounts with conflicting assignments across different builds
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!clashes || clashes.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Clashes Detected</h3>
              <p className="text-muted-foreground">
                All account assignments are consistent across builds.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Conflict Types</TableHead>
                  <TableHead>Build Assignments</TableHead>
                  <TableHead>ARR</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clashes.map((clash) => (
                  <TableRow key={clash.sfdc_account_id}>
                    <TableCell className="font-medium">
                      <div>
                        <div>{clash.account_name}</div>
                        <div className="text-sm text-muted-foreground">{clash.sfdc_account_id}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {clash.conflict_types.map((type, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        {clash.builds.map((build) => (
                          <div 
                            key={build.build_id} 
                            className={`text-sm p-2 rounded border ${
                              build.is_current_build 
                                ? 'bg-primary/10 border-primary/20' 
                                : 'bg-muted/50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{build.build_name}</span>
                              {build.is_current_build && (
                                <Badge variant="secondary" className="text-xs">CURRENT</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {build.new_owner ? (
                                <span className="text-blue-600 font-medium">
                                  NEW: {build.new_owner_name} ({build.new_owner})
                                </span>
                              ) : build.current_owner ? (
                                <span>
                                  CURRENT: {build.current_owner_name} ({build.current_owner})
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Unassigned</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        ${clash.arr.toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={clash.severity === 'high' ? 'destructive' : clash.severity === 'medium' ? 'default' : 'secondary'}>
                        {clash.severity.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {!clash.is_resolved && (
                        <Dialog 
                          open={showResolutionDialog && selectedClash?.sfdc_account_id === clash.sfdc_account_id} 
                          onOpenChange={setShowResolutionDialog}
                        >
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setSelectedClash(clash)}
                            >
                              Resolve
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Resolve Assignment Conflict</DialogTitle>
                              <DialogDescription>
                                Choose the correct assignment for {clash.account_name}. This will update all affected builds.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6">
                              {/* Current Assignments */}
                              <div>
                                <h4 className="font-medium mb-3">Current Assignments Across Builds</h4>
                                <div className="space-y-2">
                                  {clash.builds.map((build) => (
                                    <div 
                                      key={build.build_id}
                                      className={`p-3 border rounded ${
                                        build.is_current_build ? 'border-primary bg-primary/5' : 'border-muted'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <span className="font-medium">{build.build_name}</span>
                                          {build.is_current_build && (
                                            <Badge variant="secondary" className="ml-2 text-xs">CURRENT</Badge>
                                          )}
                                        </div>
                                        <div className="text-sm">
                                          {build.new_owner ? (
                                            <span className="text-blue-600 font-medium">
                                              NEW: {build.new_owner_name}
                                            </span>
                                          ) : build.current_owner ? (
                                            <span>
                                              CURRENT: {build.current_owner_name}
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">Unassigned</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Resolution Options */}
                              <div>
                                <h4 className="font-medium mb-3">Choose Resolution</h4>
                                <div className="space-y-3">
                                  {clash.builds.filter(b => b.effective_owner).map((build) => (
                                    <label key={build.build_id} className="flex items-center space-x-3">
                                      <input
                                        type="radio"
                                        name="resolution"
                                        checked={selectedResolution.type === 'build' && selectedResolution.buildId === build.build_id}
                                        onChange={() => setSelectedResolution({type: 'build', buildId: build.build_id})}
                                        className="h-4 w-4"
                                      />
                                      <div className="flex-1">
                                        <div className="font-medium">Use assignment from {build.build_name}</div>
                                        <div className="text-sm text-muted-foreground">
                                          Assign to: {build.effective_owner_name} ({build.effective_owner})
                                        </div>
                                      </div>
                                    </label>
                                  ))}
                                  
                                  <label className="flex items-center space-x-3">
                                    <input
                                      type="radio"
                                      name="resolution"
                                      checked={selectedResolution.type === 'custom'}
                                      onChange={() => setSelectedResolution({type: 'custom'})}
                                      className="h-4 w-4"
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium">Assign to different owner</div>
                                      <div className="text-sm text-muted-foreground">
                                        Leave unassigned across all builds
                                      </div>
                                    </div>
                                  </label>
                                </div>
                              </div>

                              {/* Rationale */}
                              <div>
                                <label className="text-sm font-medium">Resolution Rationale</label>
                                <Textarea
                                  value={resolutionRationale}
                                  onChange={(e) => setResolutionRationale(e.target.value)}
                                  placeholder="Explain why this resolution was chosen..."
                                  className="mt-1"
                                />
                              </div>

                              {/* Actions */}
                              <div className="flex justify-end space-x-2">
                                <Button 
                                  variant="outline" 
                                  onClick={() => setShowResolutionDialog(false)}
                                >
                                  Cancel
                                </Button>
                                <Button 
                                  onClick={handleResolveClash}
                                  disabled={!selectedResolution || !resolutionRationale.trim()}
                                >
                                  Resolve Conflict
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};