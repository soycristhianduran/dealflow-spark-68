import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, KanbanSquare, MessageSquare, MoreHorizontal,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
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
  const { waUnread, igUnread } = useUnreadCounts();
  const unread = waUnread + igUnread;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border bg-card md:hidden">
      {mobileNavItems.map((item) => {
        const badge = item.url === "/conversations" ? unread : 0;
        return (
          <NavLink
            key={item.url}
            to={path(item.url)}
            end={item.url === "/"}
            className="relative flex flex-col items-center gap-0.5 px-2 py-1 text-muted-foreground transition-colors"
            activeClassName="text-primary"
          >
            <div className="relative">
              <item.icon className="h-5 w-5" />
              {badge > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">{t(`mobileBottomNav.${item.titleKey}`)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
