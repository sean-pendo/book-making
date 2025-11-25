import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Home, 
  Database, 
  Settings, 
  FileBarChart, 
  Users, 
  Scale, 
  AlertTriangle, 
  MessageSquare, 
  BarChart3, 
  Download, 
  Shield,
  LogOut,
  ClipboardCheck
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useRolePermissions, RolePermissions } from '@/hooks/useRolePermissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserImpersonation } from '@/components/UserImpersonation';

// Map URLs to permission keys
const urlToPermissionKey: Record<string, keyof RolePermissions["pages"]> = {
  '/': 'dashboard',
  '/import': 'data_import',
  '/manager-dashboard': 'manager_dashboard',
  '/review': 'review_notes',
  '/revops-final': 'revops_final',
  '/settings': 'settings',
};

const navigationItems = [
  { title: 'Dashboard', url: '/', icon: Home },
  { title: 'Data Import', url: '/import', icon: Database },
  { title: 'Manager Dashboard', url: '/manager-dashboard', icon: Users },
  { title: 'Review & Notes', url: '/review', icon: MessageSquare },
  { title: 'RevOps Final View', url: '/revops-final', icon: ClipboardCheck },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { signOut, effectiveProfile, impersonatedUser, setImpersonatedUser } = useAuth();
  const { hasPageAccess, isLoading: permissionsLoading } = useRolePermissions();
  const currentPath = location.pathname;
  const isCollapsed = state === 'collapsed';

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/50 backdrop-blur-sm">
      <SidebarContent className="bg-gradient-subtle">
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-3">
            {!isCollapsed && (
              <div className="flex items-center gap-3 text-sidebar-primary">
                <div className="p-1.5 bg-gradient-primary rounded-lg shadow-md hover-glow">
                  <FileBarChart className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-lg">Book Builder</span>
              </div>
            )}
          </SidebarGroupLabel>
          
          <SidebarGroupContent className="px-2">
            <SidebarMenu className="space-y-2">
              {navigationItems.filter(item => {
                // Use dynamic permissions from database
                const permissionKey = urlToPermissionKey[item.url];
                if (permissionKey) {
                  return hasPageAccess(permissionKey);
                }
                // Fallback: show the item if no permission mapping exists
                return true;
              }).map((item, index) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                   <NavLink 
                      to={item.url} 
                      end 
                      className={({ isActive }) => 
                        `flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-300 group relative overflow-hidden ${
                          isActive 
                            ? 'bg-gradient-to-r from-primary/20 to-primary/10 text-primary border-r-2 border-primary shadow-sm' 
                            : 'hover:bg-sidebar-accent/70 text-sidebar-foreground hover:shadow-sm'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 transition-colors duration-200" />
                      {!isCollapsed && (
                        <span className="transition-all duration-200">
                          {item.title}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Enhanced User impersonation - only for RevOps */}
        {effectiveProfile?.role === 'REVOPS' && !isCollapsed && (
          <div className="p-3 border-t border-sidebar-border/50 bg-gradient-subtle">
            <UserImpersonation
              currentUser={effectiveProfile}
              onImpersonate={setImpersonatedUser}
              impersonatedUser={impersonatedUser}
            />
          </div>
        )}

        {/* Enhanced User info and sign out */}
        <div className="mt-auto p-3 border-t border-sidebar-border/50 bg-gradient-subtle">
          {!isCollapsed && effectiveProfile && (
            <div className="mb-3 p-3 card-glass rounded-lg border bg-card text-card-foreground shadow-sm">
              <div className="text-xs space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-2">
                  <div className="w-2 h-2 bg-success rounded-full" />
                  {effectiveProfile.full_name}
                </div>
                <div className="text-muted-foreground flex items-center gap-2">
                  <Badge variant="outline" className="text-xs px-2 py-0">
                    {effectiveProfile.role?.toLowerCase()}
                  </Badge>
                  <span>•</span>
                  <span>{effectiveProfile.region}</span>
                </div>
                {impersonatedUser && (
                  <Badge variant="warning" className="text-xs">
                    👤 Impersonating
                  </Badge>
                )}
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start hover:bg-destructive/10 hover:text-destructive transition-all group"
          >
            <LogOut className="h-4 w-4 group-hover:animate-bounce" />
            {!isCollapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}