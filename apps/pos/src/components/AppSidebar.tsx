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
import {
  ShoppingCart,
  ChefHat,
  ClipboardList,
  Grid3X3,
  TrendingUp,
  UtensilsCrossed,
  Users,
  Settings,
  LogOut,
  Coffee,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
};

const ROLE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  manager: 'secondary',
  staff: 'outline',
};

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { title: 'Billing',  url: '/billing',  icon: ShoppingCart,  roles: ['staff', 'manager', 'admin'] },
      { title: 'Kitchen',  url: '/kitchen',  icon: ChefHat,       roles: ['staff', 'manager', 'admin'] },
      { title: 'Orders',   url: '/orders',   icon: ClipboardList, roles: ['staff', 'manager', 'admin'] },
    ],
  },
  {
    label: 'Management',
    items: [
      { title: 'Tables',   url: '/tables',   icon: Grid3X3,       roles: ['manager', 'admin'] },
      { title: 'Reports',  url: '/reports',  icon: TrendingUp,    roles: ['manager', 'admin'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { title: 'Menu',     url: '/menu',     icon: UtensilsCrossed, roles: ['admin'] },
      { title: 'Staff',    url: '/staff',    icon: Users,           roles: ['admin'] },
      { title: 'Settings', url: '/settings', icon: Settings,        roles: ['admin'] },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { userRole, signOut, user } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname;
  const isCollapsed = state === 'collapsed';

  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => userRole && item.roles.includes(userRole)),
  })).filter(group => group.items.length > 0);

  return (
    <Sidebar className={isCollapsed ? 'w-14' : 'w-60'}>
      <SidebarContent>
        <div className="p-4 flex items-center gap-2 border-b border-border">
          <div className="rounded-lg bg-primary p-2">
            <Coffee className="h-5 w-5 text-primary-foreground" />
          </div>
          {!isCollapsed && <span className="font-bold text-lg">Tabletot POS</span>}
        </div>

        {visibleGroups.map(group => (
          <SidebarGroup key={group.label}>
            {!isCollapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={currentPath === item.url}>
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
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border">
        <div className="space-y-2">
          {!isCollapsed && user && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              {userRole && (
                <Badge variant={ROLE_VARIANT[userRole] ?? 'outline'} className="text-xs shrink-0">
                  {ROLE_LABEL[userRole] ?? userRole}
                </Badge>
              )}
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
