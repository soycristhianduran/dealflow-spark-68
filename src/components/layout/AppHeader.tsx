import { Bell, Search, Sun, Moon, Menu, LogOut, User, Settings, Zap, Mail, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

const mockNotifications = [
  { id: "1", text: "Tienes 3 tareas pendientes para hoy", type: "task", link: "/tasks", time: "Hace 5 min", unread: true },
  { id: "2", text: "Reunión con cliente en 1 hora", type: "meeting", link: "/calendar", time: "Hace 30 min", unread: true },
  { id: "3", text: "Nuevo lead desde Facebook Ads", type: "lead", link: "/contacts", time: "Hace 1 hora", unread: false },
  { id: "4", text: "Deal 'Proyecto Alpha' movido a Negociación", type: "deal", link: "/deals", time: "Hace 2 horas", unread: false },
];

export function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const loadLogo = () => setLogoUrl(localStorage.getItem("crm_logo_url"));
    loadLogo();
    window.addEventListener("logo-updated", loadLogo);
    return () => window.removeEventListener("logo-updated", loadLogo);
  }, []);

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "JD";
  const unreadCount = mockNotifications.filter(n => n.unread).length;

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
                {mockNotifications.slice(0, 2).map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNav(n.link)}
                    className="flex w-full items-start gap-2 rounded-md bg-accent/50 p-2.5 text-left hover:bg-accent transition-colors"
                  >
                    <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${n.unread ? "bg-destructive" : "bg-muted-foreground/30"}`} />
                    <p className="text-xs text-foreground">{n.text}</p>
                  </button>
                ))}
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

        {/* Notifications popover */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              title="Notificaciones"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Notificaciones</h3>
              <span className="text-xs text-muted-foreground">{unreadCount} sin leer</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {mockNotifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => { setNotifOpen(false); navigate(n.link); }}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent border-b last:border-b-0 ${n.unread ? "bg-accent/40" : ""}`}
                >
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.unread ? "bg-primary" : "bg-muted-foreground/30"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-snug">{n.text}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.time}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t px-4 py-2">
              <button
                onClick={() => { setNotifOpen(false); navigate("/settings"); }}
                className="w-full text-center text-xs font-medium text-primary hover:underline"
              >
                Ver todas las notificaciones
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Profile popover */}
        <Popover open={profileOpen} onOpenChange={setProfileOpen}>
          <PopoverTrigger asChild>
            <button className="hidden md:flex" title="Mi perfil">
              <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-transparent hover:ring-primary/20 transition-all">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <div className="flex items-center gap-3 p-4 border-b">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user?.email ?? "Usuario"}</p>
                <p className="text-xs text-muted-foreground">Plan activo</p>
              </div>
            </div>

            <div className="p-3 space-y-1.5 border-b">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{user?.email ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>{user?.phone ?? "Sin teléfono"}</span>
              </div>
            </div>

            <div className="p-1.5">
              <button
                onClick={() => { setProfileOpen(false); navigate("/settings"); }}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Mi perfil
              </button>
              <button
                onClick={() => { setProfileOpen(false); navigate("/settings"); }}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                Configuración
              </button>
              <Separator className="my-1" />
              <button
                onClick={() => { signOut(); setProfileOpen(false); }}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
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