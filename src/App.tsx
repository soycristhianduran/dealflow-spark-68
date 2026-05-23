import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/context/OrganizationContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import ContactsPage from "./pages/ContactsPage";
import ContactDetailPage from "./pages/ContactDetailPage";
import CompaniesPage from "./pages/CompaniesPage";
import CompanyDetailPage from "./pages/CompanyDetailPage";
import DealsPage from "./pages/DealsPage";
import DealDetailPage from "./pages/DealDetailPage";
import PipelinePage from "./pages/PipelinePage";
import CalendarPage from "./pages/CalendarPage";
import TasksPage from "./pages/TasksPage";
import SettingsPage from "./pages/SettingsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import MorePage from "./pages/MorePage";
import MetaAdsPage from "./pages/MetaAdsPage";
import NotFound from "./pages/NotFound";
import WhatsAppTemplatesPage from "./pages/WhatsAppTemplatesPage";
import WhatsAppInboxPage from "./pages/WhatsAppInboxPage";
import InstagramInboxPage from "./pages/InstagramInboxPage";
import InstagramAutomationsPage from "./pages/InstagramAutomationsPage";
import ConversationsPage from "./pages/ConversationsPage";
import EmailCampaignsPage from "./pages/EmailCampaignsPage";
import EmailBuilderPage from "./pages/EmailBuilderPage";
import AutomationsPage from "./pages/AutomationsPage";
import DataDeletionPage from "./pages/DataDeletionPage";
import DataDeletionStatusPage from "./pages/DataDeletionStatusPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import PricingPage from "./pages/PricingPage";
import BillingPage from "./pages/BillingPage";
import ProfilePage from "./pages/ProfilePage";
import InviteAcceptPage from "./pages/InviteAcceptPage";
import WorkspaceEntryPage from "./pages/WorkspaceEntryPage";
import { useLeadNotifier } from "@/hooks/useLeadNotifier";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { LockoutScreen } from "@/components/billing/LockoutScreen";
import { useSubscription } from "@/hooks/useSubscription";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

/** After login, redirect user to their workspace slug URL */
function RootRedirect() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) { navigate("/auth", { replace: true }); return; }

    supabase.rpc("get_my_organization").then(({ data }) => {
      const slug = data?.[0]?.org_slug;
      if (slug) {
        navigate(`/w/${slug}`, { replace: true });
      } else {
        // No slug yet — go to settings so user can set one
        navigate("/w/_/settings", { replace: true });
      }
      setChecking(false);
    });
  }, [loading, session, navigate]);

  if (loading || checking) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;
  }
  return null;
}

function WorkspaceRoutes() {
  const { session, loading } = useAuth();
  const { locked } = useSubscription();
  useLeadNotifier();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;

  // If the trial expired without payment or subscription is canceled,
  // replace the entire workspace with the lockout screen. The user can
  // still reach /billing through the lockout's "Elegir un plan" button
  // (which routes outside this WorkspaceRoutes via the public /pricing).
  if (locked) {
    return <LockoutScreen />;
  }

  return (
    <>
      <TrialBanner />
      <Routes>
        {/* workspace root = dashboard */}
        <Route index element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
        <Route path="contacts/:id" element={<ProtectedRoute><ContactDetailPage /></ProtectedRoute>} />
        <Route path="companies" element={<ProtectedRoute><CompaniesPage /></ProtectedRoute>} />
        <Route path="companies/:id" element={<ProtectedRoute><CompanyDetailPage /></ProtectedRoute>} />
        <Route path="leads" element={<Navigate to="../contacts" replace />} />
        <Route path="leads/:id" element={<ProtectedRoute><DealDetailPage /></ProtectedRoute>} />
        <Route path="deals" element={<Navigate to="../contacts" replace />} />
        <Route path="deals/:id" element={<ProtectedRoute><DealDetailPage /></ProtectedRoute>} />
        <Route path="pipeline" element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
        <Route path="calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
        <Route path="integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
        <Route path="meta-ads" element={<ProtectedRoute><MetaAdsPage /></ProtectedRoute>} />
        <Route path="whatsapp/templates" element={<ProtectedRoute><WhatsAppTemplatesPage /></ProtectedRoute>} />
        <Route path="whatsapp/inbox" element={<ProtectedRoute><WhatsAppInboxPage /></ProtectedRoute>} />
        <Route path="instagram/inbox" element={<ProtectedRoute><InstagramInboxPage /></ProtectedRoute>} />
        <Route path="instagram/automations" element={<ProtectedRoute><InstagramAutomationsPage /></ProtectedRoute>} />
        <Route path="conversations" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
        <Route path="email-campaigns" element={<ProtectedRoute><EmailCampaignsPage /></ProtectedRoute>} />
        <Route path="email-builder" element={<ProtectedRoute><EmailBuilderPage /></ProtectedRoute>} />
        <Route path="automations" element={<ProtectedRoute><AutomationsPage /></ProtectedRoute>} />
        <Route path="more" element={<ProtectedRoute><MorePage /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/invite" element={<InviteAcceptPage />} />
      <Route path="/data-deletion" element={<DataDeletionPage />} />
      {/* Alias en español — Meta rechaza URLs que contengan "data-deletion"
          en la ruta como filtro contra endpoints falsos.  /eliminar-datos
          sirve la misma página y es la URL que pegamos en Meta. */}
      <Route path="/eliminar-datos" element={<DataDeletionPage />} />
      {/* Status page Meta surfaces to the end user after a deletion callback */}
      <Route path="/data-deletion-status" element={<DataDeletionStatusPage />} />
      <Route path="/estado-eliminacion" element={<DataDeletionStatusPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/pricing" element={<PricingPage />} />

      {/* Workspace entry point: validates slug + renders workspace */}
      <Route path="/w/:slug/*" element={<WorkspaceEntryPage />} />

      {/* Root: redirect to user's workspace slug */}
      <Route path="/" element={<RootRedirect />} />

      {/* Legacy flat routes (backward compat) — redirect to slug-based */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <OrganizationProvider>
              <AppRoutes />
            </OrganizationProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
