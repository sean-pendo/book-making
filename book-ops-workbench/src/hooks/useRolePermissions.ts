import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type RolePermissions = {
  pages: {
    dashboard: boolean;
    manager_dashboard: boolean;
    data_import: boolean;
    review_notes: boolean;
    revops_final: boolean;
    export: boolean;
    settings: boolean;
  };
  capabilities: {
    view_all_builds: boolean;
    view_own_hierarchy: boolean;
    create_builds: boolean;
    edit_builds: boolean;
    delete_builds: boolean;
    manage_assignments: boolean;
    create_notes: boolean;
    create_reassignments: boolean;
    approve_reassignments: boolean;
    view_reports: boolean;
    export_data: boolean;
    manage_users: boolean;
  };
};

// Default permissions for REVOPS (full access)
const REVOPS_PERMISSIONS: RolePermissions = {
  pages: {
    dashboard: true,
    manager_dashboard: true,
    data_import: true,
    review_notes: true,
    revops_final: true,
    export: true,
    settings: true,
  },
  capabilities: {
    view_all_builds: true,
    view_own_hierarchy: true,
    create_builds: true,
    edit_builds: true,
    delete_builds: true,
    manage_assignments: true,
    create_notes: true,
    create_reassignments: true,
    approve_reassignments: true,
    view_reports: true,
    export_data: true,
    manage_users: true,
  },
};

// SLM permissions - can approve FLM proposals, view their hierarchy
const SLM_PERMISSIONS: RolePermissions = {
  pages: {
    dashboard: false,
    manager_dashboard: true,
    data_import: false,
    review_notes: false,
    revops_final: false,
    export: false,
    settings: true,
  },
  capabilities: {
    view_all_builds: false,
    view_own_hierarchy: true,  // Only see reps where slm = their name
    create_builds: false,
    edit_builds: false,
    delete_builds: false,
    manage_assignments: false,
    create_notes: true,        // Can add notes
    create_reassignments: true, // Can propose reassignments
    approve_reassignments: true, // Can approve FLM proposals
    view_reports: false,
    export_data: false,
    manage_users: false,
  },
};

// FLM permissions - can propose, cannot approve
const FLM_PERMISSIONS: RolePermissions = {
  pages: {
    dashboard: false,
    manager_dashboard: true,
    data_import: false,
    review_notes: false,
    revops_final: false,
    export: false,
    settings: true,
  },
  capabilities: {
    view_all_builds: false,
    view_own_hierarchy: true,  // Only see reps where flm = their name
    create_builds: false,
    edit_builds: false,
    delete_builds: false,
    manage_assignments: false,
    create_notes: true,        // Can add notes
    create_reassignments: true, // Can propose reassignments
    approve_reassignments: false, // Cannot approve - SLM must approve
    view_reports: false,
    export_data: false,
    manage_users: false,
  },
};

// Default fallback permissions (minimal access)
const DEFAULT_PERMISSIONS: RolePermissions = {
  pages: {
    dashboard: false,
    manager_dashboard: true,
    data_import: false,
    review_notes: false,
    revops_final: false,
    export: false,
    settings: true,
  },
  capabilities: {
    view_all_builds: false,
    view_own_hierarchy: true,
    create_builds: false,
    edit_builds: false,
    delete_builds: false,
    manage_assignments: false,
    create_notes: false,
    create_reassignments: false,
    approve_reassignments: false,
    view_reports: false,
    export_data: false,
    manage_users: false,
  },
};

export function useRolePermissions() {
  const { effectiveProfile } = useAuth();
  const role = effectiveProfile?.role;

  const { data: permissions, isLoading } = useQuery({
    queryKey: ["role-permissions", role],
    queryFn: async () => {
      // REVOPS always has full permissions (hardcoded for security)
      if (role === "REVOPS") {
        return REVOPS_PERMISSIONS;
      }

      // Use default permissions for SLM and FLM roles
      if (role === "SLM") {
        return SLM_PERMISSIONS;
      }

      if (role === "FLM") {
        return FLM_PERMISSIONS;
      }

      // Fetch permissions from database as fallback (for custom configurations)
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permissions")
        .eq("role", role)
        .single();

      if (error) {
        console.error("Error fetching role permissions:", error);
        return DEFAULT_PERMISSIONS;
      }

      return data?.permissions as RolePermissions || DEFAULT_PERMISSIONS;
    },
    enabled: !!role,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Helper function to check page access
  const hasPageAccess = (page: keyof RolePermissions["pages"]): boolean => {
    if (!permissions) return false;
    return permissions.pages[page] ?? false;
  };

  // Helper function to check capability
  const hasCapability = (capability: keyof RolePermissions["capabilities"]): boolean => {
    if (!permissions) return false;
    return permissions.capabilities[capability] ?? false;
  };

  return {
    permissions: permissions || DEFAULT_PERMISSIONS,
    isLoading,
    hasPageAccess,
    hasCapability,
  };
}

