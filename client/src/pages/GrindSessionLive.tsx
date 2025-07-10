import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, Plus, Clock, DollarSign, Trophy, Target, Coffee, SkipForward, X, ChevronDown, ChevronUp, UserPlus, Award, Coins, Edit, XCircle, Undo2, PlayCircle, FileText, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GrindSession {
  id: string;
  userId: string;
  date: string;
  status: string;
  preparationNotes?: string;
  preparationPercentage?: number;
  dailyGoals?: string;
  skipBreaksToday: boolean;
  objectiveCompleted?: boolean;
  finalNotes?: string;
}

interface SessionTournament {
  id: string;
  sessionId: string;
  site: string;
  name?: string;
  buyIn: string;
  rebuys: number;
  result: string;
  position?: number;
  fieldSize?: number;
  status: string;
  fromPlannedTournament: boolean;
}

interface BreakFeedback {
  id: string;
  sessionId: string;
  breakTime: string;
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  notes?: string;
}

// Helper functions for tournament categorization and colors
const getSiteColor = (site: string): string => {
  const colors: { [key: string]: string } = {
    'PokerStars': 'bg-red-600',
    'GGPoker': 'bg-orange-600',
    'GGNetwork': 'bg-orange-600',
    'PartyPoker': 'bg-pink-600',
    '888poker': 'bg-blue-600',
    'WPN': 'bg-purple-600',
    'Chico': 'bg-yellow-600',
    'iPoker': 'bg-green-600',
    'Bodog': 'bg-indigo-600',
    'CoinPoker': 'bg-amber-600',
    'Revolution': 'bg-teal-600'
  };
  return colors[site] || 'bg-gray-600';
};

const getCategoryColor = (category: string): string => {
  const colors: { [key: string]: string } = {
    'Vanilla': 'bg-blue-600',
    'PKO': 'bg-red-600',
    'Mystery': 'bg-purple-600'
  };
  return colors[category] || 'bg-gray-600';
};

const getSpeedColor = (speed: string): string => {
  const colors: { [key: string]: string } = {
    'Normal': 'bg-green-600',
    'Turbo': 'bg-yellow-600',
    'Hyper': 'bg-red-600'
  };
  return colors[speed] || 'bg-gray-600';
};

