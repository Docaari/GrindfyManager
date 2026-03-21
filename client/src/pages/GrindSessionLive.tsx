import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, Plus, Clock, Target, Coffee, ChevronDown, ChevronUp, Trophy, AlertTriangle, RefreshCw, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BreakFeedbackPopup } from "@/components/BreakFeedbackPopup";
import SupremaImportModal from "@/components/SupremaImportModal";
import EpicStartSessionModal from "@/components/grind-session/EpicStartSessionModal";
import { Download } from "lucide-react";

// Sub-components
import SessionHeader from "@/components/grind-session-live/SessionHeader";
import SessionDashboard from "@/components/grind-session-live/SessionDashboard";
import AddTournamentDialog from "@/components/grind-session-live/AddTournamentDialog";
import TournamentCard from "@/components/grind-session-live/TournamentCard";
import SessionSummaryModal from "@/components/grind-session-live/SessionSummaryModal";
import EditTournamentDialog from "@/components/grind-session-live/EditTournamentDialog";
import TimeEditDialog from "@/components/grind-session-live/TimeEditDialog";

// Types, helpers, and stats
import type { GrindSession, NewTournamentForm, RegistrationData, QuickNote } from "@/components/grind-session-live/types";
import {
  normalizeDecimalInput, generateTournamentName, parseTime,
  organizeTournaments, organizeTournamentsByBreaks, combineTournaments,
  getSiteColor,
} from "@/components/grind-session-live/helpers";
import { calculateSessionStats, calculateFinalSessionStats, calculateBreakAverages, calculateTournamentPercentages } from "@/components/grind-session-live/calculateSessionStats";

