import { Bell, Search, Sun, Moon, Menu, LogOut, User, Settings, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadLogo = () => setLogoUrl(localStorage.getItem("crm_logo_url"));
    loadLogo();
    window.addEventListener("logo-updated", loadLogo);
    return () => window.removeEventListener("logo-updated", loadLogo);
  }, []);

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "JD";

  const handleNav = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        {/* Hamburger – mobile only */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b p-4">
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <SheetTitle className="text-base font-bold">Velocity CRM</SheetTitle>
              </div>
            </SheetHeader>

            {/* Profile section */}
            <div className="flex items-center gap-3 p-4">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user?.email ?? "Usuario"}</p>
                <p className="text-xs text-muted-foreground">Plan activo</p>
              </div>
            </div>

            <Separator />

            {/* Quick actions */}
            <div className="p-2 space-y-0.5">
              <button
                onClick={() => handleNav("/settings")}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Mi perfil
              </button>
              <button
                onClick={() => handleNav("/settings")}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                Configuración
              </button>
              <button
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                )}
                {resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro"}
              </button>
            </div>

            <Separator />

            {/* Notifications preview */}
            <div className="p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notificaciones</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-md bg-accent/50 p-2.5">
                  <span className="mt-0.5 h-2 w-2 rounded-full bg-destructive shrink-0" />
                  <p className="text-xs text-foreground">Tienes 3 tareas pendientes para hoy</p>
                </div>
                <div className="flex items-start gap-2 rounded-md bg-accent/50 p-2.5">
                  <span className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <p className="text-xs text-foreground">Reunión con cliente en 1 hora</p>
                </div>
              </div>
            </div>

            {/* Sign out */}
            <div className="mt-auto border-t p-2">
              <button
                onClick={() => { signOut(); setOpen(false); }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </SheetContent>
        </Sheet>

        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." className="h-9 w-56 pl-8 text-sm" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 hidden md:inline-flex"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title={resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro"}
        >
          {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          onClick={() => navigate("/settings")}
          title="Notificaciones"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
        </Button>
        <button
          onClick={() => navigate("/settings")}
          className="hidden md:flex"
          title="Mi perfil"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </div>
    </header>
  );
}