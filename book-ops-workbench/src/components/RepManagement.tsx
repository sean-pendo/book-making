import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Users, UserX, UserCheck, AlertTriangle, Edit, Copy, Filter } from 'lucide-react';

interface SalesRep {
  id: string;
  rep_id: string;
  name: string;
  manager?: string;
  team?: string;
  region?: string;
  flm?: string;
  slm?: string;
  is_active: boolean;
  include_in_assignments: boolean;
  is_manager: boolean;
  is_strategic_rep: boolean;
  status_notes?: string;
}

interface OrphanedOwner {
  owner_id: string;
  owner_name: string;
  account_count: number;
  total_arr: number;
  is_in_sales_reps: boolean;
}

interface RepManagementProps {
  buildId: string;
}

export const RepManagement: React.FC<RepManagementProps> = ({ buildId }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddRepDialogOpen, setIsAddRepDialogOpen] = useState(false);
  const [isEditRepDialogOpen, setIsEditRepDialogOpen] = useState(false);
  const [editingRep, setEditingRep] = useState<SalesRep | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'active' | 'inactive' | 'managers' | 'duplicates'>('all');
  const [newRep, setNewRep] = useState({
    rep_id: '',
    name: '',
    team: '',
    region: '',
    manager: '',
    flm: '',
    slm: ''
  });

  // Fetch sales reps
  const { data: salesReps = [], isLoading: repsLoading } = useQuery({
    queryKey: ['salesReps', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId)
        .order('name');
      
      if (error) throw error;
      return data as SalesRep[];
    }
  });

  // Fetch orphaned owners
  const { data: orphanedOwners = [], isLoading: orphansLoading } = useQuery({
    queryKey: ['orphanedOwners', buildId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_orphaned_owners_with_details', {
        p_build_id: buildId
      });
      
      if (error) throw error;
      return data as OrphanedOwner[];
    }
  });

  // Update rep mutation
  const updateRepMutation = useMutation({
    mutationFn: async ({ repId, updates }: { repId: string; updates: Partial<SalesRep> }) => {
      const { error } = await supabase
        .from('sales_reps')
        .update(updates)
        .eq('id', repId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesReps', buildId] });
      toast({
        title: "Rep Updated",
        description: "Sales rep has been updated successfully.",
      });
    },
    onError: (error) => {
      console.error('Error updating rep:', error);
      toast({
        title: "Error",
        description: "Failed to update sales rep.",
        variant: "destructive"
      });
    }
  });

  // Add new rep mutation
  const addRepMutation = useMutation({
    mutationFn: async (repData: any) => {
      const { error } = await supabase
        .from('sales_reps')
        .insert({
          ...repData,
          build_id: buildId,
          is_active: true,
          include_in_assignments: true,
          is_manager: false
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesReps', buildId] });
      setIsAddRepDialogOpen(false);
      setNewRep({
        rep_id: '',
        name: '',
        team: '',
        region: '',
        manager: '',
        flm: '',
        slm: ''
      });
      toast({
        title: "Rep Added",
        description: "New sales rep has been added successfully.",
      });
    },
    onError: (error) => {
      console.error('Error adding rep:', error);
      toast({
        title: "Error",
        description: "Failed to add new sales rep.",
        variant: "destructive"
      });
    }
  });

  const handleToggleAssignmentEligibility = (rep: SalesRep) => {
    updateRepMutation.mutate({
      repId: rep.id,
      updates: { include_in_assignments: !rep.include_in_assignments }
    });
  };

  const handleToggleActive = (rep: SalesRep) => {
    updateRepMutation.mutate({
      repId: rep.id,
      updates: { 
        is_active: !rep.is_active,
        include_in_assignments: rep.is_active ? false : rep.include_in_assignments
      }
    });
  };

  const handleToggleManager = (rep: SalesRep) => {
    updateRepMutation.mutate({
      repId: rep.id,
      updates: { 
        is_manager: !rep.is_manager,
        include_in_assignments: rep.is_manager ? rep.include_in_assignments : false
      }
    });
  };

  const handleToggleStrategicRep = (rep: SalesRep) => {
    updateRepMutation.mutate({
      repId: rep.id,
      updates: { 
        is_strategic_rep: !rep.is_strategic_rep
      }
    });
  };

  const handleBulkExcludeInactive = () => {
    const inactiveReps = salesReps.filter(rep => !rep.is_active && rep.include_in_assignments);
    inactiveReps.forEach(rep => {
      updateRepMutation.mutate({
        repId: rep.id,
        updates: { include_in_assignments: false }
      });
    });
  };

  const handleBulkExcludeManagers = () => {
    const managerReps = salesReps.filter(rep => rep.is_manager && rep.include_in_assignments);
    managerReps.forEach(rep => {
      updateRepMutation.mutate({
        repId: rep.id,
        updates: { include_in_assignments: false }
      });
    });
  };

  const handleAddRep = () => {
    if (!newRep.rep_id || !newRep.name) {
      toast({
        title: "Validation Error",
        description: "Rep ID and Name are required fields.",
        variant: "destructive"
      });
      return;
    }

    // Check for duplicate rep_id
    if (salesReps.some(rep => rep.rep_id === newRep.rep_id)) {
      toast({
        title: "Validation Error",
        description: "Rep ID already exists. Please use a unique ID.",
        variant: "destructive"
      });
      return;
    }

    addRepMutation.mutate(newRep);
  };

  const handleEditRep = (rep: SalesRep) => {
    setEditingRep(rep);
    setIsEditRepDialogOpen(true);
  };

  const handleUpdateRep = () => {
    if (!editingRep) return;
    
    updateRepMutation.mutate({
      repId: editingRep.id,
      updates: {
        name: editingRep.name,
        team: editingRep.team,
        region: editingRep.region,
        manager: editingRep.manager,
        flm: editingRep.flm,
        slm: editingRep.slm,
        status_notes: editingRep.status_notes
      }
    });
    setIsEditRepDialogOpen(false);
    setEditingRep(null);
  };

  // Enhanced calculations and duplicate detection
  const activeReps = salesReps.filter(rep => rep.is_active);
  const inactiveReps = salesReps.filter(rep => !rep.is_active);
  const assignmentEligibleReps = salesReps.filter(rep => rep.include_in_assignments);
  const managerReps = salesReps.filter(rep => rep.is_manager);
  const strategicReps = salesReps.filter(rep => rep.is_strategic_rep);
  const orphanedOwnersNotInReps = orphanedOwners.filter(owner => !owner.is_in_sales_reps);
  
  // Duplicate detection
  const duplicateGroups = useMemo(() => {
    const nameGroups = new Map<string, SalesRep[]>();
    const repIdGroups = new Map<string, SalesRep[]>();
    
    salesReps.forEach(rep => {
      // Group by name (case insensitive)
      const nameLower = rep.name.toLowerCase().trim();
      if (!nameGroups.has(nameLower)) nameGroups.set(nameLower, []);
      nameGroups.get(nameLower)!.push(rep);
      
      // Group by rep_id
      if (!repIdGroups.has(rep.rep_id)) repIdGroups.set(rep.rep_id, []);
      repIdGroups.get(rep.rep_id)!.push(rep);
    });
    
    const duplicates = new Set<string>();
    nameGroups.forEach(group => {
      if (group.length > 1) group.forEach(rep => duplicates.add(rep.id));
    });
    repIdGroups.forEach(group => {
      if (group.length > 1) group.forEach(rep => duplicates.add(rep.id));
    });
    
    return duplicates;
  }, [salesReps]);
  
  // Filtered reps based on filter type
  const filteredReps = useMemo(() => {
    switch (filterType) {
      case 'active': return activeReps;
      case 'inactive': return inactiveReps;
      case 'managers': return managerReps;
      case 'duplicates': return salesReps.filter(rep => duplicateGroups.has(rep.id));
      default: return salesReps;
    }
  }, [filterType, salesReps, activeReps, inactiveReps, managerReps, duplicateGroups]);

  if (repsLoading || orphansLoading) {
    return <div>Loading rep management...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reps</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesReps.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeReps.length} active, {inactiveReps.length} inactive
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assignment Eligible</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignmentEligibleReps.length}</div>
            <p className="text-xs text-muted-foreground">
              Available for new assignments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Strategic Reps</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{strategicReps.length}</div>
            <p className="text-xs text-muted-foreground">
              Limited to strategic accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Managers</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{managerReps.length}</div>
            <p className="text-xs text-muted-foreground">
              Should not own accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duplicates</CardTitle>
            <Copy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{duplicateGroups.size}</div>
            <p className="text-xs text-muted-foreground">
              Potential duplicate entries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orphaned Owners</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orphanedOwnersNotInReps.length}</div>
            <p className="text-xs text-muted-foreground">
              Need to be added as reps
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons and Filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reps ({salesReps.length})</SelectItem>
              <SelectItem value="active">Active ({activeReps.length})</SelectItem>
              <SelectItem value="inactive">Inactive ({inactiveReps.length})</SelectItem>
              <SelectItem value="managers">Managers ({managerReps.length})</SelectItem>
              <SelectItem value="duplicates">Duplicates ({duplicateGroups.size})</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
        <Dialog open={isAddRepDialogOpen} onOpenChange={setIsAddRepDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add New Rep
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Sales Rep</DialogTitle>
              <DialogDescription>
                Add a new sales representative to the system.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rep_id" className="text-right">Rep ID *</Label>
                <Input
                  id="rep_id"
                  value={newRep.rep_id}
                  onChange={(e) => setNewRep({ ...newRep, rep_id: e.target.value })}
                  className="col-span-3"
                  placeholder="e.g., REP001"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name *</Label>
                <Input
                  id="name"
                  value={newRep.name}
                  onChange={(e) => setNewRep({ ...newRep, name: e.target.value })}
                  className="col-span-3"
                  placeholder="Full Name"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="team" className="text-right">Team</Label>
                <Input
                  id="team"
                  value={newRep.team}
                  onChange={(e) => setNewRep({ ...newRep, team: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="region" className="text-right">Region</Label>
                <Select value={newRep.region} onValueChange={(value) => setNewRep({ ...newRep, region: value })}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="West">West</SelectItem>
                    <SelectItem value="North East">North East</SelectItem>
                    <SelectItem value="South East">South East</SelectItem>
                    <SelectItem value="Central">Central</SelectItem>
                    <SelectItem value="AMER">AMER</SelectItem>
                    <SelectItem value="EMEA">EMEA</SelectItem>
                    <SelectItem value="APAC">APAC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="manager" className="text-right">Manager</Label>
                <Input
                  id="manager"
                  value={newRep.manager}
                  onChange={(e) => setNewRep({ ...newRep, manager: e.target.value })}
                  className="col-span-3"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddRepDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddRep} disabled={addRepMutation.isPending}>
                {addRepMutation.isPending ? 'Adding...' : 'Add Rep'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Button variant="outline" onClick={handleBulkExcludeInactive}>
          Exclude All Inactive
        </Button>
        <Button variant="outline" onClick={handleBulkExcludeManagers}>
          Exclude All Managers
        </Button>
        </div>
      </div>

      {/* Edit Rep Dialog */}
      <Dialog open={isEditRepDialogOpen} onOpenChange={setIsEditRepDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Sales Representative</DialogTitle>
            <DialogDescription>
              Update the information for this sales representative.
            </DialogDescription>
          </DialogHeader>
          {editingRep && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_rep_id">Rep ID</Label>
                  <Input
                    id="edit_rep_id"
                    value={editingRep.rep_id}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_name">Name *</Label>
                  <Input
                    id="edit_name"
                    value={editingRep.name}
                    onChange={(e) => setEditingRep({ ...editingRep, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_team">Team</Label>
                  <Input
                    id="edit_team"
                    value={editingRep.team || ''}
                    onChange={(e) => setEditingRep({ ...editingRep, team: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_region">Region</Label>
                  <Select 
                    value={editingRep.region || ''} 
                    onValueChange={(value) => setEditingRep({ ...editingRep, region: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="West">West</SelectItem>
                      <SelectItem value="North East">North East</SelectItem>
                      <SelectItem value="South East">South East</SelectItem>
                      <SelectItem value="Central">Central</SelectItem>
                      <SelectItem value="AMER">AMER</SelectItem>
                      <SelectItem value="EMEA">EMEA</SelectItem>
                      <SelectItem value="APAC">APAC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_manager">Manager</Label>
                  <Input
                    id="edit_manager"
                    value={editingRep.manager || ''}
                    onChange={(e) => setEditingRep({ ...editingRep, manager: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_flm">FLM</Label>
                  <Input
                    id="edit_flm"
                    value={editingRep.flm || ''}
                    onChange={(e) => setEditingRep({ ...editingRep, flm: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_slm">SLM</Label>
                  <Input
                    id="edit_slm"
                    value={editingRep.slm || ''}
                    onChange={(e) => setEditingRep({ ...editingRep, slm: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_status_notes">Status Notes</Label>
                <Textarea
                  id="edit_status_notes"
                  value={editingRep.status_notes || ''}
                  onChange={(e) => setEditingRep({ ...editingRep, status_notes: e.target.value })}
                  placeholder="Any notes about this rep's status or assignment eligibility..."
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditRepDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRep} disabled={updateRepMutation.isPending}>
              {updateRepMutation.isPending ? 'Updating...' : 'Update Rep'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales Reps Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Representatives ({filteredReps.length})</CardTitle>
          <CardDescription>
            Manage sales rep status and assignment eligibility
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rep ID</TableHead>
                <TableHead>Team/Region</TableHead>
                <TableHead>Management</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignment Eligible</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Strategic Rep</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReps.map((rep) => {
                const isDuplicate = duplicateGroups.has(rep.id);
                const isMissingRegion = !rep.region || rep.region.trim() === '';
                
                return (
                  <TableRow key={rep.id} className={isDuplicate ? "bg-yellow-50 dark:bg-yellow-900/10" : undefined}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {rep.name}
                        {isDuplicate && <Badge variant="outline" className="text-xs">DUPLICATE</Badge>}
                        {isMissingRegion && <Badge variant="destructive" className="text-xs">NO REGION</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{rep.rep_id}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{rep.team || 'N/A'}</div>
                        <div className={`text-xs ${isMissingRegion ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          {rep.region || 'No Region'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>FLM: {rep.flm || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">SLM: {rep.slm || 'N/A'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={rep.is_active ? 'default' : 'secondary'}>
                        {rep.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rep.include_in_assignments}
                        onCheckedChange={() => handleToggleAssignmentEligibility(rep)}
                        disabled={!rep.is_active}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rep.is_manager}
                          onCheckedChange={() => handleToggleManager(rep)}
                        />
                        {rep.is_manager && <Badge variant="outline" className="text-xs">MGR</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rep.is_strategic_rep}
                          onCheckedChange={() => handleToggleStrategicRep(rep)}
                        />
                        {rep.is_strategic_rep && <Badge variant="default" className="text-xs">STRAT</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditRep(rep)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(rep)}
                        >
                          {rep.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Orphaned Owners */}
      {orphanedOwnersNotInReps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Orphaned Account Owners</CardTitle>
            <CardDescription>
              Account owners who are not in the sales reps list. Consider adding them as reps or reassigning their accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Owner Name</TableHead>
                  <TableHead>Owner ID</TableHead>
                  <TableHead>Account Count</TableHead>
                  <TableHead>Total ARR</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphanedOwnersNotInReps.map((owner) => (
                  <TableRow key={owner.owner_id}>
                    <TableCell className="font-medium">{owner.owner_name}</TableCell>
                    <TableCell>{owner.owner_id}</TableCell>
                    <TableCell>{owner.account_count}</TableCell>
                    <TableCell>${owner.total_arr?.toLocaleString() || '0'}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNewRep({
                            rep_id: owner.owner_id,
                            name: owner.owner_name,
                            team: '',
                            region: '',
                            manager: '',
                            flm: '',
                            slm: ''
                          });
                          setIsAddRepDialogOpen(true);
                        }}
                      >
                        Add as Rep
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};