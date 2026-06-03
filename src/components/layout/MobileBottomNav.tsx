import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, KanbanSquare, MessageSquare, MoreHorizontal,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useWorkspace } from "@/hooks/useWorkspace";

const mobileNavItems = [
  { title: "Inicio",   url: "/",             icon: LayoutDashboard },
  { title: "Leads",    url: "/contacts",     icon: Users },
  { title: "Pipeline", url: "/pipeline",     icon: KanbanSquare },
  { title: "Mensajes", url: "/conversations",icon: MessageSquare },
  { title: "Más",      url: "/more",         icon: MoreHorizontal },
];

export function MobileBottomNav() {
  const { path } = useWorkspace();

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
          <span className="text-[10px] font-medium">{item.title}</span>
        </NavLink>
      ))}
    </nav>
  );
}
