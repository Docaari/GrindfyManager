import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/Landing";
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
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/Sidebar";
// Placeholder pages - will be implemented later
const Calculadoras = () => <h1>Calculadoras</h1>;

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-poker-bg flex items-center justify-center">
        <div className="text-poker-gold text-xl">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <div className="flex h-screen bg-poker-bg">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/library" component={TournamentLibraryNew} />
          <Route path="/planner" component={WeeklyPlanner} />
          <Route path="/grind" component={GrindSession} />
          <Route path="/grind-live" component={GrindSessionLive} />
          <Route path="/mental" component={MentalPrep} />
          <Route path="/coach" component={GradePlanner} />
          <Route path="/upload" component={UploadHistory} />
          <Route path="/settings" component={Settings} />
          <Route path="/estudos" component={Studies} />
          <Route path="/calculadoras" component={Calculadoras} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;