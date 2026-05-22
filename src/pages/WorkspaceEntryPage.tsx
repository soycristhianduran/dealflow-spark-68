/**
 * WorkspaceEntryPage — handles /w/:slug/*
 *
 * Validates membership then renders the full app under the slug URL.
 * The slug stays visible in the URL for all navigation.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getRootAppUrl } from "@/lib/subdomain";
import { Loader2 } from "lucide-react";
import DashboardPage from "./DashboardPage";
import ContactsPage from "./ContactsPage";
import ContactDetailPage from "./ContactDetailPage";
import CompaniesPage from "./CompaniesPage";
import CompanyDetailPage from "./CompanyDetailPage";
import DealsPage from "./DealsPage";
import DealDetailPage from "./DealDetailPage";
import PipelinePage from "./PipelinePage";
import CalendarPage from "./CalendarPage";
import TasksPage from "./TasksPage";
import SettingsPage from "./SettingsPage";
import ProfilePage from "./ProfilePage";
import IntegrationsPage from "./IntegrationsPage";
import MetaAdsPage from "./MetaAdsPage";
import WhatsAppTemplatesPage from "./WhatsAppTemplatesPage";
import WhatsAppInboxPage from "./WhatsAppInboxPage";
import InstagramInboxPage from "./InstagramInboxPage";
import InstagramAutomationsPage from "./InstagramAutomationsPage";
import ConversationsPage from "./ConversationsPage";
import EmailCampaignsPage from "./EmailCampaignsPage";
import AutomationsPage from "./AutomationsPage";
import MorePage from "./MorePage";
import NotFound from "./NotFound";

function P({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function WorkspaceEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "allowed" | "denied" | "not_found">("loading");

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      navigate(`/auth?next=/w/${slug}`, { replace: true });
      return;
    }

    // Slug "_" is used internally when user has no slug yet
    if (!slug || slug === "_") {
      setStatus("allowed");
      return;
    }

    const check = async () => {
      const { data: orgRows } = await supabase
        .rpc("get_organization_by_slug", { p_slug: slug });

      const org = orgRows?.[0];
      if (!org) { setStatus("not_found"); return; }

      const { data: myOrgs } = await supabase.rpc("get_my_organization");
      const isMember = (myOrgs || []).some((r: any) => r.organization_id === org.id);

      setStatus(isMember ? "allowed" : "denied");
    };

    check();
  }, [authLoading, session, slug, navigate]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "allowed") {
    return (
      <Routes>
        <Route index element={<P><DashboardPage /></P>} />
        <Route path="contacts" element={<P><ContactsPage /></P>} />
        <Route path="contacts/:id" element={<P><ContactDetailPage /></P>} />
        <Route path="companies" element={<P><CompaniesPage /></P>} />
        <Route path="companies/:id" element={<P><CompanyDetailPage /></P>} />
        <Route path="leads" element={<P><DealsPage /></P>} />
        <Route path="leads/:id" element={<P><DealDetailPage /></P>} />
        <Route path="deals" element={<P><DealsPage /></P>} />
        <Route path="deals/:id" element={<P><DealDetailPage /></P>} />
        <Route path="pipeline" element={<P><PipelinePage /></P>} />
        <Route path="calendar" element={<P><CalendarPage /></P>} />
        <Route path="tasks" element={<P><TasksPage /></P>} />
        <Route path="settings" element={<P><SettingsPage /></P>} />
        <Route path="profile" element={<P><ProfilePage /></P>} />
        <Route path="integrations" element={<P><IntegrationsPage /></P>} />
        <Route path="meta-ads" element={<P><MetaAdsPage /></P>} />
        <Route path="whatsapp/templates" element={<P><WhatsAppTemplatesPage /></P>} />
        <Route path="whatsapp/inbox" element={<P><WhatsAppInboxPage /></P>} />
        <Route path="instagram/inbox" element={<P><InstagramInboxPage /></P>} />
        <Route path="instagram/automations" element={<P><InstagramAutomationsPage /></P>} />
        <Route path="conversations" element={<P><ConversationsPage /></P>} />
        <Route path="email-campaigns" element={<P><EmailCampaignsPage /></P>} />
        <Route path="automations" element={<P><AutomationsPage /></P>} />
        <Route path="more" element={<P><MorePage /></P>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  const isNotFound = status === "not_found";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 mx-auto">
          <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={isNotFound
                ? "M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                : "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              }
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {isNotFound ? "Espacio no encontrado" : "Acceso denegado"}
        </h1>
        <p className="text-muted-foreground">
          {isNotFound
            ? <>El espacio de trabajo <strong className="text-foreground">{slug}</strong> no existe.</>
            : <>No tienes acceso al espacio <strong className="text-foreground">{slug}</strong>. Debes ser invitado por el administrador.</>
          }
        </p>
        <a href={getRootAppUrl()} className="inline-block mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
          Ir a mi espacio de trabajo
        </a>
      </div>
    </div>
  );
}
