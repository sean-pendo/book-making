import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useRolePermissions, RolePermissions } from '@/hooks/useRolePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  page: keyof RolePermissions['pages'];
  fallbackPath?: string;
}

/**
 * ProtectedRoute - Enforces role-based access control at the route level
 * 
 * Usage:
 * <ProtectedRoute page="dashboard">
 *   <Dashboard />
 * </ProtectedRoute>
 * 
 * If user doesn't have access, redirects to fallbackPath (default: /manager-dashboard)
 */
export function ProtectedRoute({ 
  children, 
  page, 
  fallbackPath = '/manager-dashboard' 
}: ProtectedRouteProps) {
  const { hasPageAccess, isLoading: permissionsLoading, permissions } = useRolePermissions();
  const { loading: authLoading, user, effectiveProfile } = useAuth();

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to auth if not logged in
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Show loading while profile is being loaded (profile might still be null after auth completes)
  if (!effectiveProfile || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check page access permission
  if (!hasPageAccess(page)) {
    console.warn(`[ProtectedRoute] Access denied to "${page}" page for role "${effectiveProfile.role}", redirecting to ${fallbackPath}`);
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;

