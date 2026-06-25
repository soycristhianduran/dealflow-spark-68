import { Toaster } from "@/components/ui/toaster";
import { CookieConsent } from "@/components/landing/CookieConsent";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { trackPageView } from "@/lib/metaPixel";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/context/OrganizationContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import WaitlistVIPPage from "./pages/WaitlistVIPPage";
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
import LandingBuilderPage from "./pages/LandingBuilderPage";
import AutomationsPage from "./pages/AutomationsPage";
import DataDeletionPage from "./pages/DataDeletionPage";
import DataDeletionStatusPage from "./pages/DataDeletionStatusPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import PricingPage from "./pages/PricingPage";
import BillingPage from "./pages/BillingPage";
import AIAgentPage from "./pages/AIAgentPage";
import CallingAgentPage from "./pages/CallingAgentPage";
import ProfilePage from "./pages/ProfilePage";
import InviteAcceptPage from "./pages/InviteAcceptPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import WorkspaceEntryPage from "./pages/WorkspaceEntryPage";
import OnboardingPage from "./pages/OnboardingPage";
import PlatformPage from "./pages/PlatformPage";
import IgVerifyPage from "./pages/IgVerifyPage";
import { useLeadNotifier } from "@/hooks/useLeadNotifier";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { LockoutScreen } from "@/components/billing/LockoutScreen";
import { useSubscription } from "@/hooks/useSubscription";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

// Redirect /billing?... → /w/{slug}/billing preserving query params
// Uses the same get_my_organization RPC as RootRoute for consistency
function BillingRedirect() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const search = typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    if (loading) return;
    if (!session) { setChecking(false); return; }
    supabase.rpc("get_my_organization").then(({ data }) => {
      const slug = data?.[0]?.org_slug || "_";
      navigate(`/w/${slug}/billing${search}`, { replace: true });
      setChecking(false);
    });
  }, [loading, session, navigate, search]);

  if (loading || (session && checking)) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;
  }
  if (!session) return <Navigate to="/auth?next=/billing" replace />;
  return null;
}

/** Root route: shows the marketing homepage for logged-out users, or redirects to workspace if logged in */
function RootRoute() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setChecking(false);
      return;
    }
    // New users without company_name need onboarding — UNLESS they joined an org
    // via invitation (a non-owner member), who must skip onboarding entirely.
    (async () => {
      const hasCompanyName = !!session.user.user_metadata?.company_name;
      const { data: members } = await supabase
        .from("organization_members").select("role").eq("user_id", session.user.id);
      const invited = (members || []).some((m: any) => m.role && m.role !== "owner");
      if (!hasCompanyName && !invited) {
        navigate("/onboarding", { replace: true });
        setChecking(false);
        return;
      }
      const { data } = await supabase.rpc("get_my_organization");
      const slug = data?.[0]?.org_slug;
      navigate(slug ? `/w/${slug}` : "/w/_/settings", { replace: true });
      setChecking(false);
    })();
  }, [loading, session, navigate]);

  if (loading || (session && checking)) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;
  }
  return <HomePage />;
}

// NOTE: The workspace routes + the billing lockout gate live in
// WorkspaceEntryPage (the component actually mounted at /w/:slug/*). A previous
// duplicate "WorkspaceRoutes" here was dead code AND held the only lockout check,
// so the lockout never ran. It has been removed to avoid that trap recurring.

// Fires a deduplicated Meta PageView (pixel + CAPI) on every route change.
function MetaPageView() {
  const location = useLocation();
  useEffect(() => { trackPageView(); }, [location.pathname]);
  return null;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invite" element={<InviteAcceptPage />} />
      <Route path="/data-deletion" element={<DataDeletionPage />} />
      {/* Alias en español — Meta rechaza URLs que contengan "data-deletion"
          en la ruta como filtro contra endpoints falsos.  /eliminar-datos
          sirve la misma página y es la URL que pegamos en Meta. */}
      <Route path="/eliminar-datos" element={<DataDeletionPage />} />
      {/* Status page Meta surfaces to the end user after a deletion callback */}
      <Route path="/data-deletion-status" element={<DataDeletionStatusPage />} />
      <Route path="/estado-eliminacion" element={<DataDeletionStatusPage />} />
      <Route path="/ig/verify/:token" element={<IgVerifyPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/privacidad" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/lista-vip" element={<WaitlistVIPPage />} />
      <Route path="/vip" element={<WaitlistVIPPage />} />

      {/* First-time onboarding for new users (Google OAuth + anyone missing company_name) */}
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Workspace entry point: validates slug + renders workspace */}
      <Route path="/w/:slug/*" element={<WorkspaceEntryPage />} />

      {/* Root: marketing homepage for guests, workspace redirect for logged-in users */}
      <Route path="/" element={<RootRoute />} />

      {/* Stripe redirects back to /billing — forward to workspace-scoped billing */}
      <Route path="/billing" element={<BillingRedirect />} />

      {/* Founder-only SaaS health monitor (server-gated to platform_admins) */}
      <Route path="/platform" element={<ProtectedRoute><PlatformPage /></ProtectedRoute>} />

      {/* Legacy flat routes (backward compat) — redirect to slug-based */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <CookieConsent />
          <BrowserRouter>
            <MetaPageView />
            <AuthProvider>
              <OrganizationProvider>
                <AppRoutes />
              </OrganizationProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