export default function GrindSessionLive() {
  const [, setLocation] = useLocation();
  const [activeSession, setActiveSession] = useState<GrindSession | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [showAddTournamentDialog, setShowAddTournamentDialog] = useState(false);
  const [showSupremaModal, setShowSupremaModal] = useState(false);

  // RF-01: Session recovery banner
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);

  // RF-08: Tournament search
  const [tournamentSearch, setTournamentSearch] = useState("");

  // RF-09: Pause session
  const [isPaused, setIsPaused] = useState(false);
  const [pausedTime, setPausedTime] = useState(0); // total ms paused
  const [pauseStartTime, setPauseStartTime] = useState<number | null>(null);

  const [sessionObjectiveCompleted, setSessionObjectiveCompleted] = useState(false);
  const [sessionFinalNotes, setSessionFinalNotes] = useState("");
  const [showCompletedTournaments, setShowCompletedTournaments] = useState(false);
  const [preparationPercentage, setPreparationPercentage] = useState<number[]>([50]);
  const [preparationObservations, setPreparationObservations] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");
  const [screenCap, setScreenCap] = useState<number>(10);
  const [skipBreaksToday, setSkipBreaksToday] = useState(false);

  // Inline result fields
  const [registrationData, setRegistrationData] = useState<RegistrationData>({});

  // Quick notes
  const [showQuickNotesDialog, setShowQuickNotesDialog] = useState(false);
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [quickNoteText, setQuickNoteText] = useState('');

  // Max late toggle
  const [maxLateStates, setMaxLateStates] = useState<{[key: string]: boolean}>({});

  // Session finalization
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionSummaryData, setSessionSummaryData] = useState<any>(null);
  const [finalNotes, setFinalNotes] = useState('');
  const [pendingTournaments, setPendingTournaments] = useState<any[]>([]);

  // Tournament states and dialogs
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [showPendingTournamentsDialog, setShowPendingTournamentsDialog] = useState(false);
  const [newTournament, setNewTournament] = useState<NewTournamentForm>({
    site: "", name: "", buyIn: "", type: "Vanilla", speed: "Normal",
    scheduledTime: "", fieldSize: "", rebuys: 0, result: "0", position: null, status: "upcoming"
  });

  const [showBreakManagementDialog, setShowBreakManagementDialog] = useState(false);
  const [sessionElapsedTime, setSessionElapsedTime] = useState("");
  const [showEditTournamentDialog, setShowEditTournamentDialog] = useState(false);
  const [editingPriority, setEditingPriority] = useState<string | null>(null);
  const [editingTimeDialog, setEditingTimeDialog] = useState<{[key: string]: boolean}>({});
  const [timeEditValue, setTimeEditValue] = useState<{[key: string]: string}>({});

  const [showDashboard, setShowDashboard] = useState(() => {
    const saved = localStorage.getItem('grindSessionDashboardVisible');
    return saved ? JSON.parse(saved) : true;
  });
  const [syncWithGrade, setSyncWithGrade] = useState(true);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ===== INLINE RESULT HANDLERS =====
  const handleFinishTournamentDirect = (tournamentId: string) => {
    const entryData = registrationData[tournamentId];
    const hasBounty = entryData?.bounty && entryData.bounty.trim() !== '';
    const hasPrize = entryData?.prize && entryData.prize.trim() !== '';
    const hasPosition = entryData?.position && entryData.position.trim() !== '';

    let updateData: any = { status: 'finished', endTime: new Date().toISOString() };

    if (hasBounty || hasPrize || hasPosition) {
      updateData.bounty = normalizeDecimalInput(entryData?.bounty || '0');
      updateData.result = normalizeDecimalInput(entryData?.prize || '0');
      updateData.position = hasPosition ? parseInt(entryData.position) : null;
      updateTournamentMutation.mutate({ id: tournamentId, data: updateData });
      setRegistrationData(prev => { const updated = { ...prev }; delete updated[tournamentId]; return updated; });
      const totalResult = parseFloat(updateData.result) + parseFloat(updateData.bounty);
      toast({ title: "Torneio Finalizado", description: `Resultado salvo: $${totalResult.toFixed(2)}` });
    } else {
      updateData.result = '0'; updateData.bounty = '0'; updateData.position = null;
      updateTournamentMutation.mutate({ id: tournamentId, data: updateData });
      toast({ title: "Torneio Finalizado", description: "Torneio marcado como GG!" });
    }
  };

  // ===== SESSION FINALIZATION (RF-02: Simplified - max 2 clicks) =====
  const handleSessionFinalization = () => {
    setShowConfirmationModal(true);
  };

  const generateSessionSummary = async () => {
    try {
      const summaryData = {
        volume: stats.registros,
        invested: stats.totalInvestido,
        profit: stats.profit,
        roi: stats.roi,
        fts: stats.fts,
        wins: stats.cravadas,
        bestResult: null,
        mentalAverages: {
          focus: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.foco, 0) / breakFeedbacks.length : 0,
          energy: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.energia, 0) / breakFeedbacks.length : 0,
          confidence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.confianca, 0) / breakFeedbacks.length : 0,
          emotionalIntelligence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.inteligenciaEmocional, 0) / breakFeedbacks.length : 0,
          interference: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.interferencias, 0) / breakFeedbacks.length : 0,
        },
        objectiveStatus: stats.profit > 0 ? 'completed' : (stats.profit > -stats.totalInvestido * 0.5 ? 'partial' : 'missed'),
        sessionTime: sessionElapsedTime,
        objectives: activeSession?.dailyGoals || '',
        quickNotes: quickNotes,
        endTime: new Date().toISOString()
      };
      setSessionSummaryData(summaryData);
      setShowSessionSummary(true);
    } catch (error) {
      toast({ title: "Erro ao Gerar Resumo", description: "Nao foi possivel gerar o resumo da sessao.", variant: "destructive" });
    }
  };

  const handleConfirmEndSession = async () => {
    try {
      // Auto-finish ALL pending tournaments (RF-02)
      const allTournaments = [
        ...(plannedTournaments || []).map(t => ({ ...t, id: `planned-${t.id}` })),
        ...(sessionTournaments || [])
      ];
      const organized = organizeTournaments(allTournaments, plannedTournaments || []);
      const pendingList = organized.registered?.filter(t => t.status === 'registered') || [];

      for (const tournament of pendingList) {
        await updateTournamentMutation.mutateAsync({
          id: tournament.id,
          data: { status: 'finished', endTime: new Date().toISOString(), result: '0', bounty: '0', position: null }
        });
      }
      setShowConfirmationModal(false);
      generateSessionSummary();
    } catch (error) {
      toast({ title: "Erro ao Finalizar Torneios", description: "Nao foi possivel finalizar os torneios pendentes.", variant: "destructive" });
    }
  };

  const handleEndSession = async () => {
    try {
      const sessionData = sessionSummaryData || {
        volume: stats.registros, invested: stats.totalInvestido, profit: stats.profit, roi: stats.roi,
        fts: stats.fts, wins: stats.cravadas,
        mentalAverages: {
          focus: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.foco, 0) / breakFeedbacks.length : 0,
          energy: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.energia, 0) / breakFeedbacks.length : 0,
          confidence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.confianca, 0) / breakFeedbacks.length : 0,
          emotionalIntelligence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.inteligenciaEmocional, 0) / breakFeedbacks.length : 0,
          interference: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.interferencias, 0) / breakFeedbacks.length : 0,
        }
      };

      await apiRequest('PUT', `/api/grind-sessions/${activeSession!.id}`, {
        status: 'completed', endTime: new Date().toISOString(), finalNotes: finalNotes || '',
        objectiveCompleted: sessionData.objectiveStatus === 'completed',
        volume: sessionData.volume, profit: sessionData.profit.toString(),
        abiMed: sessionData.invested > 0 ? (sessionData.invested / sessionData.volume).toString() : '0',
        roi: sessionData.roi.toString(), fts: sessionData.fts, cravadas: sessionData.wins,
        energiaMedia: sessionData.mentalAverages.energy.toString(),
        focoMedio: sessionData.mentalAverages.focus.toString(),
        confiancaMedia: sessionData.mentalAverages.confidence.toString(),
        inteligenciaEmocionalMedia: sessionData.mentalAverages.emotionalIntelligence.toString(),
        interferenciasMedia: sessionData.mentalAverages.interference.toString(),
      });

      setQuickNotes([]);
      setLocation('/grind');
    } catch (error) {
    }
  };

  const handleContinueSession = () => {
    setShowSessionSummary(false); setSessionSummaryData(null); setFinalNotes('');
    setShowConfirmationModal(false); setPendingTournaments([]);
  };

  // RF-02: Close summary and redirect to /grind
  const handleSummaryClose = () => {
    setShowSessionSummary(false);
    setLocation('/grind');
  };

  // ===== EFFECTS =====
  useEffect(() => { localStorage.setItem('grindSessionDashboardVisible', JSON.stringify(showDashboard)); }, [showDashboard]);

  // RF-03: Load quick notes from session data (DB-backed via session update)
  useEffect(() => {
    if (activeSession?.id) {
      // Try to load notes from session's finalNotes field (stored as JSON array)
      try {
        const parsed = activeSession.finalNotes ? JSON.parse(activeSession.finalNotes) : [];
        if (Array.isArray(parsed)) {
          setQuickNotes(parsed);
        }
      } catch {
        // finalNotes is plain text, not JSON - that's OK, just start fresh
      }
    }
  }, [activeSession?.id]);

  // Timer for session elapsed time (RF-09: pause-aware)
  useEffect(() => {
    if (activeSession) {
      const updateElapsedTime = () => {
        if (isPaused) return; // Don't update while paused
        const sessionStart = new Date(activeSession.date);
        const now = new Date();
        const totalPaused = pausedTime + (pauseStartTime ? now.getTime() - pauseStartTime : 0);
        const diffMs = now.getTime() - sessionStart.getTime() - totalPaused;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setSessionElapsedTime(`${hours}h ${minutes}m`);
      };
      updateElapsedTime();
      const interval = setInterval(updateElapsedTime, 60000);
      return () => clearInterval(interval);
    }
  }, [activeSession, isPaused, pausedTime, pauseStartTime]);

  const getSessionTimeInfo = () => {
    if (!activeSession) return { color: 'text-gray-400', bgColor: 'bg-gray-700', message: '' };
    const sessionStart = new Date(activeSession.date);
    const now = new Date();
    const hours = (now.getTime() - sessionStart.getTime()) / (1000 * 60 * 60);

    if (hours < 2) return { color: 'text-green-300', bgColor: 'bg-green-600/20 border-green-500/50', message: '🚀 O dia ta so comecando, pra cima!' };
    if (hours < 4) return { color: 'text-green-400', bgColor: 'bg-green-700/20 border-green-600/50', message: '💪 Se mantenha inabalavel, ainda estamos no comeco!' };
    if (hours < 6) return { color: 'text-yellow-300', bgColor: 'bg-yellow-600/20 border-yellow-500/50', message: '🔄 Reboot mental recomendado!' };
    if (hours < 8) return { color: 'text-red-300', bgColor: 'bg-red-500/20 border-red-400/50', message: '🔥 Aqui separa os homens dos meninos!' };
    return { color: 'text-red-400', bgColor: 'bg-red-600/20 border-red-500/50', message: '⚡ E aqui que muitos regs viram fish! Mantenha o foco!' };
  };

  const currentDayOfWeek = new Date().getDay();

  // ===== QUERIES =====
  const { data: sessions = [], isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => { const response = await apiRequest('GET', "/api/grind-sessions"); return Array.isArray(response) ? response : []; },
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: true, refetchOnMount: true,
  });

  const { data: plannedTournaments = [], refetch: refetchTournaments } = useQuery({
    queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek],
    queryFn: async () => { const response = await apiRequest('GET', `/api/session-tournaments/by-day/${currentDayOfWeek}`); return Array.isArray(response) ? response : []; },
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: true, refetchOnMount: true,
  });

  const { data: sessionTournaments = [], refetch: refetchSessionTournaments } = useQuery({
    queryKey: ["/api/session-tournaments", activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const data = await apiRequest('GET', `/api/session-tournaments?sessionId=${activeSession.id}`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!activeSession?.id, staleTime: 0, gcTime: 0, refetchOnWindowFocus: true, refetchOnMount: true,
  });

  const { data: weeklySuggestions = [] } = useQuery({
    queryKey: ["/api/session-tournaments/weekly-suggestions"],
    queryFn: async () => { const data = await apiRequest('GET', "/api/session-tournaments/weekly-suggestions"); return Array.isArray(data) ? data : []; },
    staleTime: 300000,
  });

  const { data: breakFeedbacks = [] } = useQuery({
    queryKey: [`/api/break-feedbacks`, activeSession?.id],
    queryFn: async () => { if (!activeSession?.id) return []; return await apiRequest("GET", `/api/break-feedbacks?sessionId=${activeSession.id}`); },
    enabled: !!activeSession?.id,
  });

  // ===== SUGGESTION HELPERS =====
  const getFilteredSuggestions = () => {
    const suggestions = Array.isArray(weeklySuggestions) ? weeklySuggestions : [];
    if (suggestions.length === 0) return [];
    let filtered = suggestions.filter(suggestion => {
      if (newTournament.site && newTournament.site !== suggestion.site) return false;
      if (newTournament.type && newTournament.type !== suggestion.type) return false;
      if (newTournament.speed && newTournament.speed !== suggestion.speed) return false;
      if (newTournament.buyIn && newTournament.buyIn !== '') {
        const formBuyIn = parseFloat(newTournament.buyIn);
        const suggestionBuyIn = parseFloat(suggestion.buyIn);
        if (!isNaN(formBuyIn) && !isNaN(suggestionBuyIn) && Math.abs(formBuyIn - suggestionBuyIn) > formBuyIn * 0.2) return false;
      }
      return true;
    });
    filtered.sort((a, b) => b.frequency - a.frequency);
    return filtered.slice(0, 6);
  };

  const resetFilters = () => {
    setNewTournament({ site: "", name: "", buyIn: "", type: "Vanilla", speed: "Normal", scheduledTime: "", fieldSize: "", rebuys: 0, result: "0", position: null, status: "upcoming" });
    toast({ title: "Filtros Limpos", description: "Todos os campos foram resetados" });
  };

  const hasActiveFilters = () => !!(newTournament.site || newTournament.type !== "Vanilla" || newTournament.speed !== "Normal" || newTournament.buyIn);

  const applyQuickFilter = (filterType: string, value: string) => {
    setNewTournament(prev => ({ ...prev, [filterType]: value }));
    toast({ title: "Filtro Aplicado", description: `Filtrado por ${filterType}: ${value}` });
  };

  const getSuggestionStats = () => {
    const suggestions = Array.isArray(weeklySuggestions) ? weeklySuggestions : [];
    return { total: suggestions.length, filtered: getFilteredSuggestions().length, sites: new Set(suggestions.map(s => s.site)).size, types: new Set(suggestions.map(s => s.type)).size };
  };

  const getSimilarityScore = (suggestion: any) => {
    let score = 0;
    if (newTournament.site === suggestion.site) score += 25;
    if (newTournament.type === suggestion.type) score += 25;
    if (newTournament.speed === suggestion.speed) score += 25;
    if (newTournament.buyIn && Math.abs(parseFloat(newTournament.buyIn) - parseFloat(suggestion.buyIn)) <= 5) score += 25;
    return score;
  };

  const applySuggestion = (suggestion: any) => {
    setNewTournament(prev => ({
      ...prev, site: suggestion.site, type: suggestion.type, speed: suggestion.speed,
      buyIn: suggestion.buyIn, fieldSize: suggestion.guaranteed || prev.fieldSize,
      scheduledTime: suggestion.time || prev.scheduledTime, name: ''
    }));
    toast({ title: "Sugestao Aplicada", description: `${suggestion.site} ${suggestion.type} $${suggestion.buyIn} ${suggestion.speed}` });
  };

  // ===== ACTIVE SESSION DETECTION (RF-01: session recovery) =====
  useEffect(() => {
    if (sessions) {
      const found = sessions.find((s: GrindSession) => s.status === "active");
      if (found && !activeSession) {
        // Session recovered from DB
        setActiveSession(found);
        setShowRecoveryBanner(true);
        setTimeout(() => setShowRecoveryBanner(false), 5000);
      } else {
        setActiveSession(found || null);
      }
    }
  }, [sessions]);

  // Break timer
  useEffect(() => {
    if (activeSession && !activeSession.skipBreaksToday) {
      const timer = setInterval(() => {
        const now = new Date();
        if (now.getMinutes() === 54) setShowBreakDialog(true);
      }, 60000);
      return () => clearInterval(timer);
    }
  }, [activeSession]);

  // ===== MUTATIONS =====
  const startSessionMutation = useMutation({
    mutationFn: async (data: { preparationNotes: string; preparationPercentage: number; dailyGoals: string; screenCap: number; skipBreaksToday: boolean }) => {
      return await apiRequest("POST", "/api/grind-sessions", {
        date: new Date().toISOString(), status: "active", ...data,
        resetTournaments: true, replaceExisting: true, dayOfWeek: new Date().getDay(), loadFromGradePlanner: true,
      });
    },
    onSuccess: (session) => {
      setActiveSession(session); setShowStartDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({ title: "Sessao Iniciada", description: "Sua sessao de grind foi iniciada com sucesso!" });
    },
    onError: (error: Error) => { toast({ title: "Erro", description: error.message, variant: "destructive" }); },
  });

  const addTournamentMutation = useMutation({
    mutationFn: async (tournamentData: any) => {
      if (tournamentData.syncWithGrade) {
        const currentDayOfWeek = new Date().getDay();
        let activeProfile = 'A';
        try {
          const profileStatesResponse = await apiRequest('GET', '/api/profile-states');
          const todayProfileState = profileStatesResponse?.find((state: any) => state.dayOfWeek === currentDayOfWeek);
          if (todayProfileState?.activeProfile) activeProfile = todayProfileState.activeProfile;
        } catch {}
        return await apiRequest("POST", "/api/planned-tournaments", {
          site: tournamentData.site, name: tournamentData.name || `${tournamentData.site} ${tournamentData.type || 'Tournament'}`,
          buyIn: String(tournamentData.buyIn), type: tournamentData.type || 'Vanilla', speed: tournamentData.speed || 'Normal',
          time: tournamentData.scheduledTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          guaranteed: tournamentData.guaranteed ? String(tournamentData.guaranteed) : null, prioridade: 2,
          dayOfWeek: currentDayOfWeek, profile: activeProfile
        });
      } else {
        return await apiRequest("POST", "/api/session-tournaments", {
          userId: activeSession?.userId, sessionId: activeSession?.id, site: tournamentData.site,
          name: tournamentData.name || `${tournamentData.site} ${tournamentData.type || 'Tournament'}`,
          buyIn: tournamentData.buyIn, rebuys: 0, result: "0", bounty: "0",
          status: tournamentData.status || "upcoming", fromPlannedTournament: tournamentData.fromPlannedTournament || false,
          plannedTournamentId: tournamentData.plannedTournamentId || null,
          fieldSize: tournamentData.fieldSize ? parseInt(tournamentData.fieldSize) : null, position: null,
          startTime: tournamentData.startTime || null, endTime: null,
          time: tournamentData.scheduledTime || tournamentData.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: tournamentData.type || 'Vanilla', speed: tournamentData.speed || 'Normal',
          guaranteed: tournamentData.guaranteed || null
        });
      }
    },
    onSuccess: (result, variables) => {
      // RF-07: Single invalidateQueries per mutation, no setTimeout cascades
      const currentDayOfWeek = new Date().getDay();
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      if (syncWithGrade) {
        queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      }
      // RF-12: Keep modal open for adding more, show success toast
      setNewTournament({ site: "", name: "", buyIn: "", type: "Vanilla", speed: "Normal", scheduledTime: "", fieldSize: "", rebuys: 0, result: "0", position: null, status: "upcoming" });
      const isRegistration = variables?.status === 'registered' && variables?.fromPlannedTournament;
      toast({
        title: isRegistration ? "Registrado no Torneio" : "Torneio Adicionado",
        description: isRegistration ? `Voce foi registrado em ${variables?.name || 'torneio'}!` : (syncWithGrade ? "Torneio adicionado a sessao e sincronizado com a Grade!" : "Torneio adicionado a sessao com sucesso!"),
      });
    },
    onError: (error: any) => { toast({ title: "Erro no Registro", description: error?.message || "Falha ao registrar torneio.", variant: "destructive" }); },
  });

  const updateTournamentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      let endpoint;
      if (id.startsWith('planned-')) { endpoint = `/api/planned-tournaments/${id.substring(8)}`; }
      else { endpoint = `/api/session-tournaments/${id}`; }
      return await apiRequest("PUT", endpoint, data);
    },
    onSuccess: (result, variables) => {
      // RF-07: Single invalidateQueries, no removeQueries/setTimeout cascades
      const currentDayOfWeek = new Date().getDay();
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      if (activeSession?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments", activeSession.id] });
      }
      const isRegistrationUpdate = variables.data.status === 'registered';
      toast({
        title: isRegistrationUpdate ? "Registrado no Torneio" : "Torneio Atualizado",
        description: isRegistrationUpdate ? "Voce se registrou no torneio com sucesso!" : "Torneio atualizado com sucesso!",
      });
    },
    onError: (error: any) => { toast({ title: "Erro ao Atualizar Torneio", description: error.message ? `Falha ao atualizar torneio: ${error.message}` : "Falha ao atualizar torneio", variant: "destructive" }); },
  });

  const breakFeedbackMutation = useMutation({
    mutationFn: async (feedback: any) => {
      return await apiRequest("POST", "/api/break-feedbacks", { ...feedback, sessionId: activeSession?.id, breakTime: new Date().toISOString() });
    },
    onSuccess: () => {
      setShowBreakDialog(false);
      queryClient.invalidateQueries({ queryKey: [`/api/break-feedbacks`, activeSession?.id] });
      toast({ title: "Feedback Registrado", description: "Seu feedback do break foi registrado!" });
    },
    onError: () => { toast({ title: "Erro ao Salvar Feedback", description: "Nao foi possivel salvar o feedback.", variant: "destructive" }); },
  });

  const finalizePendingTournamentsMutation = useMutation({
    mutationFn: async (pendingTs: any[]) => {
      return Promise.all(pendingTs.map(t => {
        const endpoint = t.id.startsWith('planned-') ? `/api/planned-tournaments/${t.id.substring(8)}` : `/api/session-tournaments/${t.id}`;
        return apiRequest("PUT", endpoint, { status: "completed", result: "0", bounty: "0", endTime: new Date().toISOString(), position: null });
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      toast({ title: "Torneios Finalizados", description: "Torneios pendentes foram marcados como GG!" });
      endSessionMutation.mutate();
    },
    onError: () => { toast({ title: "Erro ao Finalizar Torneios", description: "Nao foi possivel finalizar os torneios pendentes.", variant: "destructive" }); }
  });

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const finalStats = calculateFinalSessionStats(plannedTournaments, sessionTournaments);
      const breakAvgs = calculateBreakAverages(breakFeedbacks);
      return await apiRequest("PUT", `/api/grind-sessions/${activeSession?.id}`, {
        status: "completed", endTime: new Date().toISOString(), objectiveCompleted: sessionObjectiveCompleted, finalNotes: sessionFinalNotes,
        volume: finalStats.volume, profit: finalStats.profit.toString(), abiMed: finalStats.abiMed.toString(), roi: finalStats.roi.toString(),
        fts: finalStats.fts, cravadas: finalStats.cravadas,
        energiaMedia: breakAvgs.energia.toString(), focoMedio: breakAvgs.foco.toString(), confiancaMedia: breakAvgs.confianca.toString(),
        inteligenciaEmocionalMedia: breakAvgs.inteligenciaEmocional.toString(), interferenciasMedia: breakAvgs.interferencias.toString(),
        vanillaPercentage: finalStats.percentages.types.vanilla.toString(), pkoPercentage: finalStats.percentages.types.pko.toString(),
        mysteryPercentage: finalStats.percentages.types.mystery.toString(),
        normalSpeedPercentage: finalStats.percentages.speeds.normal.toString(), turboSpeedPercentage: finalStats.percentages.speeds.turbo.toString(),
        hyperSpeedPercentage: finalStats.percentages.speeds.hyper.toString(),
      });
    },
    onSuccess: () => {
      toast({ title: "Sessao Finalizada!", description: "Sua sessao foi concluida com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      // RF-02: Show summary, redirect on summary close
      setShowSessionSummary(true);
    },
  });

  // ===== QUICK NOTES (RF-03: Persist to DB via session update) =====
  const handleAddQuickNote = async () => {
    if (!quickNoteText.trim() || !activeSession?.id) return;
    const newNote: QuickNote = { id: Date.now().toString(), text: quickNoteText.trim(), timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    const updatedNotes = [...quickNotes, newNote];
    setQuickNotes(updatedNotes);
    // Persist notes to DB as JSON in finalNotes field
    try {
      await apiRequest('PUT', `/api/grind-sessions/${activeSession.id}`, {
        finalNotes: JSON.stringify(updatedNotes)
      });
    } catch {
      // Silent fail - notes are still in local state
    }
    setQuickNoteText(""); setShowQuickNotesDialog(false);
    toast({ title: "Nota Salva!", description: "Sua anotacao foi capturada com sucesso." });
  };

  // ===== TOURNAMENT HANDLERS =====
  const handleStartSession = async () => {
    try { await apiRequest('POST', '/api/grind-sessions/reset-tournaments'); queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] }); queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] }); } catch {}
    setQuickNotes([]);
    startSessionMutation.mutate({ preparationNotes: preparationObservations, preparationPercentage: preparationPercentage[0], dailyGoals, screenCap, skipBreaksToday });
  };

  // RF-09: Pause/Resume handlers
  const handlePauseSession = () => {
    setIsPaused(true);
    setPauseStartTime(Date.now());
  };

  const handleResumeSession = () => {
    if (pauseStartTime) {
      setPausedTime(prev => prev + (Date.now() - pauseStartTime));
    }
    setPauseStartTime(null);
    setIsPaused(false);
  };

  const handleRebuyTournament = (tournament: any) => {
    updateTournamentMutation.mutate({ id: tournament.id, data: { rebuys: (tournament.rebuys || 0) + 1 } });
  };

  const handleUpdatePriority = (tournamentId: string, newPriority: number) => {
    updateTournamentMutation.mutate({ id: tournamentId, data: { prioridade: newPriority } }, {
      onSuccess: () => { setEditingPriority(null); toast({ title: "Prioridade Atualizada" }); },
      onError: () => { setEditingPriority(null); toast({ title: "Erro ao Atualizar Prioridade", variant: "destructive" }); }
    });
  };

  const handlePriorityClickCycle = (tournamentId: string, currentPriority: number) => {
    let nextPriority = currentPriority + 1;
    if (nextPriority > 3) nextPriority = 1;
    handleUpdatePriority(tournamentId, nextPriority);
  };

  const handleRegisterTournament = (tournamentId: string) => {
    if (!activeSession?.id) { toast({ title: "Erro", description: "Nenhuma sessao ativa encontrada.", variant: "destructive" }); return; }
    const allTournaments = [...(sessionTournaments || []), ...(plannedTournaments || []).map(pt => ({ ...pt, id: `planned-${pt.id}`, status: 'upcoming', sessionId: activeSession.id }))];
    const targetTournament = allTournaments.find(t => t.id === tournamentId);
    if (!targetTournament) { toast({ title: "Erro", description: "Torneio nao encontrado.", variant: "destructive" }); return; }
    const isSuprema = targetTournament.site === 'Suprema';

    if (!tournamentId.startsWith('planned-')) {
      if (isSuprema) {
        addTournamentMutation.mutate({ sessionId: activeSession.id, site: targetTournament.site, name: targetTournament.name, buyIn: targetTournament.buyIn || '0', type: targetTournament.type || 'Vanilla', speed: targetTournament.speed || 'Normal', time: targetTournament.time || '20:00', guaranteed: targetTournament.guaranteed || null, status: 'registered', startTime: new Date().toISOString(), rebuys: 0, result: '0', bounty: '0', position: null, fieldSize: null, fromPlannedTournament: false, plannedTournamentId: null });
      } else {
        updateTournamentMutation.mutate({ id: tournamentId, data: { status: 'registered', startTime: new Date().toISOString() } });
      }
      return;
    }

    const actualId = tournamentId.substring(8);
    const plannedTournament = plannedTournaments?.find(t => t.id === actualId);
    const existingSessionTournament = sessionTournaments?.find(st => st.plannedTournamentId === actualId);

    if (existingSessionTournament && !isSuprema) {
      updateTournamentMutation.mutate({ id: existingSessionTournament.id, data: { status: 'registered', startTime: new Date().toISOString() } });
      return;
    }

    if (plannedTournament) {
      addTournamentMutation.mutate({ sessionId: activeSession.id, site: plannedTournament.site || 'PokerStars', name: plannedTournament.name, buyIn: plannedTournament.buyIn || '0', type: plannedTournament.type || 'Vanilla', speed: plannedTournament.speed || 'Normal', time: plannedTournament.time || '20:00', guaranteed: plannedTournament.guaranteed || null, status: 'registered', startTime: new Date().toISOString(), rebuys: 0, result: '0', bounty: '0', position: null, fieldSize: null, fromPlannedTournament: true, plannedTournamentId: actualId });
      return;
    }
    toast({ title: "Erro", description: "Torneio nao encontrado.", variant: "destructive" });
  };

  const handleUnregisterTournament = (tournamentId: string) => {
    updateTournamentMutation.mutate({ id: tournamentId, data: { status: 'upcoming', result: '0', bounty: '0', position: null, startTime: null, endTime: null } });
    setRegistrationData(prev => { const updated = { ...prev }; delete updated[tournamentId]; return updated; });
  };

  const handleDeleteTournament = (tournamentId: string) => {
    updateTournamentMutation.mutate({ id: tournamentId, data: { status: 'deleted' } });
  };

  // ===== TIME EDIT HANDLERS =====
  const handleEditTime = (tournamentId: string) => {
    let tournament = sessionTournaments?.find(t => t.id === tournamentId);
    if (!tournament && tournamentId.startsWith('planned-')) {
      const actualId = tournamentId.substring(8);
      tournament = plannedTournaments?.find(t => t.id === actualId);
      if (tournament) tournament = { ...tournament, id: tournamentId };
    }
    if (tournament) {
      setTimeEditValue({ ...timeEditValue, [tournamentId]: tournament.time || '20:00' });
      setEditingTimeDialog({ ...editingTimeDialog, [tournamentId]: true });
    }
  };

  const handleSaveTime = (tournamentId: string) => {
    const newTime = timeEditValue[tournamentId];
    if (newTime && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newTime)) {
      updateTournamentMutation.mutate({ id: tournamentId, data: { time: newTime } });
      setEditingTimeDialog({ ...editingTimeDialog, [tournamentId]: false });
      toast({ title: "Horario atualizado", description: `Horario alterado para ${newTime}` });
    } else {
      toast({ title: "Erro", description: "Formato invalido. Use HH:MM (ex: 20:30)", variant: "destructive" });
    }
  };

  const adjustTournamentTime = (tournamentId: string, minutesToAdd: number, autoClose: boolean = false) => {
    let tournament = sessionTournaments?.find(t => t.id === tournamentId);
    if (!tournament && tournamentId.startsWith('planned-')) { const actualId = tournamentId.substring(8); tournament = plannedTournaments?.find(t => t.id === actualId); }
    if (tournament) {
      const currentTime = tournament.time || '20:00';
      if (!currentTime || typeof currentTime !== 'string') return;
      const [hours, minutes] = currentTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + minutesToAdd;
      const newHours = Math.floor(totalMinutes / 60) % 24;
      const newMinutes = totalMinutes % 60;
      const newTime = `${newHours.toString().padStart(2, '0')}:${Math.abs(newMinutes).toString().padStart(2, '0')}`;
      updateTournamentMutation.mutate({ id: tournamentId, data: { time: newTime } });
      setTimeEditValue({ ...timeEditValue, [tournamentId]: newTime });
      if (autoClose) setEditingTimeDialog({ ...editingTimeDialog, [tournamentId]: false });
      toast({ title: `${minutesToAdd > 0 ? '+' : ''}${minutesToAdd} minutos aplicados`, description: `Horario alterado para ${newTime}` });
    } else {
      toast({ title: "Erro", description: "Torneio nao encontrado", variant: "destructive" });
    }
  };

  const setFixedTime = (tournamentId: string, timeType: 'now' | 'next-hour' | 'plus-30') => {
    const now = new Date();
    let targetTime: string;
    switch (timeType) {
      case 'now': targetTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`; break;
      case 'next-hour': targetTime = `${(now.getHours() + 1).toString().padStart(2, '0')}:00`; break;
      case 'plus-30': const plus30 = new Date(now.getTime() + 30 * 60000); targetTime = `${plus30.getHours().toString().padStart(2, '0')}:${plus30.getMinutes().toString().padStart(2, '0')}`; break;
      default: return;
    }
    updateTournamentMutation.mutate({ id: tournamentId, data: { time: targetTime } });
    setTimeEditValue({ ...timeEditValue, [tournamentId]: targetTime });
    setEditingTimeDialog({ ...editingTimeDialog, [tournamentId]: false });
    toast({ title: `Horario definido`, description: `Horario alterado para ${targetTime}` });
  };

  // Close priority editing when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (editingPriority && !(event.target as Element).closest('.priority-select')) setEditingPriority(null); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingPriority]);

  // Session timer with motivational messages (RF-09: pause-aware)
  useEffect(() => {
    if (!activeSession) return;
    if (isPaused) return; // Don't update timer while paused
    let sessionStartTime = new Date(activeSession.date).getTime();
    const updateSessionTimer = () => {
      const totalPaused = pausedTime + (pauseStartTime ? Date.now() - pauseStartTime : 0);
      const elapsed = Date.now() - sessionStartTime - totalPaused;
      const hours = Math.floor(elapsed / (1000 * 60 * 60));
      const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
      const timerElement = document.getElementById('sessionTimer');
      const statusElement = document.getElementById('statusMessage');
      if (timerElement) timerElement.textContent = `${hours}h ${minutes}m`;
      if (statusElement) {
        if (hours === 0 && minutes < 30) statusElement.textContent = "Comecando com tudo!";
        else if (hours < 2) statusElement.textContent = "Mantendo o foco!";
        else if (hours < 4) statusElement.textContent = "No ritmo certo!";
        else if (hours < 6) statusElement.textContent = "Maratona epica!";
        else statusElement.textContent = "Sessao lendaria!";
      }
    };
    updateSessionTimer();
    const interval = setInterval(updateSessionTimer, 60000);
    return () => clearInterval(interval);
  }, [activeSession, isPaused, pausedTime, pauseStartTime]);

  // Calculate stats
  const stats = useMemo(() => calculateSessionStats(sessionTournaments, plannedTournaments, registrationData, activeSession), [plannedTournaments, sessionTournaments, registrationData, activeSession]);

  // Screen cap alert
  useEffect(() => {
    const percentage = (stats.emAndamento / stats.screenCap) * 100;
    if (percentage >= 100) {
      const notification = document.createElement('div'); notification.className = 'notification notification-danger'; notification.textContent = '⚠️ Limite de telas atingido!'; document.body.appendChild(notification); setTimeout(() => notification.remove(), 5000);
    } else if (percentage >= 80) {
      const notification = document.createElement('div'); notification.className = 'notification notification-warning'; notification.textContent = '🟨 Atencao: Proximo do limite de telas (80%)'; document.body.appendChild(notification); setTimeout(() => notification.remove(), 5000);
    }
  }, [stats.emAndamento, stats.screenCap]);

  // ===== RENDER =====
  if (sessionsLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6"><Skeleton className="h-8 w-48 bg-gray-700 mb-2" /><Skeleton className="h-4 w-96 bg-gray-700" /></div>
        <Card className="bg-poker-surface border-gray-700 max-w-2xl mx-auto"><CardContent className="p-6 space-y-4"><Skeleton className="h-6 w-48 mx-auto bg-gray-700" /><Skeleton className="h-4 w-64 mx-auto bg-gray-700" /><div className="grid grid-cols-3 gap-4 mt-4"><Skeleton className="h-16 w-full bg-gray-700" /><Skeleton className="h-16 w-full bg-gray-700" /><Skeleton className="h-16 w-full bg-gray-700" /></div></CardContent></Card>
      </div>
    );
  }

  if (sessionsError) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6"><h2 className="text-2xl font-bold mb-2">Grind Session</h2><p className="text-gray-400">Inicie uma nova sessao de grind para rastrear seu desempenho em tempo real</p></div>
        <div className="text-center py-12">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" /><p className="text-xl font-semibold mb-2 text-red-400">Erro ao carregar sessao</p><p className="text-gray-400 mb-4">Nao foi possivel carregar os dados da sessao.</p>
          <Button variant="outline" onClick={() => refetchSessions()} className="bg-gray-800 border-gray-600 hover:bg-gray-700 text-white"><RefreshCw className="w-4 h-4 mr-2" />Tentar novamente</Button>
        </div>
      </div>
    );
  }

  if (!activeSession) {
    // RF-04: Use EpicStartSessionModal instead of inline dialog
    return (
      <div className="p-6 text-white">
        <EpicStartSessionModal
          isOpen={true}
          onClose={() => setLocation('/grind')}
          onSuccess={handleStartSession}
          preparationPercentage={preparationPercentage}
          setPreparationPercentage={setPreparationPercentage}
          preparationNotes={preparationObservations}
          setPreparationNotes={setPreparationObservations}
          dailyGoals={dailyGoals}
          setDailyGoals={setDailyGoals}
          screenCap={screenCap}
          setScreenCap={setScreenCap}
          isLoading={startSessionMutation.isPending}
          plannedTournaments={plannedTournaments}
          isLoadingPlannedTournaments={false}
        />
      </div>
    );
  }

  // Build combined tournament lists
  const allCombinedTournaments = combineTournaments(sessionTournaments, plannedTournaments);
  const { registered, upcoming, completed } = organizeTournaments(allCombinedTournaments, plannedTournaments);

  // RF-08: Filter tournaments by search
  const filterBySearch = (tournaments: any[]) => {
    if (!tournamentSearch.trim()) return tournaments;
    const term = tournamentSearch.toLowerCase();
    return tournaments.filter(t =>
      (t.name && t.name.toLowerCase().includes(term)) ||
      (t.site && t.site.toLowerCase().includes(term)) ||
      (t.buyIn && String(t.buyIn).includes(term))
    );
  };

  const totalTournamentCount = registered.length + upcoming.length + completed.length;
  const filteredRegistered = filterBySearch(registered);
  const filteredUpcoming = filterBySearch(upcoming);
  const filteredCompleted = filterBySearch(completed);
  const filteredTotalCount = filteredRegistered.length + filteredUpcoming.length + filteredCompleted.length;

  return (
    <div className="container p-6 text-white">
      {/* RF-01: Session recovery banner */}
      {showRecoveryBanner && (
        <div className="mb-4 p-3 bg-green-600/20 border border-green-500/50 rounded-lg text-green-300 text-center font-medium animate-in fade-in duration-300">
          Sessao retomada
        </div>
      )}

      {/* Session Objectives */}
      {activeSession?.dailyGoals && (
        <Card className="bg-slate-800/70 border border-slate-700/60 shadow-lg shadow-emerald-500/10 mb-6 hover:shadow-emerald-500/20 transition-all duration-300">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-center space-x-3 mb-4"><div className="p-2 bg-emerald-500/20 rounded-full border border-emerald-500/40"><Target className="w-6 h-6 text-emerald-400" /></div><span className="text-xl font-bold text-emerald-400 tracking-wide">OBJETIVOS DA SESSAO</span></div>
            <div className="bg-slate-900/60 border border-slate-600/40 rounded-lg p-4"><p className="text-white text-lg font-medium leading-relaxed text-center">{activeSession.dailyGoals}</p></div>
          </CardContent>
        </Card>
      )}

      <SessionHeader
        sessionElapsedTime={sessionElapsedTime}
        statusMessage={getSessionTimeInfo().message}
        onOpenQuickNote={() => setShowQuickNotesDialog(true)}
        onOpenBreakDialog={() => setShowBreakDialog(true)}
        onSessionFinalization={handleSessionFinalization}
        onOpenBreakManagement={() => setShowBreakManagementDialog(true)}
        isPaused={isPaused}
        onPause={handlePauseSession}
        onResume={handleResumeSession}
      />

      <SessionDashboard stats={stats} showDashboard={showDashboard} onToggleDashboard={() => setShowDashboard(!showDashboard)} />

      {/* Tournament List */}
      <div className="tournaments-section">
        <div className="tournaments-header">
          <div className="tournaments-title">Torneios de Hoje</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSupremaModal(true)} className="add-tournament-btn" style={{ backgroundColor: '#d97706' }}><Download className="h-4 w-4" />Importar Suprema</button>
            <AddTournamentDialog
              open={showAddTournamentDialog} onOpenChange={setShowAddTournamentDialog}
              newTournament={newTournament} setNewTournament={setNewTournament}
              syncWithGrade={syncWithGrade} setSyncWithGrade={setSyncWithGrade}
              weeklySuggestions={weeklySuggestions}
              onAddTournament={(data) => {
                if (!data.site || !data.buyIn) { toast({ title: "Campos Obrigatorios", description: "Site e Buy-in sao obrigatorios", variant: "destructive" }); return; }
                addTournamentMutation.mutate(data);
              }}
              isPending={addTournamentMutation.isPending}
              getFilteredSuggestions={getFilteredSuggestions} resetFilters={resetFilters}
              hasActiveFilters={hasActiveFilters} getSuggestionStats={getSuggestionStats}
              applySuggestion={applySuggestion} applyQuickFilter={applyQuickFilter}
              getSimilarityScore={getSimilarityScore}
            />
          </div>
        </div>

        {/* RF-08: Tournament search */}
        <div className="mb-4 mt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={tournamentSearch}
              onChange={(e) => setTournamentSearch(e.target.value)}
              placeholder="Buscar por nome, site ou buy-in..."
              className="pl-10 bg-gray-800/50 border-gray-700 text-white placeholder-gray-500 focus:border-green-500"
            />
          </div>
          {tournamentSearch.trim() && (
            <p className="text-xs text-gray-400 mt-1">
              Mostrando {filteredTotalCount} de {totalTournamentCount} torneios
            </p>
          )}
        </div>

        <div className="tournaments-content">
          {/* EM ANDAMENTO */}
          <div className="tournament-category" id="activeCategory">
            <div className="category-header category-registered"><div className="category-icon"></div><div className="category-title">Em Andamento</div><div className="category-count">{filteredRegistered.length}</div></div>
            <div className="tournaments-list">
              {filteredRegistered.length > 0 ? filteredRegistered.map((tournament: any, index: number) => (
                <TournamentCard key={tournament.id} mode="registered"
                  tournament={tournament} index={index} totalCount={filteredRegistered.length}
                  registrationData={registrationData} maxLateStates={maxLateStates} editingPriority={editingPriority}
                  onUnregister={handleUnregisterTournament} onRebuy={handleRebuyTournament}
                  onFinishDirect={handleFinishTournamentDirect} onPriorityClickCycle={handlePriorityClickCycle}
                  onPriorityClick={(id, e) => { e.preventDefault(); e.stopPropagation(); setEditingPriority(id); }}
                  onUpdatePriority={handleUpdatePriority} setEditingPriority={setEditingPriority}
                  onSetRegistrationData={setRegistrationData} onSetMaxLateStates={setMaxLateStates}
                  updateIsPending={updateTournamentMutation.isPending}
                />
              )) : <div className="category-empty">Nenhum torneio em andamento</div>}
            </div>
          </div>

          {/* PROXIMOS */}
          <div className="tournament-category" id="upcomingCategory">
            <div className="category-header category-upcoming"><div className="category-icon"></div><div className="category-title">Proximos</div><div className="category-count">{filteredUpcoming.length}</div></div>
            <div className="tournaments-list">
              {filteredUpcoming.length > 0 ? (
                <div className="space-y-4">
                  {organizeTournamentsByBreaks(filteredUpcoming).map((breakBlock) => (
                    <div key={breakBlock.breakTime} className="break-block">
                      <div className="break-header"><div className="break-line"></div><div className="break-title">Break {breakBlock.breakTime} ({breakBlock.tournaments.length})</div><div className="break-line"></div></div>
                      <div className="space-y-2">
                        {breakBlock.tournaments.map((tournament: any) => (
                          <TournamentCard key={tournament.id} mode="upcoming"
                            tournament={tournament} registered={registered}
                            onRegister={handleRegisterTournament} onEditTime={handleEditTime}
                            onEdit={(t) => { setEditingTournament(t); setShowEditTournamentDialog(true); }}
                            onDelete={handleDeleteTournament} queryClient={queryClient}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="category-empty">Nenhum torneio proximo</div>}
            </div>
          </div>

          {/* CONCLUIDOS */}
          <div className="tournament-category" id="finishedCategory">
            <div className="category-header category-finished"><div className="category-icon"></div><div className="category-title">Concluidos</div><div className="category-count">{filteredCompleted.length}</div></div>
            <div className="tournaments-list">
              {filteredCompleted.length > 0 ? (
                <Collapsible open={showCompletedTournaments} onOpenChange={setShowCompletedTournaments}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-poker-gold" /><span className="font-semibold text-white">Ver Torneios Concluidos</span></div>
                      {showCompletedTournaments ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 mt-3">
                    {filteredCompleted.map((tournament: any) => (
                      <TournamentCard key={tournament.id} mode="completed"
                        tournament={tournament}
                        onEdit={(t) => { setEditingTournament(t); setShowEditTournamentDialog(true); }}
                        onUnregister={handleUnregisterTournament} queryClient={queryClient}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ) : <div className="category-empty">Nenhum torneio concluido</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Break Feedback Dialog */}
      <BreakFeedbackPopup isOpen={showBreakDialog}
        onClose={() => setShowBreakDialog(false)}
        onSubmit={(feedback) => breakFeedbackMutation.mutate(feedback)}
        onSkip={() => setShowBreakDialog(false)}
        onSkipAll={() => { setShowBreakDialog(false); toast({ title: "Breaks Desabilitados", description: "Nao mostraremos mais feedbacks de break hoje" }); }}
        breakNumber={breakFeedbacks?.length ? breakFeedbacks.length + 1 : 1} totalBreaks={8}
        sessionProgress={breakFeedbacks?.length ? (breakFeedbacks.length / 8) * 100 : 0}
        timeRemaining={360} isPending={breakFeedbackMutation.isPending} sessionId={activeSession?.id}
      />

      {/* Break Management Dialog */}
      <Dialog open={showBreakManagementDialog} onOpenChange={setShowBreakManagementDialog}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-2xl">
          <DialogHeader><DialogTitle className="text-xl flex items-center"><Coffee className="w-6 h-6 mr-3 text-poker-accent" />Gerenciamento de Breaks</DialogTitle></DialogHeader>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-poker-gold mb-4">Breaks Registrados Hoje</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {breakFeedbacks && breakFeedbacks.length > 0 ? breakFeedbacks.map((feedback: any) => (
                  <div key={feedback.id} className="p-4 bg-green-900/20 rounded-lg border border-green-600/30">
                    <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-3"><Coffee className="w-4 h-4 text-green-400" /><span className="text-white font-medium">Break as {new Date(feedback.breakTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><Badge variant="outline" className="border-green-600 text-green-400">Registrado</Badge></div></div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Foco:</span><span className="text-white font-medium">{feedback.foco}/10</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Energia:</span><span className="text-white font-medium">{feedback.energia}/10</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Confianca:</span><span className="text-white font-medium">{feedback.confianca}/10</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Int. Emocional:</span><span className="text-white font-medium">{feedback.inteligenciaEmocional}/10</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Interferencias:</span><span className="text-white font-medium">{feedback.interferencias}/10</span></div>
                    </div>
                    {feedback.notes && <div className="mt-3 p-2 bg-gray-800/50 rounded text-sm"><span className="text-gray-400">Notas:</span><p className="text-gray-300 mt-1">{feedback.notes}</p></div>}
                  </div>
                )) : (
                  <div className="p-6 bg-gray-800/30 rounded-lg text-center"><Coffee className="w-8 h-8 text-gray-500 mx-auto mb-3" /><p className="text-gray-400 text-sm">Nenhum break registrado ainda nesta sessao</p></div>
                )}
              </div>
            </div>
            <div className="border-t border-gray-700 pt-6">
              <Button onClick={() => { setShowBreakManagementDialog(false); setShowBreakDialog(true); }} className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-3 h-12 shadow-lg"><Plus className="w-5 h-5 mr-3" />Gerar Novo Report</Button>
            </div>
          </div>
          <div className="flex justify-end mt-6"><Button onClick={() => setShowBreakManagementDialog(false)} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800">Fechar</Button></div>
        </DialogContent>
      </Dialog>

      <EditTournamentDialog open={showEditTournamentDialog} onOpenChange={setShowEditTournamentDialog}
        editingTournament={editingTournament} setEditingTournament={setEditingTournament}
        onSave={(id, data) => updateTournamentMutation.mutate({ id, data })}
      />

      {/* Pending Tournaments Dialog removed - RF-02 simplified flow handles this */}

      <TimeEditDialog editingTimeDialog={editingTimeDialog} setEditingTimeDialog={setEditingTimeDialog}
        timeEditValue={timeEditValue} setTimeEditValue={setTimeEditValue}
        onSaveTime={handleSaveTime} onAdjustTime={adjustTournamentTime} onSetFixedTime={setFixedTime}
      />

      {/* Quick Notes Dialog */}
      <Dialog open={showQuickNotesDialog} onOpenChange={setShowQuickNotesDialog}>
        <DialogContent className="sm:max-w-[425px] bg-gradient-to-br from-blue-900 to-blue-800 border-blue-500/30 text-white">
          <DialogHeader><DialogTitle className="text-xl font-bold text-center text-blue-100">📝 Anotacao Rapida</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-blue-200">Sua anotacao (max. 280 caracteres)</Label>
              <Textarea value={quickNoteText} onChange={(e) => setQuickNoteText(e.target.value)} placeholder="Ex: Vilao a esquerda muito agressivo no button, ajustar ranges..." className="min-h-[100px] bg-blue-800/50 border-blue-500/50 text-white placeholder-blue-300/70 focus:border-blue-400" maxLength={280} />
              <div className="flex justify-between text-xs text-blue-300"><span>Horario atual: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><span>{quickNoteText.length}/280</span></div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => { setShowQuickNotesDialog(false); setQuickNoteText(""); }} className="flex-1 border-blue-500 text-blue-200 hover:bg-blue-600/20">Cancelar</Button>
              <Button onClick={handleAddQuickNote} disabled={!quickNoteText.trim() || quickNoteText.length > 280} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Salvar Nota</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SessionSummaryModal show={showSessionSummary} summaryData={sessionSummaryData}
        finalNotes={finalNotes} setFinalNotes={setFinalNotes}
        onContinueSession={handleContinueSession} onEndSession={handleEndSession}
        onClose={handleSummaryClose}
      />

      {/* RF-02: Simplified confirmation modal - single step */}
      <Dialog open={showConfirmationModal} onOpenChange={setShowConfirmationModal}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Finalizar sessao?</DialogTitle>
            <DialogDescription className="text-gray-400">
              Torneios pendentes serao marcados como encerrados.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowConfirmationModal(false)} className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800">
              Cancelar
            </Button>
            <Button onClick={handleConfirmEndSession} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold" disabled={updateTournamentMutation.isPending}>
              {updateTournamentMutation.isPending ? "Finalizando..." : "Finalizar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suprema Import Modal */}
      <SupremaImportModal open={showSupremaModal} onClose={() => setShowSupremaModal(false)} excludeExternalIds={[]}
        onImport={async (tournaments) => {
          let importedCount = 0;
          for (const t of tournaments) {
            try { addTournamentMutation.mutate({ site: t.site, name: t.name, buyIn: t.buyIn, type: t.type, speed: t.speed, guaranteed: t.guaranteed, scheduledTime: t.time, status: "upcoming", syncWithGrade: false, fromPlannedTournament: false }); importedCount++; } catch {}
          }
          if (importedCount > 0) toast({ title: "Importacao Concluida", description: `${importedCount} torneios importados da Suprema Poker` });
        }}
      />
    </div>
  );
}
