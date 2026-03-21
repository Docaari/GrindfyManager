import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileStates, useUpdateProfileState } from "@/hooks/useProfileStates";
import { Button } from "@/components/ui/button";
import { Download, Maximize2, Minimize2, Calendar } from "lucide-react";
import SupremaImportModal from "@/components/SupremaImportModal";
import { weekDays } from '@/components/grade-planner/types';

import { tournamentSchema, type TournamentForm, type DayStats, emptyDayStats } from '@/components/grade-planner/types';
import { LoadingScreen } from '@/components/grade-planner/LoadingScreen';
import { WeeklySummaryBar } from '@/components/grade-planner/WeeklySummaryBar';
import { WeekGrid } from '@/components/grade-planner/WeekGrid';
import { TournamentLibrary } from '@/components/grade-planner/TournamentLibrary';
import { PlanningDialog } from '@/components/grade-planner/PlanningDialog';
import { DeleteDialog } from '@/components/grade-planner/DeleteDialog';
import { EditDialog } from '@/components/grade-planner/EditDialog';

export default function GradePlanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<'A' | 'B' | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<{
    id: string;
    dayOfWeek: number;
    profile: string;
    site: string;
    time: string;
    type: string;
    speed: string;
    name: string;
    buyIn: string;
    guaranteed: string;
    prioridade: number;
  } | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [tournamentToDelete, setTournamentToDelete] = useState<any>(null);
  const [showSupremaModal, setShowSupremaModal] = useState(false);
  const [supremaDayOfWeek, setSupremaDayOfWeek] = useState<number | null>(null);
  const [showSupremaDayPicker, setShowSupremaDayPicker] = useState(false);
  const [viewMode, setViewMode] = useState<'compact' | 'expanded'>('compact');

  // Profile states
  const { data: profileStates, isLoading: profileStatesLoading } = useProfileStates();
  const updateProfileStateMutation = useUpdateProfileState();

  const getActiveProfile = (dayOfWeek: number): 'A' | 'B' | 'C' | null => {
    const state = profileStates?.find((ps: any) => ps.dayOfWeek === dayOfWeek);
    return (state?.activeProfile as 'A' | 'B' | 'C' | null) || null;
  };

  const setActiveProfile = (dayOfWeek: number, profile: 'A' | 'B' | 'C') => {
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

  /**
   * Calculate the next occurrence of a given dayOfWeek (0=Sun..6=Sat).
   * If today is that day, returns today's date.
   */
  const getNextDateForDayOfWeek = (targetDay: number): string => {
    const now = new Date();
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysUntil);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
    const dd = String(targetDate.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  /** Format a date string + dayOfWeek into a human label like "Segunda 24/03" */
  const getSupremaDayLabel = (dayOfWeek: number, dateStr: string): string => {
    const dayName = weekDays.find(d => d.id === dayOfWeek)?.name || '';
    const d = new Date(dateStr + "T12:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dayName} ${dd}/${mm}`;
  };

  /** Open the Suprema import modal for a specific day */
  const openSupremaForDay = (dayOfWeek: number) => {
    setSupremaDayOfWeek(dayOfWeek);
    setShowSupremaModal(true);
    setShowSupremaDayPicker(false);
  };

  const form = useForm<TournamentForm>({
    resolver: zodResolver(tournamentSchema),
    mode: 'onChange',
    defaultValues: { site: "", time: "", type: "", speed: "", name: "", buyIn: "", guaranteed: "", prioridade: 2 },
  });

  const editForm = useForm<TournamentForm>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: { site: "", time: "", type: "", speed: "", name: "", buyIn: "", guaranteed: "", prioridade: 2 },
  });

  // Fetch active days
  const { data: activeDays } = useQuery({
    queryKey: ["/api/active-days"],
    queryFn: () => apiRequest("GET", "/api/active-days"),
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

  // Fetch all tournaments for library
  const { data: allTournaments = [] } = useQuery({
    queryKey: ["/api/tournaments"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/tournaments");
      return Array.isArray(response) ? response : [];
    },
  });

  // Fetch tournament suggestions
  const { data: tournamentSuggestions = [] } = useQuery({
    queryKey: ["/api/tournament-suggestions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/tournament-suggestions");
      return Array.isArray(response) ? response : [];
    },
  });

  // Auto-save mutation
  const autoSaveTournamentMutation = useMutation({
    mutationFn: async (tournament: TournamentForm) => {
      return await apiRequest("POST", "/api/planned-tournaments", tournament);
    },
    onMutate: () => { setSaveStatus('saving'); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => {
      setSaveStatus('error');
      toast({ title: "Erro ao Salvar", description: "Falha ao salvar torneio automaticamente. Tente novamente.", variant: "destructive" });
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  // Update tournament mutation
  const updateTournamentMutation = useMutation({
    mutationFn: async (data: { id: string; [key: string]: any }) => {
      const { id, ...updateData } = data;
      return await apiRequest("PUT", `/api/planned-tournaments/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      toast({ title: "Torneio Atualizado", description: "Torneio atualizado com sucesso" });
      setIsEditDialogOpen(false);
      setEditingTournament(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao Atualizar", description: error.message || "Erro desconhecido ao atualizar torneio", variant: "destructive" });
    },
  });

  // Delete tournament mutation
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

  // Toggle active day mutation
  const toggleActiveDayMutation = useMutation({
    mutationFn: async (dayOfWeek: number) => {
      return await apiRequest("POST", "/api/active-days/toggle", { dayOfWeek });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/active-days"] });
      toast({ title: "Dia Atualizado", description: "Status do dia foi alterado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar o status do dia", variant: "destructive" });
    },
  });

  // Loading screen
  if (plannedLoading || profileStatesLoading || !user) {
    return <LoadingScreen />;
  }

  // Generate tournament name
  const generateTournamentName = (data: any) => {
    if (data.name && data.name.trim()) return data.name;
    const buyIn = `$${parseFloat(data.buyIn).toFixed(0)}`;
    const guaranteed = data.guaranteed ? ` $${parseFloat(data.guaranteed).toLocaleString('pt-BR')}` : '';
    return `${buyIn}${guaranteed} ${data.site}`;
  };

  // Form submit handler
  const onSubmit = (data: TournamentForm) => {
    const sanitizedData = {
      dayOfWeek: selectedDay || 0,
      profile: selectedProfile || getActiveProfile(selectedDay || 0) || 'A',
      site: String(data.site || ""),
      time: String(data.time || ""),
      type: String(data.type || ""),
      speed: String(data.speed || ""),
      name: String(data.name || ""),
      buyIn: String(data.buyIn || "0"),
      guaranteed: String(data.guaranteed || "0"),
      prioridade: Number(data.prioridade) || 2,
    };
    autoSaveTournamentMutation.mutate(sanitizedData);
    const persistedSite = sanitizedData.site;
    form.reset();
    form.setValue("site", persistedSite);
    form.setValue("prioridade", 2);
    if (selectedDay !== null) form.setValue("dayOfWeek", selectedDay);
  };

  // Tournament helpers
  const getTournamentsForDay = (dayId: number) => {
    const activeProfile = getActiveProfile(dayId) || 'A';
    const allTournamentsForDay = (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter((t: any) => t.dayOfWeek === dayId);
    return allTournamentsForDay.filter((t: any) => t.profile === activeProfile);
  };

  const getTournamentsForModalProfile = (dayId: number, profileToShow: 'A' | 'B') => {
    const allTournamentsForDay = (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter((t: any) => t.dayOfWeek === dayId);
    return allTournamentsForDay.filter((t: any) => t.profile === profileToShow);
  };

  const getTournamentsForProfile = (dayId: number, profile: 'A' | 'B') => {
    return (Array.isArray(plannedTournaments) ? plannedTournaments : []).filter((t: any) =>
      t.dayOfWeek === dayId && t.profile === profile
    );
  };

  const isDayActiveWithTournaments = (dayOfWeek: number): boolean => {
    const activeProfile = getActiveProfile(dayOfWeek);
    if (!activeProfile) return false;
    return getTournamentsForDay(dayOfWeek).length > 0;
  };

  // Calculate stats for a set of tournaments
  const calculateStats = (tournaments: any[]): DayStats => {
    const totalTournaments = tournaments.length;
    if (totalTournaments === 0) return { ...emptyDayStats };

    const totalBuyIn = tournaments.reduce((sum: number, t: any) => sum + parseFloat(t.buyIn || 0), 0);
    const avgBuyIn = totalBuyIn / totalTournaments;

    const vanillaCount = tournaments.filter((t: any) => t.type === 'Vanilla').length;
    const pkoCount = tournaments.filter((t: any) => t.type === 'PKO').length;
    const mysteryCount = tournaments.filter((t: any) => t.type === 'Mystery').length;
    const normalCount = tournaments.filter((t: any) => t.speed === 'Normal').length;
    const turboCount = tournaments.filter((t: any) => t.speed === 'Turbo').length;
    const hyperCount = tournaments.filter((t: any) => t.speed === 'Hyper').length;

    const tournamentsWithTime = tournaments.filter((t: any) => t.time && t.time.trim() !== '');
    let startTime = null;
    let endTime = null;
    let durationHours = 0;

    if (tournamentsWithTime.length > 0) {
      const times = tournamentsWithTime.map((t: any) => {
        const timeStr = t.time.trim();
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      });
      const earliestMinutes = Math.min(...times);
      const latestMinutes = Math.max(...times);
      const earliestHours = Math.floor(earliestMinutes / 60);
      const earliestMins = earliestMinutes % 60;
      startTime = `${earliestHours.toString().padStart(2, '0')}:${earliestMins.toString().padStart(2, '0')}`;
      const endMinutes = latestMinutes + (3 * 60);
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      endTime = `${(endHours % 24).toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
      durationHours = (endMinutes - earliestMinutes) / 60;
    }

    return {
      count: totalTournaments,
      avgBuyIn,
      totalBuyIn,
      vanillaPercentage: (vanillaCount / totalTournaments) * 100,
      pkoPercentage: (pkoCount / totalTournaments) * 100,
      mysteryPercentage: (mysteryCount / totalTournaments) * 100,
      normalPercentage: (normalCount / totalTournaments) * 100,
      turboPercentage: (turboCount / totalTournaments) * 100,
      hyperPercentage: (hyperCount / totalTournaments) * 100,
      avgFieldSize: 0,
      startTime,
      endTime,
      durationHours: Math.round(durationHours * 10) / 10,
    };
  };

  const getDayStats = (dayId: number): DayStats => calculateStats(getTournamentsForDay(dayId));
  const getProfileStats = (dayId: number, profile: 'A' | 'B'): DayStats => calculateStats(getTournamentsForProfile(dayId, profile));

  // RF-11: Compute favorites from tournament history
  const getFavorites = () => {
    const tournaments = Array.isArray(allTournaments) ? allTournaments : [];
    if (tournaments.length === 0) return [];
    const frequencyMap = new Map<string, { count: number; tournament: any }>();
    tournaments.forEach((t: any) => {
      const key = `${t.name || ''}-${t.site}-${t.buyIn}`;
      const existing = frequencyMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        frequencyMap.set(key, { count: 1, tournament: t });
      }
    });
    return Array.from(frequencyMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(({ count, tournament }) => ({
        id: `fav-${tournament.id}`,
        site: tournament.site || '',
        name: tournament.name || '',
        buyIn: tournament.buyIn?.toString() || '0',
        type: tournament.format || tournament.type || 'Vanilla',
        speed: tournament.speed || 'Normal',
        guaranteed: tournament.guaranteed?.toString() || '',
        time: tournament.time || '',
        frequency: count,
      }));
  };

  const favorites = getFavorites();

  // Suggestion logic
  const getSuggestedTournaments = () => {
    const currentSite = form.watch("site");
    const currentType = form.watch("type");
    const currentSpeed = form.watch("speed");
    const currentBuyIn = form.watch("buyIn");

    const selectedDayNumber = selectedDay || 0;
    const activeProfile = getActiveProfile(selectedDayNumber);
    const allUserTournaments = Array.isArray(plannedTournaments) ? plannedTournaments : [];
    const userTournaments = activeProfile ? allUserTournaments.filter((t: any) => t.profile === activeProfile) : [];

    const globalSuggestions = (Array.isArray(tournamentSuggestions) ? tournamentSuggestions : []).map((t: any) => ({
      ...t, isGlobal: true, frequency: 1
    }));

    const otherDayTournaments = userTournaments.filter((t: any) => t.dayOfWeek !== selectedDayNumber);

    let realSuggestions = [...otherDayTournaments, ...globalSuggestions];

    const applyFilters = (list: any[]) => {
      let filtered = list;
      if (currentSite && currentSite.trim() !== "") {
        filtered = filtered.filter((t: any) => t.site === currentSite);
      }
      if (currentType && currentType.trim() !== "") {
        filtered = filtered.filter((t: any) => t.type === currentType);
      }
      if (currentSpeed && currentSpeed.trim() !== "") {
        filtered = filtered.filter((t: any) => t.speed === currentSpeed);
      }
      if (currentBuyIn && currentBuyIn.trim() !== "" && !isNaN(parseFloat(currentBuyIn))) {
        const buyInValue = parseFloat(currentBuyIn);
        const tolerance = buyInValue * 0.2;
        filtered = filtered.filter((t: any) => {
          const tournamentBuyIn = parseFloat(t.buyIn || 0);
          return Math.abs(tournamentBuyIn - buyInValue) <= tolerance;
        });
      }
      return filtered;
    };

    const filteredReal = applyFilters(realSuggestions);

    const realFreqMap = new Map();
    filteredReal.forEach((t: any) => {
      const key = `${t.site}-${t.type}-${t.speed}-${t.buyIn}`;
      realFreqMap.set(key, { ...(realFreqMap.get(key) || t), frequency: (realFreqMap.get(key)?.frequency || 0) + 1 });
    });

    const dedupedReal = Array.from(realFreqMap.values())
      .sort((a: any, b: any) => b.frequency - a.frequency)
      .slice(0, 5);

    const generateLimitedVariations = (tournaments: any[]) => {
      const variations: any[] = [];
      for (const tournament of tournaments.slice(0, 3)) {
        ['Normal', 'Turbo', 'Hyper'].forEach(speed => {
          if (speed !== tournament.speed && variations.length < 3) {
            variations.push({ ...tournament, speed, name: `${tournament.name || ''} (${speed})`, id: `variation-${tournament.id}-${speed}`, frequency: 1, isVariation: true });
          }
        });
      }
      return variations.slice(0, 3);
    };

    const filteredVariations = applyFilters(generateLimitedVariations(userTournaments));

    let suggestions = [...dedupedReal, ...filteredVariations];

    if (suggestions.length === 0) {
      suggestions = getDefaultSuggestions();
    }
    return suggestions;
  };

  const getDefaultSuggestions = () => [
    { id: 'default-1', site: 'PokerStars', type: 'Vanilla', speed: 'Normal', buyIn: '11', guaranteed: '10000', name: 'The Hot $11', time: '20:00', frequency: 1 },
    { id: 'default-2', site: 'PokerStars', type: 'PKO', speed: 'Turbo', buyIn: '22', guaranteed: '25000', name: 'PKO Turbo', time: '21:00', frequency: 1 },
    { id: 'default-3', site: 'WPN', type: 'Vanilla', speed: 'Normal', buyIn: '55', guaranteed: '20000', name: 'The Loncar', time: '19:15', frequency: 1 },
    { id: 'default-4', site: 'GGPoker', type: 'Mystery', speed: 'Hyper', buyIn: '33', guaranteed: '15000', name: 'Mystery Hyper', time: '22:00', frequency: 1 },
    { id: 'default-5', site: 'PartyPoker', type: 'Vanilla', speed: 'Normal', buyIn: '109', guaranteed: '50000', name: 'Daily Legend', time: '20:30', frequency: 1 },
  ];

  const suggestions = getSuggestedTournaments();

  // Edit handlers
  const handleEditSubmit = (data: TournamentForm) => {
    if (!editingTournament?.id) {
      toast({ title: "Erro", description: "ID do torneio nao encontrado", variant: "destructive" });
      return;
    }
    updateTournamentMutation.mutate({
      id: editingTournament.id,
      dayOfWeek: editingTournament.dayOfWeek,
      site: String(data.site || ""),
      time: String(data.time || ""),
      type: String(data.type || ""),
      speed: String(data.speed || ""),
      name: String(data.name || ""),
      buyIn: String(data.buyIn || "0"),
      guaranteed: String(data.guaranteed || "0"),
      prioridade: Number(data.prioridade) || 2,
    });
  };

  const handleEditTournament = (tournament: any) => {
    setEditingTournament(tournament);
    editForm.reset({
      site: tournament.site || "",
      time: tournament.time || "",
      type: tournament.type || "",
      speed: tournament.speed || "",
      name: tournament.name || "",
      buyIn: tournament.buyIn?.toString() || "",
      guaranteed: tournament.guaranteed?.toString() || "",
      prioridade: Number(tournament.prioridade) || 2,
    });
    setTimeout(() => setIsEditDialogOpen(true), 50);
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

  const handleSelectSuggestion = (suggestion: any) => {
    if (selectedDay !== null) {
      form.setValue("site", suggestion.site);
      form.setValue("type", suggestion.type);
      form.setValue("speed", suggestion.speed);
      form.setValue("buyIn", suggestion.buyIn);
      form.setValue("guaranteed", suggestion.guaranteed || "");
      form.setValue("name", suggestion.name || "");
      form.setValue("time", suggestion.time || "");
    }
  };

  const handleOpenDialog = (dayId: number, profile: 'A' | 'B') => {
    setSelectedDay(dayId);
    setSelectedProfile(profile);
    form.setValue("dayOfWeek", dayId);
    setIsDialogOpen(true);
  };

  /** When clicking a tournament pill in the grid, open edit dialog */
  const handleClickTournament = (tournament: any) => {
    handleEditTournament(tournament);
  };

  /** When clicking an empty cell, open the planning dialog for that day+time */
  const handleClickEmptyCell = (dayOfWeek: number, time: string) => {
    const activeProfile = getActiveProfile(dayOfWeek);
    if (!activeProfile || activeProfile === 'C') return;
    setSelectedDay(dayOfWeek);
    setSelectedProfile(activeProfile as 'A' | 'B');
    form.reset();
    form.setValue("dayOfWeek", dayOfWeek);
    form.setValue("time", time);
    form.setValue("prioridade", 2);
    setIsDialogOpen(true);
  };

  /** When adding from the tournament library sidebar */
  const handleAddFromLibrary = (tournament: {
    site: string;
    name: string;
    buyIn: string;
    type: string;
    speed: string;
    time: string;
    guaranteed: string;
  }) => {
    // Find the first active day that has a non-OFF profile
    const today = new Date().getDay();
    const activeProfile = getActiveProfile(today);
    const dayToUse = activeProfile && activeProfile !== 'C' ? today : 1;
    const profileToUse = getActiveProfile(dayToUse);

    if (!profileToUse || profileToUse === 'C') {
      toast({ title: "Nenhum dia ativo", description: "Ative um perfil A ou B em algum dia para adicionar torneios.", variant: "destructive" });
      return;
    }

    // Open dialog pre-filled
    setSelectedDay(dayToUse);
    setSelectedProfile(profileToUse as 'A' | 'B');
    form.reset();
    form.setValue("dayOfWeek", dayToUse);
    form.setValue("site", tournament.site);
    form.setValue("name", tournament.name);
    form.setValue("buyIn", tournament.buyIn);
    form.setValue("type", tournament.type);
    form.setValue("speed", tournament.speed);
    form.setValue("time", tournament.time);
    form.setValue("guaranteed", tournament.guaranteed);
    form.setValue("prioridade", 2);
    setIsDialogOpen(true);
  };

  return (
    <div className="w-full px-6 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Grade</h2>
          <p className="text-gray-400 text-sm">Planeje sua grade semanal</p>
        </div>
        <div className="flex items-center gap-2">
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
          <div className="relative">
            <Button
              onClick={() => setShowSupremaDayPicker(!showSupremaDayPicker)}
              className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Importar Grade Suprema
            </Button>
            {showSupremaDayPicker && (
              <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 p-2 min-w-[180px]">
                <p className="text-xs text-gray-400 px-2 py-1 mb-1">Selecione o dia:</p>
                {[1, 2, 3, 4, 5, 6, 0].map((dayId) => {
                  const dayName = weekDays.find(d => d.id === dayId)?.name || '';
                  const dateStr = getNextDateForDayOfWeek(dayId);
                  const d = new Date(dateStr + "T12:00:00");
                  const dd = String(d.getDate()).padStart(2, "0");
                  const mm = String(d.getMonth() + 1).padStart(2, "0");
                  return (
                    <button
                      key={dayId}
                      onClick={() => openSupremaForDay(dayId)}
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700 rounded flex items-center justify-between"
                    >
                      <span>{dayName}</span>
                      <span className="text-xs text-gray-400">{dd}/{mm}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Bar (RF-08) */}
      <WeeklySummaryBar
        getTournamentsForDay={getTournamentsForDay}
        getDayStats={getDayStats}
        isDayActiveWithTournaments={isDayActiveWithTournaments}
      />

      {/* Main layout: Library sidebar + Grid */}
      <div className="flex gap-4">
        {/* Tournament Library sidebar (RF-06) */}
        <TournamentLibrary
          allTournaments={allTournaments}
          onAddTournament={handleAddFromLibrary}
        />

        {/* Temporal Grid (RF-03) */}
        <WeekGrid
          plannedTournaments={plannedTournaments}
          viewMode={viewMode}
          getActiveProfile={getActiveProfile}
          setActiveProfile={setActiveProfile}
          onClickTournament={handleClickTournament}
          onClickEmptyCell={handleClickEmptyCell}
        />
      </div>

      <PlanningDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        selectedDay={selectedDay}
        selectedProfile={selectedProfile}
        form={form}
        onSubmit={onSubmit}
        getDayStats={getDayStats}
        getTournamentsForModalProfile={getTournamentsForModalProfile}
        generateTournamentName={generateTournamentName}
        suggestions={suggestions}
        onSelectSuggestion={handleSelectSuggestion}
        onEditTournament={handleEditTournament}
        onDeleteTournament={handleDeleteTournament}
        saveStatus={saveStatus}
        onProfileChange={(profile) => setSelectedProfile(profile)}
        isPending={autoSaveTournamentMutation.isPending}
        favorites={favorites}
        onOpenSuprema={(dayOfWeek) => {
          setIsDialogOpen(false);
          openSupremaForDay(dayOfWeek);
        }}
      />

      <DeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        tournament={tournamentToDelete}
        onConfirm={confirmDeleteTournament}
        generateTournamentName={generateTournamentName}
      />

      <EditDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        editForm={editForm}
        onSubmit={handleEditSubmit}
        onCancel={() => { setIsEditDialogOpen(false); setEditingTournament(null); }}
        isPending={updateTournamentMutation.isPending}
      />

      <SupremaImportModal
        open={showSupremaModal}
        onClose={() => {
          setShowSupremaModal(false);
          setSupremaDayOfWeek(null);
        }}
        selectedDate={supremaDayOfWeek !== null ? getNextDateForDayOfWeek(supremaDayOfWeek) : undefined}
        dayLabel={supremaDayOfWeek !== null ? getSupremaDayLabel(supremaDayOfWeek, getNextDateForDayOfWeek(supremaDayOfWeek)) : undefined}
        excludeExternalIds={
          (Array.isArray(plannedTournaments) ? plannedTournaments : [])
            .filter((t: any) => t.externalId && (supremaDayOfWeek === null || t.dayOfWeek === supremaDayOfWeek))
            .map((t: any) => {
              const base = t.externalId.replace(/-entry-\d+$/, '');
              return base;
            })
        }
        onImport={async (tournaments) => {
          const dayOfWeekToUse = supremaDayOfWeek !== null ? supremaDayOfWeek : new Date().getDay();
          const activeProfile = getActiveProfile(dayOfWeekToUse) || selectedProfile || 'A';
          let successCount = 0;
          let failCount = 0;
          for (const t of tournaments) {
            const entries = t.entries || 1;
            for (let i = 0; i < entries; i++) {
              try {
                await apiRequest("POST", "/api/planned-tournaments", {
                  dayOfWeek: dayOfWeekToUse,
                  profile: activeProfile,
                  site: t.site,
                  time: t.time,
                  type: t.type,
                  speed: t.speed,
                  name: t.name,
                  buyIn: t.buyIn,
                  guaranteed: t.guaranteed,
                  prioridade: t.prioridade,
                  externalId: entries > 1 ? `${t.externalId}-entry-${i + 1}` : t.externalId,
                  status: "upcoming",
                });
                successCount++;
              } catch {
                failCount++;
              }
            }
          }
          queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
          if (successCount > 0 && failCount === 0) {
            toast({
              title: "Importacao Concluida",
              description: `${successCount} torneios importados da Suprema Poker`,
            });
          } else if (successCount > 0 && failCount > 0) {
            toast({
              title: "Importacao Parcial",
              description: `${successCount} importados, ${failCount} falharam`,
              variant: "destructive",
            });
          } else if (failCount > 0) {
            toast({
              title: "Erro na Importacao",
              description: `Todos os ${failCount} torneios falharam ao importar`,
              variant: "destructive",
            });
          }
        }}
      />
    </div>
  );
}
