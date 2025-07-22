import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";
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
  ChevronDown,
  ChevronUp,
  BookOpen,
  MessageSquare,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import GrindSessionLive from "./GrindSessionLive";
import FilterDropdown from "@/components/FilterDropdown";
import { FilterState } from "@/components/FilterPopupSimple";
import { InputField } from "@/components/InputField";
import { MentalSlider } from "@/components/MentalSlider";
import { TextareaField } from "@/components/TextareaField";
import { useRegisterSessionForm } from "@/hooks/useRegisterSessionForm";

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

// FilterState interface removed - using the one from FilterPopup component

export default function GrindSession() {
  const hasPermission = usePermission('grind_session_access');
  
  if (!hasPermission) {
    return <AccessDenied />;
  }
  
  const [, setLocation] = useLocation();
  const [showStartDialog, setShowStartDialog] = useState(false);
  // FilterDropdown agora é integrado na página
  
  // Filter state
  const [filterState, setFilterState] = useState<FilterState>({
    period: "30d",
    customStartDate: "",
    customEndDate: "",
    // Range filters
    abiRange: [0, 500],
    preparationRange: [0, 10],
    interferenceRange: [0, 10],
    energyRange: [0, 10],
    confidenceRange: [0, 10],
    emotionalRange: [0, 10],
    focusRange: [0, 10],
    // Multi-select filters
    tournamentTypes: [],
    tournamentSpeeds: []
  });

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
  
  // Enhanced form with validation
  const registerSessionForm = useRegisterSessionForm({
    onSave: (formData) => {
      handleRegisterSession(formData);
    },
    onClose: () => {
      setShowRegisterDialog(false);
    }
  });

  // Dialog states for session day conflict
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictingSession, setConflictingSession] = useState<SessionHistoryData | null>(null);

  // Expanded observations state - tracks which session cards have expanded observations
  const [expandedObservations, setExpandedObservations] = useState<Set<string>>(new Set());
  
  // Ensure all modals are closed on component mount to prevent stuck overlay
  useEffect(() => {
    setShowStartDialog(false);
    setShowConflictDialog(false);
    setIsEditDialogOpen(false);
    setIsDeleteDialogOpen(false);
    setShowRegisterDialog(false);
  }, []);
  
  // Filter popup state already declared above

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Toggle observations expansion for a session card
  const toggleObservations = (sessionId: string) => {
    setExpandedObservations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  // Função para contar filtros ativos
  const countActiveFilters = () => {
    let count = 0;
    
    // Período personalizado
    if (filterState.period === 'custom' && (filterState.customStartDate || filterState.customEndDate)) {
      count++;
    }
    
    // Filtros de range (verifica se não estão nos valores padrão)
    if (filterState.abiRange[0] !== 0 || filterState.abiRange[1] !== 500) count++;
    if (filterState.preparationRange[0] !== 0 || filterState.preparationRange[1] !== 10) count++;
    if (filterState.interferenceRange[0] !== 0 || filterState.interferenceRange[1] !== 10) count++;
    if (filterState.energyRange[0] !== 0 || filterState.energyRange[1] !== 10) count++;
    if (filterState.confidenceRange[0] !== 0 || filterState.confidenceRange[1] !== 10) count++;
    if (filterState.emotionalRange[0] !== 0 || filterState.emotionalRange[1] !== 10) count++;
    if (filterState.focusRange[0] !== 0 || filterState.focusRange[1] !== 10) count++;
    
    // Filtros multi-select
    if (filterState.tournamentTypes.length > 0) count++;
    if (filterState.tournamentSpeeds.length > 0) count++;
    
    return count;
  };

  // Função para aplicar filtros ao histórico de sessões
  const applyFiltersToSessions = (sessions: SessionHistoryData[]) => {
    return sessions.filter(session => {
      // Filtro de período
      const sessionDate = new Date(session.date);
      const now = new Date();
      
      let dateFilter = true;
      switch (filterState.period) {
        case '7d':
          dateFilter = sessionDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '14d':
          dateFilter = sessionDate >= new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          dateFilter = sessionDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          dateFilter = sessionDate >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          dateFilter = sessionDate >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'custom':
          if (filterState.customStartDate) {
            dateFilter = dateFilter && sessionDate >= new Date(filterState.customStartDate);
          }
          if (filterState.customEndDate) {
            dateFilter = dateFilter && sessionDate <= new Date(filterState.customEndDate);
          }
          break;
      }
      
      if (!dateFilter) return false;
      
      // Filtros de range (preparação, energia, foco, etc.)
      if (session.preparationPercentage !== undefined) {
        const prepValue = session.preparationPercentage / 10; // Converter para escala 0-10
        if (prepValue < filterState.preparationRange[0] || prepValue > filterState.preparationRange[1]) {
          return false;
        }
      }
      
      if (session.energiaMedia !== undefined) {
        if (session.energiaMedia < filterState.energyRange[0] || session.energiaMedia > filterState.energyRange[1]) {
          return false;
        }
      }
      
      if (session.focoMedio !== undefined) {
        if (session.focoMedio < filterState.focusRange[0] || session.focoMedio > filterState.focusRange[1]) {
          return false;
        }
      }
      
      if (session.confiancaMedia !== undefined) {
        if (session.confiancaMedia < filterState.confidenceRange[0] || session.confiancaMedia > filterState.confidenceRange[1]) {
          return false;
        }
      }
      
      if (session.inteligenciaEmocionalMedia !== undefined) {
        if (session.inteligenciaEmocionalMedia < filterState.emotionalRange[0] || session.inteligenciaEmocionalMedia > filterState.emotionalRange[1]) {
          return false;
        }
      }
      
      if (session.interferenciasMedia !== undefined) {
        if (session.interferenciasMedia < filterState.interferenceRange[0] || session.interferenciasMedia > filterState.interferenceRange[1]) {
          return false;
        }
      }
      
      // Filtro ABI
      if (session.abiMed !== undefined) {
        if (session.abiMed < filterState.abiRange[0] || session.abiMed > filterState.abiRange[1]) {
          return false;
        }
      }
      
      return true;
    });
  };

  // Funções auxiliares melhoradas para o modal de conflito
  const formatImprovedDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    if (isToday) {
      return "Hoje";
    } else if (isYesterday) {
      return "Ontem";
    } else {
      return date.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
      console.log("🔍 DEBUG - Fetching active sessions for userPlatformId:", JSON.parse(localStorage.getItem('grindfy_user_data') || 'null')?.userPlatformId);
      const response = await apiRequest("GET", "/api/grind-sessions");
      const jsonData = await response.json();
      console.log("🔍 DEBUG - Active sessions response:", jsonData);
      return Array.isArray(jsonData) ? jsonData : [];
    },
    refetchInterval: 5000, // Refetch every 5 seconds
    staleTime: 1000, // Consider fresh for 1 second
    refetchOnWindowFocus: true, // Refetch when window gains focus
  });

  const activeSession = activeSessions.find((session: any) => session.status === "active");

  // 🎯 ETAPA 4: Query para torneios planejados do Grade Planner
  const { data: plannedTournaments = [], isLoading: isLoadingPlannedTournaments } = useQuery({
    queryKey: ["/api/planned-tournaments", { dayOfWeek: new Date().getDay() || 7 }],
    queryFn: async () => {
      const currentDayOfWeek = new Date().getDay() || 7;
      const response = await apiRequest("GET", `/api/planned-tournaments?dayOfWeek=${currentDayOfWeek}`);
      const jsonData = await response.json();
      console.log('🎯 ETAPA 4 - Torneios planejados carregados:', jsonData);
      return Array.isArray(jsonData) ? jsonData : [];
    },
    enabled: showStartDialog, // Only load when modal is open
  });

  // Active session detection complete

  // Remove auto-redirect logic - users navigate manually

  // Fetch session history
  const { data: sessionHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["/api/grind-sessions/history"],
    queryFn: async () => {
      console.log("🔍 DEBUG - Fetching session history for userPlatformId:", JSON.parse(localStorage.getItem('grindfy_user_data') || 'null')?.userPlatformId);
      const response = await apiRequest("GET", "/api/grind-sessions/history");
      const jsonData = await response.json();
      console.log("🔍 DEBUG - Session history response:", jsonData);
      return Array.isArray(jsonData) ? jsonData : [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  // Filter sessions based on current filters
  const filteredSessions = applyFiltersToSessions(sessionHistory);

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

  // 🎯 ETAPA 3: Start session mutation com integração Grade Planner
  const startSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/grind-sessions", data);
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
    // 📋 ETAPA 1: Sistema completo de integração com Grade Planner
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    console.log('🎯 ETAPA 1: Iniciando sessão integrada com Grade Planner');
    console.log('📅 Dia da semana atual:', currentDayOfWeek);
    console.log('🎯 UserPlatformId:', 'USER-0002'); // Should be dynamic from auth context
    
    const sessionData = {
      date: today.toISOString(),
      status: "active",
      preparationNotes: preparationNotes || "",
      preparationPercentage: preparationPercentage[0],
      dailyGoals: dailyGoals || "",
      screenCap: screenCap,
      skipBreaksToday: false,
      resetTournaments: true, // Always reset tournaments for clean start
      replaceExisting: true, // Always ensure clean session creation
      // 🔄 ETAPA 2: Integração com Grade Planner
      dayOfWeek: currentDayOfWeek,
      loadFromGradePlanner: true, // Flag para carregar torneios do Grade Planner
    };

    console.log('📋 Dados da sessão preparados:', sessionData);
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
      return apiRequest("PUT", `/api/grind-sessions/${data.id}`, data.sessionData);
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
      return apiRequest("DELETE", `/api/grind-sessions/${sessionId}`);
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
      return apiRequest("POST", "/api/grind-sessions", {
        ...sessionData,
        date: new Date(sessionData.date).toISOString(),
        status: "completed",
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

    // ETAPA 6: Validação avançada usando o novo sistema
    const { isValid, errors } = createSessionValidator().validate(editData);

    if (!isValid) {
      // Aplicar erros aos campos
      Object.entries(errors).forEach(([field, error]) => {
        setFieldError(field, true);
      });

      toast({
        title: "Erro de validação",
        description: "Verifique os campos destacados em vermelho.",
        variant: "destructive",
      });
      return;
    }

    // Iniciar processo de salvamento
    setIsSaving(true);
    setShowSuccess(false);

    editSessionMutation.mutate({
      id: editingSession.id,
      sessionData: {
        // Performance metrics - Convert numbers to strings for schema compatibility
        volume: editData.volume,
        profit: String(editData.profit || 0),
        abiMed: String(editData.abiMed || 0),
        roi: String(editData.roi || 0),
        fts: editData.fts,
        cravadas: editData.cravadas,
        // Mental state metrics - Convert numbers to strings for schema compatibility
        energiaMedia: String(editData.energiaMedia || 5),
        focoMedio: String(editData.focoMedio || 5),
        confiancaMedia: String(editData.confiancaMedia || 5),
        inteligenciaEmocionalMedia: String(editData.inteligenciaEmocionalMedia || 5),
        interferenciasMedia: String(editData.interferenciasMedia || 5),
        // Notes and goals
        preparationNotes: editData.preparationNotes,
        dailyGoals: editData.dailyGoals,
        finalNotes: editData.finalNotes,
        objectiveCompleted: editData.objectiveCompleted,
      }
    }, {
      onSuccess: () => {
        // ETAPA 6: Limpar auto-save ao salvar com sucesso
        clearAutoSave();
        setIsSaving(false);
        setShowSuccess(true);
        
        // Mostrar sucesso por 2 segundos antes de fechar
        setTimeout(() => {
          setShowSuccess(false);
          setIsEditDialogOpen(false);
        }, 2000);
      },
      onError: () => {
        setIsSaving(false);
        setShowSuccess(false);
      }
    });
  };

  const handleConfirmDelete = () => {
    if (!sessionToDelete) return;
    deleteSessionMutation.mutate(sessionToDelete.id);
  };

  const handleRegisterSession = (formData: any) => {
    registerSessionMutation.mutate(formData);
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

  

  

  

  // Função de validação para métricas
  const validateMetrics = (field: string, value: number): boolean => {
    if (!editingSession) return true;

    const validations = {
      volume: value >= 0,
      profit: !isNaN(value),
      abiMed: value >= 0,
      roi: !isNaN(value),
      fts: value >= 0 && value <= (editData.volume || 999),
      cravadas: value >= 0 && value <= (editData.fts || 999)
    };

    return validations[field as keyof typeof validations] ?? true;
  };

  // Navigation to active session is handled by direct links

  // ETAPA 6: Sistema de Validação Avançada
  const createSessionValidator = () => {
    const schema = {
      volume: {
        required: false,
        min: 0,
        max: 100,
        message: "Volume deve estar entre 0 e 100"
      },
      profit: {
        required: false,
        message: "Profit deve ser um número válido"
      },
      abiMed: {
        required: false,
        min: 0,
        message: "ABI médio não pode ser negativo"
      },
      fts: {
        required: false,
        min: 0,
        validate: (value: number, data: any) => 
          value <= data.volume || "FTs não pode ser maior que volume",
        message: "FTs inválido"
      },
      cravadas: {
        required: false,
        min: 0,
        validate: (value: number, data: any) => 
          value <= data.fts || "Cravadas não pode ser maior que FTs",
        message: "Cravadas inválido"
      }
    };

    const validate = (data: any): { isValid: boolean; errors: Record<string, string> } => {
      const errors: Record<string, string> = {};

      Object.entries(schema).forEach(([field, rules]) => {
        const value = data[field as keyof typeof data];
        
        if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
          errors[field] = rules.message;
        }
        
        if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
          errors[field] = rules.message;
        }
        
        if (rules.validate && typeof rules.validate === 'function') {
          const customValidation = rules.validate(value as number, data);
          if (customValidation !== true) {
            errors[field] = customValidation as string;
          }
        }
      });

      return {
        isValid: Object.keys(errors).length === 0,
        errors
      };
    };

    return { validate };
  };

  // ETAPA 6: Hook para Auto-save e Recovery
  const useAutoSave = (editData: any, sessionId: string) => {
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Auto-save no localStorage a cada 30 segundos
    useEffect(() => {
      const autoSaveKey = `edit-session-${sessionId}`;
      
      const interval = setInterval(() => {
        if (hasUnsavedChanges) {
          localStorage.setItem(autoSaveKey, JSON.stringify({
            data: editData,
            timestamp: new Date().toISOString()
          }));
          setLastSaved(new Date());
          setHasUnsavedChanges(false);
        }
      }, 30000);

      return () => clearInterval(interval);
    }, [editData, sessionId, hasUnsavedChanges]);

    // Detectar mudanças
    useEffect(() => {
      setHasUnsavedChanges(true);
    }, [editData]);

    // Limpar auto-save ao salvar com sucesso
    const clearAutoSave = () => {
      localStorage.removeItem(`edit-session-${sessionId}`);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
    };

    // Recuperar dados salvos
    const recoverAutoSave = (): any | null => {
      const autoSaveKey = `edit-session-${sessionId}`;
      const saved = localStorage.getItem(autoSaveKey);
      
      if (saved) {
        try {
          const { data, timestamp } = JSON.parse(saved);
          const saveTime = new Date(timestamp);
          const now = new Date();
          
          // Só recuperar se foi salvo nas últimas 2 horas
          if (now.getTime() - saveTime.getTime() < 2 * 60 * 60 * 1000) {
            return data;
          }
        } catch (error) {
          console.error('Erro ao recuperar auto-save:', error);
        }
      }
      
      return null;
    };

    return {
      lastSaved,
      hasUnsavedChanges,
      clearAutoSave,
      recoverAutoSave
    };
  };

  // ETAPA 6: Debounced Validation Hook
  const useDebouncedValidation = (editData: any, delay = 500) => {
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    
    const debouncedValidate = useMemo(
      () => {
        let timeoutId: NodeJS.Timeout;
        return (data: any) => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            const { errors } = createSessionValidator().validate(data);
            setValidationErrors(errors);
          }, delay);
        };
      },
      [delay]
    );

    useEffect(() => {
      debouncedValidate(editData);
    }, [editData, debouncedValidate]);

    return validationErrors;
  };

  // ETAPA 4 - Lógica de Estado e Gerenciamento do modal de edição de sessão
  const useSessionEdit = (initialSession: SessionHistoryData) => {
    const [editData, setEditData] = useState(initialSession);

    const updateField = (field: string, value: any) => {
      setEditData(prevData => ({
        ...prevData,
        [field]: value
      }));
    };

    useEffect(() => {
      setEditData(initialSession);
    }, [initialSession]);

    return { editData, updateField };
  };

  // ETAPA 5 - Hook para feedback visual em tempo real
  const useVisualFeedback = () => {
    const [savedField, setSavedField] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
    const [isAnimating, setIsAnimating] = useState<Record<string, boolean>>({});

    const showFieldSaved = (fieldName: string) => {
      setSavedField(fieldName);
      setIsAnimating(prev => ({ ...prev, [fieldName]: true }));
      
      setTimeout(() => {
        setSavedField(null);
        setIsAnimating(prev => ({ ...prev, [fieldName]: false }));
      }, 2000);
    };

    const setFieldError = (fieldName: string, hasError: boolean) => {
      setFieldErrors(prev => ({ ...prev, [fieldName]: hasError }));
    };

    const getFieldClassName = (fieldName: string, baseClass: string) => {
      let className = baseClass;
      
      if (fieldErrors[fieldName]) {
        className += " field-error";
      } else if (savedField === fieldName) {
        className += " field-saved";
      } else {
        className += " field-normal";
      }
      
      return className;
    };

    const getSliderClassName = (fieldName: string, value: number, maxValue: number = 10) => {
      let className = "slider-container";
      
      if (value <= maxValue * 0.3) {
        className += " slider-low";
      } else if (value <= maxValue * 0.7) {
        className += " slider-medium";
      } else {
        className += " slider-high";
      }
      
      if (value === 1 || value === maxValue) {
        className += " extreme-value";
      }
      
      if (isAnimating[fieldName]) {
        className += " updating";
      }
      
      return className;
    };

    return {
      showFieldSaved,
      setFieldError,
      getFieldClassName,
      getSliderClassName,
      savedField,
      fieldErrors,
      isAnimating
    };
  };

  // ETAPA 5 - Componente LoadingButton
  interface LoadingButtonProps {
    isLoading: boolean;
    children: React.ReactNode;
    loadingText?: string;
    successText?: string;
    showSuccess?: boolean;
    onClick?: () => void;
    variant?: "default" | "outline";
    className?: string;
  }

  const LoadingButton: React.FC<LoadingButtonProps> = ({ 
    isLoading, 
    children, 
    loadingText = "Salvando...",
    successText = "Salvo!",
    showSuccess = false,
    onClick,
    variant = "default",
    className = "",
    ...props 
  }) => {
    return (
      <Button 
        disabled={isLoading}
        onClick={onClick}
        variant={variant}
        className={`transition-all duration-300 ${showSuccess ? 'button-success' : ''} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <div className="loading-spinner mr-2" />
            {loadingText}
          </>
        ) : showSuccess ? (
          <>
            <span className="success-checkmark mr-2">✅</span>
            {successText}
          </>
        ) : (
          children
        )}
      </Button>
    );
  };

  const initialSession = useMemo(() => {
    return {
      id: editingSession?.id || '',
      userId: editingSession?.userId || '',
      date: editingSession?.date || '',
      duration: editingSession?.duration || '',
      volume: editingSession?.volume || 0,
      profit: editingSession?.profit || 0,
      abiMed: editingSession?.abiMed || 0,
      roi: editingSession?.roi || 0,
      fts: editingSession?.fts || 0,
      cravadas: editingSession?.cravadas || 0,
      energiaMedia: editingSession?.energiaMedia || 5,
      focoMedio: editingSession?.focoMedio || 5,
      confiancaMedia: editingSession?.confiancaMedia || 5,
      inteligenciaEmocionalMedia: editingSession?.inteligenciaEmocionalMedia || 5,
      interferenciasMedia: editingSession?.interferenciasMedia || 5,
      breakCount: editingSession?.breakCount || 0,
      preparationNotes: editingSession?.preparationNotes || '',
      preparationPercentage: editingSession?.preparationPercentage || 0,
      dailyGoals: editingSession?.dailyGoals || '',
      finalNotes: editingSession?.finalNotes || '',
      objectiveCompleted: editingSession?.objectiveCompleted || false,
      status: editingSession?.status || '',
    };
  }, [editingSession]);

  const { editData, updateField } = useSessionEdit(initialSession);
  const { 
    showFieldSaved, 
    setFieldError, 
    getFieldClassName, 
    getSliderClassName,
    savedField,
    fieldErrors 
  } = useVisualFeedback();

  // ETAPA 6: Auto-save e validação em tempo real
  const {
    lastSaved,
    hasUnsavedChanges,
    clearAutoSave,
    recoverAutoSave
  } = useAutoSave(editData, editingSession?.id || '');
  
  const debouncedErrors = useDebouncedValidation(editData);

  // Estados para controle de salvamento
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ETAPA 6: Verificar auto-save ao abrir modal
  useEffect(() => {
    if (editingSession && isEditDialogOpen) {
      const recoveredData = recoverAutoSave();
      if (recoveredData) {
        const shouldRecover = window.confirm(
          '🔄 Encontrei dados não salvos desta sessão. Deseja recuperá-los?\n\n' +
          `Última modificação: ${lastSaved ? lastSaved.toLocaleString() : 'Agora há pouco'}`
        );
        
        if (shouldRecover) {
          Object.entries(recoveredData).forEach(([field, value]) => {
            updateField(field, value);
          });
          
          toast({
            title: "📁 Dados recuperados",
            description: "Suas alterações não salvas foram restauradas.",
          });
        }
      }
    }
  }, [editingSession, isEditDialogOpen]);

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

            {/* Filtros agora são integrados via FilterDropdown */}

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

                <EpicStartSessionModal 
                  isOpen={showStartDialog} 
                  onClose={() => setShowStartDialog(false)}
                  onSuccess={handleStartSession}
                  preparationPercentage={preparationPercentage}
                  setPreparationPercentage={setPreparationPercentage}
                  preparationNotes={preparationNotes}
                  setPreparationNotes={setPreparationNotes}
                  dailyGoals={dailyGoals}
                  setDailyGoals={setDailyGoals}
                  screenCap={screenCap}
                  setScreenCap={setScreenCap}
                  isLoading={startSessionMutation.isPending}
                  plannedTournaments={plannedTournaments}
                  isLoadingPlannedTournaments={isLoadingPlannedTournaments}
                />
              </>
            )}
          </div>
        </div>
      </div>

      

      {/* FilterDropdown integrado acima do dashboard */}
      <FilterDropdown
        onApplyFilters={setFilterState}
        initialFilters={filterState}
      />

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
              className={`period-btn ${filterState.period === '7d' ? 'active' : ''}`}
              onClick={() => setFilterState({...filterState, period: '7d'})}
            >
              7 dias
            </button>
            <button 
              className={`period-btn ${filterState.period === '30d' ? 'active' : ''}`}
              onClick={() => setFilterState({...filterState, period: '30d'})}
            >
              30 dias
            </button>
            <button 
              className={`period-btn ${filterState.period === '90d' ? 'active' : ''}`}
              onClick={() => setFilterState({...filterState, period: '90d'})}
            >
              90 dias
            </button>
            <button 
              className={`period-btn ${filterState.period === 'all' ? 'active' : ''}`}
              onClick={() => setFilterState({...filterState, period: 'all'})}
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
                      onClick={() => toggleObservations(session.id)}
                      className="border-blue-600 text-blue-400 hover:text-blue-300 hover:border-blue-400 mr-2"
                      title="Ver observações"
                    >
                      {expandedObservations.has(session.id) ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
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

                {/* Expandable Observations Section */}
                {expandedObservations.has(session.id) && (
                  <div className="session-observations">
                    <div className="observations-header">
                      <h4 className="observations-title">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Observações da Sessão
                      </h4>
                    </div>
                    <div className="observations-content">
                      <div className="observations-grid">
                        {/* Preparação Column */}
                        <div className="observation-column">
                          <div className="observation-header">
                            <BookOpen className="w-4 h-4 mr-2" />
                            <span className="observation-label">Preparação</span>
                          </div>
                          <div className="observation-content">
                            {session.preparationNotes ? (
                              <p className="observation-text">{session.preparationNotes}</p>
                            ) : (
                              <p className="observation-empty">Nenhuma observação de preparação registrada</p>
                            )}
                          </div>
                        </div>

                        {/* Final Notes Column */}
                        <div className="observation-column">
                          <div className="observation-header">
                            <FileText className="w-4 h-4 mr-2" />
                            <span className="observation-label">Observações Finais</span>
                          </div>
                          <div className="observation-content">
                            {session.finalNotes ? (
                              <p className="observation-text">{session.finalNotes}</p>
                            ) : (
                              <p className="observation-empty">Nenhuma observação final registrada</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Edit Session Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent 
          className="modal-container"
          role="dialog"
          aria-labelledby="modal-title"
          aria-describedby="modal-description"
          aria-modal="true"
        >
          {/* Header fixo */}
          <div className="modal-header">
            <div className="header-content">
              <div>
                <h2 id="modal-title" className="modal-title">✏️ Editar Sessão</h2>
                <p id="modal-description" className="session-date">
                  {editingSession && (
                    <>Sessão de {formatDate(editingSession.date)}, {editingSession.startTime || 'Horário não definido'}</>
                  )}
                </p>
                {/* ETAPA 6: Indicador de auto-save */}
                {hasUnsavedChanges && (
                  <div className="auto-save-indicator">
                    💾 Alterações não salvas detectadas
                  </div>
                )}
                {lastSaved && (
                  <div className="last-saved-indicator">
                    ✅ Último backup: {lastSaved.toLocaleTimeString()}
                  </div>
                )}
              </div>
              <DialogClose className="close-btn" aria-label="Fechar modal">✕</DialogClose>
            </div>
          </div>

          {/* Body com seções */}
          <div className="modal-body">
            {editingSession && (
              <div className="space-y-6">
                {/* ETAPA 2: Seção de Métricas de Performance */}
                <div className="section">
                  <h3 className="section-title">📊 Métricas de Performance</h3>
                  <div className="metrics-grid">
                    <div className="metric-field">
                      <label className="field-label">👥 Volume</label>
                      <div className="input-with-icon">
                        <Input
                          type="number"
                          min="0"
                          value={editData.volume || 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            updateField('volume', value);
                            setFieldError('volume', value < 0);
                            if (value >= 0) showFieldSaved('volume');
                          }}
                          className={getFieldClassName('volume', "field-input")}
                          placeholder="Número de torneios"
                        />
                        <Users className="input-icon" />
                        {fieldErrors.volume && (
                          <span className="field-feedback-icon text-red-400">⚠️</span>
                        )}
                        {savedField === 'volume' && (
                          <span className="field-feedback-icon text-green-400">✅</span>
                        )}
                      </div>
                      <div className="field-hint">Total de torneios jogados na sessão</div>
                    </div>

                    <div className="metric-field">
                      <label className="field-label">💰 Profit (USD)</label>
                      <div className="input-with-icon">
                        <Input
                          type="number"
                          step="0.01"
                          value={editData.profit || 0}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            updateField('profit', value);
                          }}
                          className="field-input"
                          placeholder="Lucro em dólares"
                        />
                        <DollarSign className="input-icon" />
                      </div>
                      <div className="field-hint">Lucro líquido (prêmios - investimento)</div>
                    </div>

                    <div className="metric-field">
                      <label className="field-label">🎯 ABI Médio (USD)</label>
                      <div className="input-with-icon">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editData.abiMed || 0}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            updateField('abiMed', value);
                          }}
                          className="field-input"
                          placeholder="Buy-in médio"
                        />
                        <Target className="input-icon" />
                      </div>
                      <div className="field-hint">Buy-in médio dos torneios</div>
                    </div>

                    <div className="metric-field">
                      <label className="field-label">📈 ROI (%)</label>
                      <div className="input-with-icon">
                        <Input
                          type="number"
                          step="0.1"
                          value={editData.roi || 0}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            updateField('roi', value);
                          }}
                          className="field-input"
                          placeholder="Return on Investment"
                        />
                        <TrendingUp className="input-icon" />
                      </div>
                      <div className="field-hint">Retorno sobre investimento</div>
                    </div>

                    <div className="metric-field">
                      <label className="field-label">🏆 Final Tables</label>
                      <div className="input-with-icon">
                        <Input
                          type="number"
                          min="0"
                          max={editData.volume || 999}
                          value={editData.fts || 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            updateField('fts', value);
                          }}
                          className="field-input"
                          placeholder="Mesas finais"
                        />
                        <Trophy className="input-icon" />
                      </div>
                      <div className="field-hint">Quantidade de mesas finais alcançadas</div>
                    </div>

                    <div className="metric-field">
                      <label className="field-label">👑 Cravadas</label>
                      <div className="input-with-icon">
                        <Input
                          type="number"
                          min="0"
                          max={editData.fts || 999}
                          value={editData.cravadas || 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            updateField('cravadas', value);
                          }}
                          className="field-input"
                          placeholder="Vitórias"
                        />
                        <Award className="input-icon" />
                      </div>
                      <div className="field-hint">Torneios vencidos (1º lugar)</div>
                    </div>
                  </div>

                  {/* Indicadores de validação */}
                  <div className="validation-indicators">
                    {editData.fts > editData.volume && (
                      <div className="validation-error">
                        ⚠️ Final Tables não pode ser maior que o Volume
                      </div>
                    )}
                    {editData.cravadas > editData.fts && (
                      <div className="validation-error">
                        ⚠️ Cravadas não pode ser maior que Final Tables
                      </div>
                    )}
                  </div>
                </div>

              {/* ETAPA 3: Seção de Estado Mental */}
              <div className="section">
                <h3 className="section-title">🧠 Estado Mental (1-10)</h3>
                <div className="mental-grid">
                  {/* Energia */}
                  <div className="mental-field">
                    <label className="field-label">⚡ Energia</label>
                    <div className={getSliderClassName('energiaMedia', editData.energiaMedia || 5)}>
                      <Slider
                        value={[editData.energiaMedia || 5]}
                        onValueChange={([value]) => {
                          updateField('energiaMedia', value);
                          showFieldSaved('energiaMedia');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.energiaMedia || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Cansado</span>
                      <span className="text-xs text-gray-500">Neutro</span>
                      <span className="text-xs text-gray-500">Energizado</span>
                    </div>
                  </div>

                  {/* Foco */}
                  <div className="mental-field">
                    <label className="field-label">🎯 Foco</label>
                    <div className={getSliderClassName('focoMedio', editData.focoMedio || 5)}>
                      <Slider
                        value={[editData.focoMedio || 5]}
                        onValueChange={([value]) => {
                          updateField('focoMedio', value);
                          showFieldSaved('focoMedio');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.focoMedio || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Disperso</span>
                      <span className="text-xs text-gray-500">Neutro</span>
                      <span className="text-xs text-gray-500">Focado</span>
                    </div>
                  </div>

                  {/* Confiança */}
                  <div className="mental-field">
                    <label className="field-label">💪 Confiança</label>
                    <div className={getSliderClassName('confiancaMedia', editData.confiancaMedia || 5)}>
                      <Slider
                        value={[editData.confiancaMedia || 5]}
                        onValueChange={([value]) => {
                          updateField('confiancaMedia', value);
                          showFieldSaved('confiancaMedia');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.confiancaMedia || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Inseguro</span>
                      <span className="text-xs text-gray-500">Neutro</span>
                      <span className="text-xs text-gray-500">Confiante</span>
                    </div>
                  </div>

                  {/* Inteligência Emocional */}
                  <div className="mental-field">
                    <label className="field-label">🧠 Int. Emocional</label>
                    <div className={getSliderClassName('inteligenciaEmocionalMedia', editData.inteligenciaEmocionalMedia || 5)}>
                      <Slider
                        value={[editData.inteligenciaEmocionalMedia || 5]}
                        onValueChange={([value]) => {
                          updateField('inteligenciaEmocionalMedia', value);
                          showFieldSaved('inteligenciaEmocionalMedia');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.inteligenciaEmocionalMedia || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Reativo</span>
                      <span className="text-xs text-gray-500">Neutro</span>
                      <span className="text-xs text-gray-500">Controlado</span>
                    </div>
                  </div>

                  {/* Interferências */}
                  <div className="mental-field">
                    <label className="field-label">📱 Interferências</label>
                    <div className={getSliderClassName('interferenciasMedia', editData.interferenciasMedia || 5)}>
                      <Slider
                        value={[editData.interferenciasMedia || 5]}
                        onValueChange={([value]) => {
                          updateField('interferenciasMedia', value);
                          showFieldSaved('interferenciasMedia');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.interferenciasMedia || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Muitas</span>
                      <span className="text-xs text-gray-500">Algumas</span>
                      <span className="text-xs text-gray-500">Nenhuma</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ETAPA 3: Seção de Notas e Objetivos */}
              <div className="section">
                <h3 className="section-title">📝 Notas e Objetivos</h3>
                <div className="notes-section">
                  <div className="textarea-field">
                    <label className="field-label">📋 Notas de Preparação</label>
                    <Textarea
                      value={editData.preparationNotes || ""}
                      onChange={(e) => updateField('preparationNotes', e.target.value)}
                      placeholder="Notas sobre a preparação da sessão..."
                      maxLength={500}
                      className="field-textarea"
                    />
                    <div className="char-counter">
                      {(editData.preparationNotes || "").length}/500
                    </div>
                  </div>

                  <div className="textarea-field">
                    <label className="field-label">🎯 Objetivos do Dia</label>
                    <Textarea
                      value={editData.dailyGoals || ""}
                      onChange={(e) => updateField('dailyGoals', e.target.value)}
                      placeholder="Quais eram os objetivos para esta sessão?"
                      maxLength={300}
                      className="field-textarea"
                    />
                    <div className="char-counter">
                      {(editData.dailyGoals || "").length}/300
                    </div>
                  </div>

                  <div className="textarea-field">
                    <label className="field-label">📖 Notas Finais</label>
                    <Textarea
                      value={editData.finalNotes || ""}
                      onChange={(e) => updateField('finalNotes', e.target.value)}
                      placeholder="Reflexões, aprendizados e observações da sessão..."
                      maxLength={1000}
                      className="field-textarea"
                    />
                    <div className="char-counter">
                      {(editData.finalNotes || "").length}/1000
                    </div>
                  </div>

                  <div className="objective-toggle">
                    <label className="field-label">✅ Objetivos Cumpridos?</label>
                    <div className="flex items-center gap-3 mt-2">
                      <input
                        type="checkbox"
                        id="objectiveCompleted"
                        checked={editData.objectiveCompleted || false}
                        onChange={(e) => updateField('objectiveCompleted', e.target.checked)}
                        className="objective-checkbox"
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="objectiveCompleted" className="objective-label">
                        <span className="checkbox-icon">
                          {editData.objectiveCompleted ? '✅' : '⬜'}
                        </span>
                        <span className="objective-text">
                          {editData.objectiveCompleted ? 'Objetivos foram cumpridos' : 'Objetivos não foram cumpridos'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            )}
          </div>

          {/* Footer fixo */}
          <div className="modal-actions">
            <Button 
              variant="outline" 
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSaving}
            >
              ❌ Cancelar
            </Button>
            <LoadingButton
              isLoading={isSaving}
              showSuccess={showSuccess}
              onClick={handleSaveEdit}
              loadingText="💾 Salvando..."
              successText="✅ Salvo com sucesso!"
            >
              💾 Salvar Alterações
            </LoadingButton>
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
      {/* Register Past Session Dialog - ETAPA 1 OTIMIZADA */}
      <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
        <DialogContent className="register-session-popup bg-gray-900 border-gray-700 text-white max-w-5xl max-h-[95vh] overflow-y-auto">
          {/* Header Otimizado */}
          <DialogHeader className="pb-4 border-b border-gray-700">
            <DialogTitle className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="text-2xl">📋</span>
              Registrar Sessão Passada
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-base">
              Registre os resultados de uma sessão que já aconteceu para manter seu histórico completo
            </DialogDescription>
          </DialogHeader>

          {/* Layout Responsivo com Cards */}
          <div className="register-session-grid grid grid-cols-1 lg:grid-cols-2 gap-6 py-6">
            
            {/* Card 1: Informações Básicas */}
            <div className="register-card bg-gray-800 border border-gray-700 p-6 rounded-xl">
              <div className="card-header flex items-center gap-3 mb-4">
                <div className="icon-container bg-blue-500/20 p-2 rounded-lg">
                  <span className="text-xl">📅</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Informações Básicas</h3>
                  <p className="text-sm text-gray-400">Data e duração da sessão</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <InputField
                  label="Data da Sessão"
                  icon="🗓️"
                  type="date"
                  value={registerSessionForm.formData.date}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('date', value);
                    registerSessionForm.touchField('date');
                  }}
                  required
                  tabIndex={1}
                  hasError={registerSessionForm.hasFieldError('date')}
                  isValid={registerSessionForm.isFieldValid('date')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('date')}
                  errorMessage={registerSessionForm.getFieldError('date')}
                  onEnter={() => document.getElementById('duration-field')?.focus()}
                />
                
                <InputField
                  label="Duração"
                  icon="⏱️"
                  type="text"
                  placeholder="Ex: 4h 30min"
                  value={registerSessionForm.formData.duration}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('duration', value);
                    registerSessionForm.touchField('duration');
                  }}
                  required
                  tabIndex={2}
                  hasError={registerSessionForm.hasFieldError('duration')}
                  isValid={registerSessionForm.isFieldValid('duration')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('duration')}
                  errorMessage={registerSessionForm.getFieldError('duration')}
                  onEnter={() => document.getElementById('volume-field')?.focus()}
                />
              </div>
            </div>

            {/* Card 2: Métricas de Performance */}
            <div className="register-card bg-gray-800 border border-gray-700 p-6 rounded-xl">
              <div className="card-header flex items-center gap-3 mb-4">
                <div className="icon-container bg-green-500/20 p-2 rounded-lg">
                  <span className="text-xl">📊</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Métricas de Performance</h3>
                  <p className="text-sm text-gray-400">Volume, lucro e estatísticas</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Volume"
                  icon="🎯"
                  type="number"
                  value={registerSessionForm.formData.volume}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('volume', Number(value) || 0);
                    registerSessionForm.touchField('volume');
                  }}
                  required
                  tabIndex={3}
                  hasError={registerSessionForm.hasFieldError('volume')}
                  isValid={registerSessionForm.isFieldValid('volume')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('volume')}
                  errorMessage={registerSessionForm.getFieldError('volume')}
                  onEnter={() => document.getElementById('profit-field')?.focus()}
                />
                
                <InputField
                  label="Lucro ($)"
                  icon="💰"
                  type="number"
                  step="0.01"
                  value={registerSessionForm.formData.profit}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('profit', Number(value) || 0);
                    registerSessionForm.touchField('profit');
                  }}
                  required
                  tabIndex={4}
                  hasError={registerSessionForm.hasFieldError('profit')}
                  isValid={registerSessionForm.isFieldValid('profit')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('profit')}
                  errorMessage={registerSessionForm.getFieldError('profit')}
                  onEnter={() => document.getElementById('abi-field')?.focus()}
                />
                
                <InputField
                  label="ABI Médio ($)"
                  icon="💵"
                  type="number"
                  step="0.01"
                  value={registerSessionForm.formData.abiMed}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('abiMed', Number(value) || 0);
                    registerSessionForm.touchField('abiMed');
                  }}
                  required
                  tabIndex={5}
                  hasError={registerSessionForm.hasFieldError('abiMed')}
                  isValid={registerSessionForm.isFieldValid('abiMed')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('abiMed')}
                  errorMessage={registerSessionForm.getFieldError('abiMed')}
                  onEnter={() => document.getElementById('roi-field')?.focus()}
                />
                
                <div className="relative">
                  <InputField
                    label="ROI (%) - Calculado"
                    icon="📈"
                    type="number"
                    step="0.01"
                    value={registerSessionForm.formData.roi}
                    onChange={() => {}} // ROI é calculado automaticamente
                    tabIndex={6}
                    hasError={false}
                    isValid={true}
                    isTouched={true}
                    errorMessage=""
                    onEnter={() => document.getElementById('fts-field')?.focus()}
                  />
                  <div className="absolute top-0 right-0 bg-green-600 text-white text-xs px-2 py-1 rounded-bl-md font-medium">
                    AUTO
                  </div>
                </div>
                
                <InputField
                  label="Final Tables"
                  icon="🏆"
                  type="number"
                  value={registerSessionForm.formData.fts}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('fts', Number(value) || 0);
                    registerSessionForm.touchField('fts');
                  }}
                  tabIndex={7}
                  hasError={registerSessionForm.hasFieldError('fts')}
                  isValid={registerSessionForm.isFieldValid('fts')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('fts')}
                  errorMessage={registerSessionForm.getFieldError('fts')}
                  onEnter={() => document.getElementById('cravadas-field')?.focus()}
                />
                
                <InputField
                  label="Cravadas"
                  icon="🎖️"
                  type="number"
                  value={registerSessionForm.formData.cravadas}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('cravadas', Number(value) || 0);
                    registerSessionForm.touchField('cravadas');
                  }}
                  tabIndex={8}
                  hasError={registerSessionForm.hasFieldError('cravadas')}
                  isValid={registerSessionForm.isFieldValid('cravadas')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('cravadas')}
                  errorMessage={registerSessionForm.getFieldError('cravadas')}
                  onEnter={() => document.getElementById('energia-field')?.focus()}
                />
              </div>
            </div>

            {/* Card 3: Estado Mental */}
            <div className="register-card bg-gray-800 border border-gray-700 p-6 rounded-xl">
              <div className="card-header flex items-center gap-3 mb-4">
                <div className="icon-container bg-purple-500/20 p-2 rounded-lg">
                  <span className="text-xl">🧠</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Estado Mental</h3>
                  <p className="text-sm text-gray-400">Avaliação dos aspectos mentais</p>
                </div>
              </div>
              
              <div className="space-y-5">
                <MentalSlider
                  label="Energia"
                  icon="⚡"
                  value={registerSessionForm.formData.energiaMedia}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('energiaMedia', value);
                    registerSessionForm.touchField('energiaMedia');
                  }}
                  tabIndex={9}
                  onEnter={() => document.getElementById('foco-field')?.focus()}
                />
                
                <MentalSlider
                  label="Foco"
                  icon="🎯"
                  value={registerSessionForm.formData.focoMedio}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('focoMedio', value);
                    registerSessionForm.touchField('focoMedio');
                  }}
                  tabIndex={10}
                  onEnter={() => document.getElementById('confianca-field')?.focus()}
                />
                
                <MentalSlider
                  label="Confiança"
                  icon="💪"
                  value={registerSessionForm.formData.confiancaMedia}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('confiancaMedia', value);
                    registerSessionForm.touchField('confiancaMedia');
                  }}
                  tabIndex={11}
                  onEnter={() => document.getElementById('emocional-field')?.focus()}
                />
                
                <MentalSlider
                  label="Int. Emocional"
                  icon="🎭"
                  value={registerSessionForm.formData.inteligenciaEmocionalMedia}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('inteligenciaEmocionalMedia', value);
                    registerSessionForm.touchField('inteligenciaEmocionalMedia');
                  }}
                  tabIndex={12}
                  onEnter={() => document.getElementById('interferencias-field')?.focus()}
                />
                
                <MentalSlider
                  label="Interferências"
                  icon="📱"
                  value={registerSessionForm.formData.interferenciasMedia}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('interferenciasMedia', value);
                    registerSessionForm.touchField('interferenciasMedia');
                  }}
                  tabIndex={13}
                  onEnter={() => document.getElementById('prep-notes-field')?.focus()}
                />
              </div>
            </div>

            {/* Card 4: Notas e Objetivos */}
            <div className="register-card bg-gray-800 border border-gray-700 p-6 rounded-xl">
              <div className="card-header flex items-center gap-3 mb-4">
                <div className="icon-container bg-orange-500/20 p-2 rounded-lg">
                  <span className="text-xl">📝</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Notas e Objetivos</h3>
                  <p className="text-sm text-gray-400">Preparação, objetivos e reflexões</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <TextareaField
                  label="Notas de Preparação"
                  icon="🎯"
                  value={registerSessionForm.formData.preparationNotes}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('preparationNotes', value);
                    registerSessionForm.touchField('preparationNotes');
                  }}
                  placeholder="Como você se preparou para esta sessão?"
                  rows={3}
                  tabIndex={14}
                  maxLength={300}
                  hasError={registerSessionForm.hasFieldError('preparationNotes')}
                  isValid={registerSessionForm.isFieldValid('preparationNotes')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('preparationNotes')}
                  errorMessage={registerSessionForm.getFieldError('preparationNotes')}
                  onEnter={() => document.getElementById('goals-field')?.focus()}
                />
                
                <InputField
                  label="Objetivos do Dia"
                  icon="🎪"
                  type="text"
                  value={registerSessionForm.formData.dailyGoals}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('dailyGoals', value);
                    registerSessionForm.touchField('dailyGoals');
                  }}
                  placeholder="Quais eram seus objetivos?"
                  tabIndex={15}
                  hasError={registerSessionForm.hasFieldError('dailyGoals')}
                  isValid={registerSessionForm.isFieldValid('dailyGoals')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('dailyGoals')}
                  errorMessage={registerSessionForm.getFieldError('dailyGoals')}
                  onEnter={() => document.getElementById('notes-field')?.focus()}
                />
                
                <TextareaField
                  label="Notas Finais"
                  icon="💭"
                  value={registerSessionForm.formData.finalNotes}
                  onChange={(value) => {
                    registerSessionForm.handleFieldChange('finalNotes', value);
                    registerSessionForm.touchField('finalNotes');
                  }}
                  placeholder="Reflexões sobre a sessão, aprendizados, etc."
                  rows={3}
                  tabIndex={16}
                  maxLength={500}
                  hasError={registerSessionForm.hasFieldError('finalNotes')}
                  isValid={registerSessionForm.isFieldValid('finalNotes')}
                  isTouched={registerSessionForm.validationState.touchedFields.has('finalNotes')}
                  errorMessage={registerSessionForm.getFieldError('finalNotes')}
                  onEnter={() => document.getElementById('objective-checkbox')?.focus()}
                />
                
                <div className="field-group">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="objective-completed"
                      checked={registerSessionForm.formData.objectiveCompleted}
                      onChange={(e) => {
                        registerSessionForm.handleFieldChange('objectiveCompleted', e.target.checked);
                        registerSessionForm.touchField('objectiveCompleted');
                      }}
                      className="w-4 h-4 text-[#16a249] bg-gray-700 border-gray-600 rounded focus:ring-[#16a249] focus:ring-2"
                      tabIndex={17}
                    />
                    <Label htmlFor="objective-completed" className="text-gray-300 font-medium flex items-center gap-2 cursor-pointer">
                      <span className="text-sm">✅</span>
                      Objetivo do dia foi cumprido
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer com botões */}
          <div className="register-footer flex justify-between items-center pt-6 border-t border-gray-700">
            <Button
              variant="outline"
              onClick={() => registerSessionForm.resetMentalValues()}
              className="border-yellow-600 hover:bg-yellow-700/20 text-yellow-400 px-4 py-2 font-medium"
            >
              Resetar Valores Mentais
            </Button>
            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => setShowRegisterDialog(false)}
                className="border-gray-600 hover:bg-gray-700 text-white px-6"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => registerSessionForm.handleSubmit(handleRegisterSession)}
                disabled={registerSessionForm.isSubmitting || !registerSessionForm.isValid}
                className={`px-6 font-medium transition-all duration-200 ${
                  registerSessionForm.isValid 
                    ? 'bg-[#16a249] hover:bg-[#128a3e] text-white' 
                    : 'bg-gray-600 cursor-not-allowed text-gray-300'
                }`}
              >
                {registerSessionForm.isSubmitting ? "Registrando..." : "Registrar Sessão"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Session Conflict Dialog - GRINDFY STYLE */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="grindfy-conflict-modal max-w-md bg-gray-900 border-gray-700">
          <DialogHeader className="space-y-4 pb-4">
            <DialogTitle className="text-white text-lg font-semibold flex items-center gap-2">
              <span className="text-red-400">🎯</span>
              Sessão em Andamento
            </DialogTitle>
            <DialogDescription className="text-gray-300 text-sm leading-relaxed">
              Você já tem uma sessão ativa para hoje. Escolha como deseja continuar:
            </DialogDescription>
          </DialogHeader>

          {conflictingSession && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-500/20 p-2 rounded-full">
                  <span className="text-red-400 text-base">📅</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">
                    Sessão de Hoje
                  </p>
                  <p className="text-gray-400 text-xs">
                    Iniciada às {new Date(conflictingSession.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {/* Ação Principal */}
            <Button
              onClick={handleConflictEditSession}
              className="w-full bg-[#16a249] hover:bg-[#128a3e] text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-[#16a249]/25"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-base">🎮</span>
                <span>Ir para Sessão Existente</span>
              </div>
            </Button>

            {/* Ação Secundária */}
            <Button
              onClick={handleConflictCreateNew}
              variant="outline"
              className="w-full bg-[#c25555] hover:bg-[#a84848] border-[#c25555] text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-base">➕</span>
                <span>Criar Nova Sessão e Substituir</span>
              </div>
            </Button>

            {/* Ação de Cancelar */}
            <Button
              onClick={handleConflictCancel}
              variant="ghost"
              className="w-full text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 font-normal py-2 px-4 rounded-lg transition-all duration-200 text-sm"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm">❌</span>
                <span>Cancelar</span>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Smart Placeholders - ETAPA 4
const SmartPlaceholders = {
  preparationNotes: () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Como está se sentindo esta manhã? Energia, foco, motivação...";
    }
    if (hour < 18) {
      return "Estado mental atual? Energia da tarde, concentração...";
    }
    return "Como terminou o dia? Energia restante, foco para a sessão...";
  },
  
  dailyGoals: () => {
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 1) { // Segunda
      return "Ex: Começar a semana forte, foco total, sem tilt...";
    }
    if (dayOfWeek === 5) { // Sexta
      return "Ex: Finalizar a semana bem, manter disciplina...";
    }
    if (dayOfWeek === 0 || dayOfWeek === 6) { // Fim de semana
      return "Ex: Aproveitar o fim de semana, jogar relaxado mas focado...";
    }
    return "Ex: Manter consistência, foco nos fundamentos...";
  }
};

// Components para o modal épico
const PreparationIndicator = ({ percentage }: { percentage: number }) => {
  const getIndicatorData = () => {
    if (percentage >= 80) {
      return {
        emoji: "🔥",
        text: "Altamente preparado",
        color: "text-green-400",
        bgColor: "bg-green-400/10"
      };
    }
    if (percentage >= 50) {
      return {
        emoji: "⚡",
        text: "Bem preparado",
        color: "text-yellow-400",
        bgColor: "bg-yellow-400/10"
      };
    }
    return {
      emoji: "⚠️",
      text: "Preparação baixa",
      color: "text-orange-400",
      bgColor: "bg-orange-400/10"
    };
  };

  const indicator = getIndicatorData();

  return (
    <div className={`preparation-indicator ${indicator.bgColor} ${indicator.color}`}>
      <span className="prep-emoji text-xl">{indicator.emoji}</span>
      <span className="prep-text text-sm font-medium">{indicator.text}</span>
    </div>
  );
};

const EnhancedPreparationSlider = ({ 
  value, 
  onChange 
}: { 
  value: number[]; 
  onChange: (value: number[]) => void; 
}) => {
  const markers = [
    { value: 25, label: "25%" },
    { value: 50, label: "50%" },
    { value: 75, label: "75%" },
    { value: 100, label: "100%" }
  ];

  return (
    <div className="enhanced-slider-container">
      <div className="slider-header">
        <label className="field-label text-gray-300">Preparação (%)</label>
        <PreparationIndicator percentage={value[0]} />
      </div>
      
      <div className="slider-wrapper">
        <Slider
          value={value}
          onValueChange={onChange}
          max={100}
          min={0}
          step={5}
          className="prep-slider enhanced"
        />
        
        <div className="slider-markers">
          {markers.map((marker) => (
            <div 
              key={marker.value}
              className="marker"
              style={{ left: `${marker.value}%` }}
            >
              <div className="marker-dot"></div>
              <span className="marker-label">{marker.label}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="slider-value">
        <span className="text-2xl font-bold text-green-400">{value[0]}%</span>
      </div>
    </div>
  );
};

const LoadingButton = ({ 
  isLoading, 
  onClick, 
  children 
}: { 
  isLoading: boolean; 
  onClick: () => void; 
  children: React.ReactNode; 
}) => {
  return (
    <Button
      onClick={onClick}
      disabled={isLoading}
      className="loading-button"
    >
      {isLoading ? (
        <div className="loading-content">
          <div className="spinner"></div>
          <span>Iniciando...</span>
        </div>
      ) : (
        children
      )}
    </Button>
  );
};

// Epic Start Session Modal Component
interface EpicStartSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preparationPercentage: number[];
  setPreparationPercentage: (value: number[]) => void;
  preparationNotes: string;
  setPreparationNotes: (value: string) => void;
  dailyGoals: string;
  setDailyGoals: (value: string) => void;
  screenCap: number;
  setScreenCap: (value: number) => void;
  isLoading: boolean;
  plannedTournaments: any[];
  isLoadingPlannedTournaments: boolean;
}

const EpicStartSessionModal: React.FC<EpicStartSessionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preparationPercentage,
  setPreparationPercentage,
  preparationNotes,
  setPreparationNotes,
  dailyGoals,
  setDailyGoals,
  screenCap,
  setScreenCap,
  isLoading,
  plannedTournaments,
  isLoadingPlannedTournaments
}) => {
  // Hook para background dinâmico baseado na preparação
  useEffect(() => {
    const overlay = document.querySelector('.epic-start-modal');
    
    if (preparationPercentage[0] >= 80) {
      overlay?.classList.add('high-energy');
      overlay?.classList.remove('medium-energy');
    } else if (preparationPercentage[0] >= 60) {
      overlay?.classList.add('medium-energy');
      overlay?.classList.remove('high-energy');
    } else {
      overlay?.classList.remove('high-energy', 'medium-energy');
    }
  }, [preparationPercentage]);

  // Título dinâmico baseado no horário
  const getTimeBasedContent = () => {
    const hour = new Date().getHours();
    
    if (hour >= 6 && hour < 12) {
      return {
        title: "Bom Dia, Grinder!",
        subtitle: "Vamos começar o dia dominando as mesas",
        motivation: "O early bird pega os peixes! 🌅",
        icon: "🌅"
      };
    } else if (hour >= 12 && hour < 18) {
      return {
        title: "Hora do Show!",
        subtitle: "As mesas estão aquecidas e prontas",
        motivation: "Prime time para maximizar o grind! 🔥",
        icon: "🔥"
      };
    } else {
      return {
        title: "Grind Noturno!",
        subtitle: "A noite é nossa, vamos conquistar",
        motivation: "Night owl mode ativado! 🦉",
        icon: "🦉"
      };
    }
  };

  const timeContent = getTimeBasedContent();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="epic-start-modal">
        <DialogTitle className="sr-only">Iniciar Nova Sessão</DialogTitle>
        <DialogDescription className="sr-only">
          Prepare-se para sua sessão de grind com notas e objetivos
        </DialogDescription>
        
        {/* Header épico */}
        <div className="epic-header">
          <DialogClose className="close-btn">✕</DialogClose>
          <div className="header-icon animate-card-shuffle">{timeContent.icon}</div>
          <h2 className="modal-title gradient-text">{timeContent.title}</h2>
          <p className="modal-subtitle">{timeContent.subtitle}</p>
          <p className="motivation-text">{timeContent.motivation}</p>
        </div>

        {/* Body */}
        <div className="modal-body space-y-6">
          <EnhancedPreparationSlider
            value={preparationPercentage}
            onChange={setPreparationPercentage}
          />
          
          <div className="input-field">
            <label className="field-label">📝 Notas de Preparação</label>
            <Textarea
              value={preparationNotes}
              onChange={(e) => setPreparationNotes(e.target.value)}
              placeholder={SmartPlaceholders.preparationNotes()}
              maxLength={300}
              className="field-textarea bg-gray-800 border-gray-600 text-white"
              rows={3}
            />
          </div>
          
          <div className="input-field">
            <label className="field-label">🎯 Objetivos do Dia</label>
            <Input
              value={dailyGoals}
              onChange={(e) => setDailyGoals(e.target.value)}
              placeholder={SmartPlaceholders.dailyGoals()}
              className="field-input bg-gray-800 border-gray-600 text-white"
            />
          </div>

          {/* 🎯 ETAPA 5: Seção de Torneios Planejados */}
          <div className="input-field">
            <label className="field-label">🗓️ Torneios Planejados Hoje</label>
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 max-h-32 overflow-y-auto">
              {isLoadingPlannedTournaments ? (
                <div className="text-center text-gray-400 py-2">
                  <div className="animate-spin w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  Carregando torneios...
                </div>
              ) : plannedTournaments.length > 0 ? (
                <div className="space-y-2">
                  {plannedTournaments.map((tournament, index) => (
                    <div key={index} className="flex items-center justify-between text-sm bg-gray-700 p-2 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-white font-medium">{tournament.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-gray-300">
                        <span className="text-green-400">${tournament.buyIn}</span>
                        {tournament.time && (
                          <span className="text-blue-400">{tournament.time}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-2">
                  <Calendar className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p>Nenhum torneio planejado para hoje</p>
                  <p className="text-xs mt-1">Você pode adicionar torneios no Grade Planner</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="input-field">
            <label className="field-label">🖥️ Cap de Telas</label>
            <div className="flex items-center space-x-4">
              <Input
                type="number"
                min="1"
                max="50"
                value={screenCap}
                onChange={(e) => setScreenCap(Number(e.target.value))}
                className="field-input bg-gray-800 border-gray-600 text-white w-20"
                placeholder="10"
              />
              <span className="text-white">telas simultâneas</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Quantas telas você pretende jogar simultaneamente (1-50)
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-600 hover:bg-gray-700 text-white"
          >
            Cancelar
          </Button>
          
          <LoadingButton
            isLoading={isLoading}
            onClick={onSuccess}
          >
            <span className="flex items-center gap-2">
              <span>⚡</span>
              Iniciar Sessão
            </span>
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
};