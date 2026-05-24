import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Building2, KanbanSquare, CalendarDays,
  CheckSquare, Settings, ChevronLeft, ChevronRight, Zap, Plug,
  BarChart3, MessageSquare, Mail, Sparkles, Globe, TrendingUp,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useState, useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { usePermissions } from "@/hooks/usePermissions";

// ── Nav visible a todos los roles ─────────────────────────────────────────────
const navItems = [
  { title: "Dashboard",      url: "/",             icon: LayoutDashboard },
  { title: "Leads",          url: "/contacts",     icon: Users },
  { title: "Empresas",       url: "/companies",    icon: Building2 },
  { title: "Pipeline",       url: "/pipeline",     icon: KanbanSquare },
  { title: "Calendario",     url: "/calendar",     icon: CalendarDays },
  { title: "Tareas",         url: "/tasks",        icon: CheckSquare },
  { title: "Conversaciones", url: "/conversations",icon: MessageSquare },
];

// ── Grupos de sección "Avanzado" (admin / owner) ──────────────────────────────
const powerGroups = [
  {
    id: "marketing",
    label: "Marketing",
    icon: Mail,
    items: [
      { title: "Campañas",     url: "/email-campaigns", icon: BarChart3 },
      { title: "Email Builder",url: "/email-builder",   icon: Mail },
      { title: "Landings",     url: "/landing-builder", icon: Globe },
    ],
  },
  {
    id: "automatizaciones",
    label: "Automatizaciones",
    icon: Zap,
    items: [
      { title: "Flujos",          url: "/automations",            icon: Zap },
      { title: "IG Automaciones", url: "/instagram/automations",  icon: Sparkles },
      { title: "WA Plantillas",   url: "/whatsapp/templates",     icon: MessageSquare },
    ],
  },
  {
    id: "publicidad",
    label: "Publicidad",
    icon: TrendingUp,
    items: [
      { title: "Meta Ads", url: "/meta-ads", icon: BarChart3 },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    icon: Plug,
    items: [
      { title: "Integraciones", url: "/integrations", icon: Plug },
    ],
  },
];

const bottomItems = [
  { title: "Configuración", url: "/settings", icon: Settings },
];

// ── Componente principal ──────────────────────────────────────────────────────
export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Track which groups are open — all open by default
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(powerGroups.map((g) => [g.id, true]))
  );

  const { path } = useWorkspace();
  const { waUnread, igUnread } = useUnreadCounts();
  const { canAccessSettings, canAccessPowerFeatures } = usePermissions();

  useEffect(() => {
    const loadLogo = () => setLogoUrl(localStorage.getItem("crm_logo_url"));
    loadLogo();
    window.addEventListener("logo-updated", loadLogo);
    return () => window.removeEventListener("logo-updated", loadLogo);
  }, []);

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* ── Logo ── */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain shrink-0" />
        ) : (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 shadow-md ring-1 ring-white/10"
            style={{ backgroundImage: "linear-gradient(135deg, hsl(24 95% 58%) 0%, hsl(18 88% 50%) 100%)" }}
          >
            <Zap className="h-4 w-4 text-white fill-white" />
          </div>
        )}
        {!collapsed && (
          <span className="text-base font-bold tracking-tight text-white">
            Klosify <span className="text-primary">CRM</span>
          </span>
        )}
      </div>

      {/* ── Nav principal ── */}
      <nav className="flex-1 p-2 overflow-y-auto scrollbar-thin space-y-0.5">

        {/* Items visibles a todos */}
        {navItems.map((item) => {
          const badge =
            item.url === "/conversations" && waUnread + igUnread > 0
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
                <span className={cn(
                  "flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none",
                  collapsed ? "absolute top-1 right-1 h-4 min-w-[1rem] px-1" : "h-5 min-w-[1.25rem] px-1.5"
                )}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </NavLink>
          );
        })}

        {/* ── Secciones agrupadas (admin / owner) ── */}
        {canAccessPowerFeatures && (
          <div className={cn("mt-2", !collapsed && "space-y-0.5")}>

            {/* Separador */}
            {!collapsed && (
              <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                Avanzado
              </p>
            )}
            {collapsed && <div className="my-2 border-t border-sidebar-border/50" />}

            {powerGroups.map((group) => (
              <div key={group.id}>
                {/* Group header — only shown when expanded */}
                {!collapsed ? (
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent/50 transition-colors"
                  >
                    <group.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 transition-transform duration-150",
                        openGroups[group.id] && "rotate-90"
                      )}
                    />
                  </button>
                ) : (
                  /* Collapsed: show group icon as divider hint */
                  <div className="flex justify-center py-1 opacity-30">
                    <group.icon className="h-3 w-3" />
                  </div>
                )}

                {/* Group items */}
                {(collapsed || openGroups[group.id]) && (
                  <div className={cn(!collapsed && "ml-2 border-l border-sidebar-border/40 pl-1 mb-1")}>
                    {group.items.map((item) => (
                      <NavLink
                        key={item.url}
                        to={path(item.url)}
                        end={false}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5 relative",
                          collapsed && "justify-center px-2 hover:translate-x-0"
                        )}
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground !translate-x-0 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-primary"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="flex-1">{item.title}</span>}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* ── Bottom ── */}
      <div className="border-t border-sidebar-border p-2 space-y-0.5">
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
