import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { NavLink } from "@/components/NavLink";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTranslation } from "react-i18next";
import {
  Building2, CalendarDays, CheckSquare, Plug, Settings,
  Bot, Mail, Globe, Zap, TrendingUp, PhoneCall, Sparkles, MessageSquare, CreditCard, PenLine,
} from "lucide-react";

const moreItems = [
  { titleKey: "companies",           url: "/companies",              icon: Building2     },
  { titleKey: "calendar",            url: "/calendar",               icon: CalendarDays  },
  { titleKey: "tasks",               url: "/tasks",                  icon: CheckSquare   },
  { titleKey: "integrations",        url: "/integrations",           icon: Plug          },
  { titleKey: "chatAgent",           url: "/ai-agent",               icon: Bot           },
  { titleKey: "voiceAgent",          url: "/calling-agent",          icon: PhoneCall     },
  { titleKey: "emailCampaigns",      url: "/email-campaigns",        icon: Mail          },
  { titleKey: "emailBuilder",        url: "/email-builder",          icon: PenLine       },
  { titleKey: "landings",            url: "/landing-builder",        icon: Globe         },
  { titleKey: "automationFlows",     url: "/automations",            icon: Zap           },
  { titleKey: "instagramAutomation", url: "/instagram/automations",  icon: Sparkles      },
  { titleKey: "whatsappTemplates",   url: "/whatsapp/templates",     icon: MessageSquare },
  { titleKey: "metaAds",             url: "/meta-ads",               icon: TrendingUp    },
  { titleKey: "billing",             url: "/billing",                icon: CreditCard    },
  { titleKey: "settings",            url: "/settings",               icon: Settings      },
];

export default function MorePage() {
  const { path } = useWorkspace();
  const { t } = useTranslation();

  return (
    <AppLayout>
      <AppHeader title={t("morePage.title")} />
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
              <span>{t(`morePage.${item.titleKey}`)}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
