import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getAccountARR } from '@/_domain';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertCircle, RefreshCw, CheckCircle, XCircle, ChevronDown, User, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';

interface BuildWithOwner {
  id: string;
  name: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'FINALIZED';
  version_tag: string | null;
  created_at: string;
  region: string;
  owner_id: string | null;
  owner_name: string | null;
}

interface BuildAssignment {
  build_id: string;
  build_name: string;
  current_owner: string | null;
  current_owner_name: string | null;
  new_owner: string | null;
  new_owner_name: string | null;
  effective_owner: string | null;
  effective_owner_name: string | null;
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

interface BuildPairClashSummary {
  buildA: BuildWithOwner;
  buildB: BuildWithOwner;
  pairKey: string;
  clashes: AccountClash[];
}

export const GlobalClashDetector = () => {
  const { toast } = useToast();
  const { effectiveProfile } = useAuth();
  const { id: currentBuildId } = useParams();
  const [expandedPairKey, setExpandedPairKey] = useState<string | null>(null);
  const [selectedClash, setSelectedClash] = useState<AccountClash | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<{type: 'build' | 'custom', buildId?: string}>({type: 'build'});
  const [resolutionRationale, setResolutionRationale] = useState('');
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);

  const userRegion = effectiveProfile?.region;

  const { data: builds, isLoading: buildsLoading } = useQuery({
    queryKey: ['builds-for-clash-detection-with-owner', userRegion],
    queryFn: async () => {
      let query = supabase
        .from('builds')
        .select(`id, name, status, version_tag, created_at, region, owner_id, owner:profiles!builds_owner_id_fkey(full_name)`)
        .order('created_at', { ascending: false });
      
      if (userRegion && effectiveProfile?.role !== 'REVOPS') {
        query = query.eq('region', userRegion);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []).map(b => ({
        id: b.id,
        name: b.name,
        status: b.status as 'DRAFT' | 'IN_REVIEW' | 'FINALIZED',
        version_tag: b.version_tag,
        created_at: b.created_at,
        region: b.region,
        owner_id: b.owner_id,
        owner_name: (b.owner as { full_name: string } | null)?.full_name || null
      })) as BuildWithOwner[];
    }
  });

  const { data: allClashes, isLoading: clashesLoading, refetch: refetchClashes } = useQuery({
    queryKey: ['enhanced-global-clashes-v4', builds?.map(b => b.id)],
    queryFn: async () => {
      if (!builds || builds.length < 2) return [];
      
      const allAccountsPromises = builds.map(build => 
        supabase
          .from('accounts')
          .select('sfdc_account_id, account_name, new_owner_id, new_owner_name, owner_id, owner_name, is_parent, calculated_arr, build_id')
          .eq('build_id', build.id)
          .eq('is_parent', true)
      );
      
      const allAccountsResults = await Promise.all(allAccountsPromises);
      const accountsMap = new Map<string, { account_name: string; arr: number; builds: BuildAssignment[] }>();
      
      allAccountsResults.forEach((result, index) => {
        if (result.error) return;
        const build = builds[index];
        
        result.data?.forEach(account => {
          const key = account.sfdc_account_id;
          if (!accountsMap.has(key)) {
            accountsMap.set(key, { account_name: account.account_name, arr: getAccountARR(account), builds: [] });
          }
          
          const accountData = accountsMap.get(key)!;
          accountData.builds.push({
            build_id: build.id,
            build_name: build.name,
            current_owner: account.owner_id,
            current_owner_name: account.owner_name,
            new_owner: account.new_owner_id,
            new_owner_name: account.new_owner_name,
            effective_owner: account.new_owner_id || account.owner_id,
            effective_owner_name: account.new_owner_name || account.owner_name
          });
        });
      });
      
      const accountClashes: AccountClash[] = [];
      
      accountsMap.forEach((data, accountId) => {
        if (data.builds.length < 2) return;
        
        const uniqueOwners = new Set(data.builds.map(b => b.effective_owner).filter(Boolean));
        const hasNew = data.builds.some(b => b.new_owner);
        const hasMixed = data.builds.some(b => b.new_owner) && data.builds.some(b => !b.new_owner);
        
        if (uniqueOwners.size > 1 || hasMixed) {
          let severity: 'high' | 'medium' | 'low' = 'low';
          const conflictTypes: string[] = [];
          
          if (hasNew && uniqueOwners.size > 1) {
            severity = 'high';
            conflictTypes.push('Different New Assignments');
          } else if (hasMixed) {
            severity = 'medium';
            conflictTypes.push('Mixed Assignment State');
          } else if (uniqueOwners.size > 1) {
            severity = 'medium';
            conflictTypes.push('Different Current Owners');
          }
          
          accountClashes.push({
            sfdc_account_id: accountId,
            account_name: data.account_name,
            arr: data.arr,
            builds: data.builds,
            severity,
            conflict_types: conflictTypes,
            is_resolved: false
          });
        }
      });
      
      return accountClashes.sort((a, b) => {
        const order = { high: 3, medium: 2, low: 1 };
        return order[b.severity] - order[a.severity] || b.arr - a.arr;
      });
    },
    enabled: !!builds && builds.length >= 2
  });

