import { useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { AppBadgeSync } from "@/components/AppBadgeSync";
import { NewMessageSound } from "@/components/NewMessageSound";
import { usePermissions } from "@/hooks/usePermissions";

interface AppLayoutProps {
  children: React.ReactNode;
}

// Config / power / marketing routes: readonly members can view but not edit.
// A disabled <fieldset> neutralises form controls (buttons, inputs, selects) while
// leaving link/div navigation (view detail) and scrolling intact. Operational and
// inbox pages are excluded (they need filters/search/selection to view).
const GUARDED_SEGMENTS = [
  "/integrations", "/meta-ads", "/whatsapp/templates", "/instagram/automations",
  "/email-campaigns", "/email-builder", "/landing-builder", "/automations",
  "/ai-agent", "/calling-agent",
];

export function AppLayout({ children }: AppLayoutProps) {
  const { isReadonly } = usePermissions();
  const { pathname } = useLocation();
  const guard = isReadonly && GUARDED_SEGMENTS.some((seg) => pathname.includes(seg));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden md:flex">
        <AppSidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden pb-16 md:pb-0">
        {guard ? (
          <fieldset disabled className="flex flex-1 flex-col overflow-hidden border-0 p-0 m-0 min-w-0">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </div>
      <MobileBottomNav />
      <AppBadgeSync />
      <NewMessageSound />
    </div>
  );
}
