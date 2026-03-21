import { Switch, Route } from "wouter";
import { Suspense, lazy } from "react";
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
import Sidebar from "@/components/Sidebar";

// Lazy-loaded pages for code splitting
const Landing = lazy(() => import("@/pages/Landing"));
const Home = lazy(() => import("@/pages/Home"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const TournamentLibraryNew = lazy(() => import("@/pages/TournamentLibraryNew"));
const GrindSession = lazy(() => import("@/pages/GrindSession"));
const GrindSessionLive = lazy(() => import("@/pages/GrindSessionLive"));
const MentalPrep = lazy(() => import("@/pages/MentalPrep"));
const GradePlanner = lazy(() => import("@/pages/GradePlanner"));
const UploadHistory = lazy(() => import("@/pages/UploadHistory"));
const Settings = lazy(() => import("@/pages/Settings"));
const Studies = lazy(() => import("@/pages/Studies"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const AdminBugs = lazy(() => import("@/pages/AdminBugs"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Subscriptions = lazy(() => import("@/pages/Subscriptions"));
const SubscriptionDemo = lazy(() => import("@/pages/SubscriptionDemo"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmailPage"));
const SessionHistory = lazy(() => import("@/pages/SessionHistory"));

// Named exports need wrapper
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage").then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const RegistrationConfirmationPage = lazy(() => import("@/pages/RegistrationConfirmationPage").then(m => ({ default: m.RegistrationConfirmationPage })));
const Calculadoras = lazy(() => import("@/pages/Calculadoras"));
const CalculadoraPopup = lazy(() => import("@/pages/CalculadoraPopup"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-poker-bg flex items-center justify-center">
      <div className="text-poker-gold text-xl">Carregando...</div>
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />
          <Route path="/forgot-password" component={ForgotPasswordPage} />
          <Route path="/reset-password/:token" component={ResetPasswordPage} />
          <Route path="/verify-email" component={VerifyEmailPage} />
          <Route path="/registration-confirmation" component={RegistrationConfirmationPage} />
          <Route component={LoginPage} />
        </Switch>
      </Suspense>
    );
  }

  // Popup routes — standalone windows without sidebar/layout
  if (window.location.pathname.startsWith('/calculadora-popup/')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Route path="/calculadora-popup/:tool" component={CalculadoraPopup} />
      </Suspense>
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
              <Suspense fallback={<PageLoader />}>
                <Switch>
                  <Route path="/reset-password/:token" component={ResetPasswordPage} />
                  <Route path="/" component={() => (<ProtectedRoute><Home /></ProtectedRoute>)} />
                  <Route path="/home" component={() => (<ProtectedRoute><Home /></ProtectedRoute>)} />
                  <Route path="/dashboard" component={() => (<ProtectedRoute><Dashboard /></ProtectedRoute>)} />
                  <Route path="/library" component={() => (<ProtectedRoute><TournamentLibraryNew /></ProtectedRoute>)} />
                  <Route path="/grind" component={() => (<ProtectedRoute><GrindSession /></ProtectedRoute>)} />
                  <Route path="/grind-live" component={() => (<ProtectedRoute><GrindSessionLive /></ProtectedRoute>)} />
                  <Route path="/mental" component={() => (<ProtectedRoute><MentalPrep /></ProtectedRoute>)} />
                  <Route path="/coach" component={() => (<ProtectedRoute><GradePlanner /></ProtectedRoute>)} />
                  <Route path="/upload" component={() => (<ProtectedRoute><UploadHistory /></ProtectedRoute>)} />
                  <Route path="/settings" component={() => (<ProtectedRoute><Settings /></ProtectedRoute>)} />
                  <Route path="/estudos" component={() => (<ProtectedRoute><Studies /></ProtectedRoute>)} />
                  <Route path="/calculadoras" component={() => (<ProtectedRoute><Calculadoras /></ProtectedRoute>)} />
                  <Route path="/admin/dashboard" component={() => (<ProtectedRoute><AdminDashboard /></ProtectedRoute>)} />
                  <Route path="/admin/users" component={() => (<ProtectedRoute><AdminUsers /></ProtectedRoute>)} />
                  <Route path="/admin/bugs" component={() => (<ProtectedRoute><AdminBugs /></ProtectedRoute>)} />
                  <Route path="/analytics" component={() => (<ProtectedRoute><Analytics /></ProtectedRoute>)} />
                  <Route path="/subscriptions" component={() => (<ProtectedRoute><Subscriptions /></ProtectedRoute>)} />
                  <Route path="/subscription-demo" component={() => (<ProtectedRoute><SubscriptionDemo /></ProtectedRoute>)} />
                  <Route component={NotFound} />
                </Switch>
              </Suspense>
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
