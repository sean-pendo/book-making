import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Home, 
  Settings, 
  Users, 
  MessageSquare, 
  ClipboardCheck
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarTrigger,
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
  '/manager-dashboard': 'manager_dashboard',
  '/review': 'review_notes',
  '/revops-final': 'revops_final',
};

const navigationItems = [
  { title: 'Builds', url: '/', icon: Home, matchPaths: ['/', '/build'] },
  { title: 'Manager Dashboard', url: '/manager-dashboard', icon: Users, hideForRoles: ['REVOPS'] },
  { title: 'Review & Notes', url: '/review', icon: MessageSquare },
  { title: 'RevOps Final View', url: '/revops-final', icon: ClipboardCheck },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { effectiveProfile, impersonatedUser, setImpersonatedUser } = useAuth();
  const { hasPageAccess, isLoading: permissionsLoading } = useRolePermissions();
  const currentPath = location.pathname;
  const isCollapsed = state === 'collapsed';

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/50 backdrop-blur-sm">
      <SidebarContent className="bg-gradient-subtle">
        <SidebarGroup>
          <SidebarGroupContent className="px-2">
            {/* Collapse Toggle - aligned with nav dots */}
            <div className="flex items-center h-16 px-2">
              <div className="flex items-center justify-center w-[6px]">
                <SidebarTrigger className="hover-scale -ml-[2px]" />
              </div>
            </div>
            
            {/* Clean Vertical Stepper */}
            {(() => {
              const filteredItems = navigationItems.filter(item => {
                if (item.hideForRoles && effectiveProfile?.role) {
                  const userRole = effectiveProfile.role.toUpperCase();
                  if (item.hideForRoles.includes(userRole)) {
                    return false;
                  }
                }
                const permissionKey = urlToPermissionKey[item.url];
                if (permissionKey) {
                  return hasPageAccess(permissionKey);
                }
                return true;
              });
              
              // Helper to check if path matches item
              const isPathMatch = (item: typeof filteredItems[0], path: string) => {
                const pathsToMatch = item.matchPaths || [item.url];
                return pathsToMatch.some(p => path === p || path.startsWith(p + '/'));
              };
              
              const currentIndex = filteredItems.findIndex(item => isPathMatch(item, currentPath));
              
              // Calculate progress percentage based on current step
              const totalSteps = filteredItems.length;
              const progressPercent = totalSteps > 1 
                ? (currentIndex / (totalSteps - 1)) * 100 
                : 0;
              
              return (
                <div className="relative">
                  {/* Vertical line container - centered with dots */}
                  {!isCollapsed && (
                    <div 
                      className="absolute w-[2px] bg-border/50 rounded-full" 
                      style={{ 
                        left: '10px', 
                        top: '20px', 
                        bottom: '20px' 
                      }}
                    >
                      {/* Progress fill - colored portion */}
                      <div 
                        className="absolute top-0 left-0 w-full bg-primary/60 rounded-full transition-all duration-300"
                        style={{ height: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    {filteredItems.map((item, index) => {
                      const isItemActive = isPathMatch(item, currentPath);
                      const isCompleted = index < currentIndex;
                      const Icon = item.icon;
                      
                      return (
                        <NavLink
                          key={item.title}
                          to={item.url}
                          end
                          className={`
                            flex items-center gap-3 px-2 py-2.5 rounded-lg transition-all duration-200 group relative
                            ${isItemActive 
                              ? 'bg-primary/10 text-primary' 
                              : isCompleted
                                ? 'text-primary/70 hover:text-primary hover:bg-muted/50'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }
                          `}
                        >
                          {/* Dot indicator - centered at 11px (8px padding + 3px half of 6px dot) */}
                          <div className={`
                            relative z-10 w-[6px] h-[6px] rounded-full shrink-0 transition-all duration-200
                            ${isItemActive 
                              ? 'bg-primary scale-150 shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]' 
                              : isCompleted 
                                ? 'bg-primary/70' 
                                : 'bg-muted-foreground/40'
                            }
                          `} />
                          
                          {/* Icon and Label */}
                          {!isCollapsed && (
                            <>
                              <Icon className={`w-4 h-4 shrink-0 ${isCompleted ? 'opacity-80' : ''}`} />
                              <span className={`font-medium text-sm ${isCompleted ? 'opacity-80' : ''}`}>
                                {item.title}
                              </span>
                            </>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Enhanced User impersonation - only for users with developer=true */}
        {effectiveProfile?.developer === true && !isCollapsed && (
          <div className="p-3 border-t border-sidebar-border/50 bg-gradient-subtle">
            <UserImpersonation
              currentUser={effectiveProfile}
              onImpersonate={setImpersonatedUser}
              impersonatedUser={impersonatedUser}
            />
          </div>
        )}

        {/* User info and Settings link */}
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
                    {effectiveProfile.role?.toUpperCase()}
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
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 w-full ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-sidebar-accent/70 text-sidebar-foreground'
              }`
            }
          >
            <Settings className="h-4 w-4" />
            {!isCollapsed && <span>Settings</span>}
          </NavLink>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}