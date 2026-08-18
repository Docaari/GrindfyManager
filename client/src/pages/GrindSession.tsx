import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";
import { Play, FileText, Target, Plus, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import FilterDropdown from "@/components/FilterDropdown";
import { FilterState } from "@/components/FilterPopupSimple";
import { useRegisterSessionForm } from "@/hooks/useRegisterSessionForm";

// Sub-components
import { SessionHistoryData, DashboardMetrics } from "@/components/grind-session/types";
import { applyFiltersToSessions, createSessionValidator } from "@/components/grind-session/helpers";
import { findTodaySession } from "@/components/grind-session/session-helpers";
import { useSessionEdit, useVisualFeedback, useAutoSave, useDebouncedValidation } from "@/components/grind-session/useSessionEdit";
import DashboardMetricsCards from "@/components/grind-session/DashboardMetricsCards";
import { computeBreakdowns } from "@/components/grind-session/breakdownHelpers";
import { getCurrencyForSite } from "@shared/platform-currency";
import SessionHistoryList from "@/components/grind-session/SessionHistoryList";
import EditSessionDialog from "@/components/grind-session/EditSessionDialog";
import type { MentalEvolutionEditorHandle } from "@/components/grind-session/MentalEvolutionEditor";
import DeleteSessionDialog from "@/components/grind-session/DeleteSessionDialog";
import RegisterSessionDialog from "@/components/grind-session/RegisterSessionDialog";
import SessionDetailsDialog from "@/components/grind-session/SessionDetailsDialog";
import ConflictDialog from "@/components/grind-session/ConflictDialog";
import SpotScreenshotPaster from "@/components/grind-session-live/SpotScreenshotPaster";
import GrindPersonalizationDialog from "@/components/grind-session/GrindPersonalizationDialog";
import { useGrindPreferences } from "@/lib/grindPagePreferences";
import { useGrindCurrency } from "@/hooks/useGrindCurrency";
import { hasWarmUpData, getQuickStartLabel, getLastSessionDefaults, buildQuickStartSession } from "@/components/grind-session/quick-start-helpers";
import { mergeWarmupSources } from "@/lib/warmup-persistence-helpers";
import { CheckCircle, Brain } from "lucide-react";
import { useWarmupGate } from "@/hooks/useWarmupGate";
import { useWarmupTelemetry } from "@/hooks/useWarmupTelemetry";
import { StopBanner } from "@/components/bankroll/StopBanner";
import { StopRemainingIndicator } from "@/components/grind-session-live/StopRemainingIndicator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function GrindSession() {
  const hasPermission = usePermission('grind_session_access');
  const hasWarmupPermission = usePermission('mental_prep_access');

  const [, setLocation] = useLocation();
  const [showWarmupGateDialog, setShowWarmupGateDialog] = useState(false);
  const [gateBypassedOnce, setGateBypassedOnce] = useState(false);
  const [pendingStartSource, setPendingStartSource] = useState<"quick_start" | "personalizar" | null>(null);
  const { canStartGrind, reason: warmupGateReason, isLoading: warmupGateLoading } = useWarmupGate();
  const { track: trackWarmup } = useWarmupTelemetry();
  // Gate so eh aplicado quando o user tem permission de warm-up E a query nao
  // esta em loading (durante loading, fail-open para nao bloquear UX nem poluir
  // telemetria com `reason: 'loading'`). Snooze "Agora nao" libera 1 start.
  const warmupGateActive =
    hasWarmupPermission && !warmupGateLoading && !canStartGrind && !gateBypassedOnce;

  // Filter state with localStorage persistence
  const defaultFilters: FilterState = {
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
  };

  const loadFiltersFromStorage = (): FilterState => {
    try {
      const stored = localStorage.getItem('grindSessionFilters');
      if (stored) {
        const parsed = JSON.parse(stored) as FilterState;
        return { ...defaultFilters, ...parsed };
      }
    } catch {
      // Ignore parse errors, use defaults
    }
    return defaultFilters;
  };

  const [filterState, setFilterStateInternal] = useState<FilterState>(loadFiltersFromStorage);

  const setFilterState = useCallback((newFilters: FilterState) => {
    setFilterStateInternal(newFilters);
    try {
      localStorage.setItem('grindSessionFilters', JSON.stringify(newFilters));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const resetFilters = useCallback(() => {
    setFilterStateInternal(defaultFilters);
    localStorage.removeItem('grindSessionFilters');
  }, []);

  // Edit/Delete session states
  const [editingSession, setEditingSession] = useState<SessionHistoryData | null>(null);
  // ADR-242 — ref para o editor de evolucao mental (draft da serie de breaks).
  // O save global ("Salvar Alteracoes") dispara a persistencia da serie junto.
  const mentalEvolutionRef = useRef<MentalEvolutionEditorHandle | null>(null);
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
  // v2 Sprint Grind-Cards-Reform: 3 breakdowns colapsaveis (default = expandido).
  // Founder: pagina sempre carrega/atualiza com cards colapsados (2026-05-07).
  const [showTypesToggle, setShowTypesToggle] = useState(false);
  const [showSpeedsToggle, setShowSpeedsToggle] = useState(false);
  const [showPlatformsToggle, setShowPlatformsToggle] = useState(false);

  // Personalizacao da pagina (cards visiveis, performance mental, moeda base)
  const [showPersonalizationDialog, setShowPersonalizationDialog] = useState(false);
  const [grindPrefs] = useGrindPreferences();
  const grindFormat = useGrindCurrency();

  // Session recovery from localStorage backup
  const [recoveryData, setRecoveryData] = useState<{sessionId: string; timestamp: number} | null>(null);

  useEffect(() => {
    const backup = localStorage.getItem('grindfy_session_backup');
    if (backup) {
      try {
        const parsed = JSON.parse(backup);
        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          setRecoveryData(parsed);
        } else {
          localStorage.removeItem('grindfy_session_backup');
        }
      } catch {
        localStorage.removeItem('grindfy_session_backup');
      }
    }
  }, []);

  // Ensure all modals are closed on component mount to prevent stuck overlay
  useEffect(() => {
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
  const { data: activeSessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/grind-sessions");
      return Array.isArray(response) ? response : [];
    },
    refetchInterval: 5000,
    staleTime: 1000,
    refetchOnWindowFocus: true,
  });

  // User settings — defaultScreenCap memorizado entre sessoes (persistido em
  // user_settings via PUT /api/user-settings pelo updateScreenCapMutation em
  // /grind-live). Usado em getLastSessionDefaults / buildQuickStartSession.
  const { data: userSettingsData } = useQuery<{ defaultScreenCap?: number | null } & Record<string, any>>({
    queryKey: ["/api/user-settings"],
    queryFn: async () => {
      try {
        return await apiRequest("GET", "/api/user-settings");
      } catch {
        return {} as any;
      }
    },
    staleTime: 60_000,
  });

  // Sprint Bankroll-3 RF-6 wiring: stop-loss/stop-win status + lock countdown.
  // Endpoint: GET /api/user-settings/stops -> {stopLockUntil, currentDayDeltaUsd, ...}
  const { data: stopStatus } = useQuery<{
    stopLockUntil: string | null;
    currentDayDeltaUsd: number;
    stopLossUsd: number | null;
    stopWinUsd: number | null;
  }>({
    queryKey: ["/api/user-settings/stops"],
    queryFn: async () => {
      try {
        return await apiRequest("GET", "/api/user-settings/stops");
      } catch {
        return { stopLockUntil: null, currentDayDeltaUsd: 0, stopLossUsd: null, stopWinUsd: null } as any;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const stopBannerVariant = useMemo<"loss" | "win" | null>(() => {
    if (!stopStatus) return null;
    if (stopStatus.stopLockUntil) return "loss";
    const delta = stopStatus.currentDayDeltaUsd ?? 0;
    if (stopStatus.stopWinUsd != null && delta >= stopStatus.stopWinUsd) return "win";
    return null;
  }, [stopStatus]);

  const activeSession = activeSessions.find((session: Record<string, unknown>) => session.status === "active");

  // Sprint F2 RF-07: Spot screenshots pending count (per active session) — used
  // pelo paster como `usedCount`. Query so eh ativada quando ha sessao ativa.
  const activeSessionId = activeSession?.id as string | undefined;
  const { data: pendingSpotsData } = useQuery<{ items?: any[]; total?: number } | undefined>({
    queryKey: ["/api/starred-hands/pending", { sessionId: activeSessionId }],
    queryFn: async () => {
      if (!activeSessionId) return { items: [], total: 0 } as any;
      try {
        return await apiRequest(
          "GET",
          `/api/starred-hands/pending?sessionId=${encodeURIComponent(activeSessionId)}`,
        );
      } catch (err) {
        // Log antes do fallback (lesson #9: nao engolir erro silencioso).
        // Fallback evita refetch loop em rede flaky; counter mostra 0/10
        // ate proxima janela de stale.
        console.warn("spot.pending_query.failed", err);
        return { items: [], total: 0 };
      }
    },
    enabled: !!activeSessionId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Backend retorna `total` como source of truth (nao depende de paginacao
  // do `items`). Fallback para items.length se total ausente.
  const spotUsedCount =
    typeof pendingSpotsData?.total === "number"
      ? pendingSpotsData.total
      : Array.isArray(pendingSpotsData?.items)
        ? pendingSpotsData!.items!.length
        : 0;

  const handleSpotUploaded = useCallback(() => {
    if (!activeSessionId) return;
    queryClient.invalidateQueries({
      queryKey: ["/api/starred-hands/pending", { sessionId: activeSessionId }],
    });
  }, [activeSessionId]);

  const handleSpotError = useCallback(
    (msg: string) => {
      toast({
        title: "Erro ao salvar print",
        description: msg,
        variant: "destructive",
      });
    },
    [toast],
  );

  // Fetch session history
  const { data: sessionHistory = [], isLoading: historyLoading, isError: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ["/api/grind-sessions/history"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/grind-sessions/history");
      return Array.isArray(response) ? response : [];
    },
    staleTime: 30000,
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

  // FP-09 RF-06: Fetch latest warm-up from database
  const { data: latestWarmUp = null } = useQuery({
    queryKey: ["/api/preparation-logs/latest"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/preparation-logs/latest");
        return response || null;
      } catch {
        return null;
      }
    },
    staleTime: 60000,
    retry: false,
  });

  // FP-15: Compute warm-up data with priority: DB > localStorage > defaults
  // TODO: Remove localStorage fallback after migration period (FP-15)
  const warmUpData = useMemo(() => {
    const dbData = latestWarmUp && (latestWarmUp as any).warmupCompleted ? {
      mentalState: (latestWarmUp as any).mentalState,
      focusLevel: (latestWarmUp as any).focusLevel,
      confidenceLevel: (latestWarmUp as any).confidenceLevel,
      exercisesCompleted: (latestWarmUp as any).exercisesCompleted || [],
      warmupCompleted: (latestWarmUp as any).warmupCompleted,
      sessionGoals: (latestWarmUp as any).sessionGoals,
      createdAt: (latestWarmUp as any).createdAt,
    } : null;

    // TODO: Remove localStorage fallback after migration period (FP-15)
    let localData = null;
    try {
      const warmUpScore = localStorage.getItem('warmUpScore');
      const warmUpDataStr = localStorage.getItem('warmUpData');
      if (warmUpScore && warmUpDataStr) {
        const parsed = JSON.parse(warmUpDataStr);
        localData = {
          mentalState: parseInt(warmUpScore, 10) || 0,
          focusLevel: parsed.mentalState?.foco || 5,
          confidenceLevel: parsed.mentalState?.confianca || 5,
          exercisesCompleted: parsed.activities || [],
          warmupCompleted: true,
          sessionGoals: undefined,
          createdAt: parsed.timestamp,
        };
      }
    } catch { /* ignore */ }

    return mergeWarmupSources(dbData, localData) as any;
  }, [latestWarmUp]);

  // FP-09: Quick start session defaults
  const lastSessionDefaults = useMemo(() => {
    return getLastSessionDefaults(sessionHistory, userSettingsData ?? null);
  }, [sessionHistory, userSettingsData]);

  const quickStartLabel = getQuickStartLabel(warmUpData);
  const warmUpCompleted = hasWarmUpData(warmUpData);

  // FP-09: Handle quick start
  const handleQuickStart = (opts: { bypassGate?: boolean; forceReplace?: boolean } = {}) => {
    // Sprint W-1 RF-14: Gate Go/No-Go — exigir warm-up valido antes de iniciar grind.
    // bypassGate true cobre o retry pos-"Iniciar mesmo assim" (closure stale ignorava
    // gateBypassedOnce ja setado no mesmo tick — bug double-click reportado).
    if (warmupGateActive && !opts.bypassGate) {
      trackWarmup("grind_blocked_by_gate", { reason: warmupGateReason, source: "quick_start" });
      setPendingStartSource("quick_start");
      setShowWarmupGateDialog(true);
      return;
    }
    // Bug 3: Double-click prevention
    if (startSessionMutation.isPending) return;

    // Bug 6: Loading state guard
    if (historyLoading) {
      toast({
        title: "Aguarde",
        description: "Carregando dados da sessão...",
        variant: "default",
      });
      return;
    }

    const now = new Date();

    // Reform 2026-05-05 v3: Inicio Rapido com bypassGate=true SEMPRE forca replace
    // (user ja decidiu "Iniciar mesmo assim"). Pra outras rotas, mantem conflict dialog
    // quando ha sessao completed do dia.
    const shouldSkipConflict = opts.forceReplace === true || opts.bypassGate === true;
    if (!shouldSkipConflict) {
      const todayStr = now.toISOString().split('T')[0];

      // Check activeSessions first (fresher data)
      const activeToday = activeSessions.find((s: Record<string, unknown>) => {
        const sessionDate = s.date ? new Date(s.date as string).toISOString().split('T')[0] : '';
        return sessionDate === todayStr;
      });

      if (activeToday) {
        if (activeToday.status !== 'completed') {
          toast({
            title: "Retomando sessao ativa de hoje",
            description: "Redirecionando para a sessao em andamento.",
          });
          setLocation("/grind-live");
          return;
        }
        setConflictingSession(activeToday as SessionHistoryData);
        setShowConflictDialog(true);
        return;
      }

      // Fallback: check sessionHistory
      const existingSession = findTodaySession(sessionHistory, todayStr) as SessionHistoryData | null;

      if (existingSession) {
        if (existingSession.status !== 'completed') {
          toast({
            title: "Retomando sessao ativa de hoje",
            description: "Redirecionando para a sessao em andamento.",
          });
          setLocation("/grind-live");
          return;
        }
        setConflictingSession(existingSession);
        setShowConflictDialog(true);
        return;
      }
    }
    // Quando bypassGate=true, ainda checamos active session do dia para retomar
    // (nao recriar) — apenas pulamos conflict dialog de completed.
    if (opts.bypassGate === true && !opts.forceReplace) {
      const todayStr = now.toISOString().split('T')[0];
      const activeToday = activeSessions.find((s: Record<string, unknown>) => {
        const sessionDate = s.date ? new Date(s.date as string).toISOString().split('T')[0] : '';
        return sessionDate === todayStr && s.status !== 'completed';
      });
      if (activeToday) {
        toast({
          title: "Retomando sessao ativa de hoje",
          description: "Redirecionando para a sessao em andamento.",
        });
        setLocation("/grind-live");
        return;
      }
    }

    // Build quick start session using helpers
    const previousSession = sessionHistory.length > 0
      ? [...sessionHistory].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
      : null;
    const quickSession = buildQuickStartSession(warmUpData, previousSession, userSettingsData ?? null);

    startSessionMutation.mutate({
      date: now.toISOString(),
      status: "active",
      preparationNotes: quickSession.preparationNotes,
      preparationPercentage: quickSession.preparationPercentage,
      dailyGoals: quickSession.dailyGoals,
      screenCap: quickSession.screenCap,
      skipBreaksToday: quickSession.skipBreaksToday,
      resetTournaments: true,
      replaceExisting: true,
      dayOfWeek: now.getDay(),
      loadFromGradePlanner: true,
    } as any);
  };

  // Sprint home-reform-5 item 3.2 — auto-trigger Quick Start via ?open=quickstart.
  // Vem do CTA "Iniciar Sessao" da Home (NextTournamentCountdown). Dispara apenas
  // 1x apos sessionsLoading + historyLoading + warmupGateLoading resolverem (para
  // handleQuickStart usar dados frescos sem early-return).
  const search = useSearch();
  const quickstartFiredRef = useRef(false);
  useEffect(() => {
    if (quickstartFiredRef.current) return;
    const params = new URLSearchParams(search ?? '');
    if (params.get('open') !== 'quickstart') return;
    if (sessionsLoading || historyLoading || warmupGateLoading) return;
    if (startSessionMutation.isPending) return;
    quickstartFiredRef.current = true;
    // Limpa o query param para evitar re-fire em refetch/back-nav.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('open');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      // ignore
    }
    handleQuickStart();
  }, [search, sessionsLoading, historyLoading, warmupGateLoading]);

  // Filter sessions based on current filters
  const filteredSessions = applyFiltersToSessions(sessionHistory, filterState);

  // Fetch completed tournaments from all sessions (parallel via Promise.all).
  // Bug fix 2026-05-07: serial loop bloqueava UI por N requests sequenciais; agora
  // paraleliza + loga falhas (lesson #9: nao engolir erro silencioso).
  const filteredSessionIdsKey = useMemo(
    () => filteredSessions.map(s => s.id).sort().join(','),
    [filteredSessions],
  );
  const { data: allCompletedTournaments = [] } = useQuery({
    queryKey: ["/api/completed-tournaments", filteredSessionIdsKey],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        filteredSessions.map((session) =>
          apiRequest("GET", `/api/grind-sessions/${session.id}/tournaments`),
        ),
      );
      const out: Record<string, unknown>[] = [];
      settled.forEach((res, idx) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          out.push(...res.value);
        } else if (res.status === 'rejected') {
          console.warn(
            `[grind] tournaments.fetch failed for session ${filteredSessions[idx]?.id}:`,
            res.reason,
          );
        }
      });
      return out;
    },
    enabled: filteredSessions.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Calculate dashboard metrics
  const dashboardMetrics = useMemo((): DashboardMetrics => {
    const totalVolume = filteredSessions.reduce((sum, session) => sum + session.volume, 0);

    // Type counts: addOnTaken=true vence type primario (founder request 2026-05-07
    // round 3) — torneios com add-on real contam como Add-on mesmo se type='Vanilla'.
    const resolveType = (t: Record<string, unknown>): string =>
      t.addOnTaken === true ? 'Add-on' : (typeof t.type === 'string' ? t.type : 'Vanilla');
    const vanillaCount = allCompletedTournaments.filter((t: Record<string, unknown>) => resolveType(t) === 'Vanilla').length;
    const pkoCount = allCompletedTournaments.filter((t: Record<string, unknown>) => resolveType(t) === 'PKO').length;
    const mysteryCount = allCompletedTournaments.filter((t: Record<string, unknown>) => resolveType(t) === 'Mystery').length;
    const addOnCount = allCompletedTournaments.filter((t: Record<string, unknown>) => resolveType(t) === 'Add-on').length;
    const normalCount = allCompletedTournaments.filter((t: Record<string, unknown>) => t.speed === 'Normal').length;
    const turboCount = allCompletedTournaments.filter((t: Record<string, unknown>) => t.speed === 'Turbo').length;
    const hyperCount = allCompletedTournaments.filter((t: Record<string, unknown>) => t.speed === 'Hyper').length;
    const totalCompletedTournaments = allCompletedTournaments.length;

    let totalReentradas = 0;
    let avgParticipants = 0;
    let itmPercentage = 0;
    let maiorResultado = 0;
    let maiorResultadoMeta: {
      name?: string;
      site?: string;
      position?: number;
      prizeUsd: number;
    } | null = null;

    if (filteredSessions && filteredSessions.length > 0) {
      // v2.3 (2026-05-07 founder pos-QA round 2): bugs Reentradas/Participantes/MaiorResultado.

      // Media Participantes via MEDIANA (robusto a outliers). Range valido
      // 1 < participants <= 100_000.
      // v2.5 (2026-05-07 founder formula): fallback `guaranteed / buyIn`
      // quando fieldSize ausente. Audit DB mostrou USER-0005 com 321/324
      // session_tournaments sem fieldSize, mas 165/192 com guaranteed e buyIn.
      // Mediana de gtd/buyIn = 925 (Sharkscope reportou 625 — proximo +
      // dentro range founder 300-1000). CSV parser populou guaranteed mas
      // nao fieldSize, entao fallback recupera o sinal.
      if (allCompletedTournaments.length > 0) {
        const estimates: number[] = [];
        for (const t of allCompletedTournaments) {
          const tt = t as Record<string, any>;
          const fs = Number(tt.fieldSize);
          if (Number.isFinite(fs) && fs > 0 && fs <= 100_000) {
            estimates.push(fs);
            continue;
          }
          // Fallback: guaranteed / buyIn (formula MTT padrao).
          const gtd = Number(tt.guaranteed);
          const bi = Number(tt.buyIn);
          if (Number.isFinite(gtd) && gtd > 0 && Number.isFinite(bi) && bi > 0) {
            const est = gtd / bi;
            if (est > 1 && est <= 100_000) estimates.push(est);
          }
        }
        if (estimates.length >= 5) {
          estimates.sort((a, b) => a - b);
          const mid = Math.floor(estimates.length / 2);
          avgParticipants = estimates.length % 2 === 0
            ? (estimates[mid - 1] + estimates[mid]) / 2
            : estimates[mid];
        }
      }

      // Reentradas: SUM(reentries + rebuys) — founder quer ambos contados.
      // server endpoint trata rebuys e reentries separadamente no profit calc.
      totalReentradas = allCompletedTournaments.reduce((sum: number, t: Record<string, unknown>) => {
        const r = Number(t.reentries);
        const rb = Number(t.rebuys);
        const reentries = Number.isFinite(r) && r > 0 ? r : 0;
        const rebuys = Number.isFinite(rb) && rb > 0 ? rb : 0;
        return sum + reentries + rebuys;
      }, 0);

      // ITM%: COUNT(prize > 0) / COUNT(*) * 100 (spec R3).
      const totalCount = allCompletedTournaments.length;
      if (totalCount > 0) {
        const itmCount = allCompletedTournaments.filter((t: Record<string, unknown>) => {
          const prize = Number(t.result ?? t.prize);
          return Number.isFinite(prize) && prize > 0;
        }).length;
        itmPercentage = (itmCount / totalCount) * 100;
      }

      // Maior Resultado: MAX(prize) FX-aware + metadata (name, site, position).
      const rates = grindFormat.ratesUsdToOther ?? {};
      for (const t of allCompletedTournaments) {
        const tt = t as Record<string, any>;
        const prizeNative = Number(tt.result ?? tt.prize);
        if (!Number.isFinite(prizeNative) || prizeNative <= 0) continue;
        const ccy = (typeof tt.currency === 'string' && tt.currency.length > 0
          ? tt.currency
          : getCurrencyForSite(String(tt.site ?? '')).code).toUpperCase();
        let prizeUsd = prizeNative;
        if (ccy !== 'USD') {
          const rate = rates[ccy];
          if (Number.isFinite(rate) && (rate as number) > 0) {
            prizeUsd = prizeNative / (rate as number);
          }
        }
        if (prizeUsd > maiorResultado) {
          maiorResultado = prizeUsd;
          maiorResultadoMeta = {
            name: typeof tt.name === 'string' ? tt.name : undefined,
            site: typeof tt.site === 'string' ? tt.site : undefined,
            position: Number.isFinite(Number(tt.position)) && Number(tt.position) > 0
              ? Number(tt.position)
              : undefined,
            prizeUsd,
          };
        }
      }
    }

    // Avg mental/prep so consideram sessoes com valor reportado (>0); sessoes
    // sem reporte (sentinel 0) nao puxam a media para baixo. Mesmo padrao dos
    // baloes do historico para coerencia.
    const avgPositive = (getter: (s: any) => number): number => {
      const arr = filteredSessions
        .map((s) => Number(getter(s)) || 0)
        .filter((v) => v > 0);
      return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    };

    // v1 (Spec §3 — 16 KPIs): totals FX-aware computados sobre os tournaments
    // raw (allCompletedTournaments). Single-pass pra performance.
    const fxRates = grindFormat.ratesUsdToOther ?? {};
    const toUsd = (native: number, ccy: string): number => {
      if (!Number.isFinite(native) || native === 0) return 0;
      const code = (ccy || 'USD').toUpperCase();
      if (code === 'USD') return native;
      const r = fxRates[code];
      return Number.isFinite(r) && (r as number) > 0 ? native / (r as number) : native;
    };
    let totalProfitUsd = 0;
    let totalInvestedUsd = 0;
    const distinctIds = new Set<string>();
    const distinctActiveDays = new Set<string>();
    for (const t of allCompletedTournaments) {
      const tt = t as Record<string, any>;
      const ccy = typeof tt.currency === 'string' && tt.currency.length > 0
        ? tt.currency
        : getCurrencyForSite(String(tt.site ?? '')).code;
      const buyIn = Number(tt.buyIn) || 0;
      const reentries = Number(tt.reentries) || 0;
      const rebuys = Number(tt.rebuys) || 0;
      const addOn = tt.addOnTaken ? (Number(tt.addOnCost) || 0) : 0;
      const investedNative = buyIn * (1 + reentries + rebuys) + addOn;
      const profitNative = tt.profit !== undefined && tt.profit !== null && tt.profit !== ''
        ? Number(tt.profit)
        : (Number(tt.result ?? tt.prize) || 0) + (Number(tt.bounty) || 0) - investedNative;
      totalInvestedUsd += toUsd(investedNative, ccy);
      totalProfitUsd += toUsd(profitNative, ccy);
      if (typeof tt.id === 'string') distinctIds.add(tt.id);
      const dateStr = typeof tt.date === 'string' ? tt.date.slice(0, 10) : '';
      if (dateStr) distinctActiveDays.add(dateStr);
    }
    // Fallback active days via session.date quando tournaments sem date.
    if (distinctActiveDays.size === 0) {
      for (const s of filteredSessions) {
        const ds = typeof s.date === 'string' ? s.date.slice(0, 10) : '';
        if (ds) distinctActiveDays.add(ds);
      }
    }
    const totalRegistros = distinctIds.size;
    // v2.6: chain duration sources — durationMin (real, server) > estimatedDurationMin
    // (server via tournament times) > client-side span (allCompletedTournaments
    // agrupados por sessionId) > skip session.
    // Client-side fallback: agrupa tournaments por sessionId, computa MIN(start)/
    // MAX(end). Cap defensivo 24h.
    const spanBySession = new Map<string, { minStart: number; maxEnd: number }>();
    for (const t of allCompletedTournaments) {
      const tt = t as Record<string, any>;
      const sid = typeof tt.sessionId === 'string' ? tt.sessionId : null;
      if (!sid) continue;
      const stRaw = tt.startTime;
      const enRaw = tt.endTime;
      let st: number | null = null;
      let en: number | null = null;
      if (stRaw) {
        const parsed = new Date(stRaw).getTime();
        if (Number.isFinite(parsed)) st = parsed;
      }
      if (enRaw) {
        const parsed = new Date(enRaw).getTime();
        if (Number.isFinite(parsed)) en = parsed;
      }
      const acc = spanBySession.get(sid);
      if (!acc) {
        spanBySession.set(sid, {
          minStart: st ?? Number.POSITIVE_INFINITY,
          maxEnd: en ?? Number.NEGATIVE_INFINITY,
        });
      } else {
        if (st !== null && st < acc.minStart) acc.minStart = st;
        if (en !== null && en > acc.maxEnd) acc.maxEnd = en;
      }
    }
    const sessionDurationsMin: number[] = [];
    for (const s of filteredSessions) {
      const ss = s as any;
      const real = Number(ss.durationMin);
      if (Number.isFinite(real) && real > 0) {
        sessionDurationsMin.push(real);
        continue;
      }
      const est = Number(ss.estimatedDurationMin);
      if (Number.isFinite(est) && est > 0) {
        sessionDurationsMin.push(est);
        continue;
      }
      const span = spanBySession.get(ss.id);
      if (
        span &&
        Number.isFinite(span.minStart) &&
        Number.isFinite(span.maxEnd) &&
        span.maxEnd > span.minStart
      ) {
        const min = Math.round((span.maxEnd - span.minStart) / 60000);
        if (min > 0 && min <= 24 * 60) {
          sessionDurationsMin.push(min);
          continue;
        }
      }
      // Sem dados de tempo, skip (nao puxa media down via heuristica volume*90 antiga).
    }
    const totalDurationMin = sessionDurationsMin.reduce((a, b) => a + b, 0);
    const avgSessionDurationMin = sessionDurationsMin.length > 0
      ? totalDurationMin / sessionDurationsMin.length
      : 0;
    const activeDayCount = distinctActiveDays.size;
    const gamesPerActiveDay = activeDayCount > 0
      ? allCompletedTournaments.length / activeDayCount
      : 0;
    const profitPerActiveDay = activeDayCount > 0 ? totalProfitUsd / activeDayCount : 0;
    const profitPerHour = totalDurationMin > 0
      ? totalProfitUsd / (totalDurationMin / 60)
      : 0;
    const profitPerTournament = totalRegistros > 0
      ? totalProfitUsd / totalRegistros
      : 0;
    // Auditoria avgABI/avgROI (spec R5 + §4.1.3): formulas corretas FX-aware.
    const avgABI_v1 = totalRegistros > 0 ? totalInvestedUsd / totalRegistros : 0;
    const avgROI_v1 = totalInvestedUsd > 0 ? (totalProfitUsd / totalInvestedUsd) * 100 : 0;

    return {
      totalSessions: filteredSessions.length,
      totalVolume,
      totalProfit: totalProfitUsd,
      avgABI: avgABI_v1,
      avgROI: avgROI_v1,
      totalFTs: filteredSessions.reduce((sum, session) => sum + (Number(session.fts) || 0), 0),
      totalCravadas: filteredSessions.reduce((sum, session) => sum + (Number(session.cravadas) || 0), 0),
      avgEnergia: avgPositive((s) => s.energiaMedia),
      avgFoco: avgPositive((s) => s.focoMedio),
      avgConfianca: avgPositive((s) => s.confiancaMedia),
      avgInteligenciaEmocional: avgPositive((s) => s.inteligenciaEmocionalMedia),
      avgInterferencias: avgPositive((s) => s.interferenciasMedia),
      avgPreparationPercentage: avgPositive((s) => s.preparationPercentage),
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
      maiorResultado,
      maiorResultadoMeta,
      // v1 KPIs novos (Spec §3 — 16 cards)
      totalRegistros,
      avgSessionDurationMin,
      gamesPerActiveDay,
      profitPerActiveDay,
      profitPerHour,
      profitPerTournament,
    };
  }, [filteredSessions, allCompletedTournaments, grindFormat.ratesUsdToOther]);

  // v2 (Sprint Grind-Cards-Reform): breakdowns por tipo / velocidade / plataforma.
  const breakdowns = useMemo(
    () => computeBreakdowns(allCompletedTournaments as any[], grindFormat.ratesUsdToOther),
    [allCompletedTournaments, grindFormat.ratesUsdToOther],
  );

  const dashboardMetricsWithBreakdowns: DashboardMetrics = useMemo(
    () => ({
      ...dashboardMetrics,
      typesBreakdown: breakdowns.types,
      speedsBreakdown: breakdowns.speeds,
      platformsBreakdown: breakdowns.platforms,
    }),
    [dashboardMetrics, breakdowns],
  );

  // Mental circles animation - only full animation on first load, simple fade on updates
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    const circles = document.querySelectorAll('.mental-circle');
    if (circles.length === 0) return;

    if (!hasAnimatedRef.current) {
      // First load: full scale + opacity animation
      hasAnimatedRef.current = true;
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
    } else {
      // Subsequent updates: simple fade only
      circles.forEach((circle) => {
        const element = circle as HTMLElement;
        const value = parseFloat(element.dataset.value || '0');
        const isPreparation = element.classList.contains('mental-prep');
        const maxValue = isPreparation ? 100 : 10;

        element.style.transition = 'opacity 0.3s ease-in-out';
        element.style.opacity = '0.6';

        setTimeout(() => {
          element.style.opacity = '1';

          if (value < maxValue * 0.3) {
            element.style.boxShadow = '0 0 20px rgba(255, 68, 68, 0.3)';
          } else if (value < maxValue * 0.7) {
            element.style.boxShadow = '0 0 20px rgba(255, 170, 0, 0.3)';
          } else {
            element.style.boxShadow = '0 0 20px rgba(0, 255, 136, 0.3)';
          }
        }, 50);
      });
    }
  }, [dashboardMetrics.avgPreparationPercentage, dashboardMetrics.avgEnergia, dashboardMetrics.avgFoco, dashboardMetrics.avgConfianca, dashboardMetrics.avgInteligenciaEmocional, dashboardMetrics.avgInterferencias]);

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/grind-sessions", data);
    },
    onSuccess: (data: any) => {
      // Reform 2026-05-05 v4: precisa atualizar cache /api/grind-sessions ANTES do
      // navigate. /grind-live tem useEffect que redireciona de volta pra /grind se
      // activeSession=null no cache. Sem setQueryData, race do refetch leva user
      // de volta pra /grind.
      toast({
        title: "Sessão iniciada com sucesso!",
        description: "Sua sessão de grind foi iniciada. Boa sorte!",
      });
      // Insere sessao recem-criada no cache (head). Server retorna o objeto.
      try {
        queryClient.setQueryData(["/api/grind-sessions"], (old: any) => {
          const list = Array.isArray(old) ? old : [];
          // Substitui se ja existir (replaceExisting); senao prepend.
          const filtered = list.filter((s: any) => s?.id !== data?.id);
          return [data, ...filtered];
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[grind] setQueryData fallback:", e);
      }
      setLocation("/grind-live");
      // Refetch em paralelo para sincronizar com server.
      queryClient.refetchQueries({ queryKey: ["/api/grind-sessions"] }).catch(() => {});
    },
    onError: (error: any) => {
      // eslint-disable-next-line no-console
      console.error("[grind] startSessionMutation error:", error);
      toast({
        title: "Erro ao iniciar sessão",
        description: error?.message || "Algo deu errado ao iniciar a sessão. Veja o console.",
        variant: "destructive",
      });
    },
  });

  const checkExistingSessionBeforePreparation = (opts: { bypassGate?: boolean } = {}) => {
    // Sprint W-1 RF-14: Gate Go/No-Go — exigir warm-up valido antes de iniciar grind.
    // bypassGate true atende retry pos-"Iniciar mesmo assim" (mesmo motivo de
    // closure stale do handleQuickStart).
    if (warmupGateActive && !opts.bypassGate) {
      trackWarmup("grind_blocked_by_gate", { reason: warmupGateReason, source: "personalizar" });
      setPendingStartSource("personalizar");
      setShowWarmupGateDialog(true);
      return;
    }
    // Bug 3: Double-click prevention
    if (startSessionMutation.isPending) return;

    const today = new Date().toISOString().split('T')[0];
    const existingSession = findTodaySession(sessionHistory, today) as SessionHistoryData | null;

    if (existingSession) {
      // FP-08: Auto-continue if session is active (not completed)
      if (existingSession.status !== 'completed') {
        toast({
          title: "Retomando sessao ativa de hoje",
          description: "Redirecionando para a sessao em andamento.",
        });
        setLocation("/grind-live");
        return;
      }
      // Session completed — show conflict dialog
      setConflictingSession(existingSession);
      setShowConflictDialog(true);
    } else {
      // Sem sessao existente: dispara quick start direto (sem modal warm-up legado).
      handleQuickStart({ bypassGate: opts.bypassGate });
    }
  };

  // Sprint W-1: useEffect legado de `warmUpIntegration` removido — flag nao
  // eh mais escrita pelo MentalPrep refatorado. Integracao com /grind agora
  // passa pelo gate via useWarmupGate() (RF-14).

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
    // Modal warm-up legado removido — agora cria nova sessao direto via mutation
    // com replaceExisting=true (warm-up tem sessao propria em /mental).
    handleQuickStart({ bypassGate: true, forceReplace: true });
  };

  const handleConflictCancel = () => {
    setShowConflictDialog(false);
    setConflictingSession(null);
    localStorage.removeItem('warmUpScore');
    localStorage.removeItem('warmUpData');
    localStorage.removeItem('warmUpIntegration');
  };

  // Edit session mutation.
  // ADR-242 fix-wave (MEDIUM-1): o orquestrador `handleSaveEdit` controla TODA a
  // UX pos-save (toast, fechar modal, limpar editingSession) de forma sequencial
  // — a sessao persiste ANTES da serie de breaks, e o modal so fecha quando AMBOS
  // confirmam. Por isso esta mutation NAO fecha o modal nem dispara toast no
  // onSuccess (evita 2 onSuccess concorrentes + unmount do editor durante o save
  // da serie + toast duplicado). Mantem so a invalidacao da query de historico.
  const editSessionMutation = useMutation({
    mutationFn: async (data: { id: string; sessionData: any }) => {
      return apiRequest("PUT", `/api/grind-sessions/${data.id}`, data.sessionData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
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
      // Invalidar AMBAS queries para evitar quick-start ver sessao deletada (cache stale).
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
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

  const handleSaveEdit = async () => {
    if (!editingSession) return;

    // Valida apenas os campos que o usuario realmente mudou — evita que dado
    // legado inconsistente (ex: fts>volume herdado) bloqueie a edicao de outro
    // campo (ex: profit). Bug relatado: editar profit de dia negativo nao salvava.
    const changedFields = (
      ["volume", "profit", "abiMed", "fts", "cravadas"] as const
    ).filter((f) => editData[f] !== (initialSession as any)[f]);

    const { isValid, errors } = createSessionValidator().validate(
      editData,
      changedFields,
    );

    if (!isValid) {
      Object.entries(errors).forEach(([field]) => {
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

    const durationRaw = (editData as any).duration;
    const durationParsed =
      durationRaw === "" || durationRaw == null
        ? undefined
        : Number(durationRaw);

    // ADR-242 fix-wave (MEDIUM-1 + MEDIUM-2): fluxo async unico e sequencial.
    // 1) persiste a SESSAO; 2) persiste a SERIE de breaks (bulk endpoint que
    //    recalcula as medias derivadas na mesma tx). So fecha o modal/limpa o
    //    editor quando AMBOS confirmam. Se qualquer um falhar, o modal NAO fecha
    //    (usuario pode retentar) e a falha eh sinalizada com toast destrutivo
    //    distinto (sem checkmark de sucesso total — nada de "Salvo" silencioso).
    try {
      await editSessionMutation.mutateAsync({
        id: editingSession.id,
        sessionData: {
          volume: editData.volume,
          ...(durationParsed != null && Number.isFinite(durationParsed)
            ? { duration: durationParsed }
            : {}),
          profit: String(editData.profit || 0),
          abiMed: String(editData.abiMed || 0),
          // ADR-244 D4: preserva a ausencia; a coluna e nullable e o PUT aceita null.
          roi: editData.roi == null ? null : String(editData.roi),
          fts: editData.fts,
          cravadas: editData.cravadas,
          // ADR-242 (RF-07): as 5 medias *Media agora sao DERIVADAS da serie de
          // breaks e persistidas pelo bulk endpoint. O PUT legado nao as envia.
          preparationNotes: editData.preparationNotes,
          dailyGoals: editData.dailyGoals,
          finalNotes: editData.finalNotes,
          objectiveCompleted: editData.objectiveCompleted,
        },
      });
    } catch (err: any) {
      // Falha do save da SESSAO: modal permanece aberto, sem checkmark.
      console.error("[handleSaveEdit] session save failed:", err);
      setIsSaving(false);
      setShowSuccess(false);
      toast({
        title: "Erro ao atualizar sessão",
        description: err?.message || "Algo deu errado ao atualizar a sessão.",
        variant: "destructive",
      });
      return;
    }

    // ADR-242 (Q-03 salvar junto): a serie so eh persistida APOS a sessao salvar.
    try {
      await mentalEvolutionRef.current?.saveDraft();
    } catch (err: any) {
      // MEDIUM-2: a sessao salvou mas a serie mental falhou — NAO mostrar sucesso
      // total. Diferencia o resultado e mantem o modal aberto para retentar.
      console.error("[handleSaveEdit] mental evolution save failed:", err);
      setIsSaving(false);
      setShowSuccess(false);
      toast({
        title: "Sessão salva, mas a evolução mental falhou",
        description: "A sessão foi atualizada, mas não conseguimos salvar a evolução mental. Tente salvar novamente.",
        variant: "destructive",
      });
      return;
    }

    // Sucesso total: ambos persistiram.
    clearAutoSave();
    setIsSaving(false);
    setShowSuccess(true);
    toast({
      title: "Sessão atualizada!",
      description: "As informações da sessão foram atualizadas com sucesso.",
    });
    setTimeout(() => {
      setShowSuccess(false);
      setIsEditDialogOpen(false);
      setEditingSession(null);
    }, 2000);
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
      // ADR-244 D4: roi ausente e null, nunca 0. `|| 0` fazia o editor
      // pre-preencher 0 e o save gravar "0" por cima do null — o jogador
      // perdia a distincao "sem ROI" sem perceber.
      roi: editingSession?.roi ?? null,
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

  // Debounced validation for real-time feedback
  useDebouncedValidation(editData);

  // Save state controls
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // RF-03 (G3): Recovery dialog via AlertDialog Radix (substitui window.confirm).
  // Estado isolado em objeto unico (lesson #12) para nao misturar com edit dialog.
  const [recoveryDialog, setRecoveryDialog] = useState<{
    open: boolean;
    data: Record<string, any>;
    lastSaved: Date | null;
  } | null>(null);

  // Recover auto-save on edit dialog open. Snapshot lastSaved at open time
  // (later auto-save updates dont mutate the recovery dialog text). Cleanup
  // closes recoveryDialog if user dismisses edit dialog before responding,
  // preventing orphan overlay (review M1).
  useEffect(() => {
    if (!editingSession || !isEditDialogOpen) {
      setRecoveryDialog(null);
      return;
    }
    const recoveredData = recoverAutoSave();
    if (recoveredData) {
      setRecoveryDialog({
        open: true,
        data: recoveredData,
        lastSaved: lastSaved ?? null,
      });
    }
  }, [editingSession, isEditDialogOpen, lastSaved, recoverAutoSave]);

  const handleRecoveryConfirm = useCallback(() => {
    if (!recoveryDialog) return;
    Object.entries(recoveryDialog.data).forEach(([field, value]) => {
      updateField(field, value);
    });
    toast({
      title: "Dados recuperados",
      description: "Suas alteracoes nao salvas foram restauradas.",
    });
    setRecoveryDialog(null);
  }, [recoveryDialog, updateField, toast]);

  const handleRecoveryCancel = useCallback(() => {
    setRecoveryDialog(null);
  }, []);

  // Permission gate AFTER hooks (Rules of Hooks compliance — lesson #1).
  if (!hasPermission) {
    return <AccessDenied featureName="Sessao de Grind" description="Acesse o modulo de sessoes de grind para acompanhar suas sessoes em tempo real." />;
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Sprint Bankroll-3 RF-6: Stop-loss/win banner — read-only, dismisses
          automaticamente quando lockedUntil expira ou stopReached=null. */}
      {stopBannerVariant && (
        <div className="mb-4">
          <StopBanner
            lockedUntil={stopStatus?.stopLockUntil ?? null}
            stopReached={stopBannerVariant}
            dayDeltaUsd={stopStatus?.currentDayDeltaUsd}
            stopLossUsd={stopStatus?.stopLossUsd ?? null}
            stopWinUsd={stopStatus?.stopWinUsd ?? null}
          />
        </div>
      )}

      {/* Fase D #5 (RF-03): indicador leve "quanto falta" para o stop. Some quando
          stopLossUsd null ou quando o lock cheio (StopBanner loss) já cobre. */}
      {!stopBannerVariant && stopStatus?.stopLossUsd != null && (
        <div className="mb-4">
          <StopRemainingIndicator
            stopLossUsd={stopStatus.stopLossUsd}
            currentDayDeltaUsd={stopStatus.currentDayDeltaUsd ?? 0}
          />
        </div>
      )}

      {/* Sprint F2 RF-07: Spot Screenshot Paster (so quando sessao ativa) */}
      {activeSession && (
        <SpotScreenshotPaster
          sessionId={activeSessionId as string}
          usedCount={spotUsedCount}
          onUploaded={handleSpotUploaded}
          onError={handleSpotError}
        />
      )}

      {/* Recovery banner for unfinished sessions */}
      {recoveryData && !activeSession && !sessionsLoading && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-medium text-amber-200">Sessão não finalizada detectada</p>
              <p className="text-sm text-muted-foreground">
                Última atividade: {new Date(recoveryData.timestamp).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              localStorage.removeItem('grindfy_session_backup');
              setRecoveryData(null);
            }}>
              Descartar
            </Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => {
              setLocation("/grind-live");
            }}>
              Retomar Sessão
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="grind-page-title mb-2">Grind</h1>
            <p className="grind-body-text">Gerencie suas sessões de grind e acompanhe seu histórico</p>
          </div>

          <div className="flex gap-3">
            {activeSession && (
              <>
                <Button
                  onClick={() => setLocation("/grind-live")}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8 py-3 shadow-lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Continuar Sessão Ativa
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleQuickStart({ bypassGate: true, forceReplace: true })}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                  title="Criar nova sessao mesmo com sessao ativa"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nova Sessão
                </Button>
              </>
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
                {/* FP-09: Quick Start button (primary) */}
                <div className="flex flex-col items-center gap-1">
                  <Button
                    size="lg"
                    onClick={() => handleQuickStart()}
                    disabled={startSessionMutation.isPending || historyLoading || showConflictDialog}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8 py-3 shadow-lg min-h-[44px]"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    {quickStartLabel}
                  </Button>
                  {warmUpCompleted ? (
                    <span className={`text-xs flex items-center gap-1 ${
                      (warmUpData?.mentalState ?? 0) >= 70 ? 'text-green-400' :
                      (warmUpData?.mentalState ?? 0) >= 40 ? 'text-yellow-400' :
                      'text-orange-400'
                    }`}>
                      <CheckCircle className="w-3 h-3" />
                      Warm-up concluido ({warmUpData?.mentalState}%)
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">Sem warm-up</span>
                  )}
                </div>

              </>
            )}

            {/* Personalizar — disponivel sempre (cards / perf mental / moeda); independe de ter sessao ativa */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPersonalizationDialog(true)}
              className="text-gray-400 hover:text-white text-sm"
            >
              Personalizar...
            </Button>
          </div>

          {/* Personalizacao da pagina Grind — toggles de visibilidade, performance mental, moeda base */}
          <GrindPersonalizationDialog
            isOpen={showPersonalizationDialog}
            onOpenChange={setShowPersonalizationDialog}
          />

        </div>
      </div>

      {/* FilterDropdown */}
      <FilterDropdown
        onApplyFilters={setFilterState}
        initialFilters={filterState}
      />

      {/* Dashboard Metrics */}
      {historyLoading ? (
        <div className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse bg-gray-700 rounded-2xl h-28" />
            ))}
          </div>
        </div>
      ) : (
        <DashboardMetricsCards
          dashboardMetrics={dashboardMetricsWithBreakdowns}
          showTournamentToggle={showTournamentToggle}
          setShowTournamentToggle={setShowTournamentToggle}
          showMentalToggle={showMentalToggle}
          setShowMentalToggle={setShowMentalToggle}
          recentSessions={filteredSessions.slice(0, 5)}
          visibility={grindPrefs.visibility}
          mentalEnabled={grindPrefs.mentalEnabled}
          formatCurrencyBase={grindFormat.format}
          convertCurrencyBase={grindFormat.convert}
          showTypesToggle={showTypesToggle}
          setShowTypesToggle={setShowTypesToggle}
          showSpeedsToggle={showSpeedsToggle}
          setShowSpeedsToggle={setShowSpeedsToggle}
          showPlatformsToggle={showPlatformsToggle}
          setShowPlatformsToggle={setShowPlatformsToggle}
        />
      )}

      {/* Session History */}
      {grindPrefs.visibility.history && (
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
          formatCurrency={grindFormat.format}
          mentalEnabled={grindPrefs.mentalEnabled}
        />
      )}

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
        mentalEvolutionRef={mentalEvolutionRef}
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
        formatCurrency={grindFormat.format}
      />

      {/* Session Conflict Dialog — onOpenChange routed via onCancel para
          limpar conflictingSession quando user fecha por backdrop/ESC. */}
      <ConflictDialog
        isOpen={showConflictDialog}
        onOpenChange={(open) => {
          if (!open) handleConflictCancel();
          else setShowConflictDialog(true);
        }}
        conflictingSession={conflictingSession}
        onEditSession={handleConflictEditSession}
        onCreateNew={handleConflictCreateNew}
        onCancel={handleConflictCancel}
      />

      {/* Sprint W-1 RF-14: Warm-up Gate Dialog */}
      <AlertDialog open={showWarmupGateDialog} onOpenChange={setShowWarmupGateDialog}>
        <AlertDialogContent data-testid="warmup-gate-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Faca warm-up antes
            </AlertDialogTitle>
            <AlertDialogDescription>
              Voce nao tem um warm-up valido nos ultimos 30 minutos. O ritual de
              10 minutos prepara seu PFC, calibra estado emocional e protege a banca
              de decisoes em dia ruim.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                trackWarmup("grind_gate_bypassed", {
                  reason: warmupGateReason,
                  source: pendingStartSource ?? "unknown",
                });
                setGateBypassedOnce(true);
                setShowWarmupGateDialog(false);
                const source = pendingStartSource;
                setPendingStartSource(null);
                // Retry no proximo tick — warmupGateActive ja sera false (bypass)
                setTimeout(() => {
                  if (source === "quick_start") handleQuickStart({ bypassGate: true });
                  else if (source === "personalizar") checkExistingSessionBeforePreparation({ bypassGate: true });
                }, 0);
              }}
            >
              Iniciar mesmo assim
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowWarmupGateDialog(false);
                setPendingStartSource(null);
                setLocation("/mental");
              }}
            >
              Ir para warm-up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* RF-03 (G3): Recovery dialog do auto-save (substitui window.confirm).
          Acessivel via Radix AlertDialog + estado isolado em recoveryDialog. */}
      <AlertDialog
        open={recoveryDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open) handleRecoveryCancel();
        }}
      >
        <AlertDialogContent data-testid="recovery-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Encontrei dados nao salvos</AlertDialogTitle>
            <AlertDialogDescription>
              Ultima modificacao:{' '}
              {recoveryDialog?.lastSaved
                ? recoveryDialog.lastSaved.toLocaleString()
                : 'Agora ha pouco'}
              . Deseja recuperar suas alteracoes nao salvas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRecoveryCancel}>
              Descartar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRecoveryConfirm}>
              Recuperar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
