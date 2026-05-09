import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Building2, Handshake,
  KanbanSquare, CalendarDays, CheckSquare, Settings, ChevronLeft, Zap, Plug, BarChart3, MessageSquare, Mail
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useState, useEffect } from "react";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Leads", url: "/contacts", icon: Users },
  { title: "Empresas", url: "/companies", icon: Building2 },
  { title: "Deals", url: "/deals", icon: Handshake },
  { title: "Pipeline", url: "/pipeline", icon: KanbanSquare },
  { title: "Calendario", url: "/calendar", icon: CalendarDays },
  { title: "Tareas", url: "/tasks", icon: CheckSquare },
  { title: "Integraciones", url: "/integrations", icon: Plug },
  { title: "Meta Ads", url: "/meta-ads", icon: BarChart3 },
  { title: "WA Inbox", url: "/whatsapp/inbox", icon: MessageSquare },
  { title: "WA Plantillas", url: "/whatsapp/templates", icon: MessageSquare },
  { title: "Email Campañas", url: "/email-campaigns", icon: Mail },
  { title: "Automatizaciones", url: "/automations", icon: Zap },
];

const bottomItems = [
  { title: "Configuración", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

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
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain shrink-0" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary shrink-0">
            <Zap className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
        )}
        {!collapsed && <span className="text-base font-bold tracking-tight text-sidebar-accent-foreground">Velocity CRM</span>}
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
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
      </nav>

      {/* Bottom */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        {bottomItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
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
