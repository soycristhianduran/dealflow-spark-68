import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden md:flex">
        <AppSidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden pb-16 md:pb-0">
        {children}
      </div>
      <MobileBottomNav />
    </div>
  );
}
