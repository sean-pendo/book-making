import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, PlayCircle, Eye, Trash2, Edit3, Calendar, User, Clock, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { EnhancedLoader } from '@/components/EnhancedLoader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Build {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'IN_REVIEW' | 'FINALIZED';
  version_tag: string;
  target_date: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  owner_name: string | null;
}

interface RevOpsUser {
  id: string;
  email: string;
  full_name: string | null;
}

const Dashboard = () => {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newBuildName, setNewBuildName] = useState('');
  const [newBuildDescription, setNewBuildDescription] = useState('');
  const [newBuildTargetDate, setNewBuildTargetDate] = useState('');
  const [newBuildOwnerId, setNewBuildOwnerId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [buildToDelete, setBuildToDelete] = useState<Build | null>(null);
  const [buildToEdit, setBuildToEdit] = useState<Build | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [revopsUsers, setRevopsUsers] = useState<RevOpsUser[]>([]);
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadBuilds();
    loadRevOpsUsers();
  }, []);

  const loadBuilds = async () => {
    try {
      const { data, error } = await supabase
        .from('builds')
        .select(`
          *,
          owner:profiles!builds_owner_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to include owner_name
      const transformedBuilds = (data || []).map(build => ({
        ...build,
        owner_name: build.owner?.full_name || null
      }));
      
      setBuilds(transformedBuilds);
    } catch (error) {
      console.error('Error loading builds:', error);
      toast({
        title: 'Error',
        description: 'Failed to load builds',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRevOpsUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('role', ['REVOPS', 'FLM'])
        .order('full_name');

      if (error) throw error;
      setRevopsUsers(data || []);
    } catch (error) {
      console.error('Error loading RevOps users:', error);
    }
  };

  const createNewBuild = async () => {
    if (!newBuildName.trim() || !newBuildOwnerId) return;

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('builds')
        .insert([
          {
            name: newBuildName.trim(),
            description: newBuildDescription.trim() || null,
            target_date: newBuildTargetDate || null,
            owner_id: newBuildOwnerId,
            created_by: (await supabase.auth.getUser()).data.user?.id || '',
          },
        ])
        .select(`
          *,
          owner:profiles!builds_owner_id_fkey(full_name)
        `)
        .single();

      if (error) throw error;

      const transformedBuild = {
        ...data,
        owner_name: data.owner?.full_name || null
      };

      toast({
        title: 'Success',
        description: 'New build created successfully',
      });

      setBuilds([transformedBuild, ...builds]);
      setNewBuildName('');
      setNewBuildDescription('');
      setNewBuildTargetDate('');
      setNewBuildOwnerId('');
      setDialogOpen(false);
    } catch (error) {
      console.error('Error creating build:', error);
      toast({
        title: 'Error',
        description: 'Failed to create build',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditBuild = (build: Build, e: React.MouseEvent) => {
    e.stopPropagation();
    setBuildToEdit(build);
    setNewBuildName(build.name);
    setNewBuildDescription(build.description || '');
    setNewBuildTargetDate(build.target_date || '');
    setNewBuildOwnerId(build.owner_id || '');
    setEditDialogOpen(true);
  };

  const updateBuild = async () => {
    if (!buildToEdit || !newBuildName.trim() || !newBuildOwnerId) return;

    setIsEditing(true);
    try {
      const { data, error } = await supabase
        .from('builds')
        .update({
          name: newBuildName.trim(),
          description: newBuildDescription.trim() || null,
          target_date: newBuildTargetDate || null,
          owner_id: newBuildOwnerId,
        })
        .eq('id', buildToEdit.id)
        .select(`
          *,
          owner:profiles!builds_owner_id_fkey(full_name)
        `)
        .single();

      if (error) throw error;

      const transformedBuild = {
        ...data,
        owner_name: data.owner?.full_name || null
      };

      toast({
        title: 'Success',
        description: 'Build updated successfully',
      });

      setBuilds(builds.map(build => 
        build.id === buildToEdit.id ? transformedBuild : build
      ));
      
      setNewBuildName('');
      setNewBuildDescription('');
      setNewBuildTargetDate('');
      setNewBuildOwnerId('');
      setBuildToEdit(null);
      setEditDialogOpen(false);
    } catch (error) {
      console.error('Error updating build:', error);
      toast({
        title: 'Error',
        description: 'Failed to update build',
        variant: 'destructive',
      });
    } finally {
      setIsEditing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'status-warning';
      case 'IN_REVIEW':
        return 'status-info';
      case 'FINALIZED':
        return 'status-success';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getNextAction = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return { label: 'Continue Building', icon: PlayCircle };
      case 'IN_REVIEW':
        return { label: 'Review Progress', icon: Eye };
      case 'FINALIZED':
        return { label: 'View Results', icon: Eye };
      default:
        return { label: 'View', icon: Eye };
    }
  };

  const canCreateBuild = profile?.role === 'REVOPS' || profile?.role === 'FLM';

  // Set default owner to current user if they have permission
  useEffect(() => {
    if (profile && canCreateBuild && !newBuildOwnerId && dialogOpen) {
      setNewBuildOwnerId(profile.id);
    }
  }, [profile, canCreateBuild, newBuildOwnerId, dialogOpen]);

  const handleDeleteBuild = (build: Build, e: React.MouseEvent) => {
    e.stopPropagation();
    setBuildToDelete(build);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteBuild = async () => {
    if (!buildToDelete) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('builds')
        .delete()
        .eq('id', buildToDelete.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Build "${buildToDelete.name}" deleted successfully`,
      });

      setBuilds(builds.filter(build => build.id !== buildToDelete.id));
      setDeleteDialogOpen(false);
      setBuildToDelete(null);
    } catch (error) {
      console.error('Error deleting build:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete build',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading || authLoading) {
    return <EnhancedLoader size="lg" text="Loading Dashboard" />
  }

  // Show message if profile is still being created
  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="w-96 card-elevated card-glass">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <EnhancedLoader size="md" text="Setting up your account..." />
            <div className="text-center mt-4">
              <p className="text-muted-foreground">
                Creating your profile with admin permissions. This will just take a moment.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Enhanced Header Section */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-gradient">
            Dashboard
          </h1>
          <p className="text-lg text-muted-foreground">
            Manage your territory book builds and track progress
          </p>
        </div>
        
        {canCreateBuild && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="btn-gradient hover-scale shadow-lg">
                <Plus className="mr-2 h-5 w-5" />
                New Build
              </Button>
            </DialogTrigger>
            <DialogContent className="card-elevated">
              <DialogHeader className="space-y-3">
                <DialogTitle className="text-2xl">Create New Build</DialogTitle>
                <DialogDescription className="text-base">
                  Start a new territory book building process
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="build-name" className="text-sm font-medium">Build Name</Label>
                  <Input
                    id="build-name"
                    placeholder="e.g., FY25 Q1 Territory Build"
                    value={newBuildName}
                    onChange={(e) => setNewBuildName(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="build-description" className="text-sm font-medium">Description (Optional)</Label>
                  <Textarea
                    id="build-description"
                    placeholder="Brief description of this build..."
                    value={newBuildDescription}
                    onChange={(e) => setNewBuildDescription(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-primary min-h-[100px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-date" className="text-sm font-medium">Target Date (Optional)</Label>
                  <Input
                    id="target-date"
                    type="date"
                    value={newBuildTargetDate}
                    onChange={(e) => setNewBuildTargetDate(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="build-owner" className="text-sm font-medium">RevOps Owner *</Label>
                  <Select value={newBuildOwnerId} onValueChange={setNewBuildOwnerId}>
                    <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-primary">
                      <SelectValue placeholder="Select RevOps owner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {revopsUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={isCreating}
                    className="hover-scale"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={createNewBuild} 
                    disabled={isCreating || !newBuildName.trim() || !newBuildOwnerId}
                    className="btn-gradient hover-scale"
                  >
                    {isCreating ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground mr-2"></div>
                        Creating...
                      </div>
                    ) : (
                      'Create Build'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {builds.length === 0 ? (
        <Card className="card-elevated card-interactive card-glass">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="text-center space-y-6">
              <div className="w-24 h-24 mx-auto bg-gradient-primary rounded-full flex items-center justify-center animate-float shadow-glow shadow-primary/20">
                <Plus className="h-12 w-12 text-primary-foreground" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold mb-2 text-gradient">No builds yet</h3>
                <p className="text-muted-foreground max-w-md text-lg">
                  {canCreateBuild 
                    ? 'Create your first territory book build to get started and begin organizing your sales territories'
                    : 'No builds have been created yet. Contact your administrator to create new builds.'
                  }
                </p>
              </div>
              {canCreateBuild && (
                <Button 
                  onClick={() => setDialogOpen(true)}
                  size="lg"
                  className="btn-gradient hover-scale shadow-lg hover:shadow-xl transition-all"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Create First Build
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {builds.map((build, index) => {
            const nextAction = getNextAction(build.status);
            const NextIcon = nextAction.icon;
            
            return (
              <Card 
                key={build.id} 
                className="group cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-xl border-border/40 hover:border-primary/50 bg-gradient-to-br from-card to-card/80 backdrop-blur-sm"
                onClick={() => navigate(`/build/${build.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors leading-tight">
                          {build.name}
                        </CardTitle>
                        <span className={`inline-flex items-center rounded-full ${getStatusColor(build.status)} font-medium px-3 py-1 text-xs shrink-0 border`}>
                          {build.status.replace('_', ' ')}
                        </span>
                      </div>
                      {build.description && (
                        <CardDescription className="text-sm line-clamp-2 mt-1">
                          {build.description}
                        </CardDescription>
                      )}
                    </div>
                    {canCreateBuild && (
                      <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleEditBuild(build, e)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDeleteBuild(build, e)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4 pt-0">
                  {/* Information Grid */}
                  <div className="grid grid-cols-2 gap-3 p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-primary/70" />
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground font-medium">Created</span>
                        <span className="text-xs font-medium">{new Date(build.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    {build.updated_at !== build.created_at && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-accent/70" />
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground font-medium">Last Updated</span>
                          <span className="text-xs font-medium">
                            {(() => {
                              const now = new Date();
                              const updated = new Date(build.updated_at);
                              const diffInHours = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60));
                              
                              if (diffInHours < 1) return 'Just now';
                              if (diffInHours < 24) return `${diffInHours}h ago`;
                              if (diffInHours < 48) return 'Yesterday';
                              return updated.toLocaleDateString();
                            })()}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {build.target_date && (
                      <div className="flex items-center gap-2 text-sm">
                        <Target className="h-4 w-4 text-secondary/70" />
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground font-medium">Target Date</span>
                          <span className="text-xs font-medium">{new Date(build.target_date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    )}
                    
                    {build.owner_name && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground/70" />
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground font-medium">Owner</span>
                          <span className="text-xs font-medium">{build.owner_name}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <Button 
                    className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-[1.02]" 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/build/${build.id}`);
                    }}
                  >
                    <NextIcon className="mr-2 h-4 w-4" />
                    {nextAction.label}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Build Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="card-elevated">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-2xl">Edit Build</DialogTitle>
            <DialogDescription className="text-base">
              Update build information and settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="edit-build-name" className="text-sm font-medium">Build Name</Label>
              <Input
                id="edit-build-name"
                placeholder="e.g., FY25 Q1 Territory Build"
                value={newBuildName}
                onChange={(e) => setNewBuildName(e.target.value)}
                className="transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-build-description" className="text-sm font-medium">Description (Optional)</Label>
              <Textarea
                id="edit-build-description"
                placeholder="Brief description of this build..."
                value={newBuildDescription}
                onChange={(e) => setNewBuildDescription(e.target.value)}
                className="transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-primary min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-target-date" className="text-sm font-medium">Target Date (Optional)</Label>
              <Input
                id="edit-target-date"
                type="date"
                value={newBuildTargetDate}
                onChange={(e) => setNewBuildTargetDate(e.target.value)}
                className="transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-build-owner" className="text-sm font-medium">RevOps Owner *</Label>
              <Select value={newBuildOwnerId} onValueChange={setNewBuildOwnerId}>
                <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-primary">
                  <SelectValue placeholder="Select RevOps owner..." />
                </SelectTrigger>
                <SelectContent>
                  {revopsUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setBuildToEdit(null);
                  setNewBuildName('');
                  setNewBuildDescription('');
                  setNewBuildTargetDate('');
                  setNewBuildOwnerId('');
                }}
                disabled={isEditing}
                className="hover-scale"
              >
                Cancel
              </Button>
              <Button 
                onClick={updateBuild} 
                disabled={isEditing || !newBuildName.trim() || !newBuildOwnerId}
                className="btn-gradient hover-scale"
              >
                {isEditing ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground mr-2"></div>
                    Updating...
                  </div>
                ) : (
                  'Update Build'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="card-elevated">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl">Delete Build</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Are you sure you want to delete <span className="font-semibold text-foreground">"{buildToDelete?.name}"</span>? 
              This action cannot be undone and will permanently remove all associated data including accounts, opportunities, and assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="space-x-3">
            <AlertDialogCancel disabled={isDeleting} className="hover-scale">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteBuild}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 hover-scale"
            >
              {isDeleting ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-destructive-foreground/30 border-t-destructive-foreground mr-2"></div>
                  Deleting...
                </div>
              ) : (
                'Delete Build'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;