import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { NavLink } from "@/components/NavLink";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  Building2, CalendarDays, CheckSquare, Plug, Settings,
  Bot, Mail, Globe, Zap, TrendingUp, PhoneCall, Sparkles, MessageSquare, CreditCard, PenLine,
} from "lucide-react";

const moreItems = [
  { title: "Empresas",              url: "/companies",              icon: Building2     },
  { title: "Calendario",            url: "/calendar",               icon: CalendarDays  },
  { title: "Tareas",                url: "/tasks",                  icon: CheckSquare   },
  { title: "Integraciones",         url: "/integrations",           icon: Plug          },
  { title: "Agente de Chat",        url: "/ai-agent",               icon: Bot           },
  { title: "Agente de Voz",         url: "/calling-agent",          icon: PhoneCall     },
  { title: "Campañas Email",        url: "/email-campaigns",        icon: Mail          },
  { title: "Email Builder",         url: "/email-builder",          icon: PenLine       },
  { title: "Landings",              url: "/landing-builder",        icon: Globe         },
  { title: "Flujos (Automatiz.)",   url: "/automations",            icon: Zap           },
  { title: "Autom. Instagram",      url: "/instagram/automations",  icon: Sparkles      },
  { title: "Plantillas WhatsApp",   url: "/whatsapp/templates",     icon: MessageSquare },
  { title: "Meta Ads",              url: "/meta-ads",               icon: TrendingUp    },
  { title: "Facturación",           url: "/billing",                icon: CreditCard    },
  { title: "Configuración",         url: "/settings",               icon: Settings      },
];

export default function MorePage() {
  const { path } = useWorkspace();

  return (
    <AppLayout>
      <AppHeader title="Más opciones" />
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        <div className="space-y-1">
          {moreItems.map((item) => (
            <NavLink
              key={item.url}
              to={path(item.url)}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              activeClassName="bg-accent text-accent-foreground"
            >
              <item.icon className="h-5 w-5 text-muted-foreground" />
              <span>{item.title}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
