import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { NotificationBanner } from "@/components/NotificationBanner";
import { NotificationModals } from "@/components/NotificationModals";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import TournamentLibraryNew from "@/pages/TournamentLibraryNew";
import WeeklyPlanner from "@/pages/WeeklyPlanner";
import GrindSession from "@/pages/GrindSession";
import GrindSessionLive from "@/pages/GrindSessionLive";
import MentalPrep from "@/pages/MentalPrep";
import GradePlanner from "@/pages/GradePlanner";
import UploadHistory from "@/pages/UploadHistory";
import Settings from "@/pages/Settings";
import Studies from "@/pages/Studies";
import AdminUsers from "@/pages/AdminUsers";
import AdminBugs from "@/pages/AdminBugs";
import AdminDashboard from "@/pages/AdminDashboard";
import Analytics from "@/pages/Analytics";
import Subscriptions from "@/pages/Subscriptions";
import SubscriptionDemo from "@/pages/SubscriptionDemo";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/Sidebar";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import VerifyEmailPage from "@/pages/VerifyEmailPage";
import { RegistrationConfirmationPage } from "@/pages/RegistrationConfirmationPage";
import Home from "@/pages/Home";
import PermissionTestComponent from "@/components/PermissionTestComponent";
// Placeholder pages - will be implemented later
const Calculadoras = () => <h1>Calculadoras</h1>;

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-poker-bg flex items-center justify-center">
        <div className="text-poker-gold text-xl">Verificando autenticação...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password/:token" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/registration-confirmation" component={RegistrationConfirmationPage} />
        <Route component={LoginPage} />
      </Switch>
    );
  }

  return (
    <SidebarProvider>
      <NotificationProvider>
        <AnalyticsTracker>
          <NotificationBanner />
          <NotificationModals />
          <div className="flex h-screen bg-poker-bg">
            <Sidebar />
            <div className="flex-1 overflow-auto">
              <Switch>
                {/* Public routes accessible even when authenticated */}
                <Route path="/reset-password/:token" component={ResetPasswordPage} />
                <Route path="/" component={() => (
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                )} />
                <Route path="/home" component={() => (
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                )} />
                <Route path="/dashboard" component={() => (
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                )} />
                <Route path="/library" component={() => (
                  <ProtectedRoute>
                    <TournamentLibraryNew />
                  </ProtectedRoute>
                )} />
                <Route path="/planner" component={() => (
                  <ProtectedRoute>
                    <WeeklyPlanner />
                  </ProtectedRoute>
                )} />
                <Route path="/grind" component={() => (
                  <ProtectedRoute>
                    <GrindSession />
                  </ProtectedRoute>
                )} />
                <Route path="/grind-live" component={() => (
                  <ProtectedRoute>
                    <GrindSessionLive />
                  </ProtectedRoute>
                )} />
                <Route path="/mental" component={() => (
                  <ProtectedRoute>
                    <MentalPrep />
                  </ProtectedRoute>
                )} />
                <Route path="/coach" component={() => (
                  <ProtectedRoute>
                    <GradePlanner />
                  </ProtectedRoute>
                )} />
                <Route path="/upload" component={() => (
                  <ProtectedRoute>
                    <UploadHistory />
                  </ProtectedRoute>
                )} />
                <Route path="/settings" component={() => (
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                )} />
                <Route path="/estudos" component={() => (
                  <ProtectedRoute>
                    <Studies />
                  </ProtectedRoute>
                )} />
                <Route path="/calculadoras" component={() => (
                  <ProtectedRoute>
                    <Calculadoras />
                  </ProtectedRoute>
                )} />
                <Route path="/admin/dashboard" component={() => (
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                )} />
                <Route path="/admin/users" component={() => (
                  <ProtectedRoute>
                    <AdminUsers />
                  </ProtectedRoute>
                )} />
                <Route path="/admin/bugs" component={() => (
                  <ProtectedRoute>
                    <AdminBugs />
                  </ProtectedRoute>
                )} />
                <Route path="/analytics" component={() => (
                  <ProtectedRoute>
                    <Analytics />
                  </ProtectedRoute>
                )} />
                <Route path="/subscriptions" component={() => (
                  <ProtectedRoute>
                    <Subscriptions />
                  </ProtectedRoute>
                )} />
                <Route path="/subscription-demo" component={() => (
                  <ProtectedRoute>
                    <SubscriptionDemo />
                  </ProtectedRoute>
                )} />
                <Route path="/test-permissions" component={() => (
                  <ProtectedRoute>
                    <PermissionTestComponent />
                  </ProtectedRoute>
                )} />
                <Route component={NotFound} />
              </Switch>
            </div>
          </div>
        </AnalyticsTracker>
      </NotificationProvider>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;