  const buildPairs = useMemo<BuildPairClashSummary[]>(() => {
    if (!builds || !allClashes || allClashes.length === 0) return [];
    
    const pairMap = new Map<string, BuildPairClashSummary>();
    
    allClashes.forEach(clash => {
      const buildIds = [...new Set(clash.builds.map(b => b.build_id))];
      
      for (let i = 0; i < buildIds.length; i++) {
        for (let j = i + 1; j < buildIds.length; j++) {
          const [idA, idB] = [buildIds[i], buildIds[j]].sort();
          const pairKey = `${idA}|${idB}`;
          
          if (!pairMap.has(pairKey)) {
            const buildA = builds.find(b => b.id === idA);
            const buildB = builds.find(b => b.id === idB);
            if (buildA && buildB) {
              pairMap.set(pairKey, { buildA, buildB, pairKey, clashes: [] });
            }
          }
          
          pairMap.get(pairKey)?.clashes.push(clash);
        }
      }
    });
    
    return Array.from(pairMap.values());
  }, [builds, allClashes]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'DRAFT': 'bg-amber-100 text-amber-800 border-amber-200',
      'IN_REVIEW': 'bg-blue-100 text-blue-800 border-blue-200',
      'FINALIZED': 'bg-green-100 text-green-800 border-green-200'
    };
    return <Badge className={`${styles[status] || ''} text-xs`}>{status.replace('_', ' ')}</Badge>;
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const handleResolveClash = async () => {
    if (!selectedClash || !selectedResolution.buildId || !resolutionRationale) return;

    try {
      const targetBuild = selectedClash.builds.find(b => b.build_id === selectedResolution.buildId);
      const targetOwnerId = targetBuild?.effective_owner || null;
      const targetOwnerName = targetBuild?.effective_owner_name || null;

      const updatePromises = selectedClash.builds.map(build => 
        supabase
          .from('accounts')
          .update({ new_owner_id: targetOwnerId, new_owner_name: targetOwnerName })
          .eq('build_id', build.build_id)
          .eq('sfdc_account_id', selectedClash.sfdc_account_id)
      );

      const results = await Promise.all(updatePromises);
      if (results.some(r => r.error)) throw new Error('Failed to update');

      await supabase.from('clashes').insert({
        sfdc_account_id: selectedClash.sfdc_account_id,
        account_name: selectedClash.account_name,
        proposed_resolution: `Use assignment from build: ${selectedResolution.buildId}`,
        resolution_rationale: resolutionRationale,
        is_resolved: true,
        resolved_by: (await supabase.auth.getUser()).data.user?.id,
        resolved_at: new Date().toISOString()
      });

      toast({ title: "Resolved", description: `${selectedClash.account_name} updated` });
      setShowResolutionDialog(false);
      setSelectedResolution({ type: 'build' });
      setResolutionRationale('');
      setSelectedClash(null);
      refetchClashes();
    } catch (error) {
      toast({ title: "Error", description: "Failed to resolve", variant: "destructive" });
    }
  };

  // Header component for consistency
  const Header = () => (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Clash Detection</h1>
      <p className="text-muted-foreground text-sm mt-0.5">
        Identify conflicts where accounts have different assignments across builds
      </p>
    </div>
  );

