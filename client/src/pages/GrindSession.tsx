import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Play, 
  Clock, 
  Trophy,
  Coffee,
  FileText,
  Target,
  Calendar,
  TrendingUp,
  DollarSign,
  Award,
  Filter,
  BarChart3,
  Users,
  Zap,
  Brain,
  Heart,
  Volume2,
  Edit3,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import GrindSessionLive from "./GrindSessionLive";

interface SessionHistoryData {
  id: string;
  userId: string;
  date: string;
  duration?: string;
  volume: number;
  profit: number;
  abiMed: number;
  roi: number;
  fts: number;
  cravadas: number;
  energiaMedia: number;
  focoMedio: number;
  confiancaMedia: number;
  inteligenciaEmocionalMedia: number;
  interferenciasMedia: number;
  breakCount: number;
  preparationNotes?: string;
  preparationPercentage?: number;
  dailyGoals?: string;
  finalNotes?: string;
  objectiveCompleted?: boolean;
  status: string;
  // Tournament type percentages
  vanillaPercentage?: number;
  pkoPercentage?: number;
  mysteryPercentage?: number;
  // Tournament speed percentages
  normalSpeedPercentage?: number;
  turboSpeedPercentage?: number;
  hyperSpeedPercentage?: number;
}

interface DashboardMetrics {
  totalSessions: number;
  totalVolume: number;
  totalProfit: number;
  avgABI: number;
  avgROI: number;
  totalFTs: number;
  totalCravadas: number;
  avgEnergia: number;
  avgFoco: number;
  avgConfianca: number;
  avgInteligenciaEmocional: number;
  avgInterferencias: number;
  avgPreparationPercentage: number;
  // Tournament type percentages
  avgVanillaPercentage?: number;
  avgPkoPercentage?: number;
  avgMysteryPercentage?: number;
  // Tournament speed percentages
  avgNormalSpeedPercentage?: number;
  avgTurboSpeedPercentage?: number;
  avgHyperSpeedPercentage?: number;
}

interface FilterState {
  periodo: string;
  customStartDate: string;
  customEndDate: string;
  preparacaoMin: number;
  preparacaoMax: number;
  energiaMin: number;
  energiaMax: number;
  focoMin: number;
  focoMax: number;
  confiancaMin: number;
  confiancaMax: number;
  emocionalMin: number;
  emocionalMax: number;
  interferenciasMin: number;
  interferenciasMax: number;
}

