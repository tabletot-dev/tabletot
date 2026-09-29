import { NavLink } from 'react-router-dom';
import { BarChart2, Anchor, GitFork, CheckSquare, Image, UtensilsCrossed, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import TabletotLogo from '@/components/TabletotLogo';

const navItems = [
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/venue', label: 'Venue', icon: Store },
  { to: '/curation/anchors', label: 'Anchor Items', icon: Anchor },
  { to: '/curation/pairings', label: 'Item Pairings', icon: GitFork },
  { to: '/curation/rules', label: 'Completion Rules', icon: CheckSquare },
  { to: '/curation/aov', label: 'AOV Lift', icon: BarChart2 },
  { to: '/curation/ads', label: 'Ads', icon: Image },
];

export function Sidebar() {
  return (
    <aside className="w-56 min-h-screen border-r border-border bg-card flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-border flex items-center gap-2.5">
        <TabletotLogo className="h-6 w-6 shrink-0 text-foreground" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Tabletot</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">Dashboard</p>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5">
        <p className="px-2 py-1.5 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
          Kiosk
        </p>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
