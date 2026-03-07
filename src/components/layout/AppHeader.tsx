import { Bell, Search, Sun, Moon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/components/ThemeProvider";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6 shrink-0">
      <div>
        <h1 className="text-lg font-semibold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
          className="h-9 w-9"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title={resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro"}
        >
          {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">JD</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
