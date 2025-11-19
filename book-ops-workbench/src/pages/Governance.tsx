import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Clock, FileText, Plus, Search, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

interface ExceptionLog {
  id: string;
  sfdc_account_id: string;
  account_name?: string;
  requestor: string;
  reason: string;
  approver?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  approved_at?: string;
  build_id?: string;
}

interface BuildVersion {
  id: string;
  name: string;
  version_tag: string;
  status: string;
  created_at: string;
  created_by: string;
  description?: string;
}

interface PersonnelChange {
  id: string;
  change_type: 'hire' | 'departure' | 'transfer' | 'promotion';
  employee_name: string;
  old_team?: string;
  new_team?: string;
  effective_date: string;
  impact_description?: string;
  created_at: string;
  created_by: string;
}

export const Governance = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('exceptions');
  const [exceptions, setExceptions] = useState<ExceptionLog[]>([]);
  const [versions, setVersions] = useState<BuildVersion[]>([]);
  const [personnelChanges, setPersonnelChanges] = useState<PersonnelChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // New exception form state
  const [newException, setNewException] = useState({
    sfdc_account_id: '',
    account_name: '',
    reason: ''
  });
  const [showNewExceptionDialog, setShowNewExceptionDialog] = useState(false);

  // New personnel change form state
  const [newPersonnelChange, setNewPersonnelChange] = useState({
    change_type: '' as 'hire' | 'departure' | 'transfer' | 'promotion',
    employee_name: '',
    old_team: '',
    new_team: '',
    effective_date: '',
    impact_description: ''
  });
  const [showNewPersonnelDialog, setShowNewPersonnelDialog] = useState(false);

  useEffect(() => {
    loadGovernanceData();
  }, []);

  const loadGovernanceData = async () => {
    try {
      setLoading(true);
      
      // Load exceptions (using audit_log table for now)
      const { data: auditData, error: auditError } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false });

      if (auditError) {
        console.error('Error loading audit data:', auditError);
      } else {
        // Transform audit data to exception format
        const exceptionData = auditData?.map(audit => ({
          id: audit.id,
          sfdc_account_id: audit.record_id,
          account_name: (audit.new_values && typeof audit.new_values === 'object' && audit.new_values !== null && 'account_name' in audit.new_values) 
            ? String(audit.new_values.account_name) 
            : 'Unknown Account',
          requestor: 'System', // Would need to join with profiles
          reason: audit.rationale || 'No reason provided',
          status: 'approved' as const,
          created_at: audit.created_at,
          build_id: audit.build_id
        })) || [];
        setExceptions(exceptionData);
      }

      // Load build versions
      const { data: buildsData, error: buildsError } = await supabase
        .from('builds')
        .select('*')
        .order('created_at', { ascending: false });

      if (buildsError) {
        console.error('Error loading builds:', buildsError);
      } else {
        const versionData = buildsData?.map(build => ({
          id: build.id,
          name: build.name,
          version_tag: build.version_tag,
          status: build.status,
          created_at: build.created_at,
          created_by: 'System', // Would need to join with profiles
          description: build.description
        })) || [];
        setVersions(versionData);
      }

      // For now, we'll use mock data for personnel changes since there's no table yet
      setPersonnelChanges([]);
      
    } catch (error) {
      console.error('Error loading governance data:', error);
      toast({
        title: "Error",
        description: "Failed to load governance data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveException = async (exceptionId: string) => {
    try {
      // For now, just show success message
      toast({
        title: "Exception Approved",
        description: "The exception has been approved successfully.",
      });
    } catch (error) {
      console.error('Error approving exception:', error);
      toast({
        title: "Error",
        description: "Failed to approve exception",
        variant: "destructive",
      });
    }
  };

  const handleRejectException = async (exceptionId: string) => {
    try {
      // For now, just show success message
      toast({
        title: "Exception Rejected",
        description: "The exception has been rejected.",
      });
    } catch (error) {
      console.error('Error rejecting exception:', error);
      toast({
        title: "Error",
        description: "Failed to reject exception",
        variant: "destructive",
      });
    }
  };

  const handleCreateException = async () => {
    try {
      // Would create new exception in database
      toast({
        title: "Exception Created",
        description: "New exception has been submitted for review.",
      });
      setShowNewExceptionDialog(false);
      setNewException({ sfdc_account_id: '', account_name: '', reason: '' });
    } catch (error) {
      console.error('Error creating exception:', error);
      toast({
        title: "Error",
        description: "Failed to create exception",
        variant: "destructive",
      });
    }
  };

  const handleCreatePersonnelChange = async () => {
    try {
      // Would create new personnel change in database
      toast({
        title: "Personnel Change Logged",
        description: "Personnel change has been recorded.",
      });
      setShowNewPersonnelDialog(false);
      setNewPersonnelChange({
        change_type: '' as any,
        employee_name: '',
        old_team: '',
        new_team: '',
        effective_date: '',
        impact_description: ''
      });
    } catch (error) {
      console.error('Error creating personnel change:', error);
      toast({
        title: "Error",
        description: "Failed to log personnel change",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getVersionBadge = (tag: string) => {
    const colors = {
      'v0': 'bg-gray-500',
      'v1': 'bg-blue-500',
      'v2': 'bg-purple-500',
      'vFinal': 'bg-green-500'
    };
    return <Badge className={colors[tag as keyof typeof colors] || 'bg-gray-500'}>{tag}</Badge>;
  };

  const getChangeTypeBadge = (type: string) => {
    const colors = {
      'hire': 'bg-green-500',
      'departure': 'bg-red-500',
      'transfer': 'bg-blue-500',
      'promotion': 'bg-purple-500'
    };
    return <Badge className={colors[type as keyof typeof colors] || 'bg-gray-500'}>{type}</Badge>;
  };

  const filteredExceptions = exceptions.filter(exception => {
    const matchesSearch = exception.account_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exception.sfdc_account_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exception.reason.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || exception.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Governance Hub</h1>
          <p className="text-muted-foreground">
            Exception tracking, version control, and personnel change management
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="exceptions">Exception Log</TabsTrigger>
          <TabsTrigger value="versions">Version Tags</TabsTrigger>
          <TabsTrigger value="personnel">Personnel Changes</TabsTrigger>
        </TabsList>

        <TabsContent value="exceptions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Exception Log
                  </CardTitle>
                  <CardDescription>
                    Track account exceptions, approvals, and governance decisions
                  </CardDescription>
                </div>
                {profile?.role && ['REVOPS', 'LEADERSHIP'].includes(profile.role) && (
                  <Dialog open={showNewExceptionDialog} onOpenChange={setShowNewExceptionDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        New Exception
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Exception</DialogTitle>
                        <DialogDescription>
                          Log a new account exception for review and approval
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="account-id">Account ID</Label>
                          <Input
                            id="account-id"
                            value={newException.sfdc_account_id}
                            onChange={(e) => setNewException({...newException, sfdc_account_id: e.target.value})}
                            placeholder="Enter Salesforce Account ID"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="account-name">Account Name</Label>
                          <Input
                            id="account-name"
                            value={newException.account_name}
                            onChange={(e) => setNewException({...newException, account_name: e.target.value})}
                            placeholder="Enter account name"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="reason">Reason</Label>
                          <Textarea
                            id="reason"
                            value={newException.reason}
                            onChange={(e) => setNewException({...newException, reason: e.target.value})}
                            placeholder="Explain the reason for this exception"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNewExceptionDialog(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleCreateException}>
                          Submit Exception
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search exceptions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Requestor</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExceptions.map((exception) => (
                      <TableRow key={exception.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{exception.account_name}</div>
                            <div className="text-sm text-muted-foreground">{exception.sfdc_account_id}</div>
                          </div>
                        </TableCell>
                        <TableCell>{exception.requestor}</TableCell>
                        <TableCell className="max-w-xs truncate">{exception.reason}</TableCell>
                        <TableCell>{getStatusBadge(exception.status)}</TableCell>
                        <TableCell>{new Date(exception.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {exception.status === 'pending' && profile?.role && ['REVOPS', 'LEADERSHIP'].includes(profile.role) && (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleApproveException(exception.id)}>
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleRejectException(exception.id)}>
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Version Tags
              </CardTitle>
              <CardDescription>
                Track build versions from v0 model through vFinal
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Build Name</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map((version) => (
                      <TableRow key={version.id}>
                        <TableCell className="font-medium">{version.name}</TableCell>
                        <TableCell>{getVersionBadge(version.version_tag)}</TableCell>
                        <TableCell>{getStatusBadge(version.status.toLowerCase())}</TableCell>
                        <TableCell>{version.created_by}</TableCell>
                        <TableCell>{new Date(version.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="max-w-xs truncate">{version.description || 'No description'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personnel" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Personnel Changes
                  </CardTitle>
                  <CardDescription>
                    Track mid-year personnel shifts and continuity drift
                  </CardDescription>
                </div>
                {profile?.role && ['REVOPS', 'LEADERSHIP'].includes(profile.role) && (
                  <Dialog open={showNewPersonnelDialog} onOpenChange={setShowNewPersonnelDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Log Change
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Log Personnel Change</DialogTitle>
                        <DialogDescription>
                          Record a personnel change that may impact account continuity
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="change-type">Change Type</Label>
                          <Select
                            value={newPersonnelChange.change_type}
                            onValueChange={(value: any) => setNewPersonnelChange({...newPersonnelChange, change_type: value})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select change type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hire">New Hire</SelectItem>
                              <SelectItem value="departure">Departure</SelectItem>
                              <SelectItem value="transfer">Transfer</SelectItem>
                              <SelectItem value="promotion">Promotion</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="employee-name">Employee Name</Label>
                          <Input
                            id="employee-name"
                            value={newPersonnelChange.employee_name}
                            onChange={(e) => setNewPersonnelChange({...newPersonnelChange, employee_name: e.target.value})}
                            placeholder="Enter employee name"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="old-team">Old Team</Label>
                            <Input
                              id="old-team"
                              value={newPersonnelChange.old_team}
                              onChange={(e) => setNewPersonnelChange({...newPersonnelChange, old_team: e.target.value})}
                              placeholder="Previous team"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="new-team">New Team</Label>
                            <Input
                              id="new-team"
                              value={newPersonnelChange.new_team}
                              onChange={(e) => setNewPersonnelChange({...newPersonnelChange, new_team: e.target.value})}
                              placeholder="New team"
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="effective-date">Effective Date</Label>
                          <Input
                            id="effective-date"
                            type="date"
                            value={newPersonnelChange.effective_date}
                            onChange={(e) => setNewPersonnelChange({...newPersonnelChange, effective_date: e.target.value})}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="impact">Impact Description</Label>
                          <Textarea
                            id="impact"
                            value={newPersonnelChange.impact_description}
                            onChange={(e) => setNewPersonnelChange({...newPersonnelChange, impact_description: e.target.value})}
                            placeholder="Describe the potential impact on account continuity"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNewPersonnelDialog(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleCreatePersonnelChange}>
                          Log Change
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {personnelChanges.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Personnel Changes</h3>
                  <p>No personnel changes have been logged yet.</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Change Type</TableHead>
                        <TableHead>Teams</TableHead>
                        <TableHead>Effective Date</TableHead>
                        <TableHead>Impact</TableHead>
                        <TableHead>Logged By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {personnelChanges.map((change) => (
                        <TableRow key={change.id}>
                          <TableCell className="font-medium">{change.employee_name}</TableCell>
                          <TableCell>{getChangeTypeBadge(change.change_type)}</TableCell>
                          <TableCell>
                            {change.old_team && change.new_team ? (
                              <span>{change.old_team} → {change.new_team}</span>
                            ) : (
                              change.new_team || change.old_team || 'N/A'
                            )}
                          </TableCell>
                          <TableCell>{new Date(change.effective_date).toLocaleDateString()}</TableCell>
                          <TableCell className="max-w-xs truncate">{change.impact_description || 'No impact noted'}</TableCell>
                          <TableCell>{change.created_by}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};