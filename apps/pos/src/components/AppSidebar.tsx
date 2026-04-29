import { useAuth } from '@/contexts/AuthContext';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
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
  SidebarFooter,
} from '@/components/ui/sidebar';
import { LayoutDashboard, ShoppingCart, FileText, Users, TrendingUp, Settings, FolderTree, UtensilsCrossed, LogOut, Coffee, Grid3X3, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AppSidebar() {
  const { state } = useSidebar();
  const { userRole, signOut, user } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname;
  
  const isCollapsed = state === 'collapsed';

  const allItems = [
    { title: 'Dashboard', url: '/', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff'] },
    { title: 'Billing', url: '/billing', icon: ShoppingCart, roles: ['admin', 'manager', 'staff'] },
    { title: 'Orders', url: '/orders', icon: FileText, roles: ['admin', 'manager', 'staff'] },
    { title: 'Tables', url: '/tables', icon: Grid3X3, roles: ['admin', 'manager'] },
    { title: 'Categories', url: '/admin/categories', icon: FolderTree, roles: ['admin', 'manager'] },
    { title: 'Menu Items', url: '/admin/menu-items', icon: UtensilsCrossed, roles: ['admin', 'manager'] },
    { title: 'Recommendations', url: '/admin/recommendations', icon: Sparkles, roles: ['admin', 'manager'] },
    { title: 'Staff', url: '/staff', icon: Users, roles: ['admin', 'manager'] },
    { title: 'Reports', url: '/reports', icon: TrendingUp, roles: ['admin', 'manager'] },
    { title: 'Settings', url: '/settings', icon: Settings, roles: ['admin', 'manager'] },
  ];

  const items = allItems.filter(item => 
    !item.roles || (userRole && item.roles.includes(userRole))
  );

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar className={isCollapsed ? 'w-14' : 'w-60'}>
      <SidebarContent>
        <div className="p-4 flex items-center gap-2 border-b border-border">
          <div className="rounded-lg bg-primary p-2">
            <Coffee className="h-5 w-5 text-primary-foreground" />
          </div>
          {!isCollapsed && <span className="font-bold text-lg">POS System</span>}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-muted/50"
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border">
        <div className="space-y-2">
          {!isCollapsed && user && (
            <div className="text-xs text-muted-foreground truncate">
              {user.email}
            </div>
          )}
          <Button
            variant="outline"
            size={isCollapsed ? 'icon' : 'default'}
            onClick={signOut}
            className="w-full"
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