  if (buildsLoading || clashesLoading) {
    return (
      <div className="p-6 space-y-6">
        <Header />
        <div className="flex items-center gap-2 py-8 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!builds || builds.length < 2) {
    return (
      <div className="p-6 space-y-6">
        <Header />
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Need at least 2 builds to detect clashes.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (buildPairs.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <Header />
        <Card className="border-2 border-dashed border-green-200 bg-green-50/50">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center">
              <div className="p-4 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-green-900 mb-1">No Conflicts Detected</h3>
              <p className="text-green-700 text-sm max-w-md">
                All account assignments are consistent across your {builds.length} builds. No action needed.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Header />
      
      <div className="max-w-3xl mx-auto space-y-3">
        {buildPairs.map((pair) => {
        const isExpanded = expandedPairKey === pair.pairKey;
        const isACurrentBuild = pair.buildA.id === currentBuildId;
        const isBCurrentBuild = pair.buildB.id === currentBuildId;
        const highCount = pair.clashes.filter(c => c.severity === 'high').length;
        const clashCount = pair.clashes.length;

        return (
          <Collapsible
            key={pair.pairKey}
            open={isExpanded}
            onOpenChange={(open) => setExpandedPairKey(open ? pair.pairKey : null)}
          >
            <Card className={`border-2 shadow-md ${isExpanded ? 'border-primary shadow-lg' : 'border-amber-300 bg-amber-50/30 hover:border-amber-400 hover:shadow-lg'} transition-all`}>
              <CollapsibleTrigger asChild>
                <CardContent className="py-6 px-8 cursor-pointer relative">
                  {/* Warning badge in top right */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                          <AlertTriangle className="h-4 w-4" />
                          {clashCount}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{clashCount} conflicting {clashCount === 1 ? 'account' : 'accounts'}{highCount > 0 ? ` (${highCount} critical)` : ''}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className="flex items-center justify-center gap-8 pr-20">
                    {/* Build A */}
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <span className="font-bold text-lg">
                          {pair.buildA.name}
                        </span>
                        {getStatusBadge(pair.buildA.status)}
                      </div>
                      {isACurrentBuild && <div className="text-xs text-primary font-medium mt-0.5">(this build)</div>}
                      <div className="text-sm text-muted-foreground mt-1">
                        {pair.buildA.owner_name && <span>{pair.buildA.owner_name} · </span>}
                        {formatDate(pair.buildA.created_at)}
                      </div>
                    </div>

                    {/* Conflict indicator */}
                    <div className="flex flex-col items-center">
                      <div className="p-2 rounded-full bg-amber-100">
                        <ArrowLeftRight className="h-6 w-6 text-amber-600" />
                      </div>
                    </div>

                    {/* Build B */}
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <span className="font-bold text-lg">
                          {pair.buildB.name}
                        </span>
                        {getStatusBadge(pair.buildB.status)}
                      </div>
                      {isBCurrentBuild && <div className="text-xs text-primary font-medium mt-0.5">(this build)</div>}
                      <div className="text-sm text-muted-foreground mt-1">
                        {pair.buildB.owner_name && <span>{pair.buildB.owner_name} · </span>}
                        {formatDate(pair.buildB.created_at)}
                      </div>
                    </div>

                    {/* Chevron */}
                    <ChevronDown className={`h-6 w-6 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </CardContent>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t px-4 py-3 bg-muted/20">
                  {/* Stats row */}
                  <div className="flex items-center justify-center gap-6 mb-4 text-sm">
                    <span><strong>{pair.clashes.length}</strong> clashes</span>
                    {highCount > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <XCircle className="h-3.5 w-3.5" />
                        {highCount} critical
                      </span>
                    )}
                  </div>

                  {/* Clashes table */}
                  <div className="rounded border bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Account</TableHead>
                          <TableHead className="text-xs">{pair.buildA.name}</TableHead>
                          <TableHead className="text-xs">{pair.buildB.name}</TableHead>
                          <TableHead className="text-xs text-right">ARR</TableHead>
                          <TableHead className="text-xs w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pair.clashes.slice(0, 10).map((clash) => {
                          const assignA = clash.builds.find(b => b.build_id === pair.buildA.id);
                          const assignB = clash.builds.find(b => b.build_id === pair.buildB.id);
                          
                          return (
                            <TableRow key={clash.sfdc_account_id}>
                              <TableCell className="py-2">
                                <div className="font-medium text-sm">{clash.account_name}</div>
                              </TableCell>
                              <TableCell className="py-2 text-sm">
                                {assignA?.new_owner_name ? (
                                  <span className="text-blue-600">{assignA.new_owner_name}</span>
                                ) : (
                                  <span className="text-muted-foreground">{assignA?.current_owner_name || '—'}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-sm">
                                {assignB?.new_owner_name ? (
                                  <span className="text-blue-600">{assignB.new_owner_name}</span>
                                ) : (
                                  <span className="text-muted-foreground">{assignB?.current_owner_name || '—'}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-sm text-right">${clash.arr.toLocaleString()}</TableCell>
                              <TableCell className="py-2">
                                <Dialog 
                                  open={showResolutionDialog && selectedClash?.sfdc_account_id === clash.sfdc_account_id} 
                                  onOpenChange={setShowResolutionDialog}
                                >
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedClash(clash)}>
                                      Resolve
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-md">
                                    <DialogHeader>
                                      <DialogTitle className="text-base">Resolve: {clash.account_name}</DialogTitle>
                                      <DialogDescription>Choose which assignment to keep</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-3">
                                      {clash.builds.filter(b => b.effective_owner).map((build) => (
                                        <label key={build.build_id} className="flex items-center gap-3 p-2 border rounded cursor-pointer hover:bg-muted/50">
                                          <input
                                            type="radio"
                                            name="resolution"
                                            checked={selectedResolution.buildId === build.build_id}
                                            onChange={() => setSelectedResolution({ type: 'build', buildId: build.build_id })}
                                          />
                                          <div className="text-sm">
                                            <div className="font-medium">{build.build_name}</div>
                                            <div className="text-muted-foreground">{build.effective_owner_name}</div>
                                          </div>
                                        </label>
                                      ))}
                                      <Textarea
                                        value={resolutionRationale}
                                        onChange={(e) => setResolutionRationale(e.target.value)}
                                        placeholder="Reason..."
                                        className="text-sm"
                                        rows={2}
                                      />
                                      <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setShowResolutionDialog(false)}>Cancel</Button>
                                        <Button size="sm" onClick={handleResolveClash} disabled={!selectedResolution.buildId || !resolutionRationale.trim()}>
                                          Resolve
                                        </Button>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {pair.clashes.length > 10 && (
                      <div className="text-center py-2 text-xs text-muted-foreground border-t">
                        +{pair.clashes.length - 10} more clashes
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
      </div>
    </div>
  );
};
