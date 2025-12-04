import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RolePermissionsManager } from "@/components/RolePermissionsManager";
import { Info, LogOut } from "lucide-react";

type UserRole = "SLM" | "FLM" | "REVOPS";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  region: string;
};

const Settings = () => {
  const { profile, signOut } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === "REVOPS" || profile?.role === "FLM";

  // Fetch all profiles if admin
  const { data: profiles, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");
      
      if (error) throw error;
      return data as Profile[];
    },
    enabled: isAdmin,
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: Partial<Profile> }) => {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Profile updated successfully");
    },
    onError: (error) => {
      toast.error(`Failed to update profile: ${error.message}`);
    },
  });

  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Profile>>({});

  const handleEdit = (user: Profile) => {
    setEditingUser(user.id);
    setEditForm(user);
  };

  const handleSave = (userId: string) => {
    updateProfileMutation.mutate({ userId, updates: editForm });
    setEditingUser(null);
    setEditForm({});
  };

  const handleCancel = () => {
    setEditingUser(null);
    setEditForm({});
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "REVOPS":
      case "LEADERSHIP":
        return "default";
      case "MANAGER":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your profile and user settings</p>
      </div>

      {/* Current User Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>View your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input value={profile?.email || ""} disabled />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={profile?.full_name || ""} disabled />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={profile?.role || ""} disabled />
            </div>
            <div>
              <Label>Region</Label>
              <Input value={profile?.region || ""} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role Permissions Management (Developer Only - set via Supabase) */}
      {profile?.developer === true && <RolePermissionsManager />}

      {/* User Management (Admin Only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>Manage all user accounts and permissions</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p>Loading users...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        {editingUser === user.id ? (
                          <Input
                            value={editForm.full_name || ""}
                            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                          />
                        ) : (
                          user.full_name
                        )}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {editingUser === user.id ? (
                          <Select
                            value={editForm.role}
                            onValueChange={(value) => setEditForm({ ...editForm, role: value as UserRole })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SLM">SLM</SelectItem>
                              <SelectItem value="FLM">FLM</SelectItem>
                              <SelectItem value="REVOPS">RevOps</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={getRoleBadgeVariant(user.role)}>{user.role}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingUser === user.id ? (
                          <Input
                            value={editForm.region || ""}
                            onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                          />
                        ) : (
                          user.region
                        )}
                      </TableCell>
                      <TableCell>
                        {editingUser === user.id ? (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSave(user.id)}>
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancel}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleEdit(user)}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sign Out */}
      <Card>
        <CardHeader>
          <CardTitle>Sign Out</CardTitle>
          <CardDescription>End your current session</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={signOut}
            className="w-full sm:w-auto"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>

      {/* App Version Info */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">App Version</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Version: </span>
              <Badge variant="outline" className="font-mono">v{__APP_VERSION__}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Released: </span>
              <span className="font-mono text-xs">{new Date(__BUILD_DATE__).toLocaleDateString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
