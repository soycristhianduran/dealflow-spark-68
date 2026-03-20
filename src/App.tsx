import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
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
import DataDeletionPage from "./pages/DataDeletionPage";
import PrivacyPage from "./pages/PrivacyPage";
import ProfilePage from "./pages/ProfilePage";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;

  return (
    <Routes>
      <Route path="/auth" element={session ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
      <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
      <Route path="/contacts/:id" element={<ProtectedRoute><ContactDetailPage /></ProtectedRoute>} />
      <Route path="/companies" element={<ProtectedRoute><CompaniesPage /></ProtectedRoute>} />
      <Route path="/companies/:id" element={<ProtectedRoute><CompanyDetailPage /></ProtectedRoute>} />
      <Route path="/deals" element={<ProtectedRoute><DealsPage /></ProtectedRoute>} />
      <Route path="/deals/:id" element={<ProtectedRoute><DealDetailPage /></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
      <Route path="/meta-ads" element={<ProtectedRoute><MetaAdsPage /></ProtectedRoute>} />
      <Route path="/more" element={<ProtectedRoute><MorePage /></ProtectedRoute>} />
      <Route path="/data-deletion" element={<DataDeletionPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
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
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