const formatNumberWithDots = (num: string | number): string => {
  const numStr = String(num);
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const generateTournamentName = (tournament: any): string => {
  if (tournament.name && tournament.name.trim()) {
    // Format guaranteed values in existing titles
    return tournament.name.replace(/\b(\d{4,})\b/g, (match: string) => formatNumberWithDots(match));
  }

  const guaranteed = tournament.guaranteed ? ` $${formatNumberWithDots(tournament.guaranteed)}` : '';
  return `${tournament.type || tournament.category || 'Vanilla'} $${formatNumberWithDots(tournament.buyIn)}${guaranteed} ${tournament.site}`;
};

export default function GrindSessionLive() {
  const [, setLocation] = useLocation();
  const [activeSession, setActiveSession] = useState<GrindSession | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [showAddTournamentDialog, setShowAddTournamentDialog] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionObjectiveCompleted, setSessionObjectiveCompleted] = useState(false);
  const [sessionFinalNotes, setSessionFinalNotes] = useState("");
  const [showCompletedTournaments, setShowCompletedTournaments] = useState(false);
  const [preparationPercentage, setPreparationPercentage] = useState(50);
  const [preparationObservations, setPreparationObservations] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");

  // Tournament states and dialogs
  const [registrationDialogs, setRegistrationDialogs] = useState<{[key: string]: boolean}>({});
  const [editDialogs, setEditDialogs] = useState<{[key: string]: boolean}>({});
  const [registrationData, setRegistrationData] = useState<{[key: string]: {prizeItm: string, bounty: string, position: string}}>({});
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [showPendingTournamentsDialog, setShowPendingTournamentsDialog] = useState(false);
  const [pendingTournaments, setPendingTournaments] = useState<any[]>([]);
  const [newTournament, setNewTournament] = useState({
    site: "",
    name: "",
    buyIn: "",
    type: "Vanilla",
    speed: "Normal",
    scheduledTime: "",
    fieldSize: "",
    rebuys: 0,
    result: "0",
    position: null,
    status: "upcoming"
  });

  // Break feedback form
  const [breakFeedback, setBreakFeedback] = useState({
    foco: 5,
    energia: 5,
    confianca: 5,
    inteligenciaEmocional: 5,
    interferencias: 5,
    notes: ""
  });



  const [showBreakManagementDialog, setShowBreakManagementDialog] = useState(false);
  const [sessionElapsedTime, setSessionElapsedTime] = useState("");
  const [showEditTournamentDialog, setShowEditTournamentDialog] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Timer for session elapsed time
  useEffect(() => {
    if (activeSession) {
      const updateElapsedTime = () => {
        const sessionStart = new Date(activeSession.date);
        const now = new Date();
        const diffMs = now.getTime() - sessionStart.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setSessionElapsedTime(`${hours}h ${minutes}m`);
      };

      updateElapsedTime();
      const interval = setInterval(updateElapsedTime, 60000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [activeSession]);

  // Get current day of week (0 = Sunday, 1 = Monday, etc.)
  const currentDayOfWeek = new Date().getDay();

  // Fetch active session
  const { data: sessions } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
  });

  // Fetch planned tournaments for today
  const { data: plannedTournaments, refetch: refetchTournaments } = useQuery({
    queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek],
    queryFn: async () => {
      const response = await fetch(`/api/session-tournaments/by-day/${currentDayOfWeek}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch planned tournaments");
      const data = await response.json();
      console.log('Fresh tournament data from API:', data);
      return data;
    },
    staleTime: 0, // Always fetch fresh data
    cacheTime: 0, // Don't cache at all
  });

  // Fetch session tournaments
  const { data: sessionTournaments } = useQuery({
    queryKey: ["/api/session-tournaments", activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const response = await fetch(`/api/session-tournaments?sessionId=${activeSession.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch session tournaments");
      return response.json();
    },
    enabled: !!activeSession?.id,
  });

  // Query for break feedbacks during the active session
  const { data: breakFeedbacks = [] } = useQuery({
    queryKey: [`/api/break-feedbacks`, activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const response = await fetch(`/api/break-feedbacks?sessionId=${activeSession.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch break feedbacks");
      return response.json();
    },
    enabled: !!activeSession?.id,
  });

  // Check for active session on load
  useEffect(() => {
    if (sessions) {
      const todaySession = sessions.find((s: GrindSession) => 
        s.status === "active" && 
        new Date(s.date).toDateString() === new Date().toDateString()
      );
      setActiveSession(todaySession || null);
    }
  }, [sessions]);

  // Break timer simulation - show dialog every hour (for demo: every 5 seconds)
  useEffect(() => {
    if (activeSession && !activeSession.skipBreaksToday) {
      const timer = setInterval(() => {
        // Check if it's 14:55 or 15:55 (or every hour for demo)
        const now = new Date();
        const minutes = now.getMinutes();
        const hours = now.getHours();

        // Show break dialog at xx:54 (6 minutes before the hour)
        if (minutes === 54) {
          setShowBreakDialog(true);
        }
      }, 60000); // Check every minute

      return () => clearInterval(timer);
    }
  }, [activeSession]);

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (data: { preparationNotes: string; dailyGoals: string }) => {
      const sessionData = {
        date: new Date().toISOString(),
        status: "active",
        preparationNotes: data.preparationNotes,
        dailyGoals: data.dailyGoals,
        skipBreaksToday: false,
      };
      const response = await apiRequest("/api/grind-sessions", {
        method: "POST",
        body: JSON.stringify(sessionData),
      });
      return response.json();
    },
    onSuccess: (session) => {
      setActiveSession(session);
      setShowStartDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Sessão Iniciada",
        description: "Sua sessão de grind foi iniciada com sucesso!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add tournament mutation
  const addTournamentMutation = useMutation({
    mutationFn: async (tournamentData: any) => {
      const data = {
        userId: activeSession?.userId,
        sessionId: activeSession?.id,
        site: tournamentData.site,
        name: tournamentData.name || `${tournamentData.site} ${tournamentData.type || 'Tournament'}`,
        buyIn: tournamentData.buyIn,
        rebuys: 0,
        result: "0",
        bounty: "0",
        status: "upcoming",
        fromPlannedTournament: false,
        fieldSize: tournamentData.fieldSize ? parseInt(tournamentData.fieldSize) : null,
        position: null,
        startTime: null,
        endTime: null,
        time: tournamentData.scheduledTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        type: tournamentData.type || 'Vanilla',
        speed: tournamentData.speed || 'Normal',
        guaranteed: tournamentData.guaranteed || null
      };

      console.log('Creating manual tournament with data:', data);
      const response = await fetch("/api/session-tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create tournament");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });

      // Force refresh the current day data
      const currentDayOfWeek = new Date().getDay();
      queryClient.removeQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });

      setTimeout(() => {
        refetchTournaments();
      }, 100);

      setShowAddTournamentDialog(false);
      setNewTournament({
        site: "",
        name: "",
        buyIn: "",
        type: "Vanilla",
        speed: "Normal",
        scheduledTime: "",
        fieldSize: "",
        rebuys: 0,
        result: "0",
        position: null,
        status: "upcoming"
      });
      toast({
        title: "Torneio Adicionado",
        description: "Torneio adicionado à sessão com sucesso!",
      });
    },
    onError: (error: any) => {
      console.error('Failed to create tournament:', error);
      toast({
        title: "Erro ao Adicionar Torneio",
        description: error.message || "Falha ao adicionar torneio à sessão",
        variant: "destructive",
      });
    },
  });

  // Update tournament mutation
  const updateTournamentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      console.log('Update mutation called with:', { id, data });

      // Determine endpoint based on ID prefix
      let endpoint;
      let apiId;

      if (id.startsWith('planned-')) {
        // For planned tournaments, use the actual ID without prefix
        apiId = id.substring(8);
        endpoint = `/api/planned-tournaments/${apiId}`;
      } else {
        // For session tournaments, use the ID as-is
        apiId = id;
        endpoint = `/api/session-tournaments/${apiId}`;
      }

      console.log('Making API call to:', endpoint, 'with data:', data);
      const response = await apiRequest(endpoint, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      const result = await response.json();
      console.log('API response:', result);
      return result;
    },
    onSuccess: (result, variables) => {
      console.log('Update successful:', result);

      // Force immediate UI update with refetch
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });

      // Force refresh the current day data immediately
      const currentDayOfWeek = new Date().getDay();
      queryClient.removeQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });

      // Force immediate refetch
      setTimeout(() => {
        refetchTournaments();
      }, 100);

      toast({
        title: "Torneio Atualizado",
        description: "Status do torneio atualizado com sucesso!",
      });
    },
    onError: (error: any) => {
      console.error('Update failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      });

      let errorMessage = "Falha ao atualizar torneio";
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }

      toast({
        title: "Erro ao Atualizar Torneio",
        description: errorMessage,
        variant: "destructive"
      });
    },
  });

  // Break feedback mutation
  const breakFeedbackMutation = useMutation({
    mutationFn: async (feedback: any) => {
      const data = {
        ...feedback,
        sessionId: activeSession?.id,
        breakTime: new Date().toISOString(),
      };
      const response = await fetch("/api/break-feedbacks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to save break feedback");
      }
      return response.json();
    },
    onSuccess: () => {
      setShowBreakDialog(false);
      setBreakFeedback({
        foco: 5,
        energia: 5,
        confianca: 5,
        inteligenciaEmocional: 5,
        interferencias: 5,
        notes: ""
      });
      // Invalidate break feedbacks query to refresh the data
      queryClient.invalidateQueries({ queryKey: [`/api/break-feedbacks`, activeSession?.id] });
      toast({
        title: "Feedback Registrado",
        description: "Seu feedback do break foi registrado!",
      });
    },
  });

  // Function to check for pending tournaments
  const checkPendingTournaments = () => {
    const allTournaments = [
      ...(plannedTournaments || []),
      ...(sessionTournaments || [])
    ];

    console.log('checkPendingTournaments - All tournaments:', allTournaments.map(t => ({
      id: t.id,
      status: t.status,
      result: t.result,
      name: t.name
    })));

    // Find tournaments with status "registered" that don't have results (or result is 0)
    // Only consider tournaments that are truly in progress and need completion
    const pending = allTournaments.filter(t => {
      const isRegistered = t.status === 'registered';
      const hasNoResult = !t.result || t.result === '0' || t.result === '';
      const hasNoPosition = !t.position || t.position === null;
      const isActuallyPending = isRegistered && hasNoResult && hasNoPosition;

      console.log(`Tournament ${t.id}: status=${t.status}, result="${t.result}", position=${t.position}, isPending=${isActuallyPending}`);
      return isActuallyPending;
    });

    console.log('checkPendingTournaments - Pending tournaments found:', pending.length);

    return pending;
  };

  // Function to finalize pending tournaments automatically
  const finalizePendingTournamentsMutation = useMutation({
    mutationFn: async (pendingTournaments: any[]) => {
      const promises = pendingTournaments.map(tournament => {
        const endpoint = tournament.id.startsWith('planned-') 
          ? `/api/planned-tournaments/${tournament.id.substring(8)}`
          : `/api/session-tournaments/${tournament.id}`;

        return apiRequest(endpoint, {
          method: "PUT",
          body: JSON.stringify({
            status: "completed",
            result: "0", // No prize
            bounty: "0", // No bounty
            endTime: new Date().toISOString(),
            position: null // Can remain empty
          }),
        });
      });

      return Promise.all(promises);
    },
    onSuccess: () => {
      // Refresh tournament data
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });

      toast({
        title: "Torneios Finalizados",
        description: "Torneios pendentes foram marcados como GG! automaticamente.",
      });

      // Now actually end the session
      endSessionMutation.mutate();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao Finalizar Torneios",
        description: "Não foi possível finalizar os torneios pendentes. Tente novamente.",
        variant: "destructive",
      });
    }
  });

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/grind-sessions/${activeSession?.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: "completed",
          endTime: new Date().toISOString(),
          objectiveCompleted: sessionObjectiveCompleted,
          finalNotes: sessionFinalNotes,
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sessão Finalizada!",
        description: "Sua sessão foi concluída com sucesso. Redirecionando para o histórico...",
      });

      // Invalidate queries to refresh data and clear cache
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      queryClient.removeQueries({ queryKey: ["/api/grind-sessions"] }); // Force cache removal

      // Redirect to grind history page
      setTimeout(() => {
        setLocation("/grind");
      }, 1000);
    },
  });

  // Function to handle session finalization with validation
  const handleSessionFinalization = () => {
    const pending = checkPendingTournaments();

    console.log('Session finalization triggered. Pending tournaments:', pending);

    if (pending.length > 0) {
      // Show warning dialog for pending tournaments
      console.log('Found pending tournaments, showing warning dialog');
      setPendingTournaments(pending);
      setShowPendingTournamentsDialog(true);
    } else {
      // No pending tournaments, proceed directly to session summary
      console.log('No pending tournaments, opening session summary');
      setShowSessionSummary(true);
    }
  };

  const handleStartSession = async () => {
    console.log('Starting new session - resetting all tournaments...');

    try {
      // Reset all tournaments using dedicated API
      const response = await fetch('/api/grind-sessions/reset-tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        console.error('Failed to reset tournaments');
      } else {
        console.log('Successfully reset all tournaments to upcoming status');

        // Force refresh data after reset
        queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
        queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      }
    } catch (error) {
      console.error('Error resetting tournaments:', error);
    }

    const combinedPreparationNotes = `${preparationPercentage}% - ${preparationObservations}`;
    startSessionMutation.mutate({
      preparationNotes: combinedPreparationNotes,
      dailyGoals,
    });
  };

  const handleUpdateTournament = (tournament: any, field: string, value: any) => {
    console.log('handleUpdateTournament called with:', { id: tournament.id, field, value, currentRebuys: tournament.rebuys });

    // Handle rebuys increment correctly
    if (field === 'rebuys') {
      value = (tournament.rebuys || 0) + 1;
      console.log('Incrementing rebuys to:', value);
    }

    // Ensure proper data format
    const updateData = { [field]: value };

    // Handle special cases for data transformation
    if (field === 'position' && value !== null) {
      updateData[field] = parseInt(String(value)) || null;
    } else if (field === 'result' || field === 'bounty') {
      updateData[field] = String(value || '0');
    }

    console.log('Final update data:', updateData);

    updateTournamentMutation.mutate({
      id: tournament.id,
      data: updateData,
    });
  };

  const handleRebuyTournament = (tournament: any) => {
    console.log('Rebuy tournament called for:', tournament.id, 'Current rebuys:', tournament.rebuys);
    handleUpdateTournament(tournament, 'rebuys', (tournament.rebuys || 0) + 1);
  };

  // Functions to organize tournaments by status
  const organizeTournaments = (tournaments: any[] = []) => {
    const upcoming = tournaments.filter(t => 
      t.status === 'upcoming' || (!t.status && t.time)
    );

    const registered = tournaments.filter(t => 
      t.status === 'registered'
    );

    const completed = tournaments.filter(t => 
      t.status === 'completed' || t.status === 'finished'
    );

    return { registered, upcoming, completed };
  };

  const parseTime = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const formatTime = (timeStr: string): string => {
    return timeStr;
  };

  const postponeTournament = (tournamentId: string, minutes: number) => {
    const tournament = plannedTournaments?.find((t: any) => t.id === tournamentId);
    if (tournament) {
      const [hours, mins] = tournament.time.split(':').map(Number);
      const totalMinutes = hours * 60 + mins + minutes;
      const newHours = Math.floor(totalMinutes / 60) % 24;
      const newMins = totalMinutes % 60;
      const newTime = `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;

      updateTournamentMutation.mutate({
        id: tournamentId,
        data: { time: newTime }
      });
    }
  };

  const handleRegisterTournament = (tournamentId: string) => {
    console.log('Registering tournament:', tournamentId);

    // Extract the actual ID if it's a planned tournament
    const actualId = tournamentId.startsWith('planned-') ? tournamentId.substring(8) : tournamentId;
    console.log('Actual tournament ID:', actualId);

    updateTournamentMutation.mutate({
      id: tournamentId, // Use the full ID to determine the endpoint
      data: { 
        status: 'registered',
        startTime: new Date().toISOString()
      }
    });
  };

  const handleUnregisterTournament = (tournamentId: string) => {
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { status: 'upcoming' }
    });
  };

  const handleCompleteTournament = (tournamentId: string, data: any) => {
    const updateData = {
      status: 'finished',
      result: data.prizeItm || '0',  // Prize ITM
      bounty: data.bounty || '0',    // Bounty field
      position: data.position ? parseInt(data.position) : null,
      endTime: new Date().toISOString()
    };

    updateTournamentMutation.mutate({
      id: tournamentId,
      data: updateData
    });

    // Clear registration data for this tournament
    setRegistrationData(prev => {
      const updated = { ...prev };
      delete updated[tournamentId];
      return updated;
    });
  };

  const handleFoldTournament = (tournamentId: string) => {
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { status: 'folded' }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "registered":
        return <Badge className="bg-blue-600">Registrado</Badge>;
      case "active":
        return <Badge className="bg-green-600">Ativo</Badge>;
      case "finished":
        return <Badge className="bg-gray-600">Finalizado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSiteColor = (site: string): string => {
    switch (site.toLowerCase()) {
      case 'pokerstars':
        return 'bg-red-600';
      case 'partypoker':
        return 'bg-orange-500';
      case '888poker':
        return 'bg-blue-600';
      case 'ggnetwork':
      case 'ggpoker':
        return 'bg-red-800';
      case 'wpn':
        return 'bg-green-800';
      case 'ipoker':
        return 'bg-orange-600';
      case 'coinpoker':
        return 'bg-pink-500';
      case 'chico':
        return 'bg-white text-black';
      case 'revolution':
        return 'bg-pink-800';
      case 'bodog':
        return 'bg-red-400';
      default:
        return 'bg-gray-600';
    }
  };

  // Calculate session statistics during active session (Dashboard stats)
  const calculateSessionStats = () => {
    const allTournaments = [
      ...(plannedTournaments || []),
      ...(sessionTournaments || [])
    ];

    // Separate tournaments by status for better debugging
    const upcomingTournaments = allTournaments.filter(t => t.status === "upcoming");
    const registeredTournaments = allTournaments.filter(t => t.status === "registered");
    const finishedTournaments = allTournaments.filter(t => t.status === "finished" || t.status === "completed");

    console.log('Tournament organization:', {
      upcoming: upcomingTournaments.map(t => ({ id: t.id, status: t.status, name: t.name })),
      registered: registeredTournaments.map(t => ({ id: t.id, status: t.status, name: t.name })),
      completed: finishedTournaments.map(t => ({ id: t.id, status: t.status, name: t.name }))
    });

    const volume = finishedTournaments.length;
    const registros = [...registeredTournaments, ...finishedTournaments].length;

    // CONSISTENT FORMULA: Profit = Prize + Bounties - Buy-in - Rebuys
    const totalBounties = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => {
      const bounty = parseFloat(t.bounty || '0');
      console.log('SESSÃO ATIVA - Tournament', t.id, 'bounty:', bounty);
      return sum + bounty;
    }, 0);
    const totalPrizes = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => {
      const result = parseFloat(t.result || '0');
      console.log('SESSÃO ATIVA - Tournament', t.id, 'result:', result);
      return sum + result;
    }, 0);
    const investidoFinalizados = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => {
      const buyIn = parseFloat(t.buyIn || '0');
      const rebuys = t.rebuys || 0;
      return sum + (buyIn * (1 + rebuys));
    }, 0);
    const profit = (totalPrizes + totalBounties) - investidoFinalizados;
    
    console.log('SESSÃO ATIVA - Final calculation: prizes=', totalPrizes, 'bounties=', totalBounties, 'invested=', investidoFinalizados, 'profit=', profit);

    return {
      volume,
      registros,
      profit,
      totalBounties,
      totalPrizes,
      investidoFinalizados
    };
  };

  // Calculate final session statistics for session completion
  const calculateFinalSessionStats = () => {
    const allTournaments = [
      ...(plannedTournaments || []),
      ...(sessionTournaments || [])
    ];

    // Only include completed tournaments in final stats
    const completedTournaments = allTournaments.filter(t => t.status === "finished" || t.status === "completed");
    console.log('calculateFinalSessionStats - Completed tournaments:', completedTournaments.map(t => ({ id: t.id, status: t.status, buyIn: t.buyIn, rebuys: t.rebuys, result: t.result, bounty: t.bounty, name: t.name })));

    const volume = completedTournaments.length;
    const totalBuyins = completedTournaments.reduce((sum: number, t: any) => {
      const buyIn = parseFloat(t.buyIn || '0');
      const rebuys = t.rebuys || 0;
      const invested = buyIn * (1 + rebuys);
      console.log(`Tournament ${t.id}: buyIn=${buyIn}, rebuys=${rebuys}, invested=${invested}`);
      return sum + invested;
    }, 0);

    const totalResult = completedTournaments.reduce((sum: number, t: any) => {
      const result = parseFloat(t.result || '0');
      console.log(`Tournament ${t.id}: result=${result}`);
      return sum + result;
    }, 0);

    const totalBounties = completedTournaments.reduce((sum: number, t: any) => {
      const bounty = parseFloat(t.bounty || '0');
      console.log(`Tournament ${t.id}: bounty=${bounty}`);
      return sum + bounty;
    }, 0);

    const profit = (totalResult + totalBounties) - totalBuyins;
    console.log('Final profit calculation: result=', totalResult, 'bounties=', totalBounties, 'invested=', totalBuyins, 'profit=', profit);

    return {
      volume,
      profit,
      totalBuyins,
      totalResult,
      totalBounties,
      roi: totalBuyins > 0 ? ((profit / totalBuyins) * 100) : 0
    };
  };

  // Get session statistics for display
  const stats = calculateSessionStats();



  // Handle session end
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession) return;
      
      const finalStats = calculateFinalSessionStats();
      
      const sessionData = {
        status: "completed",
        objectiveCompleted: sessionObjectiveCompleted,
        finalNotes: sessionFinalNotes,
        volume: finalStats.volume,
        profit: finalStats.profit,
        totalBuyins: finalStats.totalBuyins,
        totalResult: finalStats.totalResult,
        totalBounties: finalStats.totalBounties,
        roi: finalStats.roi
      };
      
      const response = await apiRequest(`/api/grind-sessions/${activeSession.id}`, {
        method: "PUT",
        body: JSON.stringify(sessionData),
      });
      return response.json();
    },
    onSuccess: () => {
      setActiveSession(null);
      setShowSessionSummary(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Sessão Finalizada",
        description: "Sua sessão foi finalizada e os dados foram salvos!",
      });
      setLocation("/grind-session");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Sessão de Grind</h1>
        <p className="text-gray-300">Gerencie sua sessão de torneios em tempo real</p>
      </div>

      {/* Session not started */}
      {!activeSession && (
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold text-white mb-4">Nenhuma sessão ativa</h2>
          <p className="text-gray-400 mb-6">Inicie uma nova sessão para começar seu grind</p>
          <Button onClick={() => setShowStartDialog(true)} className="bg-red-600 hover:bg-red-700">
            <Play className="mr-2 h-4 w-4" />
            Iniciar Sessão
          </Button>
        </div>
      )}

      {/* Active session */}
      {activeSession && (
        <div className="space-y-6">
          {/* Session Header */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-white mb-1">Sessão Ativa</CardTitle>
                  <CardDescription className="text-gray-300">
                    Iniciada em {new Date(activeSession.date).toLocaleDateString('pt-BR')} às {new Date(activeSession.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Tempo de Sessão</div>
                  <div className="text-xl font-bold text-white">{sessionElapsedTime}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-700 p-3 rounded-lg">
                  <div className="text-sm text-gray-400">Volume</div>
                  <div className="text-xl font-bold text-white">{stats.volume}</div>
                </div>
                <div className="bg-gray-700 p-3 rounded-lg">
                  <div className="text-sm text-gray-400">Registros</div>
                  <div className="text-xl font-bold text-white">{stats.registros}</div>
                </div>
                <div className="bg-gray-700 p-3 rounded-lg">
                  <div className="text-sm text-gray-400">Profit</div>
                  <div className={`text-xl font-bold ${stats.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${stats.profit.toFixed(2)}
                  </div>
                </div>
                <div className="bg-gray-700 p-3 rounded-lg">
                  <div className="text-sm text-gray-400">Bounties</div>
                  <div className="text-xl font-bold text-yellow-400">${stats.totalBounties.toFixed(2)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => setShowAddTournamentDialog(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Torneio
            </Button>
            <Button
              onClick={() => setShowBreakManagementDialog(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Coffee className="mr-2 h-4 w-4" />
              Gerenciar Breaks
            </Button>
            <Button
              onClick={handleSessionFinalization}
              className="bg-red-600 hover:bg-red-700"
            >
              <SkipForward className="mr-2 h-4 w-4" />
              Finalizar Sessão
            </Button>
          </div>

          {/* Tournament Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming Tournaments */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Próximos Torneios</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(plannedTournaments || []).concat(sessionTournaments || [])
                    .filter(t => t.status === "upcoming")
                    .map((tournament, index) => (
                      <div key={tournament.id} className="bg-gray-700 p-3 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-white">{generateTournamentName(tournament)}</div>
                            <div className="text-sm text-gray-400">
                              {tournament.time} • ${tournament.buyIn} • {tournament.site}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updateTournamentMutation.mutate({ 
                                id: tournament.id, 
                                data: { status: "registered" } 
                              })}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingTournament(tournament);
                                setShowEditTournamentDialog(true);
                              }}
                              className="border-gray-600 text-gray-300 hover:bg-gray-600"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Registered Tournaments */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Torneios Registrados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(plannedTournaments || []).concat(sessionTournaments || [])
                    .filter(t => t.status === "registered")
                    .map((tournament, index) => (
                      <div key={tournament.id} className="bg-gray-700 p-3 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-white">{generateTournamentName(tournament)}</div>
                            <div className="text-sm text-gray-400">
                              {tournament.time} • ${tournament.buyIn} • {tournament.site}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                setRegistrationData(prev => ({
                                  ...prev,
                                  [tournament.id]: { prizeItm: '0', bounty: '0', position: '' }
                                }));
                                setRegistrationDialogs(prev => ({
                                  ...prev,
                                  [tournament.id]: true
                                }));
                              }}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              <Trophy className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateTournamentMutation.mutate({ 
                                id: tournament.id, 
                                data: { status: "upcoming" } 
                              })}
                              className="border-gray-600 text-gray-300 hover:bg-gray-600"
                            >
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Completed Tournaments */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <span>Torneios Finalizados ({(plannedTournaments || []).concat(sessionTournaments || []).filter(t => t.status === "finished" || t.status === "completed").length})</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCompletedTournaments(!showCompletedTournaments)}
                  className="text-gray-300 hover:text-white"
                >
                  {showCompletedTournaments ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CardTitle>
            </CardHeader>
            <Collapsible open={showCompletedTournaments}>
              <CollapsibleContent>
                <CardContent>
                  <div className="space-y-3">
                    {(plannedTournaments || []).concat(sessionTournaments || [])
                      .filter(t => t.status === "finished" || t.status === "completed")
                      .map((tournament, index) => (
                        <div key={tournament.id} className="bg-gray-700 p-3 rounded-lg">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-medium text-white">{generateTournamentName(tournament)}</div>
                              <div className="text-sm text-gray-400">
                                {tournament.time} • ${tournament.buyIn} • {tournament.site}
                              </div>
                              <div className="mt-2 flex gap-4 text-sm">
                                <span className="text-gray-300">Resultado: <span className="text-green-400">${tournament.result}</span></span>
                                <span className="text-gray-300">Bounty: <span className="text-yellow-400">${tournament.bounty}</span></span>
                                {tournament.position && <span className="text-gray-300">Posição: <span className="text-blue-400">{tournament.position}</span></span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>
      )}

      {/* Dialogs and Modals */}
      {/* Start Session Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Iniciar Nova Sessão</DialogTitle>
            <DialogDescription className="text-gray-300">
              Configure sua sessão de grind para hoje
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Preparação (%)</Label>
              <Input
                type="number"
                value={preparationPercentage}
                onChange={(e) => setPreparationPercentage(Number(e.target.value))}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="0-100"
              />
            </div>
            <div>
              <Label className="text-gray-300">Observações de Preparação</Label>
              <Textarea
                value={preparationObservations}
                onChange={(e) => setPreparationObservations(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Como está sua preparação mental, física e técnica?"
              />
            </div>
            <div>
              <Label className="text-gray-300">Objetivos do Dia</Label>
              <Textarea
                value={dailyGoals}
                onChange={(e) => setDailyGoals(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Quais são seus objetivos para esta sessão?"
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  const preparationNotes = `Preparação: ${preparationPercentage}%\n\n${preparationObservations}`;
                  startSessionMutation.mutate({
                    preparationNotes,
                    dailyGoals
                  });
                }}
                className="bg-red-600 hover:bg-red-700"
                disabled={startSessionMutation.isPending}
              >
                {startSessionMutation.isPending ? "Iniciando..." : "Iniciar Sessão"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowStartDialog(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-600"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Tournament Dialog */}
      <Dialog open={showAddTournamentDialog} onOpenChange={setShowAddTournamentDialog}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Adicionar Torneio</DialogTitle>
            <DialogDescription className="text-gray-300">
              Adicione um novo torneio à sua sessão
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Site</Label>
              <Select value={newTournament.site} onValueChange={(value) => setNewTournament(prev => ({ ...prev, site: value }))}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="Selecione o site" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="PokerStars">PokerStars</SelectItem>
                  <SelectItem value="GGPoker">GGPoker</SelectItem>
                  <SelectItem value="PartyPoker">PartyPoker</SelectItem>
                  <SelectItem value="888poker">888poker</SelectItem>
                  <SelectItem value="WPN">WPN</SelectItem>
                  <SelectItem value="CoinPoker">CoinPoker</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300">Nome do Torneio</Label>
              <Input
                value={newTournament.name}
                onChange={(e) => setNewTournament(prev => ({ ...prev, name: e.target.value }))}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Nome do torneio"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Buy-in</Label>
                <Input
                  type="number"
                  value={newTournament.buyIn}
                  onChange={(e) => setNewTournament(prev => ({ ...prev, buyIn: e.target.value }))}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-gray-300">Horário</Label>
                <Input
                  type="time"
                  value={newTournament.scheduledTime}
                  onChange={(e) => setNewTournament(prev => ({ ...prev, scheduledTime: e.target.value }))}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => addTournamentMutation.mutate(newTournament)}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={addTournamentMutation.isPending || !newTournament.site || !newTournament.buyIn}
              >
                {addTournamentMutation.isPending ? "Adicionando..." : "Adicionar"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddTournamentDialog(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-600"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Session Summary Dialog */}
      <Dialog open={showSessionSummary} onOpenChange={setShowSessionSummary}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Resumo da Sessão</DialogTitle>
            <DialogDescription className="text-gray-300">
              Revise os resultados da sua sessão antes de finalizar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Session Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-800 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{calculateFinalSessionStats().volume}</div>
                <div className="text-sm text-gray-400">Volume</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg text-center">
                <div className={`text-2xl font-bold ${calculateFinalSessionStats().profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${calculateFinalSessionStats().profit.toFixed(2)}
                </div>
                <div className="text-sm text-gray-400">Profit</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-400">${calculateFinalSessionStats().totalBuyins.toFixed(2)}</div>
                <div className="text-sm text-gray-400">Investido</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg text-center">
                <div className={`text-2xl font-bold ${calculateFinalSessionStats().roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {calculateFinalSessionStats().roi.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-400">ROI</div>
              </div>
            </div>

            {/* Session Notes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="objectiveCompleted"
                  checked={sessionObjectiveCompleted}
                  onChange={(e) => setSessionObjectiveCompleted(e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-800 border-gray-600 rounded focus:ring-red-500"
                />
                <Label htmlFor="objectiveCompleted" className="text-gray-300">
                  Objetivos da sessão foram cumpridos
                </Label>
              </div>
              <div>
                <Label className="text-gray-300">Observações Finais</Label>
                <Textarea
                  value={sessionFinalNotes}
                  onChange={(e) => setSessionFinalNotes(e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Como foi sua sessão? Que insights você teve?"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => endSessionMutation.mutate()}
                className="bg-red-600 hover:bg-red-700"
                disabled={endSessionMutation.isPending}
              >
                {endSessionMutation.isPending ? "Finalizando..." : "Finalizar Sessão"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSessionSummary(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-600"
              >
                Continuar Sessão
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Break Management Dialog */}
      <Dialog open={showBreakManagementDialog} onOpenChange={setShowBreakManagementDialog}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Gerenciar Breaks</DialogTitle>
            <DialogDescription className="text-gray-300">
              Registre seus breaks e monitore seu estado mental
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center">
              <Button
                onClick={() => setShowBreakDialog(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                <FileText className="mr-2 h-4 w-4" />
                Gerar Novo Report
              </Button>
            </div>
            
            {/* Break History */}
            <div className="max-h-64 overflow-y-auto">
              <div className="text-sm text-gray-400 mb-2">Breaks Registrados:</div>
              {breakFeedbacks.length === 0 ? (
                <div className="text-gray-500 text-center py-4">Nenhum break registrado ainda</div>
              ) : (
                <div className="space-y-2">
                  {breakFeedbacks.map((feedback: BreakFeedback, index: number) => (
                    <div key={feedback.id} className="bg-gray-800 p-3 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm text-gray-300">{feedback.breakTime}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Foco: {feedback.foco}/10 • Energia: {feedback.energia}/10 • Confiança: {feedback.confianca}/10
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">#{index + 1}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Break Feedback Dialog */}
      <Dialog open={showBreakDialog} onOpenChange={setShowBreakDialog}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Feedback do Break</DialogTitle>
            <DialogDescription className="text-gray-300">
              Como você está se sentindo neste momento?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Foco (1-10)</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={breakFeedback.foco}
                onChange={(e) => setBreakFeedback(prev => ({ ...prev, foco: Number(e.target.value) }))}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300">Energia (1-10)</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={breakFeedback.energia}
                onChange={(e) => setBreakFeedback(prev => ({ ...prev, energia: Number(e.target.value) }))}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300">Confiança (1-10)</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={breakFeedback.confianca}
                onChange={(e) => setBreakFeedback(prev => ({ ...prev, confianca: Number(e.target.value) }))}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300">Inteligência Emocional (1-10)</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={breakFeedback.inteligenciaEmocional}
                onChange={(e) => setBreakFeedback(prev => ({ ...prev, inteligenciaEmocional: Number(e.target.value) }))}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300">Interferências (1-10)</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={breakFeedback.interferencias}
                onChange={(e) => setBreakFeedback(prev => ({ ...prev, interferencias: Number(e.target.value) }))}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300">Observações</Label>
              <Textarea
                value={breakFeedback.notes}
                onChange={(e) => setBreakFeedback(prev => ({ ...prev, notes: e.target.value }))}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Observações sobre este break..."
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  // Submit break feedback
                  if (activeSession) {
                    const feedbackData = {
                      sessionId: activeSession.id,
                      breakTime: new Date().toLocaleTimeString('pt-BR'),
                      ...breakFeedback
                    };
                    
                    fetch('/api/break-feedbacks', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      credentials: 'include',
                      body: JSON.stringify(feedbackData),
                    })
                    .then(response => response.json())
                    .then(() => {
                      queryClient.invalidateQueries({ queryKey: [`/api/break-feedbacks`, activeSession.id] });
                      setShowBreakDialog(false);
                      setBreakFeedback({
                        foco: 5,
                        energia: 5,
                        confianca: 5,
                        inteligenciaEmocional: 5,
                        interferencias: 5,
                        notes: ""
                      });
                      toast({
                        title: "Break Registrado",
                        description: "Seu feedback foi salvo com sucesso!",
                      });
                    });
                  }
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                Salvar Feedback
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBreakDialog(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-600"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}