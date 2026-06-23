import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, KanbanSquare, MessageSquare, MoreHorizontal,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTranslation } from "react-i18next";

const mobileNavItems = [
  { titleKey: "home",     url: "/",             icon: LayoutDashboard },
  { titleKey: "leads",    url: "/contacts",     icon: Users },
  { titleKey: "pipeline", url: "/pipeline",     icon: KanbanSquare },
  { titleKey: "messages", url: "/conversations",icon: MessageSquare },
  { titleKey: "more",     url: "/more",         icon: MoreHorizontal },
];

export function MobileBottomNav() {
  const { path } = useWorkspace();
  const { t } = useTranslation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border bg-card md:hidden">
      {mobileNavItems.map((item) => (
        <NavLink
          key={item.url}
          to={path(item.url)}
          end={item.url === "/"}
          className="flex flex-col items-center gap-0.5 px-2 py-1 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <item.icon className="h-5 w-5" />
          <span className="text-[10px] font-medium">{t(`mobileBottomNav.${item.titleKey}`)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
