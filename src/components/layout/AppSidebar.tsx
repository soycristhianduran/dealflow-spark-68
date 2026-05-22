import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Building2,
  KanbanSquare, CalendarDays, CheckSquare, Settings, ChevronLeft, Zap, Plug, BarChart3, MessageSquare, Mail, Sparkles
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useState, useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { usePermissions } from "@/hooks/usePermissions";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Leads", url: "/contacts", icon: Users },
  { title: "Empresas", url: "/companies", icon: Building2 },
  { title: "Pipeline", url: "/pipeline", icon: KanbanSquare },
  { title: "Calendario", url: "/calendar", icon: CalendarDays },
  { title: "Tareas", url: "/tasks", icon: CheckSquare },
  { title: "Integraciones", url: "/integrations", icon: Plug },
  { title: "Meta Ads", url: "/meta-ads", icon: BarChart3 },
  { title: "Conversaciones", url: "/conversations", icon: MessageSquare },
  { title: "WA Plantillas", url: "/whatsapp/templates", icon: MessageSquare },
  { title: "IG Automatizaciones", url: "/instagram/automations", icon: Sparkles },
  { title: "Email Campañas", url: "/email-campaigns", icon: Mail },
  { title: "Automatizaciones", url: "/automations", icon: Zap },
];

const bottomItems = [
  { title: "Configuración", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const { path } = useWorkspace();
  const { waUnread, igUnread } = useUnreadCounts();
  const { canAccessSettings } = usePermissions();

  useEffect(() => {
    const loadLogo = () => setLogoUrl(localStorage.getItem("crm_logo_url"));
    loadLogo();
    window.addEventListener("logo-updated", loadLogo);
    return () => window.removeEventListener("logo-updated", loadLogo);
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo — sunset gradient bg + filled Zap icon, with subtle shadow */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain shrink-0" />
        ) : (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 shadow-md ring-1 ring-white/10"
            style={{
              backgroundImage:
                "linear-gradient(135deg, hsl(24 95% 58%) 0%, hsl(18 88% 50%) 100%)",
            }}
          >
            <Zap className="h-4 w-4 text-white fill-white" />
          </div>
        )}
        {!collapsed && (
          <span className="text-base font-bold tracking-tight text-white">
            Velocity <span className="text-primary">CRM</span>
          </span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          // Single unified "Conversaciones" badge sums both channels.  The
          // legacy /whatsapp/inbox and /instagram/inbox routes are still
          // reachable by direct URL but no longer in the sidebar.
          const badge =
            item.url === "/conversations" && (waUnread + igUnread) > 0
              ? waUnread + igUnread
              : 0;
          return (
            <NavLink
              key={item.url}
              to={path(item.url)}
              end={item.url === "/"}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5 relative",
                collapsed && "justify-center px-2 hover:translate-x-0"
              )}
              activeClassName="bg-sidebar-accent text-sidebar-accent-foreground !translate-x-0 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-primary"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">{item.title}</span>}
              {badge > 0 && (
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none",
                    collapsed
                      ? "absolute top-1 right-1 h-4 min-w-[1rem] px-1"
                      : "h-5 min-w-[1.25rem] px-1.5"
                  )}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        {canAccessSettings && bottomItems.map((item) => (
          <NavLink
            key={item.url}
            to={path(item.url)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-2"
            )}
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        ))}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ChevronLeft className={cn("h-4 w-4 shrink-0 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>Colapsar</span>}
        </button>
      </div>
    </aside>
  );
}
