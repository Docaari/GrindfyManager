import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";
import { Play, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import GrindSessionLive from "./GrindSessionLive";
import FilterDropdown from "@/components/FilterDropdown";
import { FilterState } from "@/components/FilterPopupSimple";
import { useRegisterSessionForm } from "@/hooks/useRegisterSessionForm";

// Sub-components
import { SessionHistoryData, DashboardMetrics } from "@/components/grind-session/types";
import { applyFiltersToSessions, createSessionValidator } from "@/components/grind-session/helpers";
import { useSessionEdit, useVisualFeedback, useAutoSave, useDebouncedValidation } from "@/components/grind-session/useSessionEdit";
import DashboardMetricsCards from "@/components/grind-session/DashboardMetricsCards";
import SessionHistoryList from "@/components/grind-session/SessionHistoryList";
import EditSessionDialog from "@/components/grind-session/EditSessionDialog";
import DeleteSessionDialog from "@/components/grind-session/DeleteSessionDialog";
import RegisterSessionDialog from "@/components/grind-session/RegisterSessionDialog";
import SessionDetailsDialog from "@/components/grind-session/SessionDetailsDialog";
import ConflictDialog from "@/components/grind-session/ConflictDialog";
import EpicStartSessionModal from "@/components/grind-session/EpicStartSessionModal";

export default function GrindSession() {
  const hasPermission = usePermission('grind_session_access');

  if (!hasPermission) {
    return <AccessDenied featureName="Sessão de Grind" description="Acesse o módulo de sessões de grind para acompanhar suas sessões em tempo real." currentPlan="free" requiredPlan="premium" pageName="Grind" onViewPlans={() => window.location.href = '/subscriptions'} />;
  }

  const [, setLocation] = useLocation();
  const [showStartDialog, setShowStartDialog] = useState(false);

  // Filter state
  const [filterState, setFilterState] = useState<FilterState>({
    period: "30d",
    customStartDate: "",
    customEndDate: "",
    abiRange: [0, 500],
    preparationRange: [0, 10],
    interferenceRange: [0, 10],
    energyRange: [0, 10],
    confidenceRange: [0, 10],
    emotionalRange: [0, 10],
    focusRange: [0, 10],
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

  // Session details modal states
  const [showSessionDetailsModal, setShowSessionDetailsModal] = useState(false);
  const [selectedSessionForDetails, setSelectedSessionForDetails] = useState<SessionHistoryData | null>(null);

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

  // Toggle states for new design
  const [showTournamentToggle, setShowTournamentToggle] = useState(false);
  const [showMentalToggle, setShowMentalToggle] = useState(false);

  // Ensure all modals are closed on component mount to prevent stuck overlay
  useEffect(() => {
    setShowStartDialog(false);
    setShowConflictDialog(false);
    setIsEditDialogOpen(false);
    setIsDeleteDialogOpen(false);
    setShowRegisterDialog(false);
  }, []);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleViewSessionDetails = (session: SessionHistoryData) => {
    try {
      setSelectedSessionForDetails(session);
      setShowSessionDetailsModal(true);
    } catch (error) {
      toast({
        title: "Erro ao carregar detalhes",
        description: "Não foi possível abrir os detalhes da sessão.",
        variant: "destructive",
      });
    }
  };

  // Check for active session
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/grind-sessions");
      return Array.isArray(response) ? response : [];
    },
    refetchInterval: 5000,
    staleTime: 1000,
    refetchOnWindowFocus: true,
  });

  const activeSession = activeSessions.find((session: any) => session.status === "active");

  // Query for planned tournaments from Grade Planner
  const { data: plannedTournaments = [], isLoading: isLoadingPlannedTournaments } = useQuery({
    queryKey: ["/api/planned-tournaments", { dayOfWeek: new Date().getDay() || 7 }],
    queryFn: async () => {
      const currentDayOfWeek = new Date().getDay() || 7;
      const response = await apiRequest("GET", `/api/planned-tournaments?dayOfWeek=${currentDayOfWeek}`);
      return Array.isArray(response) ? response : [];
    },
    enabled: showStartDialog,
  });

  // Fetch session history
  const { data: sessionHistory = [], isLoading: historyLoading, isError: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ["/api/grind-sessions/history"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/grind-sessions/history");
      return Array.isArray(response) ? response : [];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch session tournaments for the currently viewed session only
  const { data: allSessionTournaments = [], isLoading: sessionTournamentsLoading } = useQuery({
    queryKey: ["/api/session-tournaments", selectedSessionForDetails?.id],
    queryFn: async () => {
      if (!selectedSessionForDetails?.id) return [];
      try {
        const response = await apiRequest("GET", `/api/grind-sessions/${selectedSessionForDetails.id}/tournaments`);
        return Array.isArray(response) ? response : [];
      } catch (error) {
        return [];
      }
    },
    enabled: !!selectedSessionForDetails?.id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Filter sessions based on current filters
  const filteredSessions = applyFiltersToSessions(sessionHistory, filterState);

  // Hook to fetch completed tournaments from all sessions
  const { data: allCompletedTournaments = [], isLoading: completedTournamentsLoading } = useQuery({
    queryKey: ["/api/completed-tournaments", filteredSessions.map(s => s.id)],
    queryFn: async () => {
      const allTournaments: any[] = [];
      for (const session of filteredSessions) {
        try {
          const sessionTournaments = await apiRequest("GET", `/api/grind-sessions/${session.id}/tournaments`);
          if (Array.isArray(sessionTournaments)) {
            allTournaments.push(...sessionTournaments);
          }
        } catch (error) {
        }
      }
      return allTournaments;
    },
    enabled: filteredSessions.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Calculate dashboard metrics
  const dashboardMetrics = useMemo((): DashboardMetrics => {
    const totalVolume = filteredSessions.reduce((sum, session) => sum + session.volume, 0);

    const vanillaCount = allCompletedTournaments.filter(t => t.type === 'Vanilla').length;
    const pkoCount = allCompletedTournaments.filter(t => t.type === 'PKO').length;
    const mysteryCount = allCompletedTournaments.filter(t => t.type === 'Mystery').length;
    const normalCount = allCompletedTournaments.filter(t => t.speed === 'Normal').length;
    const turboCount = allCompletedTournaments.filter(t => t.speed === 'Turbo').length;
    const hyperCount = allCompletedTournaments.filter(t => t.speed === 'Hyper').length;
    const totalCompletedTournaments = allCompletedTournaments.length;

    let totalReentradas = 0;
    let avgParticipants = 0;
    let itmPercentage = 0;
    let maiorResultado = 0;

    if (filteredSessions && filteredSessions.length > 0) {
      let totalVol = 0;
      let totalProfit = 0;

      filteredSessions.forEach(session => {
        totalVol += session.volume || 0;
        totalProfit += parseFloat(String(session.profit) || '0');
      });

      if (totalVol > 0) {
        avgParticipants = 728.33;
      }

      totalReentradas = filteredSessions.reduce((sum, session) => {
        return sum + (session.cravadas || 0);
      }, 0);

      const totalItmTournaments = filteredSessions.reduce((sum, session) => {
        return sum + (session.fts || 0);
      }, 0);

      if (totalVol > 0) {
        itmPercentage = (totalItmTournaments / totalVol) * 100;
      }

      maiorResultado = filteredSessions.reduce((max, session) => {
        const sessionProfit = parseFloat(String(session.profit) || '0');
        return Math.max(max, sessionProfit);
      }, 0);
    }

    return {
      totalSessions: filteredSessions.length,
      totalVolume,
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
      vanillaCount,
      pkoCount,
      mysteryCount,
      vanillaPercentage: totalCompletedTournaments > 0 ? (vanillaCount / totalCompletedTournaments) * 100 : 0,
      pkoPercentage: totalCompletedTournaments > 0 ? (pkoCount / totalCompletedTournaments) * 100 : 0,
      mysteryPercentage: totalCompletedTournaments > 0 ? (mysteryCount / totalCompletedTournaments) * 100 : 0,
      normalCount,
      turboCount,
      hyperCount,
      normalPercentage: totalCompletedTournaments > 0 ? (normalCount / totalCompletedTournaments) * 100 : 0,
      turboPercentage: totalCompletedTournaments > 0 ? (turboCount / totalCompletedTournaments) * 100 : 0,
      hyperPercentage: totalCompletedTournaments > 0 ? (hyperCount / totalCompletedTournaments) * 100 : 0,
      totalReentradas,
      avgParticipants,
      itmPercentage,
      maiorResultado
    };
  }, [filteredSessions, allCompletedTournaments]);

  // Mental circles animation
  useEffect(() => {
    const animateMentalCircles = () => {
      const circles = document.querySelectorAll('.mental-circle');
      circles.forEach((circle, index) => {
        const element = circle as HTMLElement;
        const value = parseFloat(element.dataset.value || '0');
        const isPreparation = element.classList.contains('mental-prep');
        const maxValue = isPreparation ? 100 : 10;

        element.style.transform = 'scale(0)';
        element.style.opacity = '0';

        setTimeout(() => {
          element.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
          element.style.transform = 'scale(1)';
          element.style.opacity = '1';

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

    const timer = setTimeout(animateMentalCircles, 100);
    return () => clearTimeout(timer);
  }, [dashboardMetrics.avgPreparationPercentage, dashboardMetrics.avgEnergia, dashboardMetrics.avgFoco, dashboardMetrics.avgConfianca, dashboardMetrics.avgInteligenciaEmocional, dashboardMetrics.avgInterferencias]);

  // Start session mutation
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

  const checkExistingSessionBeforePreparation = () => {
    const today = new Date().toISOString().split('T')[0];
    const existingSession = sessionHistory.find((session: SessionHistoryData) => {
      const sessionDate = new Date(session.date).toISOString().split('T')[0];
      return sessionDate === today;
    });

    if (existingSession) {
      setConflictingSession(existingSession);
      setShowConflictDialog(true);
    } else {
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
  }, [sessionHistory]);

  const loadWarmUpData = () => {
    const warmUpScore = localStorage.getItem('warmUpScore');
    const warmUpData = localStorage.getItem('warmUpData');

    if (warmUpScore && warmUpData) {
      const parsedWarmUpData = JSON.parse(warmUpData);
      setPreparationPercentage([parseInt(warmUpScore)]);
      setPreparationNotes(parsedWarmUpData.observations || '');
      localStorage.removeItem('warmUpScore');
      localStorage.removeItem('warmUpData');
    }
  };

  // Conflict dialog handlers
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
    localStorage.removeItem('warmUpScore');
    localStorage.removeItem('warmUpData');
    localStorage.removeItem('warmUpIntegration');
  };

  const handleStartSession = () => {
    const today = new Date();
    const currentDayOfWeek = today.getDay();

    const sessionData = {
      date: today.toISOString(),
      status: "active",
      preparationNotes: preparationNotes || "",
      preparationPercentage: preparationPercentage[0],
      dailyGoals: dailyGoals || "",
      screenCap: screenCap,
      skipBreaksToday: false,
      resetTournaments: true,
      replaceExisting: true,
      dayOfWeek: currentDayOfWeek,
      loadFromGradePlanner: true,
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
      registerSessionForm.resetForm();
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

    const { isValid, errors } = createSessionValidator().validate(editData);

    if (!isValid) {
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

    setIsSaving(true);
    setShowSuccess(false);

    editSessionMutation.mutate({
      id: editingSession.id,
      sessionData: {
        volume: editData.volume,
        profit: String(editData.profit || 0),
        abiMed: String(editData.abiMed || 0),
        roi: String(editData.roi || 0),
        fts: editData.fts,
        cravadas: editData.cravadas,
        energiaMedia: String(editData.energiaMedia || 5),
        focoMedio: String(editData.focoMedio || 5),
        confiancaMedia: String(editData.confiancaMedia || 5),
        inteligenciaEmocionalMedia: String(editData.inteligenciaEmocionalMedia || 5),
        interferenciasMedia: String(editData.interferenciasMedia || 5),
        preparationNotes: editData.preparationNotes,
        dailyGoals: editData.dailyGoals,
        finalNotes: editData.finalNotes,
        objectiveCompleted: editData.objectiveCompleted,
      }
    }, {
      onSuccess: () => {
        clearAutoSave();
        setIsSaving(false);
        setShowSuccess(true);
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

  // Edit session hooks
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

  const {
    lastSaved,
    hasUnsavedChanges,
    clearAutoSave,
    recoverAutoSave
  } = useAutoSave(editData, editingSession?.id || '');

  const debouncedErrors = useDebouncedValidation(editData);

  // Save state controls
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Recover auto-save on edit dialog open
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
            <h1 className="grind-page-title mb-2">Grind</h1>
            <p className="grind-body-text">Gerencie suas sessões de grind e acompanhe seu histórico</p>
          </div>

          <div className="flex gap-3">
            {activeSession && (
              <Button
                onClick={() => setLocation("/grind-live")}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8 py-3 shadow-lg"
              >
                <Play className="w-5 h-5 mr-2" />
                Continuar Sessão Ativa
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setShowRegisterDialog(true)}
              className="bg-blue-800 border-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              Registrar Sessão
            </Button>

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

      {/* FilterDropdown */}
      <FilterDropdown
        onApplyFilters={setFilterState}
        initialFilters={filterState}
      />

      {/* Dashboard Metrics */}
      <DashboardMetricsCards
        dashboardMetrics={dashboardMetrics}
        showTournamentToggle={showTournamentToggle}
        setShowTournamentToggle={setShowTournamentToggle}
        showMentalToggle={showMentalToggle}
        setShowMentalToggle={setShowMentalToggle}
      />

      {/* Session History */}
      <SessionHistoryList
        filteredSessions={filteredSessions}
        historyLoading={historyLoading}
        historyError={historyError}
        refetchHistory={refetchHistory}
        filterState={filterState}
        setFilterState={setFilterState}
        activeSession={activeSession}
        checkExistingSessionBeforePreparation={checkExistingSessionBeforePreparation}
        onEditSession={handleEditSession}
        onDeleteSession={handleDeleteSession}
        onViewSessionDetails={handleViewSessionDetails}
      />

      {/* Edit Session Dialog */}
      <EditSessionDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        editingSession={editingSession}
        editData={editData}
        updateField={updateField}
        showFieldSaved={showFieldSaved}
        setFieldError={setFieldError}
        getFieldClassName={getFieldClassName}
        getSliderClassName={getSliderClassName}
        savedField={savedField}
        fieldErrors={fieldErrors}
        hasUnsavedChanges={hasUnsavedChanges}
        lastSaved={lastSaved}
        isSaving={isSaving}
        showSuccess={showSuccess}
        onSave={handleSaveEdit}
      />

      {/* Delete Session Dialog */}
      <DeleteSessionDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        sessionToDelete={sessionToDelete}
        onConfirmDelete={handleConfirmDelete}
        isDeleting={deleteSessionMutation.isPending}
      />

      {/* Register Past Session Dialog */}
      <RegisterSessionDialog
        isOpen={showRegisterDialog}
        onOpenChange={setShowRegisterDialog}
        registerSessionForm={registerSessionForm}
        onRegisterSession={handleRegisterSession}
      />

      {/* Session Details Dialog */}
      <SessionDetailsDialog
        isOpen={showSessionDetailsModal}
        onOpenChange={setShowSessionDetailsModal}
        selectedSession={selectedSessionForDetails}
        tournaments={allSessionTournaments}
        isLoading={sessionTournamentsLoading}
      />

      {/* Session Conflict Dialog */}
      <ConflictDialog
        isOpen={showConflictDialog}
        onOpenChange={setShowConflictDialog}
        conflictingSession={conflictingSession}
        onEditSession={handleConflictEditSession}
        onCreateNew={handleConflictCreateNew}
        onCancel={handleConflictCancel}
      />
    </div>
  );
}
