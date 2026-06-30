import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Building2, KanbanSquare, CalendarDays,
  CheckSquare, Settings, ChevronLeft, ChevronRight, Zap, Plug,
  BarChart3, MessageSquare, Mail, Sparkles, Globe, TrendingUp, CreditCard, Bot, PhoneCall,
} from "lucide-react";
import { KlosifyLogo } from "@/components/icons/KlosifyLogo";
import { NavLink } from "@/components/NavLink";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/hooks/useSubscription";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
import { useTranslation } from "react-i18next";

// ── Nav key definitions (titles are i18n keys resolved in component) ──────────
const navItemDefs = [
  { key: "nav.dashboard",    url: "/",              icon: LayoutDashboard },
  { key: "nav.leads",        url: "/contacts",      icon: Users },
  { key: "nav.companies",    url: "/companies",     icon: Building2 },
  { key: "nav.pipeline",     url: "/pipeline",      icon: KanbanSquare },
  { key: "nav.calendar",     url: "/calendar",      icon: CalendarDays },
  { key: "nav.tasks",        url: "/tasks",         icon: CheckSquare },
  { key: "nav.conversations",url: "/conversations", icon: MessageSquare },
];

const powerGroupDefs = [
  {
    id: "agentes",
    labelKey: "nav.advanced",
    icon: Bot,
    items: [
      { key: "nav.chatAgent", url: "/ai-agent",      icon: MessageSquare },
      { key: "nav.voiceAgent",url: "/calling-agent", icon: PhoneCall },
    ],
  },
  {
    id: "marketing",
    labelKey: "nav.marketing",
    icon: Mail,
    items: [
      { key: "nav.campaigns",    url: "/email-campaigns", icon: BarChart3 },
      { key: "nav.emailBuilder", url: "/email-builder",   icon: Mail },
      { key: "nav.landingPages", url: "/landing-builder", icon: Globe },
    ],
  },
  {
    id: "automatizaciones",
    labelKey: "nav.automations",
    icon: Zap,
    items: [
      { key: "nav.flows",         url: "/automations",           icon: Zap },
      { key: "nav.igAutomations", url: "/instagram/automations", icon: Sparkles },
      { key: "nav.waTemplates",   url: "/whatsapp/templates",    icon: MessageSquare },
    ],
  },
  {
    id: "publicidad",
    labelKey: "nav.advertising",
    icon: TrendingUp,
    items: [
      { key: "nav.advertising", url: "/meta-ads", icon: BarChart3 },
    ],
  },
  {
    id: "sistema",
    labelKey: "nav.system",
    icon: Plug,
    items: [
      { key: "nav.settings", url: "/integrations", icon: Plug },
    ],
  },
];

const bottomItemDefs = [
  { key: "nav.billing",  url: "/billing",  icon: CreditCard },
  { key: "nav.settings", url: "/settings", icon: Settings },
];

// ── Componente principal ──────────────────────────────────────────────────────
export function AppSidebar() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const location = useLocation();

  // Gate certain nav items behind plan features. Voice Agent is Pro+ only;
  // while the subscription is still loading we keep it hidden to avoid a flash.
  const { subscription, loading: subLoading } = useSubscription();
  const canVoiceAgent = !!subscription?.featureVoiceAgent;

  // Resolve translated arrays inside component so they react to language changes
  const navItems = navItemDefs.map((d) => ({ ...d, title: t(d.key) }));
  const powerGroups = powerGroupDefs.map((g) => ({
    ...g,
    label: t(g.labelKey),
    items: g.items
      .filter((i) => i.key !== "nav.voiceAgent" || (!subLoading && canVoiceAgent))
      .map((i) => ({ ...i, title: t(i.key) })),
  }));
  const bottomItems = bottomItemDefs.map((d) => ({ ...d, title: t(d.key) }));

  // Track which groups are open — closed by default, auto-open the active group
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // Restore from localStorage if available
    try {
      const saved = localStorage.getItem("crm_sidebar_groups");
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default: all closed
    return Object.fromEntries(powerGroups.map((g) => [g.id, false]));
  });

  const { path } = useWorkspace();
  const { waUnread, igUnread } = useUnreadCounts();
  const { canAccessSettings, canViewPowerFeatures } = usePermissions();
  // Read-only members also see Settings/Billing (view-only); vendors do not.
  const canViewBottom = canAccessSettings || canViewPowerFeatures;

  // Auto-open the group that contains the current page
  useEffect(() => {
    const currentPath = location.pathname;
    powerGroups.forEach((group) => {
      const isActiveGroup = group.items.some((item) => currentPath.includes(item.url));
      if (isActiveGroup) {
        setOpenGroups((prev) => {
          if (prev[group.id]) return prev; // already open, skip
          const next = { ...prev, [group.id]: true };
          try { localStorage.setItem("crm_sidebar_groups", JSON.stringify(next)); } catch {}
          return next;
        });
      }
    });
  }, [location.pathname]);

  useEffect(() => {
    const loadLogo = () => setLogoUrl(localStorage.getItem("crm_logo_url"));
    loadLogo();
    window.addEventListener("logo-updated", loadLogo);
    return () => window.removeEventListener("logo-updated", loadLogo);
  }, []);

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem("crm_sidebar_groups", JSON.stringify(next)); } catch {}
      return next;
    });

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
          <KlosifyLogo size={32} />
        )}
        {!collapsed && (
          <span className="text-base font-bold tracking-tight text-white">
            Klosify <span className="text-primary">CRM</span>
          </span>
        )}
      </div>

      {/* ── Selector de organización (multi-org / gestores) ── */}
      <OrgSwitcher collapsed={collapsed} />

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

        {/* ── Secciones agrupadas (admin / owner / solo lectura ven; vendor no) ── */}
        {canViewPowerFeatures && (
          <div className={cn("mt-2", !collapsed && "space-y-0.5")}>

            {/* Separador */}
            {!collapsed && (
              <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                {t("nav.advanced")}
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

                {/* Group items — animated collapse */}
                <div className={cn(
                  "overflow-hidden transition-all duration-200",
                  (collapsed || openGroups[group.id]) ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                )}>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* ── Bottom ── */}
      <div className="border-t border-sidebar-border p-2 space-y-0.5">
        {canViewBottom && bottomItems.map((item) => (
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
          {!collapsed && <span>{t("nav.collapse")}</span>}
        </button>
      </div>
    </aside>
  );
}
