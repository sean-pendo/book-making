import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, Save } from "lucide-react";

type RolePermissions = {
  id: string;
  role: "SLM" | "FLM" | "REVOPS";
  permissions: {
    pages: Record<string, boolean>;
    capabilities: Record<string, boolean>;
  };
};

const pageLabels: Record<string, string> = {
  dashboard: "Main Dashboard",
  manager_dashboard: "Manager Dashboard",
  data_import: "Data Import",
  review_notes: "Review & Notes",
  revops_final: "RevOps Final View",
  export: "Export",
  settings: "Settings",
};

const capabilityLabels: Record<string, string> = {
  view_all_builds: "View All Builds",
  view_own_hierarchy: "View Own Hierarchy",
  create_builds: "Create Builds",
  edit_builds: "Edit Builds",
  delete_builds: "Delete Builds",
  manage_assignments: "Manage Assignments",
  create_notes: "Create Notes",
  create_reassignments: "Create Reassignments",
  approve_reassignments: "Approve Reassignments",
  view_reports: "View Reports",
  export_data: "Export Data",
  manage_users: "Manage Users",
};

export const RolePermissionsManager = () => {
  const queryClient = useQueryClient();
  const [editingRole, setEditingRole] = useState<"SLM" | "FLM" | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<RolePermissions["permissions"] | null>(null);

  // Fetch role permissions
  const { data: permissions, isLoading } = useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("*")
        .in("role", ["SLM", "FLM"])
        .order("role");

      if (error) throw error;
      return data.map(d => ({
        ...d,
        permissions: d.permissions as RolePermissions["permissions"]
      })) as RolePermissions[];
    },
  });

  // Update permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ role, permissions }: { role: "SLM" | "FLM"; permissions: RolePermissions["permissions"] }) => {
      const { error } = await supabase
        .from("role_permissions")
        .update({
          permissions: permissions as any,
          updated_at: new Date().toISOString(),
        })
        .eq("role", role);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      toast.success("Permissions updated successfully");
      setEditingRole(null);
      setDraftPermissions(null);
    },
    onError: (error) => {
      toast.error(`Failed to update permissions: ${error.message}`);
    },
  });

  const handleEdit = (role: "SLM" | "FLM") => {
    const rolePerms = permissions?.find((p) => p.role === role);
    if (rolePerms) {
      setEditingRole(role);
      setDraftPermissions(rolePerms.permissions);
    }
  };

  const handleCancel = () => {
    setEditingRole(null);
    setDraftPermissions(null);
  };

  const handleSave = () => {
    if (editingRole && draftPermissions) {
      updatePermissionsMutation.mutate({
        role: editingRole,
        permissions: draftPermissions,
      });
    }
  };

  const togglePermission = (category: "pages" | "capabilities", key: string) => {
    if (draftPermissions) {
      setDraftPermissions({
        ...draftPermissions,
        [category]: {
          ...draftPermissions[category],
          [key]: !draftPermissions[category][key],
        },
      });
    }
  };

  const getRoleBadge = (role: string) => {
    const colors = {
      SLM: "bg-green-500",
      FLM: "bg-blue-500",
    };
    return <Badge className={colors[role as keyof typeof colors]}>{role}</Badge>;
  };

  if (isLoading) {
    return <div>Loading permissions...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <CardTitle>Role Permissions Management</CardTitle>
        </div>
        <CardDescription>Configure what SLM and FLM roles can access and manage</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="SLM">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="SLM">SLM Permissions</TabsTrigger>
            <TabsTrigger value="FLM">FLM Permissions</TabsTrigger>
          </TabsList>

          {["SLM", "FLM"].map((role) => {
            const rolePerms = permissions?.find((p) => p.role === role);
            const isEditing = editingRole === role;
            const currentPerms = isEditing ? draftPermissions : rolePerms?.permissions;

            return (
              <TabsContent key={role} value={role} className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getRoleBadge(role)}
                    <span className="text-sm text-muted-foreground">
                      Configure permissions for {role} role
                    </span>
                  </div>
                  {!isEditing ? (
                    <Button onClick={() => handleEdit(role as "SLM" | "FLM")} variant="outline" size="sm">
                      Edit Permissions
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button onClick={handleSave} size="sm" disabled={updatePermissionsMutation.isPending}>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                      <Button onClick={handleCancel} variant="outline" size="sm">
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                {/* Page Access Permissions */}
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-3">Page Access</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(currentPerms?.pages || {}).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                          <Label htmlFor={`${role}-page-${key}`} className="cursor-pointer">
                            {pageLabels[key] || key}
                          </Label>
                          <Switch
                            id={`${role}-page-${key}`}
                            checked={value}
                            onCheckedChange={() => togglePermission("pages", key)}
                            disabled={!isEditing}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Capability Permissions */}
                  <div>
                    <h4 className="font-semibold mb-3">Capabilities</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(currentPerms?.capabilities || {}).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                          <Label htmlFor={`${role}-cap-${key}`} className="cursor-pointer">
                            {capabilityLabels[key] || key}
                          </Label>
                          <Switch
                            id={`${role}-cap-${key}`}
                            checked={value}
                            onCheckedChange={() => togglePermission("capabilities", key)}
                            disabled={!isEditing}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
};
