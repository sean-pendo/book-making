import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserCheck, UserX, Shield, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

interface MockUser {
  id: string;
  email: string;
  full_name: string;
  role: 'REVOPS' | 'SLM' | 'FLM';
  team: string | null;
  region: 'AMER' | 'EMEA' | 'GLOBAL' | null;
}

const mockUsers: MockUser[] = [
  {
    id: 'user1',
    email: 'john.slm@company.com',
    full_name: 'John Smith',
    role: 'SLM',
    team: 'Enterprise AMER',
    region: 'AMER'
  },
  {
    id: 'user2',
    email: 'sarah.flm@company.com',
    full_name: 'Sarah Johnson',
    role: 'FLM',
    team: 'Enterprise EMEA',
    region: 'EMEA'
  },
  {
    id: 'user3',
    email: 'mike.slm@company.com',
    full_name: 'Mike Wilson',
    role: 'SLM',
    team: 'Commercial AMER',
    region: 'AMER'
  },
  {
    id: 'user4',
    email: 'emma.slm@company.com',
    full_name: 'Emma Davis',
    role: 'SLM',
    team: 'Commercial EMEA',
    region: 'EMEA'
  },
  {
    id: 'user5',
    email: 'alex.flm@company.com',
    full_name: 'Alex Thompson',
    role: 'FLM',
    team: 'Global Operations',
    region: 'GLOBAL'
  },
  {
    id: 'user6',
    email: 'lisa.slm@company.com',
    full_name: 'Lisa Garcia',
    role: 'SLM',
    team: 'Enterprise EMEA',
    region: 'EMEA'
  }
];

interface UserImpersonationProps {
  currentUser: any;
  onImpersonate: (user: MockUser | null) => void;
  impersonatedUser: MockUser | null;
}

export const UserImpersonation: React.FC<UserImpersonationProps> = ({
  currentUser,
  onImpersonate,
  impersonatedUser
}) => {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Only show for RevOps and FLM users
  if (!currentUser?.role || !['REVOPS', 'FLM'].includes(currentUser.role)) {
    return null;
  }

  // Close dialog when component unmounts or user changes
  useEffect(() => {
    const cleanup = () => setShowDialog(false);
    return cleanup;
  }, []);

  useEffect(() => {
    setShowDialog(false);
    setSelectedUserId('');
  }, [currentUser]);

  const handleStartImpersonation = () => {
    const selectedUser = mockUsers.find(user => user.id === selectedUserId);
    if (selectedUser) {
      onImpersonate(selectedUser);
      setShowDialog(false);
      toast({
        title: "Impersonation Started",
        description: `Now viewing as ${selectedUser.full_name} (${selectedUser.role})`,
      });
    }
  };

  const handleStopImpersonation = () => {
    onImpersonate(null);
    toast({
      title: "Impersonation Stopped",
      description: "Returned to your original view",
    });
  };

  const getRoleBadge = (role: string) => {
    const colors = {
      'REVOPS': 'bg-purple-500',
      'FLM': 'bg-blue-500',
      'SLM': 'bg-green-500',
    };
    return <Badge className={colors[role as keyof typeof colors] || 'bg-gray-500'}>{role}</Badge>;
  };

  if (impersonatedUser) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-orange-100 border border-orange-200 rounded-lg">
        <UserCheck className="w-4 h-4 text-orange-600" />
        <div className="flex-1 text-sm">
          <div className="font-medium text-orange-800">
            Viewing as: {impersonatedUser.full_name}
          </div>
          <div className="text-orange-600">
            {impersonatedUser.role} • {impersonatedUser.team} • {impersonatedUser.region}
          </div>
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleStopImpersonation}
          className="border-orange-300 text-orange-700 hover:bg-orange-50"
        >
          <UserX className="w-3 h-3 mr-1" />
          Stop
        </Button>
      </div>
    );
  }

  return (
    <>
      {!showDialog && (
        <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
          <Shield className="w-4 h-4 mr-2" />
          Impersonate User
        </Button>
      )}
      
      {showDialog && (
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Impersonation
              </DialogTitle>
              <DialogDescription>
                View the application from another user's perspective for testing and support purposes.
              </DialogDescription>
            </DialogHeader>
            
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>RevOps Access:</strong> This feature allows you to see the app exactly as another user would, 
                including their role permissions, team data, and regional access.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-select">Select User to Impersonate</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mockUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium">{user.full_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {user.email} • {user.role} • {user.region}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUserId && (
                <div className="p-3 bg-muted/20 rounded-lg">
                  <h4 className="font-medium mb-2">Selected User Details:</h4>
                  {(() => {
                    const user = mockUsers.find(u => u.id === selectedUserId);
                    if (!user) return null;
                    return (
                      <div className="space-y-1 text-sm">
                        <div><strong>Name:</strong> {user.full_name}</div>
                        <div><strong>Email:</strong> {user.email}</div>
                        <div className="flex items-center gap-2">
                          <strong>Role:</strong> {getRoleBadge(user.role)}
                        </div>
                        <div><strong>Team:</strong> {user.team || 'N/A'}</div>
                        <div><strong>Region:</strong> {user.region || 'N/A'}</div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleStartImpersonation}
                disabled={!selectedUserId}
              >
                <UserCheck className="w-4 h-4 mr-2" />
                Start Impersonation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};