export default function GrindSession() {
  const [, setLocation] = useLocation();
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [preparationPercentage, setPreparationPercentage] = useState([50]);
  const [preparationNotes, setPreparationNotes] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");
  const [screenCap, setScreenCap] = useState(10);

  // Edit/Delete session states
  const [editingSession, setEditingSession] = useState<SessionHistoryData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<SessionHistoryData | null>(null);
  
  // Register past session states
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [registerSessionData, setRegisterSessionData] = useState({
    date: "",
    duration: "",
    volume: 0,
    profit: 0,
    abiMed: 0,
    roi: 0,
    fts: 0,
    cravadas: 0,
    energiaMedia: 5,
    focoMedio: 5,
    confiancaMedia: 5,
    inteligenciaEmocionalMedia: 5,
    interferenciasMedia: 5,
    preparationNotes: "",
    dailyGoals: "",
    finalNotes: "",
    objectiveCompleted: false
  });

  // Dialog states for session day conflict
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictingSession, setConflictingSession] = useState<SessionHistoryData | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    periodo: "30d",
    customStartDate: "",
    customEndDate: "",
    preparacaoMin: 0,
    preparacaoMax: 100,
    energiaMin: 0,
    energiaMax: 10,
    focoMin: 0,
    focoMax: 10,
    confiancaMin: 0,
    confiancaMax: 10,
    emocionalMin: 0,
    emocionalMax: 10,
    interferenciasMin: 0,
    interferenciasMax: 10
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper functions
  const formatCurrency = (amount: number) => {
    return `$${Math.round(amount).toLocaleString()}`;
  };

  const getPreparationColor = (percentage: number) => {
    if (percentage < 33) return 'text-red-400 bg-red-900/20 border-red-600/30';
    if (percentage < 67) return 'text-yellow-400 bg-yellow-900/20 border-yellow-600/30';
    return 'text-green-400 bg-green-900/20 border-green-600/30';
  };

  // Check for active session
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch active sessions");
      return response.json();
    },
    refetchInterval: 5000, // Refetch every 5 seconds
    staleTime: 1000, // Consider fresh for 1 second
    refetchOnWindowFocus: true, // Refetch when window gains focus
  });

  const activeSession = activeSessions.find((session: any) => session.status === "active");

  // Remove auto-redirect logic - users navigate manually

  // Fetch session history
  const { data: sessionHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["/api/grind-sessions/history"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions/history", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch session history");
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  // Filter sessions based on current filters
  const filteredSessions = sessionHistory.filter((session: SessionHistoryData) => {
    const sessionDate = new Date(session.date);
    const now = new Date();

    // Period filter
    let periodMatch = false;
    switch (filters.periodo) {
      case "7d":
        periodMatch = sessionDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        periodMatch = sessionDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        periodMatch = sessionDate >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        periodMatch = sessionDate >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case "custom":
        const start = filters.customStartDate ? new Date(filters.customStartDate) : new Date(0);
        const end = filters.customEndDate ? new Date(filters.customEndDate) : new Date();
        periodMatch = sessionDate >= start && sessionDate <= end;
        break;
      default:
        periodMatch = true;
    }

    // Mental state filters
    const preparationPercentage = session.preparationPercentage || 0;
    const preparationMatch = preparationPercentage >= filters.preparacaoMin && preparationPercentage <= filters.preparacaoMax;

    const energiaMatch = session.energiaMedia >= filters.energiaMin && session.energiaMedia <= filters.energiaMax;
    const focoMatch = session.focoMedio >= filters.focoMin && session.focoMedio <= filters.focoMax;
    const confiancaMatch = session.confiancaMedia >= filters.confiancaMin && session.confiancaMedia <= filters.confiancaMax;
    const emocionalMatch = session.inteligenciaEmocionalMedia >= filters.emocionalMin && session.inteligenciaEmocionalMedia <= filters.emocionalMax;
    const interferenciasMatch = session.interferenciasMedia >= filters.interferenciasMin && session.interferenciasMedia <= filters.interferenciasMax;

    return periodMatch && preparationMatch && energiaMatch && focoMatch && confiancaMatch && emocionalMatch && interferenciasMatch;
  });

  // Calculate dashboard metrics from filtered sessions
  const dashboardMetrics: DashboardMetrics = {
    totalSessions: filteredSessions.length,
    totalVolume: filteredSessions.reduce((sum, session) => sum + session.volume, 0),
    totalProfit: filteredSessions.reduce((sum, session) => sum + session.profit, 0),
    avgABI: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.abiMed, 0) / filteredSessions.length : 0,
    avgROI: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.roi, 0) / filteredSessions.length : 0,
    totalFTs: filteredSessions.reduce((sum, session) => sum + session.fts, 0),
    totalCravadas: filteredSessions.reduce((sum, session) => sum + session.cravadas, 0),
    avgEnergia: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.energiaMedia, 0) / filteredSessions.length : 0,
    avgFoco: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.focoMedio, 0) / filteredSessions.length : 0,
    avgConfianca: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.confiancaMedia, 0) / filteredSessions.length : 0,
    avgInteligenciaEmocional: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.inteligenciaEmocionalMedia, 0) / filteredSessions.length : 0,
    avgInterferencias: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + session.interferenciasMedia, 0) / filteredSessions.length : 0,
    avgPreparationPercentage: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + (session.preparationPercentage || 0), 0) / filteredSessions.length : 0,
    // Tournament type percentages
    avgVanillaPercentage: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + (session.vanillaPercentage || 0), 0) / filteredSessions.length : 0,
    avgPkoPercentage: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + (session.pkoPercentage || 0), 0) / filteredSessions.length : 0,
    avgMysteryPercentage: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + (session.mysteryPercentage || 0), 0) / filteredSessions.length : 0,
    // Tournament speed percentages
    avgNormalSpeedPercentage: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + (session.normalSpeedPercentage || 0), 0) / filteredSessions.length : 0,
    avgTurboSpeedPercentage: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + (session.turboSpeedPercentage || 0), 0) / filteredSessions.length : 0,
    avgHyperSpeedPercentage: filteredSessions.length > 0 ? filteredSessions.reduce((sum, session) => sum + (session.hyperSpeedPercentage || 0), 0) / filteredSessions.length : 0
  };

  // Animação dos círculos mentais - ETAPA 2
  useEffect(() => {
    const animateMentalCircles = () => {
      const circles = document.querySelectorAll('.mental-circle');
      
      circles.forEach((circle, index) => {
        const element = circle as HTMLElement;
        const value = parseFloat(element.dataset.value || '0');
        const isPreparation = element.classList.contains('mental-prep');
        const maxValue = isPreparation ? 100 : 10;
        
        // Animação de entrada
        element.style.transform = 'scale(0)';
        element.style.opacity = '0';
        
        setTimeout(() => {
          element.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
          element.style.transform = 'scale(1)';
          element.style.opacity = '1';
          
          // Animação de progresso circular baseada no valor
          if (value < maxValue * 0.3) {
            element.style.boxShadow = '0 0 20px rgba(255, 68, 68, 0.3)';
          } else if (value < maxValue * 0.7) {
            element.style.boxShadow = '0 0 20px rgba(255, 170, 0, 0.3)';
          } else {
            element.style.boxShadow = '0 0 20px rgba(0, 255, 136, 0.3)';
          }
        }, index * 100);
      });
    };

    // Executar animação após um pequeno delay para garantir que o DOM foi atualizado
    const timer = setTimeout(animateMentalCircles, 100);
    return () => clearTimeout(timer);
  }, [dashboardMetrics.avgPreparationPercentage, dashboardMetrics.avgEnergia, dashboardMetrics.avgFoco, dashboardMetrics.avgConfianca, dashboardMetrics.avgInteligenciaEmocional, dashboardMetrics.avgInterferencias]); // Reexecutar quando os dados mudarem

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/grind-sessions", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Sessão iniciada com sucesso!",
        description: "Sua sessão de grind foi iniciada. Boa sorte!",
      });
      setShowStartDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      
      // Redirect to active session page
      setTimeout(() => {
        setLocation("/grind-live");
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao iniciar sessão",
        description: error.message || "Algo deu errado ao iniciar a sessão.",
        variant: "destructive",
      });
    },
  });

  // Check if there's already a session on the current day BEFORE asking for preparation notes
  const checkExistingSessionBeforePreparation = () => {
    const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
    
    // Look for existing session on the same day
    const existingSession = sessionHistory.find((session: SessionHistoryData) => {
      const sessionDate = new Date(session.date).toISOString().split('T')[0];
      return sessionDate === today;
    });

    if (existingSession) {
      // Found existing session, show conflict dialog immediately
      setConflictingSession(existingSession);
      setShowConflictDialog(true);
    } else {
      // No existing session, proceed to preparation dialog
      setShowStartDialog(true);
    }
  };

  // Check for warm up integration on component mount
  useEffect(() => {
    const warmUpIntegration = localStorage.getItem('warmUpIntegration');
    if (warmUpIntegration === 'true') {
      loadWarmUpData();
      checkExistingSessionBeforePreparation();
      localStorage.removeItem('warmUpIntegration');
    }
  }, [sessionHistory]); // Depend on sessionHistory to ensure data is loaded

  // Load warm up data into form fields
  const loadWarmUpData = () => {
    const warmUpScore = localStorage.getItem('warmUpScore');
    const warmUpData = localStorage.getItem('warmUpData');
    
    if (warmUpScore && warmUpData) {
      const parsedWarmUpData = JSON.parse(warmUpData);
      
      // Set preparation data from Warm Up
      setPreparationPercentage([parseInt(warmUpScore)]);
      setPreparationNotes(parsedWarmUpData.observations || '');
      
      // Clear localStorage after use
      localStorage.removeItem('warmUpScore');
      localStorage.removeItem('warmUpData');
    }
  };

  // Handle conflict dialog actions
  const handleConflictEditSession = () => {
    if (conflictingSession) {
      setEditingSession(conflictingSession);
      setIsEditDialogOpen(true);
      setShowConflictDialog(false);
    }
  };

  const handleConflictCreateNew = () => {
    setShowConflictDialog(false);
    setShowStartDialog(true);
  };

  const handleConflictCancel = () => {
    setShowConflictDialog(false);
    setConflictingSession(null);
    // Clear warm up data since user cancelled
    localStorage.removeItem('warmUpScore');
    localStorage.removeItem('warmUpData');
    localStorage.removeItem('warmUpIntegration');
  };

  const handleStartSession = () => {
    const sessionData = {
      date: new Date().toISOString(),
      status: "active",
      preparationNotes: preparationNotes || "",
      preparationPercentage: preparationPercentage[0],
      dailyGoals: dailyGoals || "",
      screenCap: screenCap,
      skipBreaksToday: false,
      resetTournaments: true, // Always reset tournaments for clean start
      replaceExisting: true, // Always ensure clean session creation
    };

    startSessionMutation.mutate(sessionData);
  };

  const handleCreateNewSession = () => {
    const sessionData = {
      date: new Date().toISOString(),
      status: "active",
      preparationNotes: preparationNotes || "",
      preparationPercentage: preparationPercentage[0],
      dailyGoals: dailyGoals || "",
      screenCap: screenCap,
      skipBreaksToday: false,
      resetTournaments: true, // Flag to reset tournaments for clean start
      replaceExisting: true, // Flag to replace any existing session for today
    };

    startSessionMutation.mutate(sessionData);
  };

  // Edit session mutation
  const editSessionMutation = useMutation({
    mutationFn: async (data: { id: string; sessionData: any }) => {
      return apiRequest(`/api/grind-sessions/${data.id}`, {
        method: "PUT",
        body: JSON.stringify(data.sessionData),
      });
    },
    onSuccess: () => {
      toast({
        title: "Sessão atualizada!",
        description: "As informações da sessão foram atualizadas com sucesso.",
      });
      setIsEditDialogOpen(false);
      setEditingSession(null);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar sessão",
        description: error.message || "Algo deu errado ao atualizar a sessão.",
        variant: "destructive",
      });
    },
  });

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest(`/api/grind-sessions/${sessionId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Sessão excluída!",
        description: "A sessão foi excluída permanentemente.",
      });
      setIsDeleteDialogOpen(false);
      setSessionToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao excluir sessão",
        description: error.message || "Algo deu errado ao excluir a sessão.",
        variant: "destructive",
      });
    },
  });

  // Register past session mutation
  const registerSessionMutation = useMutation({
    mutationFn: async (sessionData: any) => {
      return apiRequest("/api/grind-sessions", {
        method: "POST",
        body: JSON.stringify({
          ...sessionData,
          date: new Date(sessionData.date).toISOString(),
          status: "completed",
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Sessão registrada!",
        description: "A sessão passada foi registrada com sucesso.",
      });
      setShowRegisterDialog(false);
      setRegisterSessionData({
        date: "",
        duration: "",
        volume: 0,
        profit: 0,
        abiMed: 0,
        roi: 0,
        fts: 0,
        cravadas: 0,
        energiaMedia: 5,
        focoMedio: 5,
        confiancaMedia: 5,
        inteligenciaEmocionalMedia: 5,
        interferenciasMedia: 5,
        preparationNotes: "",
        dailyGoals: "",
        finalNotes: "",
        objectiveCompleted: false
      });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao registrar sessão",
        description: error.message || "Algo deu errado ao registrar a sessão.",
        variant: "destructive",
      });
    },
  });

  const handleEditSession = (session: SessionHistoryData) => {
    setEditingSession({ ...session });
    setIsEditDialogOpen(true);
  };

  const handleDeleteSession = (session: SessionHistoryData) => {
    setSessionToDelete(session);
    setIsDeleteDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingSession) return;
    
    editSessionMutation.mutate({
      id: editingSession.id,
      sessionData: {
        // Performance metrics
        volume: editingSession.volume,
        profit: editingSession.profit,
        abiMed: editingSession.abiMed,
        roi: editingSession.roi,
        fts: editingSession.fts,
        cravadas: editingSession.cravadas,
        // Mental state metrics
        energiaMedia: editingSession.energiaMedia,
        focoMedio: editingSession.focoMedio,
        confiancaMedia: editingSession.confiancaMedia,
        inteligenciaEmocionalMedia: editingSession.inteligenciaEmocionalMedia,
        interferenciasMedia: editingSession.interferenciasMedia,
        // Notes and goals
        preparationNotes: editingSession.preparationNotes,
        dailyGoals: editingSession.dailyGoals,
        finalNotes: editingSession.finalNotes,
        objectiveCompleted: editingSession.objectiveCompleted,
      }
    });
  };

  const handleConfirmDelete = () => {
    if (!sessionToDelete) return;
    deleteSessionMutation.mutate(sessionToDelete.id);
  };

  const handleRegisterSession = () => {
    registerSessionMutation.mutate(registerSessionData);
  };

  // Handle conflict dialog options
  const handleEditExistingSession = () => {
    if (conflictingSession) {
      setEditingSession(conflictingSession);
      setIsEditDialogOpen(true);
    }
    setShowConflictDialog(false);
    setConflictingSession(null);
  };

  const handleReplaceExistingSession = () => {
    if (conflictingSession) {
      // Delete the existing session first, then show preparation dialog
      deleteSessionMutation.mutate(conflictingSession.id, {
        onSuccess: () => {
          // Clear states to ensure clean UI
          setPreparationNotes("");
          setDailyGoals("");
          setPreparationPercentage([50]);
          
          // Invalidate queries to refresh session data
          queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
          
          // After deletion, show the preparation dialog to collect notes
          setShowStartDialog(true);
        }
      });
    }
    setShowConflictDialog(false);
    setConflictingSession(null);
  };

  const handleCancelAction = () => {
    setShowConflictDialog(false);
    setConflictingSession(null);
  };

  // Navigation to active session is handled by direct links

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Grind</h1>
            <p className="text-gray-400">Gerencie suas sessões de grind e acompanhe seu histórico</p>
          </div>

          <div className="flex gap-3">
            {/* Active Session Indicator */}
            {activeSession && (
              <Button
                onClick={() => setLocation("/grind-live")}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8 py-3 shadow-lg"
              >
                <Play className="w-5 h-5 mr-2" />
                Continuar Sessão Ativa
              </Button>
            )}

            {/* Register Past Session Button */}
            <Button
              variant="outline"
              onClick={() => setShowRegisterDialog(true)}
              className="bg-blue-800 border-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              Registrar Sessão
            </Button>

            {/* Filters Toggle */}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="border-gray-600 hover:bg-gray-700 text-[#000000]"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filtros
            </Button>

            {/* Start Session Button - Only show if no active session */}
            {!activeSession && (
              <>
                <Button
                  size="lg"
                  onClick={checkExistingSessionBeforePreparation}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8 py-3 shadow-lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Iniciar Sessão
                </Button>

                <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
                  <DialogContent className="bg-poker-surface border-gray-700 text-white">
                <DialogHeader>
                  <DialogTitle>Iniciar Nova Sessão</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Prepare-se para sua sessão de grind com notas e objetivos
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="preparation-percentage">Preparação (%)</Label>
                    <div className="flex items-center space-x-4">
                      <Slider
                        value={preparationPercentage}
                        onValueChange={setPreparationPercentage}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-poker-accent font-semibold min-w-[3rem]">
                        {preparationPercentage[0]}%
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="preparation-notes">Notas de Preparação</Label>
                    <Textarea
                      id="preparation-notes"
                      value={preparationNotes}
                      onChange={(e) => setPreparationNotes(e.target.value)}
                      placeholder="Comentario sobre seu estado mental e como foi sua preparação..."
                      className="bg-gray-800 border-gray-600 text-white"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="daily-goals">Objetivos do Dia</Label>
                    <Input
                      id="daily-goals"
                      value={dailyGoals}
                      onChange={(e) => setDailyGoals(e.target.value)}
                      placeholder="Ex: Cap de 6 telas, Foco em spots IP x BB..."
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="screen-cap">Cap de Telas</Label>
                    <div className="flex items-center space-x-4">
                      <Input
                        id="screen-cap"
                        type="number"
                        min="1"
                        max="50"
                        value={screenCap}
                        onChange={(e) => setScreenCap(Number(e.target.value))}
                        className="bg-gray-800 border-gray-600 text-white w-20"
                        placeholder="10"
                      />
                      <span className="text-white">telas simultâneas</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Quantas telas você pretende jogar simultaneamente (1-50)
                    </p>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowStartDialog(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleStartSession}
                      disabled={startSessionMutation.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {startSessionMutation.isPending ? "Iniciando..." : "Iniciar Sessão"}
                    </Button>
                  </div>
                </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Filters Panel */}
      {showFilters && (
        <Card className="mb-6 bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Period Filter */}
              <div>
                <Label className="text-gray-300">Período</Label>
                <Select value={filters.periodo} onValueChange={(value) => setFilters({...filters, periodo: value})}>
                  <SelectTrigger className="bg-gray-800 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="1y">Último ano</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Date Range */}
              {filters.periodo === "custom" && (
                <>
                  <div>
                    <Label className="text-gray-300">Data Inicial</Label>
                    <Input
                      type="date"
                      value={filters.customStartDate}
                      onChange={(e) => setFilters({...filters, customStartDate: e.target.value})}
                      className="bg-gray-800 border-gray-600"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Data Final</Label>
                    <Input
                      type="date"
                      value={filters.customEndDate}
                      onChange={(e) => setFilters({...filters, customEndDate: e.target.value})}
                      className="bg-gray-800 border-gray-600"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Mental State Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-300">Preparação (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.preparacaoMin}
                    onChange={(e) => setFilters({...filters, preparacaoMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.preparacaoMax}
                    onChange={(e) => setFilters({...filters, preparacaoMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Energia</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.energiaMin}
                    onChange={(e) => setFilters({...filters, energiaMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.energiaMax}
                    onChange={(e) => setFilters({...filters, energiaMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Foco</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.focoMin}
                    onChange={(e) => setFilters({...filters, focoMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.focoMax}
                    onChange={(e) => setFilters({...filters, focoMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Confiança</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.confiancaMin}
                    onChange={(e) => setFilters({...filters, confiancaMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.confiancaMax}
                    onChange={(e) => setFilters({...filters, confiancaMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Inteligência Emocional</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.emocionalMin}
                    onChange={(e) => setFilters({...filters, emocionalMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.emocionalMax}
                    onChange={(e) => setFilters({...filters, emocionalMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Interferências</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.interferenciasMin}
                    onChange={(e) => setFilters({...filters, interferenciasMin: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={filters.interferenciasMax}
                    onChange={(e) => setFilters({...filters, interferenciasMax: Number(e.target.value)})}
                    className="bg-gray-800 border-gray-600 w-20"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setFilters({
                  periodo: "30d",
                  customStartDate: "",
                  customEndDate: "",
                  preparacaoMin: 0,
                  preparacaoMax: 100,
                  energiaMin: 0,
                  energiaMax: 10,
                  focoMin: 0,
                  focoMax: 10,
                  confiancaMin: 0,
                  confiancaMax: 10,
                  emocionalMin: 0,
                  emocionalMax: 10,
                  interferenciasMin: 0,
                  interferenciasMax: 10
                })}
                className="border-gray-600 hover:bg-gray-700"
              >
                Limpar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Dashboard Metrics */}
      <div className="mb-6">
        {/* ETAPA 1: Métricas Principais Destacadas */}
        <div className="main-metrics">
          <div className="section-title">🎯 Métricas Principais</div>
          <div className="metrics-grid">
            <div className="metric-card metric-volume">
              <div className="metric-trend trend-neutral">0%</div>
              <div className="metric-icon">
                <Users className="w-8 h-8 text-blue-400 mx-auto" />
              </div>
              <div className="metric-value">{dashboardMetrics.totalVolume}</div>
              <div className="metric-label">Volume Total</div>
            </div>

            <div className="metric-card metric-profit">
              <div className="metric-trend trend-neutral">0%</div>
              <div className="metric-icon">
                <DollarSign className="w-8 h-8 text-green-400 mx-auto" />
              </div>
              <div className="metric-value">{formatCurrency(dashboardMetrics.totalProfit)}</div>
              <div className="metric-label">Profit Total</div>
            </div>

            <div className="metric-card metric-abi">
              <div className="metric-trend trend-neutral">0%</div>
              <div className="metric-icon">
                <Target className="w-8 h-8 text-purple-400 mx-auto" />
              </div>
              <div className="metric-value">{formatCurrency(dashboardMetrics.avgABI)}</div>
              <div className="metric-label">ABI Médio</div>
            </div>

            <div className="metric-card metric-roi">
              <div className="metric-trend trend-neutral">0%</div>
              <div className="metric-icon">
                <TrendingUp className="w-8 h-8 text-red-400 mx-auto" />
              </div>
              <div className="metric-value">{dashboardMetrics.avgROI.toFixed(1)}%</div>
              <div className="metric-label">ROI Médio</div>
            </div>

            <div className="metric-card metric-fts">
              <div className="metric-trend trend-neutral">0%</div>
              <div className="metric-icon">
                <Award className="w-8 h-8 text-orange-400 mx-auto" />
              </div>
              <div className="metric-value">{dashboardMetrics.totalFTs}</div>
              <div className="metric-label">Final Tables</div>
            </div>

            <div className="metric-card metric-wins">
              <div className="metric-trend trend-neutral">0%</div>
              <div className="metric-icon">
                <Trophy className="w-8 h-8 text-cyan-400 mx-auto" />
              </div>
              <div className="metric-value">{dashboardMetrics.totalCravadas}</div>
              <div className="metric-label">Cravadas</div>
            </div>
          </div>
        </div>

        {/* ETAPA 3: Seções de Distribuição organizadas */}
        <div className="distributions">
          <div className="distribution-card">
            <div className="distribution-title">⚡ Tipos de Torneio</div>
            <div className="distribution-grid">
              <div className="distribution-item type-vanilla">
                <div className="item-name">Vanilla</div>
                <div className="item-stats">
                  <div className="item-count">{Math.round(dashboardMetrics.totalVolume * (dashboardMetrics.avgVanillaPercentage || 0) / 100)} torneios</div>
                  <div className="item-percentage">{dashboardMetrics.avgVanillaPercentage?.toFixed(1) || '0.0'}%</div>
                </div>
              </div>
              
              <div className="distribution-item type-pko">
                <div className="item-name">PKO</div>
                <div className="item-stats">
                  <div className="item-count">{Math.round(dashboardMetrics.totalVolume * (dashboardMetrics.avgPkoPercentage || 0) / 100)} torneios</div>
                  <div className="item-percentage">{dashboardMetrics.avgPkoPercentage?.toFixed(1) || '0.0'}%</div>
                </div>
              </div>
              
              <div className="distribution-item type-mystery">
                <div className="item-name">Mystery</div>
                <div className="item-stats">
                  <div className="item-count">{Math.round(dashboardMetrics.totalVolume * (dashboardMetrics.avgMysteryPercentage || 0) / 100)} torneios</div>
                  <div className="item-percentage">{dashboardMetrics.avgMysteryPercentage?.toFixed(1) || '0.0'}%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="distribution-card">
            <div className="distribution-title">🚀 Velocidade</div>
            <div className="distribution-grid">
              <div className="distribution-item speed-normal">
                <div className="item-name">Normal</div>
                <div className="item-stats">
                  <div className="item-count">{Math.round(dashboardMetrics.totalVolume * (dashboardMetrics.avgNormalSpeedPercentage || 0) / 100)} torneios</div>
                  <div className="item-percentage">{dashboardMetrics.avgNormalSpeedPercentage?.toFixed(1) || '0.0'}%</div>
                </div>
              </div>
              
              <div className="distribution-item speed-turbo">
                <div className="item-name">Turbo</div>
                <div className="item-stats">
                  <div className="item-count">{Math.round(dashboardMetrics.totalVolume * (dashboardMetrics.avgTurboSpeedPercentage || 0) / 100)} torneios</div>
                  <div className="item-percentage">{dashboardMetrics.avgTurboSpeedPercentage?.toFixed(1) || '0.0'}%</div>
                </div>
              </div>
              
              <div className="distribution-item speed-hyper">
                <div className="item-name">Hyper</div>
                <div className="item-stats">
                  <div className="item-count">{Math.round(dashboardMetrics.totalVolume * (dashboardMetrics.avgHyperSpeedPercentage || 0) / 100)} torneios</div>
                  <div className="item-percentage">{dashboardMetrics.avgHyperSpeedPercentage?.toFixed(1) || '0.0'}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ETAPA 2: Performance Mental com círculos coloridos */}
        <div className="mental-performance">
          <div className="section-title">🧠 Performance Mental</div>
          <div className="mental-grid">
            <div className="mental-item">
              <div className="mental-circle mental-prep" data-value={dashboardMetrics.avgPreparationPercentage}>
                {dashboardMetrics.avgPreparationPercentage.toFixed(0)}
              </div>
              <div className="mental-label">Preparação</div>
              <div className="mental-average">Média: {dashboardMetrics.avgPreparationPercentage.toFixed(1)}%</div>
            </div>
            
            <div className="mental-item">
              <div className="mental-circle mental-energy" data-value={dashboardMetrics.avgEnergia}>
                {dashboardMetrics.avgEnergia.toFixed(1)}
              </div>
              <div className="mental-label">Energia</div>
              <div className="mental-average">Média: {dashboardMetrics.avgEnergia.toFixed(1)}/10</div>
            </div>
            
            <div className="mental-item">
              <div className="mental-circle mental-focus" data-value={dashboardMetrics.avgFoco}>
                {dashboardMetrics.avgFoco.toFixed(1)}
              </div>
              <div className="mental-label">Foco</div>
              <div className="mental-average">Média: {dashboardMetrics.avgFoco.toFixed(1)}/10</div>
            </div>
            
            <div className="mental-item">
              <div className="mental-circle mental-confidence" data-value={dashboardMetrics.avgConfianca}>
                {dashboardMetrics.avgConfianca.toFixed(1)}
              </div>
              <div className="mental-label">Confiança</div>
              <div className="mental-average">Média: {dashboardMetrics.avgConfianca.toFixed(1)}/10</div>
            </div>
            
            <div className="mental-item">
              <div className="mental-circle mental-emotional" data-value={dashboardMetrics.avgInteligenciaEmocional}>
                {dashboardMetrics.avgInteligenciaEmocional.toFixed(1)}
              </div>
              <div className="mental-label">Int. Emocional</div>
              <div className="mental-average">Média: {dashboardMetrics.avgInteligenciaEmocional.toFixed(1)}/10</div>
            </div>
            
            <div className="mental-item">
              <div className="mental-circle mental-interference" data-value={dashboardMetrics.avgInterferencias}>
                {dashboardMetrics.avgInterferencias.toFixed(1)}
              </div>
              <div className="mental-label">Interferências</div>
              <div className="mental-average">Média: {dashboardMetrics.avgInterferencias.toFixed(1)}/10</div>
            </div>
          </div>
        </div>
      </div>
      {/* ETAPA 4: Histórico de Sessões Redesenhado */}
      <div className="sessions-history">
        <div className="history-controls">
          <div className="section-title">📚 Histórico de Sessões</div>
          <div className="period-selector">
            <button 
              className={`period-btn ${filters.periodo === '7d' ? 'active' : ''}`}
              onClick={() => setFilters({...filters, periodo: '7d'})}
            >
              7 dias
            </button>
            <button 
              className={`period-btn ${filters.periodo === '30d' ? 'active' : ''}`}
              onClick={() => setFilters({...filters, periodo: '30d'})}
            >
              30 dias
            </button>
            <button 
              className={`period-btn ${filters.periodo === '90d' ? 'active' : ''}`}
              onClick={() => setFilters({...filters, periodo: '90d'})}
            >
              90 dias
            </button>
            <button 
              className={`period-btn ${filters.periodo === 'all' ? 'active' : ''}`}
              onClick={() => setFilters({...filters, periodo: 'all'})}
            >
              Tudo
            </button>
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-lg text-gray-400 mb-2">Nenhuma sessão encontrada</p>
            <p className="text-sm text-gray-500">Inicie uma sessão para começar a acompanhar seu progresso</p>
          </div>
        ) : (
          <div className="sessions-grid">
            {filteredSessions.map((session: SessionHistoryData) => (
              <div key={session.id} className="session-card" data-session-id={session.id}>
                <div className="session-header">
                  <div className="session-date">
                    {new Date(session.date).toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </div>
                  <div className={`session-result ${session.profit >= 0 ? 'result-profit' : 'result-loss'}`}>
                    {formatCurrency(session.profit)}
                  </div>
                </div>

                <div className="session-metrics">
                  <div className="session-metric">
                    <div className="session-value">{session.volume}</div>
                    <div className="session-label">Volume</div>
                  </div>
                  <div className="session-metric">
                    <div className={`session-value ${session.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(session.profit)}
                    </div>
                    <div className="session-label">Profit</div>
                  </div>
                  <div className="session-metric">
                    <div className="session-value">{session.roi.toFixed(1)}%</div>
                    <div className="session-label">ROI</div>
                  </div>
                  <div className="session-metric">
                    <div className="session-value">{formatCurrency(session.abiMed)}</div>
                    <div className="session-label">ABI</div>
                  </div>
                  <div className="session-metric">
                    <div className="session-value">{session.fts}</div>
                    <div className="session-label">FTs</div>
                  </div>
                  <div className="session-metric">
                    <div className="session-value">{session.cravadas}</div>
                    <div className="session-label">Cravadas</div>
                  </div>
                  <div className="session-metric">
                    <div className="session-value">{session.breakCount}</div>
                    <div className="session-label">Breaks</div>
                  </div>
                </div>

                <div className="session-mental">
                  <div className="mental-summary">
                    <div className="mental-dot mental-prep" title="Preparação">
                      {Math.round(session.preparationPercentage || 0)}
                    </div>
                    <div className="mental-dot mental-energy" title="Energia">
                      {Math.round(session.energiaMedia)}
                    </div>
                    <div className="mental-dot mental-focus" title="Foco">
                      {Math.round(session.focoMedio)}
                    </div>
                    <div className="mental-dot mental-confidence" title="Confiança">
                      {Math.round(session.confiancaMedia)}
                    </div>
                    <div className="mental-dot mental-emotional" title="Inteligência Emocional">
                      {Math.round(session.inteligenciaEmocionalMedia)}
                    </div>
                    <div className="mental-dot mental-interference" title="Interferências">
                      {Math.round(session.interferenciasMedia)}
                    </div>
                  </div>
                  <div className="session-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditSession(session)}
                      className="border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 mr-2"
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteSession(session)}
                      className="border-red-600 text-red-400 hover:text-red-300 hover:border-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Edit Session Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="modal-container">
          {/* Header fixo */}
          <div className="modal-header">
            <div className="header-content">
              <div>
                <h2 className="modal-title">✏️ Editar Sessão</h2>
                <p className="session-date">
                  {editingSession && (
                    <>Sessão de {formatDate(editingSession.date)}, {editingSession.startTime || 'Horário não definido'}</>
                  )}
                </p>
              </div>
              <DialogClose className="close-btn">✕</DialogClose>
            </div>
          </div>
          
          {/* Body com seções */}
          <div className="modal-body">
            {/* Seções serão implementadas nas próximas etapas */}
            {editingSession && (
              <div className="space-y-4">
              {/* Performance Metrics */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white border-b border-gray-600 pb-2">Métricas de Performance</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="editVolume" className="text-white">Volume</Label>
                    <Input
                      id="editVolume"
                      type="number"
                      value={editingSession.volume || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        volume: parseInt(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="editProfit" className="text-white">Profit (USD)</Label>
                    <Input
                      id="editProfit"
                      type="number"
                      step="0.01"
                      value={editingSession.profit || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        profit: parseFloat(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="editABI" className="text-white">ABI Médio (USD)</Label>
                    <Input
                      id="editABI"
                      type="number"
                      step="0.01"
                      value={editingSession.abiMed || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        abiMed: parseFloat(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="editROI" className="text-white">ROI (%)</Label>
                    <Input
                      id="editROI"
                      type="number"
                      step="0.1"
                      value={editingSession.roi || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        roi: parseFloat(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="editFTs" className="text-white">Final Tables</Label>
                    <Input
                      id="editFTs"
                      type="number"
                      value={editingSession.fts || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        fts: parseInt(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="editCravadas" className="text-white">Cravadas</Label>
                    <Input
                      id="editCravadas"
                      type="number"
                      value={editingSession.cravadas || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        cravadas: parseInt(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Mental State Metrics */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white border-b border-gray-600 pb-2">Estado Mental (1-10)</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="editEnergia" className="text-white">Energia</Label>
                    <Input
                      id="editEnergia"
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={editingSession.energiaMedia || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        energiaMedia: parseFloat(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="editFoco" className="text-white">Foco</Label>
                    <Input
                      id="editFoco"
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={editingSession.focoMedio || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        focoMedio: parseFloat(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="editConfianca" className="text-white">Confiança</Label>
                    <Input
                      id="editConfianca"
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={editingSession.confiancaMedia || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        confiancaMedia: parseFloat(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="editEmocional" className="text-white">Int. Emocional</Label>
                    <Input
                      id="editEmocional"
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={editingSession.inteligenciaEmocionalMedia || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        inteligenciaEmocionalMedia: parseFloat(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="editInterferencias" className="text-white">Interferências</Label>
                    <Input
                      id="editInterferencias"
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={editingSession.interferenciasMedia || 0}
                      onChange={(e) => setEditingSession({
                        ...editingSession,
                        interferenciasMedia: parseFloat(e.target.value) || 0
                      })}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Notes and Goals */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white border-b border-gray-600 pb-2">Notas e Objetivos</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="editPreparationNotes" className="text-white">Notas de Preparação</Label>
                  <Textarea
                    id="editPreparationNotes"
                    placeholder="Notas sobre a preparação da sessão..."
                    value={editingSession.preparationNotes || ""}
                    onChange={(e) => setEditingSession({
                      ...editingSession,
                      preparationNotes: e.target.value
                    })}
                    className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    rows={2}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="editDailyGoals" className="text-white">Objetivos Diários</Label>
                  <Textarea
                    id="editDailyGoals"
                    placeholder="Objetivos para esta sessão..."
                    value={editingSession.dailyGoals || ""}
                    onChange={(e) => setEditingSession({
                      ...editingSession,
                      dailyGoals: e.target.value
                    })}
                    className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    rows={2}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="editFinalNotes" className="text-white">Notas Finais</Label>
                  <Textarea
                    id="editFinalNotes"
                    placeholder="Reflexões sobre a sessão..."
                    value={editingSession.finalNotes || ""}
                    onChange={(e) => setEditingSession({
                      ...editingSession,
                      finalNotes: e.target.value
                    })}
                    className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    rows={2}
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="editObjectiveCompleted"
                    checked={editingSession.objectiveCompleted || false}
                    onChange={(e) => setEditingSession({
                      ...editingSession,
                      objectiveCompleted: e.target.checked
                    })}
                    className="w-4 h-4 text-poker-accent bg-gray-700 border-gray-600 rounded focus:ring-poker-accent"
                  />
                  <Label htmlFor="editObjectiveCompleted" className="text-white">
                    Objetivos Completados
                  </Label>
                </div>
              </div>
              </div>
            )}
          </div>
          
          {/* Footer fixo */}
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              ❌ Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSessionMutation.isPending}>
              💾 Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Session Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-poker-surface border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Excluir Sessão</DialogTitle>
            <DialogDescription className="text-gray-400">
              Tem certeza que deseja excluir permanentemente esta sessão?
            </DialogDescription>
          </DialogHeader>
          
          {sessionToDelete && (
            <div className="space-y-4">
              <div className="bg-gray-800 border border-gray-600 rounded p-4">
                <p className="text-white font-medium">
                  Sessão de {formatDate(sessionToDelete.date)}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Volume: {sessionToDelete.volume} | Profit: {formatCurrency(sessionToDelete.profit)}
                </p>
              </div>
              
              <div className="bg-red-900/20 border border-red-600/50 rounded p-3">
                <p className="text-red-400 text-sm">
                  ⚠️ Esta ação não pode ser desfeita. Todos os dados da sessão, incluindo torneios e feedbacks de breaks, serão permanentemente excluídos.
                </p>
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmDelete}
                  disabled={deleteSessionMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleteSessionMutation.isPending ? "Excluindo..." : "Excluir Permanentemente"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Register Past Session Dialog */}
      <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">Registrar Sessão Passada</DialogTitle>
            <DialogDescription className="text-gray-400">
              Registre os resultados de uma sessão que já aconteceu
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            {/* Left Column - Basic Info */}
            <div className="space-y-4">
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="font-semibold text-white mb-3">Informações Básicas</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-gray-300">Data da Sessão</Label>
                    <Input
                      type="date"
                      value={registerSessionData.date}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, date: e.target.value})}
                      className="bg-gray-900 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Duração</Label>
                    <Input
                      type="text"
                      placeholder="Ex: 4h 30min"
                      value={registerSessionData.duration}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, duration: e.target.value})}
                      className="bg-gray-900 border-gray-600 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="font-semibold text-white mb-3">Métricas de Performance</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300">Volume</Label>
                    <Input
                      type="number"
                      value={registerSessionData.volume}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, volume: Number(e.target.value)})}
                      className="bg-gray-900 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Lucro ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={registerSessionData.profit}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, profit: Number(e.target.value)})}
                      className="bg-gray-900 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">ABI Médio ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={registerSessionData.abiMed}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, abiMed: Number(e.target.value)})}
                      className="bg-gray-900 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">ROI (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={registerSessionData.roi}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, roi: Number(e.target.value)})}
                      className="bg-gray-900 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Final Tables</Label>
                    <Input
                      type="number"
                      value={registerSessionData.fts}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, fts: Number(e.target.value)})}
                      className="bg-gray-900 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Cravadas</Label>
                    <Input
                      type="number"
                      value={registerSessionData.cravadas}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, cravadas: Number(e.target.value)})}
                      className="bg-gray-900 border-gray-600 text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Mental State & Notes */}
            <div className="space-y-4">
              {/* Mental State */}
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="font-semibold text-white mb-3">Estado Mental</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-gray-300">Energia (1-10)</Label>
                    <div className="flex items-center space-x-4">
                      <Slider
                        value={[registerSessionData.energiaMedia]}
                        onValueChange={([value]) => setRegisterSessionData({...registerSessionData, energiaMedia: value})}
                        max={10}
                        min={1}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-poker-accent font-semibold min-w-[2rem]">
                        {registerSessionData.energiaMedia}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-300">Foco (1-10)</Label>
                    <div className="flex items-center space-x-4">
                      <Slider
                        value={[registerSessionData.focoMedio]}
                        onValueChange={([value]) => setRegisterSessionData({...registerSessionData, focoMedio: value})}
                        max={10}
                        min={1}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-poker-accent font-semibold min-w-[2rem]">
                        {registerSessionData.focoMedio}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-300">Confiança (1-10)</Label>
                    <div className="flex items-center space-x-4">
                      <Slider
                        value={[registerSessionData.confiancaMedia]}
                        onValueChange={([value]) => setRegisterSessionData({...registerSessionData, confiancaMedia: value})}
                        max={10}
                        min={1}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-poker-accent font-semibold min-w-[2rem]">
                        {registerSessionData.confiancaMedia}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-300">Inteligência Emocional (1-10)</Label>
                    <div className="flex items-center space-x-4">
                      <Slider
                        value={[registerSessionData.inteligenciaEmocionalMedia]}
                        onValueChange={([value]) => setRegisterSessionData({...registerSessionData, inteligenciaEmocionalMedia: value})}
                        max={10}
                        min={1}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-poker-accent font-semibold min-w-[2rem]">
                        {registerSessionData.inteligenciaEmocionalMedia}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-300">Interferências (1-10)</Label>
                    <div className="flex items-center space-x-4">
                      <Slider
                        value={[registerSessionData.interferenciasMedia]}
                        onValueChange={([value]) => setRegisterSessionData({...registerSessionData, interferenciasMedia: value})}
                        max={10}
                        min={1}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-poker-accent font-semibold min-w-[2rem]">
                        {registerSessionData.interferenciasMedia}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="font-semibold text-white mb-3">Notas e Objetivos</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-gray-300">Notas de Preparação</Label>
                    <Textarea
                      value={registerSessionData.preparationNotes}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, preparationNotes: e.target.value})}
                      placeholder="Como você se preparou para esta sessão?"
                      className="bg-gray-900 border-gray-600 text-white"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Objetivos do Dia</Label>
                    <Input
                      value={registerSessionData.dailyGoals}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, dailyGoals: e.target.value})}
                      placeholder="Quais eram seus objetivos?"
                      className="bg-gray-900 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Notas Finais</Label>
                    <Textarea
                      value={registerSessionData.finalNotes}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, finalNotes: e.target.value})}
                      placeholder="Reflexões sobre a sessão, aprendizados, etc."
                      className="bg-gray-900 border-gray-600 text-white"
                      rows={3}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="objective-completed"
                      checked={registerSessionData.objectiveCompleted}
                      onChange={(e) => setRegisterSessionData({...registerSessionData, objectiveCompleted: e.target.checked})}
                      className="w-4 h-4 text-poker-accent bg-gray-700 border-gray-600 rounded focus:ring-poker-accent"
                    />
                    <Label htmlFor="objective-completed" className="text-gray-300">
                      Objetivo do dia foi cumprido
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6">
            <Button
              variant="outline"
              onClick={() => setShowRegisterDialog(false)}
              className="border-gray-600 hover:bg-gray-700 text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRegisterSession}
              disabled={registerSessionMutation.isPending || !registerSessionData.date}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {registerSessionMutation.isPending ? "Registrando..." : "Registrar Sessão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Session Conflict Dialog */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="sm:max-w-[500px] bg-poker-surface border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Sessão Já Existe</DialogTitle>
            <DialogDescription className="text-gray-400">
              Já existe uma sessão registrada para hoje. Escolha uma das opções abaixo:
            </DialogDescription>
          </DialogHeader>
          
          {conflictingSession && (
            <div className="space-y-4">
              <div className="bg-yellow-900/20 border border-yellow-600/50 rounded p-4">
                <p className="text-yellow-400 font-medium">
                  📅 Sessão Existente: {formatDate(conflictingSession.date)}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Volume: {conflictingSession.volume} | Profit: {formatCurrency(conflictingSession.profit)}
                </p>
              </div>
              
              <div className="space-y-3">
                <Button
                  onClick={handleConflictEditSession}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  Editar Sessão Existente
                </Button>
                
                <Button
                  onClick={handleConflictCreateNew}
                  className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Criar Nova Sessão e Substituir
                </Button>
                
                <Button
                  variant="outline"
                  onClick={handleConflictCancel}
                  className="w-full border-gray-600 hover:bg-gray-700 text-white"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancelar Ação
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}