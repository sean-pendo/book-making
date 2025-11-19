-- Create a table to store role-based permissions configuration
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role NOT NULL UNIQUE,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Only RevOps can manage role permissions
CREATE POLICY "RevOps can manage role permissions"
ON role_permissions
FOR ALL
USING (get_current_user_role() = 'REVOPS');

-- Everyone can view role permissions (needed for access checks)
CREATE POLICY "Everyone can view role permissions"
ON role_permissions
FOR SELECT
USING (true);

-- Insert default permissions for SLM and FLM roles
INSERT INTO role_permissions (role, permissions) VALUES
('SLM', '{
  "pages": {
    "dashboard": false,
    "manager_dashboard": true,
    "data_import": false,
    "review_notes": true,
    "revops_final": false,
    "export": false,
    "settings": true
  },
  "capabilities": {
    "view_all_builds": false,
    "view_own_hierarchy": true,
    "create_builds": false,
    "edit_builds": false,
    "delete_builds": false,
    "manage_assignments": false,
    "create_notes": true,
    "create_reassignments": true,
    "approve_reassignments": false,
    "view_reports": true,
    "export_data": false,
    "manage_users": false
  }
}'::jsonb),
('FLM', '{
  "pages": {
    "dashboard": true,
    "manager_dashboard": true,
    "data_import": true,
    "review_notes": true,
    "revops_final": true,
    "export": true,
    "settings": true
  },
  "capabilities": {
    "view_all_builds": true,
    "view_own_hierarchy": true,
    "create_builds": true,
    "edit_builds": true,
    "delete_builds": false,
    "manage_assignments": true,
    "create_notes": true,
    "create_reassignments": true,
    "approve_reassignments": true,
    "view_reports": true,
    "export_data": true,
    "manage_users": false
  }
}'::jsonb),
('REVOPS', '{
  "pages": {
    "dashboard": true,
    "manager_dashboard": true,
    "data_import": true,
    "review_notes": true,
    "revops_final": true,
    "export": true,
    "settings": true
  },
  "capabilities": {
    "view_all_builds": true,
    "view_own_hierarchy": true,
    "create_builds": true,
    "edit_builds": true,
    "delete_builds": true,
    "manage_assignments": true,
    "create_notes": true,
    "create_reassignments": true,
    "approve_reassignments": true,
    "view_reports": true,
    "export_data": true,
    "manage_users": true
  }
}'::jsonb)
ON CONFLICT (role) DO NOTHING;

-- Create trigger to update timestamp
CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON role_permissions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();