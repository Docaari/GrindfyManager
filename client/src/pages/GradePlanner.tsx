import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProfileStates, useUpdateProfileState } from "@/hooks/useProfileStates";
import { DragDropContext, type DropResult } from "react-beautiful-dnd";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { validateDrop, mapLibraryToPlanned, calculateMove } from "@shared/drag-drop-utils";
import { checkOffToggleWarning, getAffectedTournaments, shouldShowOffDialog } from "@shared/grade-off-toggle";
import { shouldShowGrindCTA, getGrindCTAData, getTodayDayOfWeek } from "@/components/grade-planner/grind-cta-helpers";
import { Maximize2, Minimize2, BarChart3, Zap, X, Plus, Keyboard, Calendar, Trophy, Plane, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Sprint tournament-selector-reform: a aba "Torneios" agora reflete a pagina
// /library (TournamentLibraryNew). SelectorPanel (scoring) saiu da UI.
import TournamentLibraryNew from "@/pages/TournamentLibraryNew";

import { tournamentSchema, type TournamentForm, weekDays } from '@/components/grade-planner/types';
import { computeDayStats, buildOffDayToastPayload } from '@/components/grade-planner/helpers';
import { mapZodIssuesToForm } from '@/lib/zodErrorMapper';
import { LoadingScreen } from '@/components/grade-planner/LoadingScreen';
import { WeeklySummaryBar } from '@/components/grade-planner/WeeklySummaryBar';
import { WeekGrid } from '@/components/grade-planner/WeekGrid';
import { BibliotecaPanel } from '@/components/grade-planner/BibliotecaPanel';
import { TicketsWidget } from '@/components/dashboard/TicketsWidget';
import { ProfileComparison } from '@/components/grade-planner/ProfileComparison';
import { GradeSettings } from '@/components/grade-planner/GradeSettings';
import { DeleteDialog } from '@/components/grade-planner/DeleteDialog';
import { EditDialog } from '@/components/grade-planner/EditDialog';
// Sprint F4 → Sprint day-detail-zoom-1: DayDetailHost decide zoom vs drawer via ?detail=drawer.
import { DayDetailHost } from '@/components/grade/DayDetailHost';
import { PrimedopePanel } from '@/components/primedope/PrimedopePanel';
import { useBankroll } from '@/hooks/useBankroll';
// Sprint coach-page-reform-1.
import { useTabFromUrl } from '@/hooks/useTabFromUrl';
// Sprint Estudos-Habito-1 (RF-4): FocusStatsBar placement="coach".
import { FocusStatsBar } from '@/components/study/FocusStatsBar';
import { useFocusStatsBar } from '@/hooks/useFocusStatsBar';
import { FlightsPanel } from '@/components/grade-planner/FlightsPanel';

const COACH_TABS = ['planner', 'selector', 'flights', 'variance'] as const;
const COACH_TAB_LIST: string[] = [...COACH_TABS];

// Sprint tournament-selector-reform: cada aba e um card clicavel (TabsTrigger
// estilizado). A className e identica nos 4 cards — extraida p/ DRY.
const CARD_TRIGGER_CLS =
  'flex flex-col items-start gap-1 h-auto rounded-xl border border-gray-700 bg-gray-800/60 p-4 text-left whitespace-normal transition-colors hover:border-emerald-500/60 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-500/10 data-[state=active]:shadow-none';

export default function GradePlanner() {
  // Sprint Estudos-Habito-1 (RF-4): FocusStatsBar placement="coach".
  const focusBar = useFocusStatsBar('coach');
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // State
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [tournamentToDelete, setTournamentToDelete] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'expanded'>('compact');
  // Biblioteca minimizada por default (espelha o modal Detalhe do Dia —
  // dayZoom.libraryCollapsed). Preferencia persistida em localStorage.
  const [libraryCollapsed, setLibraryCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("gradePlanner.libraryCollapsed") !== "0";
    } catch {
      return true;
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<string>("grade");
  const [showComparison, setShowComparison] = useState(false);

  // Profile states
  const { data: profileStates, isLoading: profileStatesLoading } = useProfileStates();
  const updateProfileStateMutation = useUpdateProfileState();
  const [, setLocation] = useLocation();

  // Imperative ref para colapsar/expandir o Panel da biblioteca de fato
  // (react-resizable-panels expõe collapse/expand via ref).
  const libraryPanelRef = useRef<ImperativePanelHandle>(null);

  const persistLibraryCollapsed = useCallback((v: boolean) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "gradePlanner.libraryCollapsed",
          v ? "1" : "0",
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleToggleLibrary = useCallback(() => {
    const panel = libraryPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, []);

  // Aplica o estado colapsado default no mount do desktop (Panel collapsible
  // monta expandido salvo se forçarmos — mesma técnica do DayDetailZoom).
  useEffect(() => {
    const t = setTimeout(() => {
      const panel = libraryPanelRef.current;
      if (!panel) return;
      try {
        if (libraryCollapsed) panel.collapse();
        else panel.expand();
      } catch {
        /* ignore — panel size nao registrado ainda */
      }
    }, 0);
    return () => clearTimeout(t);
    // Só no mount — mudanças posteriores via onCollapse/onExpand do Panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FP-04: Off toggle dialog state
  const [showOffDialog, setShowOffDialog] = useState(false);
  const [pendingOffDay, setPendingOffDay] = useState<number | null>(null);
  const [affectedTournaments, setAffectedTournaments] = useState<any[]>([]);

  // FP-06: Grind CTA banner state
  const [ctaDismissed, setCtaDismissed] = useState(false);

  // UX: Dialog de novo torneio com seletor de dia (independente do clique-na-celula)
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  // ===========================================================================
  // Sprint day-detail-zoom-1 — DayDetailHost (zoom vs drawer) + Portal ref
  // ===========================================================================
  // FIX day-detail-manage hotfix: removido gate portalMounted — useEffect [] no
  // mount rodava enquanto GradePlanner retornava <LoadingScreen /> (profile
  // states ainda carregando), portanto dndPortalRef.current era null naquele
  // momento e nunca virava true depois (deps []). Modal nao abria pos-load.
  // Sem gate: portalContainer cai pra body default quando ref ainda null,
  // funciona; quando ja montado, DnD cross-portal preservado.
  const [dayDetailOpen, setDayDetailOpen] = useState<number | null>(null);
  const dndPortalRef = useRef<HTMLDivElement | null>(null);

  // Sprint coach-page-reform-1 RF-01: tabs persistidas em URL ?tab=.
  const [activeTab, setActiveTab] = useTabFromUrl(COACH_TAB_LIST, 'planner');

  // Sprint coach-page-reform-1 RF-03: housekeeping silencioso da flag legada
  // primedope_panel_expanded (PrimedopePanel migrou para aba Variance).
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('primedope_panel_expanded');
      }
    } catch {
      // ignore (private mode etc).
    }
  }, []);

  const { data: bankrollState } = useBankroll();
  const bankrollUsd =
    typeof bankrollState?.amount === 'number' ? bankrollState.amount : 0;

  const getActiveProfile = (dayOfWeek: number): 'A' | 'B' | 'C' | 'OFF' | null => {
    const state = profileStates?.find((ps: any) => ps.dayOfWeek === dayOfWeek);
    // Aceitar tanto `activeProfile` (canonical) quanto `profile` (shape alternativo).
    const profile = (state as any)?.activeProfile ?? (state as any)?.profile;
    if (!profile) return null;
    if (profile === 'OFF') return 'OFF';
    if (profile === 'A' || profile === 'B' || profile === 'C') return profile;
    return null;
  };

  const executeProfileSwitch = (dayOfWeek: number, profile: 'A' | 'B' | 'C' | 'OFF') => {
    updateProfileStateMutation.mutate({
      dayOfWeek,
      activeProfile: profile,
      profileAData: {},
      profileBData: {}
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/profile-states"] });
      },
    });
  };

  const setActiveProfile = (dayOfWeek: number, profile: 'A' | 'B' | 'C' | 'OFF') => {
    // FP-04: Show dialog instead of window.confirm when switching to OFF with tournaments
    const tournamentsWithActive = (plannedTournaments || []).map((t: any) => ({ ...t, isActive: true }));
    if (shouldShowOffDialog(profile, dayOfWeek, tournamentsWithActive)) {
      const affected = getAffectedTournaments(dayOfWeek, tournamentsWithActive);
      setAffectedTournaments(affected);
      setPendingOffDay(dayOfWeek);
      setShowOffDialog(true);
      return;
    }

    executeProfileSwitch(dayOfWeek, profile);
  };

  const handleConfirmOff = () => {
    if (pendingOffDay !== null) {
      executeProfileSwitch(pendingOffDay, 'OFF');
    }
    setShowOffDialog(false);
    setPendingOffDay(null);
    setAffectedTournaments([]);
  };

  const handleCancelOff = () => {
    setShowOffDialog(false);
    setPendingOffDay(null);
    setAffectedTournaments([]);
  };

  const editForm = useForm<TournamentForm>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: {
      site: "",
      time: "",
      // Defaults sensatos — usuarios tipicamente jogam Vanilla Normal
      type: "Vanilla",
      speed: "Normal",
      name: "",
      buyIn: "",
      guaranteed: "",
      prioridade: 2,
      gameType: null,
      startingStack: null,
      maxPlayers: null,
      blindLevelMinutes: null,
      lateRegMinutes: null,
      alertMinutesBefore: null,
      allowsAddOn: false,
      addOnCost: null,
      allowsReentry: false,
      maxReentries: null,
    },
  });

  // Fetch planned tournaments
  const plannedQuery = useQuery({
    queryKey: ["/api/planned-tournaments"],
    enabled: !!user?.userPlatformId,
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/planned-tournaments");
        return Array.isArray(response) ? response : [];
      } catch {
        return [];
      }
    },
  });

  const plannedTournaments = plannedQuery.data || [];
  const plannedLoading = plannedQuery.isLoading;

  // Fetch grade hours
  const { data: gradeHours } = useQuery({
    queryKey: ["/api/grade-planner/hours"],
    queryFn: () => apiRequest("GET", "/api/grade-planner/hours"),
  });

  const gradeStartHour = gradeHours?.gradeStartHour ?? 12;
  const gradeEndHour = gradeHours?.gradeEndHour ?? 3;

  // Mutations
  const addPlannedMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/planned-tournaments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library"] });
    },
    onError: (error: any) => {
      // Sprint 1 RF-01: backend devolve {error:'validation', issues:[{field,message,code}]}
      // em caso de erro Zod. Aplica setError em cada campo do form RHF.
      const issues = error?.response?.data?.issues ?? error?.issues ?? error?.body?.issues;

      if (Array.isArray(issues) && issues.length > 0) {
        mapZodIssuesToForm(issues, editForm);
        toast({
          title: "Falha na validacao",
          description: "Verifique os campos destacados em vermelho",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Erro ao adicionar torneio",
        description: error?.message || "Não foi possível adicionar o torneio. Revise os campos e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const updateTournamentMutation = useMutation({
    mutationFn: async (data: { id: string; [key: string]: any }) => {
      const { id, ...updateData } = data;
      return await apiRequest("PUT", `/api/planned-tournaments/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-library"] });
      toast({ title: "Torneio Atualizado", description: "Torneio atualizado com sucesso" });
      setIsEditDialogOpen(false);
      setEditingTournament(null);
    },
    onError: (error: any) => {
      // Sprint 1 RF-01: idem add — issues estruturadas iluminam campos inline
      const issues = error?.issues ?? error?.body?.issues ?? error?.cause?.issues;
      if (Array.isArray(issues) && issues.length > 0) {
        mapZodIssuesToForm(issues, editForm);
        toast({
          title: "Falha na validacao",
          description: "Verifique os campos destacados em vermelho",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Erro ao Atualizar",
        description: error?.message || "Erro desconhecido ao atualizar torneio",
        variant: "destructive"
      });
    },
  });

  const deleteTournamentMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/planned-tournaments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/active-days"] });
      toast({ title: "Torneio Excluido", description: "Torneio excluido com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao Excluir", description: error.message || "Erro desconhecido ao excluir torneio", variant: "destructive" });
    },
  });

  const updateHoursMutation = useMutation({
    mutationFn: async ({ gradeStartHour, gradeEndHour }: { gradeStartHour: number; gradeEndHour: number }) => {
      return await apiRequest("PUT", "/api/grade-planner/hours", { gradeStartHour, gradeEndHour });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grade-planner/hours"] });
      toast({ title: "Horarios Atualizados" });
      setIsSettingsOpen(false);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar horarios", variant: "destructive" });
    },
  });

  // Generate tournament name
  const generateTournamentName = (data: any) => {
    if (data.name && data.name.trim()) return data.name;
    const buyIn = `$${parseFloat(data.buyIn).toFixed(0)}`;
    const guaranteed = data.guaranteed ? ` $${parseFloat(data.guaranteed).toLocaleString('pt-BR')}` : '';
    return `${buyIn}${guaranteed} ${data.site}`;
  };

  // Tournament helpers
  const getTournamentsForDay = (dayId: number) => {
    const activeProfile = getActiveProfile(dayId);
    if (!activeProfile || activeProfile === 'OFF') return [];
    return (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter(
      (t: any) => t.dayOfWeek === dayId && t.profile === activeProfile
    );
  };

  const isDayActiveWithTournaments = (dayOfWeek: number): boolean => {
    const activeProfile = getActiveProfile(dayOfWeek);
    if (!activeProfile || activeProfile === 'OFF') return false;
    return getTournamentsForDay(dayOfWeek).length > 0;
  };

  // RF-04: stats agregadas via helper puro (computeDayStats).
  const getDayStats = (dayId: number) => computeDayStats(getTournamentsForDay(dayId));

  // Edit handlers
  const handleEditTournament = (tournament: any) => {
    setEditingTournament(tournament);
    editForm.reset({
      site: tournament.site || "",
      time: tournament.time || "",
      type: tournament.type || "Vanilla",
      speed: tournament.speed || "Normal",
      name: tournament.name || "",
      buyIn: tournament.buyIn?.toString() || "",
      guaranteed: tournament.guaranteed?.toString() || "",
      prioridade: Number(tournament.prioridade) || 2,
      dayOfWeek: tournament.dayOfWeek,
      // Campos avancados
      gameType: (tournament.gameType === "NLH" || tournament.gameType === "PLO") ? tournament.gameType : null,
      startingStack: tournament.startingStack != null ? String(tournament.startingStack) : null,
      maxPlayers: tournament.maxPlayers != null ? String(tournament.maxPlayers) : null,
      blindLevelMinutes: tournament.blindLevelMinutes != null ? String(tournament.blindLevelMinutes) : null,
      lateRegMinutes: tournament.lateRegMinutes != null ? String(tournament.lateRegMinutes) : null,
      alertMinutesBefore: tournament.alertMinutesBefore != null ? String(tournament.alertMinutesBefore) : null,
      allowsAddOn: Boolean(tournament.allowsAddOn),
      addOnCost: tournament.addOnCost != null ? String(tournament.addOnCost) : null,
      allowsReentry: Boolean(tournament.allowsReentry),
      maxReentries: tournament.maxReentries != null ? String(tournament.maxReentries) : null,
    });
    setTimeout(() => setIsEditDialogOpen(true), 50);
  };

  // Normaliza campos avancados (strings de input -> numeros ou null)
  const normalizeAdvancedFields = (data: TournamentForm) => {
    const toIntOrNull = (v: any): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = parseInt(String(v), 10);
      return isNaN(n) ? null : n;
    };
    const toStringOrNull = (v: any): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const isSatellite = data.type === 'Satellite';
    return {
      gameType: data.gameType ?? null,
      startingStack: toIntOrNull(data.startingStack),
      maxPlayers: toIntOrNull(data.maxPlayers),
      blindLevelMinutes: toIntOrNull(data.blindLevelMinutes),
      lateRegMinutes: toIntOrNull(data.lateRegMinutes),
      alertMinutesBefore: toIntOrNull(data.alertMinutesBefore),
      // Coerencia: type=Add-on implica allowsAddOn=true
      allowsAddOn: Boolean(data.allowsAddOn) || data.type === 'Add-on',
      addOnCost: (Boolean(data.allowsAddOn) || data.type === 'Add-on') ? toStringOrNull(data.addOnCost) : null,
      allowsReentry: Boolean(data.allowsReentry),
      maxReentries: data.allowsReentry ? toIntOrNull(data.maxReentries) : null,
      // Sprint 2026-05-07 — modificadores ortogonais ADR-031
      isFlight: Boolean(data.isFlight),
      isLive: Boolean(data.isLive),
      // Satellite fields — so propaga quando type=Satellite (orthogonality refinement no Zod)
      satelliteRewardType: isSatellite ? (data.satelliteRewardType ?? null) : null,
      satelliteTicketValue: isSatellite ? toStringOrNull(data.satelliteTicketValue) : null,
      satelliteTargetName: isSatellite ? toStringOrNull(data.satelliteTargetName) : null,
    };
  };

  const handleEditSubmit = (data: TournamentForm) => {
    if (!editingTournament?.id) {
      toast({ title: "Erro", description: "ID do torneio nao encontrado", variant: "destructive" });
      return;
    }
    const advanced = normalizeAdvancedFields(data);
    updateTournamentMutation.mutate({
      id: editingTournament.id,
      dayOfWeek: data.dayOfWeek ?? editingTournament.dayOfWeek,
      site: String(data.site || ""),
      time: String(data.time || ""),
      type: String(data.type || "Vanilla"),
      speed: String(data.speed || "Normal"),
      name: String(data.name || ""),
      buyIn: String(data.buyIn || "0"),
      guaranteed: String(data.guaranteed || "0"),
      prioridade: Number(data.prioridade) || 2,
      ...advanced,
    });
  };

  const handleDeleteTournament = (tournament: any) => {
    setTournamentToDelete(tournament);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteTournament = () => {
    deleteTournamentMutation.mutate(tournamentToDelete.id);
    setIsDeleteDialogOpen(false);
    setTournamentToDelete(null);
  };

  const handleRemoveTournament = (id: string) => {
    deleteTournamentMutation.mutate(id);
  };

  const handleClickTournament = (tournament: any) => {
    handleEditTournament(tournament);
  };

  const handleClickEmptyCell = (dayOfWeek: number, time: string) => {
    const activeProfile = getActiveProfile(dayOfWeek);
    // FIX UX: se o dia esta OFF ou sem perfil, nao deixar o clique silencioso
    if (!activeProfile || activeProfile === 'OFF') {
      const dayName = weekDays.find(d => d.id === dayOfWeek)?.name || 'este dia';
      const payload = buildOffDayToastPayload({
        dayName,
        dayOfWeek,
        setActiveProfile,
      });
      toast({
        title: payload.title,
        description: payload.description,
        action: payload.action as any,
      });
      return;
    }
    const newTournament = {
      dayOfWeek,
      time,
      profile: activeProfile,
    };
    setEditingTournament(newTournament);
    editForm.reset({
      site: "",
      time,
      type: "Vanilla",
      speed: "Normal",
      name: "",
      buyIn: "",
      guaranteed: "",
      prioridade: 2,
      dayOfWeek,
      gameType: null,
      startingStack: null,
      maxPlayers: null,
      blindLevelMinutes: null,
      lateRegMinutes: null,
      alertMinutesBefore: null,
      allowsAddOn: false,
      addOnCost: null,
      allowsReentry: false,
      maxReentries: null,
    });
    setTimeout(() => setIsEditDialogOpen(true), 50);
  };

  // Abre o dialog de novo torneio com seletor de dia (vindo do botao no header)
  const handleOpenNewDialog = () => {
    // Achar o primeiro dia ativo (A/B/C) como default; fallback = hoje
    const today = new Date().getDay();
    const dayCandidates = [today, 1, 2, 3, 4, 5, 6, 0];
    let defaultDay = today;
    for (const d of dayCandidates) {
      const p = getActiveProfile(d);
      if (p && p !== 'OFF') {
        defaultDay = d;
        break;
      }
    }

    // Hora default: proxima hora redonda apos hora atual, dentro do range da grade
    const now = new Date();
    const nextHour = (now.getHours() + 1) % 24;
    const defaultTime = `${String(nextHour).padStart(2, "0")}:00`;

    setEditingTournament({ dayOfWeek: defaultDay });
    editForm.reset({
      site: "",
      time: defaultTime,
      type: "Vanilla",
      speed: "Normal",
      name: "",
      buyIn: "",
      guaranteed: "",
      prioridade: 2,
      dayOfWeek: defaultDay,
      gameType: null,
      startingStack: null,
      maxPlayers: null,
      blindLevelMinutes: null,
      lateRegMinutes: null,
      alertMinutesBefore: null,
      allowsAddOn: false,
      addOnCost: null,
      allowsReentry: false,
      maxReentries: null,
    });
    setIsNewDialogOpen(true);
  };

  // Override edit submit to handle new tournaments (no id)
  const handleFormSubmit = (data: TournamentForm) => {
    if (editingTournament?.id) {
      // Existing tournament - update
      handleEditSubmit(data);
    } else {
      // New tournament - create
      const targetDay = data.dayOfWeek ?? editingTournament?.dayOfWeek ?? 0;
      const activeProfile = getActiveProfile(targetDay);

      // Se o dia de destino estiver OFF/null, ativar perfil A automaticamente
      if (!activeProfile || activeProfile === 'OFF') {
        executeProfileSwitch(targetDay, 'A');
      }
      const profileToUse = (activeProfile && activeProfile !== 'OFF') ? activeProfile : 'A';
      const advanced = normalizeAdvancedFields(data);

      // Auto-gerar nome se nao preenchido (schema do DB exige name not null)
      const buyInNum = parseFloat(data.buyIn || "0");
      const autoName = (data.name && data.name.trim())
        ? data.name
        : `$${isNaN(buyInNum) ? "0" : buyInNum.toFixed(0)} ${data.site}`;

      addPlannedMutation.mutate({
        dayOfWeek: targetDay,
        profile: profileToUse,
        site: String(data.site || ""),
        time: String(data.time || ""),
        type: String(data.type || "Vanilla"),
        speed: String(data.speed || "Normal"),
        name: autoName,
        buyIn: String(data.buyIn || "0"),
        guaranteed: String(data.guaranteed || "0"),
        prioridade: Number(data.prioridade) || 2,
        ...advanced,
      }, {
        onSuccess: () => {
          setIsEditDialogOpen(false);
          setIsNewDialogOpen(false);
          setEditingTournament(null);
          toast({
            title: "✓ Torneio adicionado",
            description: `${autoName} — ${weekDays.find(d => d.id === targetDay)?.name} às ${data.time}`,
          });
        },
      });
    }
  };

  // Keyboard shortcut: N abre o dialog de novo torneio
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' || e.key === 'N') {
        const target = e.target as HTMLElement | null;
        // Ignora se o usuario esta digitando em algum input/textarea/select
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        // Ignora se algum dialog ja esta aberto
        if (isEditDialogOpen || isNewDialogOpen || isSettingsOpen || isDeleteDialogOpen) return;
        e.preventDefault();
        handleOpenNewDialog();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditDialogOpen, isNewDialogOpen, isSettingsOpen, isDeleteDialogOpen]);

  // =========================================================================
  // Drag & Drop handler
  // =========================================================================
  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;

    // Parse destination droppable ID: "cell-{dayOfWeek}-{time}"
    const destParts = destination.droppableId.split("-");
    if (destParts[0] !== "cell" || destParts.length < 3) return;

    const destDayOfWeek = parseInt(destParts[1], 10);
    const destTime = destParts.slice(2).join("-"); // Handle "HH:00" format
    const destProfile = getActiveProfile(destDayOfWeek);

    // Validate the drop
    const validation = validateDrop(
      {},
      { dayOfWeek: destDayOfWeek, time: destTime, profile: destProfile }
    );

    if (!validation.allowed) {
      toast({
        title: "Drop nao permitido",
        description: validation.reason || "Operacao invalida",
        variant: "destructive",
      });
      return;
    }

    // Determine source type
    if (draggableId.startsWith("library-")) {
      // Dragging from library to grid
      const libraryId = draggableId.replace("library-", "");
      // We need to find the library tournament data from the query cache
      const libraryData = queryClient.getQueryData<any[]>(["/api/tournament-library"]);
      const libraryTournament = (libraryData || []).find((t: any) => t.id === libraryId);

      if (!libraryTournament) return;

      const planned = mapLibraryToPlanned(libraryTournament, {
        dayOfWeek: destDayOfWeek,
        time: destTime,
        profile: destProfile!,
      });

      addPlannedMutation.mutate(planned);
    } else if (draggableId.startsWith("cell-")) {
      // Dragging from one cell to another (reposition)
      const tournamentId = draggableId.replace("cell-", "");
      const tournament = plannedTournaments.find((t: any) => t.id === tournamentId);

      if (!tournament) return;

      const move = calculateMove(tournament, destDayOfWeek, destTime);

      if (Object.keys(move.updates).length > 0) {
        updateTournamentMutation.mutate({
          id: tournamentId,
          ...move.updates,
        });
      }
    }
  }, [plannedTournaments, getActiveProfile, queryClient, addPlannedMutation, updateTournamentMutation, toast]);

  // Sprint coach-page-reform-1 RF-01: tabs sempre renderizam (ate sem user
  // hidratado) para nao quebrar URL persistence. LoadingScreen apenas quando
  // profileStates ainda carrega (forma da grade).
  // Sprint Variance-1 RF-06: removido gate `plannedLoading` para que o
  // PrimedopePanel monte imediato (prefill via useQuery comeca a hidratar).
  // `plannedTournaments` ja tem default `[]` quando `data` ainda undefined.
  if (user && profileStatesLoading) {
    return <LoadingScreen />;
  }

  // =========================================================================
  // Render
  // =========================================================================

  const gradeContent = (
    <WeekGrid
      plannedTournaments={plannedTournaments}
      viewMode={viewMode}
      getActiveProfile={getActiveProfile}
      setActiveProfile={setActiveProfile}
      onClickTournament={handleClickTournament}
      onClickEmptyCell={handleClickEmptyCell}
      onRemoveTournament={handleRemoveTournament}
      gradeStartHour={gradeStartHour}
      gradeEndHour={gradeEndHour}
      onOpenSettings={() => setIsSettingsOpen(true)}
      onShowDayDetails={(dayOfWeek) => setDayDetailOpen(dayOfWeek)}
    />
  );

  const bibliotecaContent = (
    <BibliotecaPanel
      collapsed={libraryCollapsed && !isMobile}
      onToggleCollapsed={handleToggleLibrary}
    />
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="w-full px-6 py-6">
        {/* Sprint Estudos-Habito-1 RF-4: stats foco visiveis no /coach. */}
        <div className="mb-3">
          <FocusStatsBar
            placement="coach"
            data={focusBar.data}
            loading={focusBar.loading}
            error={focusBar.error}
            visible={focusBar.visible}
          />
        </div>
        {/* Header com totais semanais */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-3xl font-bold text-white">Grade</h2>
              <p className="text-gray-400 text-sm">Planeje sua grade semanal</p>
            </div>
            {/* Totais semanais inline */}
            {(() => {
              const weekDayIds = [0, 1, 2, 3, 4, 5, 6];
              const allWeekTournaments = weekDayIds.flatMap(d => getTournamentsForDay(d));
              const weekTotal = allWeekTournaments.reduce((sum, t: any) => sum + parseFloat(t.buyIn || 0), 0);
              const weekCount = allWeekTournaments.length;
              if (weekCount === 0) return null;
              return (
                <div className="hidden md:flex items-center gap-4 bg-gray-800/60 border border-gray-700/50 rounded-lg px-4 py-2">
                  <div className="text-center">
                    <div className="text-white font-bold text-lg">{weekCount}</div>
                    <div className="text-gray-400 text-xs">Torneios</div>
                  </div>
                  <div className="w-px h-8 bg-gray-700"></div>
                  <div className="text-center">
                    <div className="text-emerald-400 font-bold text-lg">${weekTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                    <div className="text-gray-400 text-xs">Investimento</div>
                  </div>
                  <div className="w-px h-8 bg-gray-700"></div>
                  <div className="text-center">
                    <div className="text-blue-400 font-bold text-lg">${weekCount > 0 ? (weekTotal / weekCount).toFixed(0) : '0'}</div>
                    <div className="text-gray-400 text-xs">ABI</div>
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleOpenNewDialog}
              className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30 font-medium"
              title="Adicionar novo torneio (atalho: N)"
              data-testid="btn-novo-torneio"
            >
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Novo Torneio</span>
              <kbd className="hidden md:inline-flex ml-2 items-center justify-center w-5 h-5 rounded bg-emerald-700/60 text-[10px] font-mono text-emerald-100">
                N
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowComparison(!showComparison)}
              className={`border-gray-700 text-gray-300 hover:bg-gray-700 ${showComparison ? 'bg-emerald-900/30 border-emerald-600 text-emerald-400' : 'bg-gray-800'}`}
              title="Comparar perfis A/B/C"
            >
              <BarChart3 className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Comparar</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'compact' ? 'expanded' : 'compact')}
              className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              title={viewMode === 'compact' ? 'Modo expandido' : 'Modo compacto'}
            >
              {viewMode === 'compact' ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Summary Bar */}
        <WeeklySummaryBar
          getTournamentsForDay={getTournamentsForDay}
          getDayStats={getDayStats}
          isDayActiveWithTournaments={isDayActiveWithTournaments}
          getActiveProfile={getActiveProfile}
        />

        {/* Tickets Widget — registrar/visualizar tickets de satelites */}
        <div className="mb-4" data-testid="grade-planner-tickets-widget">
          <TicketsWidget />
        </div>

        {/* Empty state onboarding — primeiro uso */}
        {plannedTournaments.length === 0 && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/20 via-zinc-900/40 to-zinc-900/40 px-5 py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                  <Plus className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-100">Comece sua grade semanal</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Ative um perfil (A/B/C) num dia e adicione torneios, ou arraste da biblioteca à esquerda.
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleOpenNewDialog}
                className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Adicionar primeiro torneio
              </Button>
            </div>
          </div>
        )}

        {/* FP-06: CTA Banner Grade -> Grind */}
        {(() => {
          const todayDow = getTodayDayOfWeek();
          const mappedProfiles = (profileStates || [])
            .filter((ps: any) => ps.activeProfile)
            .map((ps: any) => ({ dayOfWeek: ps.dayOfWeek, activeProfile: ps.activeProfile as 'A' | 'B' | 'C' | 'OFF' }));
          const ctaData = getGrindCTAData(todayDow, mappedProfiles, plannedTournaments);
          if (!ctaData.show || ctaDismissed) return null;
          return (
            <div className="mb-4 flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-emerald-400" />
                <span className="text-emerald-300 text-sm font-medium">
                  Voce tem {ctaData.tournamentCount} torneio{ctaData.tournamentCount > 1 ? 's' : ''} planejado{ctaData.tournamentCount > 1 ? 's' : ''} para hoje
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setLocation("/grind")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Iniciar Grind
                </Button>
                <button
                  onClick={() => setCtaDismissed(true)}
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="Fechar banner"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })()}

        {/* Sprint tournament-selector-reform: cards substituem as abas textuais.
            Cada card e um TabsTrigger (Radix preservado) estilizado como cartao
            clicavel — acesso mais facil as 4 ferramentas: Grade / Torneios /
            Flights / Calculadora MTTs. testids legados (coach-tab-*) + alias
            grade-tab-selector (display:contents) mantidos p/ testes.
            onClick redundante: Radix Tabs reage a onMouseDown; RTL fireEvent.click
            precisa do click explicito (lesson #27). */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 h-auto bg-transparent p-0">
            <TabsTrigger
              value="planner"
              data-testid="coach-tab-planner"
              onClick={() => setActiveTab('planner')}
              className={CARD_TRIGGER_CLS}
            >
              <Calendar className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Grade</span>
              <span className="text-xs text-gray-400">Biblioteca + grade semanal</span>
            </TabsTrigger>
            {/* alias legado grade-tab-selector via wrapper display:contents. */}
            <div data-testid="grade-tab-selector" style={{ display: 'contents' }}>
              <TabsTrigger
                value="selector"
                data-testid="coach-tab-selector"
                onClick={() => setActiveTab('selector')}
                className={CARD_TRIGGER_CLS}
              >
                <Trophy className="h-5 w-5 text-yellow-400" />
                <span className="text-sm font-semibold text-white">Torneios</span>
                <span className="text-xs text-gray-400">Biblioteca de torneios</span>
              </TabsTrigger>
            </div>
            <TabsTrigger
              value="flights"
              data-testid="coach-tab-flights"
              onClick={() => setActiveTab('flights')}
              className={CARD_TRIGGER_CLS}
            >
              <Plane className="h-5 w-5 text-sky-400" />
              <span className="text-sm font-semibold text-white">Flights</span>
              <span className="text-xs text-gray-400">Reentradas e flights</span>
            </TabsTrigger>
            <TabsTrigger
              value="variance"
              data-testid="coach-tab-variance"
              onClick={() => setActiveTab('variance')}
              className={CARD_TRIGGER_CLS}
            >
              <Calculator className="h-5 w-5 text-purple-400" />
              <span className="text-sm font-semibold text-white">Calculadora MTTs</span>
              <span className="text-xs text-gray-400">Simulador de variancia</span>
            </TabsTrigger>
          </TabsList>

          {/* Aba Biblioteca + Grade (planner). */}
          <TabsContent value="planner" className="mt-0">
            {isMobile ? (
              <Tabs value={mobileTab} onValueChange={setMobileTab} className="w-full">
                <TabsList className="w-full bg-gray-800 border border-gray-700 mb-4">
                  <TabsTrigger value="biblioteca" className="flex-1 text-sm">Biblioteca</TabsTrigger>
                  <TabsTrigger value="grade" className="flex-1 text-sm">Grade</TabsTrigger>
                </TabsList>
                <TabsContent value="biblioteca" className="mt-0">
                  <div className="h-[calc(100vh-280px)]">{bibliotecaContent}</div>
                </TabsContent>
                <TabsContent value="grade" className="mt-0">
                  {gradeContent}
                </TabsContent>
              </Tabs>
            ) : (
              <PanelGroup
                direction="horizontal"
                className="min-h-[800px]"
              >
                {/* Grade à ESQUERDA (espelha o modal Detalhe do Dia).
                    NAO capar altura nem aninhar overflow vertical: react-beautiful-dnd
                    NAO suporta scroll container aninhado — capar viewport (h-[calc])
                    + WeekGrid overflow-auto matava o drag (regressao a6b2925c).
                    Painel cresce com o conteudo → scroll vertical fica na pagina;
                    WeekGrid faz so scroll horizontal (overflow-x-auto). */}
                <Panel
                  defaultSize={70}
                  minSize={45}
                  className={libraryCollapsed ? "" : "pr-2"}
                >
                  <div className="h-full overflow-auto pb-2">
                    {gradeContent}
                  </div>
                </Panel>
                <PanelResizeHandle
                  className={
                    "transition-colors cursor-col-resize rounded " +
                    (libraryCollapsed
                      ? "w-0"
                      : "w-1.5 bg-gray-700/50 hover:bg-emerald-500/50")
                  }
                />
                {/* Biblioteca à DIREITA, colapsivel, default minimizada. */}
                <Panel
                  ref={libraryPanelRef}
                  defaultSize={30}
                  minSize={20}
                  maxSize={55}
                  collapsible
                  collapsedSize={3}
                  onCollapse={() => {
                    setLibraryCollapsed(true);
                    persistLibraryCollapsed(true);
                  }}
                  onExpand={() => {
                    setLibraryCollapsed(false);
                    persistLibraryCollapsed(false);
                  }}
                  className={libraryCollapsed ? "" : "pl-2"}
                >
                  {bibliotecaContent}
                </Panel>
              </PanelGroup>
            )}
          </TabsContent>

          {/* Aba Torneios — reflete a pagina /library (TournamentLibraryNew).
              Sprint tournament-selector-reform: SelectorPanel (scoring + cold-start
              "importe 50 torneios") substituido pela biblioteca de torneios. */}
          <TabsContent value="selector" className="mt-0">
            <TournamentLibraryNew />
          </TabsContent>

          {/* Aba Flights — conteudo migrado de /flight (RF-02). */}
          <TabsContent value="flights" className="mt-0">
            <FlightsPanel />
          </TabsContent>

          {/* forceMount: PrimedopePanel monta antes do clique pra prefill useQuery
              comecar hidratacao imediatamente (RF-06). */}
          <TabsContent value="variance" className="mt-0" forceMount>
            {(() => {
              const today = getTodayDayOfWeek();
              const todayProfile = getActiveProfile(today);
              const profileLetter = todayProfile && todayProfile !== 'OFF' ? todayProfile : 'A';
              return (
                <div data-testid="coach-variance-panel" className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-2 rounded-t-lg bg-gray-900/60 px-4 py-3 mb-3">
                    <h2 className="text-base font-semibold text-white">Calculadora de Variância MTT</h2>
                    <span className="text-xs text-gray-400">
                      Estima a variância esperada do seu volume via Monte Carlo (10.000 simulações)
                    </span>
                  </div>
                  <div>
                    <PrimedopePanel
                      userId={user?.userPlatformId ?? ''}
                      bankrollUsd={bankrollUsd}
                      profileLetter={profileLetter}
                      dayOfWeek={today}
                    />
                  </div>
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>

        {/* Profile Comparison — visivel apenas quando botão Comparar está ativo */}
        {showComparison && <ProfileComparison />}

        {/* Sprint day-detail-zoom-1: Portal container inside DragDropContext */}
        <div ref={dndPortalRef} id="dnd-portal-container" />

        {/* Sprint day-detail-zoom-1: DayDetailHost (zoom default, drawer via ?detail=drawer) */}
        {dayDetailOpen !== null && (
          <DayDetailHost
            open={dayDetailOpen !== null}
            onOpenChange={(o) => {
              if (!o) setDayDetailOpen(null);
            }}
            profileLetter={(() => {
              const p = getActiveProfile(dayDetailOpen);
              return p && p !== 'OFF' ? p : 'A';
            })()}
            dayOfWeek={dayDetailOpen}
            portalContainer={dndPortalRef.current ?? undefined}
            dayProfileOff={getActiveProfile(dayDetailOpen) === 'OFF'}
          />
        )}

        {/* ============================================================= */}
        {/* Dialogs */}
        {/* ============================================================= */}

        <GradeSettings
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          currentStartHour={gradeStartHour}
          currentEndHour={gradeEndHour}
          onSave={(start, end) => updateHoursMutation.mutate({ gradeStartHour: start, gradeEndHour: end })}
          isPending={updateHoursMutation.isPending}
        />

        <DeleteDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          tournament={tournamentToDelete}
          onConfirm={confirmDeleteTournament}
          generateTournamentName={generateTournamentName}
        />

        {/* Dialog para edicao de torneio existente OU inline-add via celula vazia */}
        <EditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          editForm={editForm}
          onSubmit={handleFormSubmit}
          onCancel={() => { setIsEditDialogOpen(false); setEditingTournament(null); }}
          isPending={updateTournamentMutation.isPending || addPlannedMutation.isPending}
          editingTournament={editingTournament}
        />

        {/* Dialog para criar novo torneio via botao do header — com seletor de dia */}
        <EditDialog
          open={isNewDialogOpen}
          onOpenChange={setIsNewDialogOpen}
          editForm={editForm}
          onSubmit={handleFormSubmit}
          onCancel={() => { setIsNewDialogOpen(false); setEditingTournament(null); }}
          isPending={addPlannedMutation.isPending}
          editingTournament={editingTournament}
          showDayPicker={true}
        />

        {/* FP-04: Off Toggle Dialog */}
        <Dialog open={showOffDialog} onOpenChange={(open) => { if (!open) handleCancelOff(); }}>
          <DialogContent className="!bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md p-0 overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] sm:rounded-xl">
            <div className="bg-gradient-to-br from-amber-900/30 via-zinc-900 to-zinc-900 border-b border-zinc-800 px-6 py-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold">
                  <div className="p-1.5 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30">
                    <X className="h-4 w-4 text-amber-400" />
                  </div>
                  Desativar {pendingOffDay !== null ? weekDays.find(d => d.id === pendingOffDay)?.name : ''}?
                </DialogTitle>
                <DialogDescription className="text-zinc-400 text-sm">
                  {affectedTournaments.length} torneio{affectedTournaments.length > 1 ? 's' : ''} planejado{affectedTournaments.length > 1 ? 's' : ''} serão ocultados (não deletados).
                </DialogDescription>
              </DialogHeader>
            </div>
            {affectedTournaments.length > 0 && (
              <div className="px-6 py-4 max-h-64 overflow-y-auto space-y-1.5">
                {affectedTournaments.map((t: any, idx: number) => (
                  <div key={t.id || idx} className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                    <span className="text-zinc-100 truncate flex-1 font-medium">{t.name || t.site || 'Torneio'}</span>
                    <div className="flex items-center gap-3 text-zinc-400 text-xs ml-2 flex-shrink-0">
                      {t.time && <span className="font-mono">{t.time}</span>}
                      {t.buyIn && <span className="text-emerald-400">${parseFloat(t.buyIn || '0').toFixed(0)}</span>}
                      {t.site && <span className="text-zinc-500">{t.site}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-zinc-800 bg-zinc-950/60 px-6 py-4 flex gap-2 justify-end">
              <Button variant="ghost" onClick={handleCancelOff} className="text-zinc-300 hover:bg-zinc-800 hover:text-white">
                Cancelar
              </Button>
              <Button onClick={handleConfirmOff} className="bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30">
                Desativar dia
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DragDropContext>
  );
}
